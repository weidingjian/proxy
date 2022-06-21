import http from 'http'
import https from 'https'
import urlModule from 'url'
import zlib from 'zlib'
import brotliTorb from 'brotli'
import Stream from 'stream'
import { DEFAULT_CHUNK_COLLECT_THRESHOLD } from '../constant'
import { INetworkProxyConfig, IReqResourceInfo, IRequestDetail } from '../types'
import { collectErrorLog, CommonReadableStream, getHeaderFromRawHeaders } from '../util'
import log from '../util/log'
import getErrorContent from './error-handle'

class HttpRequestHandler {
  private dangerouslyIgnoreUnauthorized: INetworkProxyConfig['dangerouslyIgnoreUnauthorized'] = false
  private rule: INetworkProxyConfig['rule']
  private recorder: INetworkProxyConfig['recorder']
  private chunkSizeThreshold: number = DEFAULT_CHUNK_COLLECT_THRESHOLD
  constructor(config: INetworkProxyConfig) {
    this.rule = config.rule
    this.recorder = config.recorder
    this.dangerouslyIgnoreUnauthorized = config.dangerouslyIgnoreUnauthorized
  }
  private onRequestData(req: http.IncomingMessage) {
    return new Promise<Buffer>((resolve, reject) => {
      let postData: Buffer[] = []
      req.on('data', chunk => {
        postData.push(chunk)
      })
      req.on('end', () => {
        resolve(Buffer.concat(postData))
      })
      req.on('error', err => {
        reject(err)
      })
    })
  }
  private handleRecorder(resourceInfo: IReqResourceInfo) {
    try {
      const resourceInfoId = this.recorder.appendRecord(resourceInfo)
      resourceInfo.reqBody = '' // memery leak when pass reqData.toString()
      this.recorder?.updateRecord(resourceInfoId, resourceInfo)
      return resourceInfoId
    } catch (e) {
      return -1
    }
  }
  private async beforeSendRequest(requestDetail: IRequestDetail) {
    const userModifiedInfo = this.rule.beforeSendRequest?.(requestDetail)
    if (!userModifiedInfo) {
      return requestDetail
    }
    const reqDetail: any = {}
    ;['protocol', 'requestOptions', 'requestData', 'response'].map(key => {
      // @ts-ignore
      reqDetail[key] = userModifiedInfo[key] || requestDetail[key]
    })
    return reqDetail as IRequestDetail
  }
  private handleResponse({
    headers,
    dataChunks
  }: {
    headers: Record<string, any>
    dataChunks: Buffer[]
  }): Promise<Buffer> {
    const serverResData = Buffer.concat(dataChunks)
    const originContentSize = Buffer.byteLength(serverResData)
    // remove gzip related header, and ungzip the content
    // note there are other compression types like deflate
    const contentEncoding = headers['content-encoding'] || headers['Content-Encoding']
    const isServerGzipped = /gzip/i.test(contentEncoding)
    const isServerDeflated = /deflate/i.test(contentEncoding)
    const isBrotlied = /br/i.test(contentEncoding)
    headers['x-nodeproxy-origin-content-length'] = originContentSize

    const refactContentEncoding = () => {
      if (contentEncoding) {
        headers['x-anyproxy-origin-content-encoding'] = contentEncoding
        delete headers['content-encoding']
        delete headers['Content-Encoding']
      }
    }
    return new Promise((resolve, reject) => {
      if (isServerGzipped && contentEncoding) {
        refactContentEncoding()
        zlib.gunzip(serverResData, (err, buff) => {
          if (err) {
            reject(err)
          } else {
            resolve(buff)
          }
        })
        return
      }
      if (isServerDeflated && contentEncoding) {
        refactContentEncoding()
        zlib.inflate(serverResData, (err, buff) => {
          if (err) {
            reject(err)
          } else {
            resolve(buff)
          }
        })
        return
      }

      if (isBrotlied && contentEncoding) {
        refactContentEncoding()
        try {
          // an Unit8Array returned by decompression
          const result = brotliTorb.decompress(serverResData)
          resolve(Buffer.from(result))
        } catch (e) {
          reject(e)
        }
        return
      }
      resolve(serverResData)
    })
  }
  private requestRemoteResponse(requestDetail: IRequestDetail) {
    if (requestDetail.response) {
      requestDetail._directlyPassToRespond = true
      return Promise.resolve(requestDetail)
    }

    if (!requestDetail.requestOptions) {
      throw new Error('lost response or requestOptions, failed to continue')
    }
    const options = requestDetail.requestOptions
    delete options.headers['content-length'] // will reset the content-length after rule
    delete options.headers['Content-Length']
    delete options.headers['Transfer-Encoding']
    delete options.headers['transfer-encoding']

    if (this.dangerouslyIgnoreUnauthorized) {
      options.rejectUnauthorized = false
    }
    return new Promise((resolve, reject) => {
      const proxyReq = (requestDetail.protocol === 'https' ? https : http).request(options, res => {
        res.headers = getHeaderFromRawHeaders(res.rawHeaders)
        const resolveRespone = (responseData: any) => {
          resolve({
            response: responseData,
            _res: res
          })
        }
        const { statusCode, headers } = res
        let rawResChunks: Buffer[] = []
        let resDataChunks: Buffer[] = []
        let resDataStream: CommonReadableStream | null = null
        let size = 0
        res.on('data', chunk => {
          rawResChunks.push(chunk)
          if (resDataStream) {
            resDataStream.push(chunk)
            return
          }
          size += chunk.length
          resDataChunks.push(chunk)

          if (size >= this.chunkSizeThreshold) {
            resDataStream = new CommonReadableStream()
            while (resDataChunks.length) {
              resDataStream.push(resDataChunks.shift())
            }
            resolveRespone({
              statusCode,
              header: headers,
              body: resDataStream,
              rawBody: rawResChunks
            })
          }
        })

        res.on('end', async () => {
          if (resDataStream) {
            resDataStream.push(null) // indicate the stream is end
            return
          }
          const resData = await this.handleResponse({
            headers: res.headers,
            dataChunks: resDataChunks
          })
          resolveRespone({
            statusCode,
            header: res.headers,
            body: resData,
            rawBody: rawResChunks
          })
        })
        res.on('error', error => {
          log.error('error happend in response:' + error)
          reject(error)
        })
      })
      proxyReq.on('error', reject)
      proxyReq.end(requestDetail.requestData || '')
    })
  }
  private async beforeSendResponse(requestDetail: IRequestDetail, responseData: IRequestDetail) {
    if (responseData._directlyPassToRespond) {
      return responseData
    } else if (responseData.response?.body instanceof CommonReadableStream) {
      // in stream mode
      return responseData
    } else {
      const res = await this.rule?.beforeSendResponse(requestDetail, responseData)
      return res || responseData
    }
  }
  private async handleErrorResponse(error: any, fullUrl: string, requestDetail: IRequestDetail) {
    log.error(collectErrorLog(error))
    let errorResponse = {
      statusCode: 500,
      header: {
        'Content-Type': 'text/html; charset=utf-8',
        'Proxy-Error': true,
        'Proxy-Error-Message': error ? JSON.stringify(error) : 'null'
      },
      body: getErrorContent(error, fullUrl)
    }
    try {
      const userResponse = await this.rule?.onError(requestDetail, error)
      if (userResponse?.response?.header) {
        errorResponse = userResponse.response
      }
    } catch (e) {}
    return {
      response: errorResponse
    }
  }
  private sendResponse(responseInfo: IRequestDetail['response'], res: http.ServerResponse) {
    const { header, statusCode, body = '' } = responseInfo! || {}
    if (!responseInfo) {
      throw new Error('failed to get response info')
    } else if (!statusCode) {
      throw new Error('failed to get response status code')
    } else if (!header) {
      throw new Error('filed to get response header')
    }

    const transferEncoding = header['transfer-encoding'] || header['Transfer-Encoding'] || ''
    const contentLength = header['content-length'] || header['Content-Length']
    const connection = header.Connection || header.connection
    if (contentLength) {
      delete header['content-length']
      delete header['Content-Length']
    }
    if (connection) {
      header['x-nodeproxy-origin-connection'] = connection
      delete header.connection
      delete header.Connection
    }

    if (
      !global._throttle &&
      transferEncoding !== 'chunked' &&
      !(body instanceof CommonReadableStream)
    ) {
      header['Content-Length'] = Buffer.byteLength(body)
    }
    res.writeHead(statusCode, header)

    if (global._throttle) {
      if (body instanceof CommonReadableStream) {
        body.pipe(global._throttle.throttle()).pipe(res)
      } else {
        const thrStream = new Stream()
        thrStream.pipe(global._throttle.throttle()).pipe(res)
        thrStream.emit('data', body)
        thrStream.emit('end')
      }
    } else {
      if (body instanceof CommonReadableStream) {
        body.pipe(res)
      } else {
        res.end(body)
      }
    }

    return {
      ...responseInfo,
      header
    }
  }

  private recordResponseInfo(
    resourceInfoId: number,
    recordResourceInfo: IReqResourceInfo,
    responseInfo: IRequestDetail['response']
  ) {
    recordResourceInfo.endTime = new Date().getTime()
    recordResourceInfo.res = {
      //construct a self-defined res object
      statusCode: responseInfo?.statusCode!,
      headers: responseInfo?.header!
    }

    recordResourceInfo.statusCode = responseInfo?.statusCode!
    recordResourceInfo.resHeader = responseInfo?.header!
    recordResourceInfo.resBody =
      responseInfo?.body instanceof CommonReadableStream ? '(big stream)' : responseInfo?.body || ''
    recordResourceInfo.length = recordResourceInfo?.resBody?.length || 0

    this.recorder?.updateRecord(resourceInfoId, recordResourceInfo)
  }
  public requestHandler: http.RequestListener = async (req, res) => {
    const { headers, url = '', method = 'GET', connection } = req
    req.headers = getHeaderFromRawHeaders(req.rawHeaders)
    const host = headers.host!
    // @ts-ignore
    const protocol = !!connection.encrypted && !/^http:/.test(req.url) ? 'https' : 'http'

    let fullUrl = protocol + '://' + host + url
    if (protocol === 'http') {
      const reqUrlPattern = urlModule.parse(url)
      if (reqUrlPattern.host && reqUrlPattern.protocol) {
        fullUrl = url
      }
    }
    const urlPattern = urlModule.parse(fullUrl)
    const path = urlPattern.path!
    const port = urlPattern.port || (/https/.test(protocol) ? 443 : 80)
    const hostname = urlPattern.hostname || host
    let resourceInfoId = -1

    log.log(`received request to: ${method} ${host}${path}`, 'green')

    const reqData = await this.onRequestData(req)
    const recordResourceInfo: IReqResourceInfo = {
      host,
      method,
      path,
      protocol,
      url: fullUrl,
      req,
      startTime: new Date().getTime()
    }
    if (this.recorder) {
      resourceInfoId = this.handleRecorder(recordResourceInfo)
    }
    const requestDetail = {
      requestOptions: {
        hostname,
        port,
        path,
        method,
        headers
      },
      protocol,
      url: fullUrl,
      requestData: reqData,
      _req: req
    }
    const reqDatial = await this.beforeSendRequest(requestDetail)
    let responseData
    try {
      const resDatial = await this.requestRemoteResponse(reqDatial)
      responseData = await this.beforeSendResponse(requestDetail, resDatial as IRequestDetail)
    } catch (err) {
      responseData = await this.handleErrorResponse(err, fullUrl, requestDetail)
    }
    try {
      const responseInfo = await this.sendResponse(responseData, res)
      this.recordResponseInfo(resourceInfoId, recordResourceInfo, responseInfo)
    } catch (e) {
      log.error(`Send final response failed: ${e.message}`)
    }
  }
}

export default HttpRequestHandler
