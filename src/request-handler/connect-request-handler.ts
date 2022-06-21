import { collectErrorLog, CommonReadableStream } from '../util'
import http from 'http'
import net from 'net'
import log from '../util/log'
import { IConnectRequestDetail, INetworkProxyConfig, IReqResourceInfo } from '../types'
import HttpsServer from '../https-server'

class ConnectRequestHandler {
  private httpServerPort: INetworkProxyConfig['port'] = ''
  private rule: INetworkProxyConfig['rule']
  private recorder: INetworkProxyConfig['recorder']
  private wsIntercept: INetworkProxyConfig['wsIntercept']
  private forceProxyHttps: INetworkProxyConfig['forceProxyHttps']
  private httpsServer: HttpsServer
  public conns: Map<string, net.Socket> = new Map()
  public sockets: Map<string, http.ServerResponse> = new Map()
  constructor(config: INetworkProxyConfig, httpsServer: HttpsServer) {
    this.rule = config.rule
    this.recorder = config.recorder
    this.forceProxyHttps = config.forceProxyHttps
    this.wsIntercept = config.wsIntercept
    this.httpServerPort = config.port
    this.httpsServer = httpsServer
  }
  private async beforeDealHttpsRequest(requestDetail: IConnectRequestDetail) {
    log.log(`received https CONNECT request ${requestDetail.host}`)
    let shouldIntercept = await this.rule?.beforeDealHttpsRequest?.(requestDetail)
    if (shouldIntercept === null) {
      return this.forceProxyHttps
    }
    return Boolean(shouldIntercept)
  }

  private resWrite200: http.RequestListener = (req, res) => {
    return new Promise(resolve => {
      // mark socket connection as established, to detect the request protocol
      res.write('HTTP/' + req.httpVersion + ' 200 OK\r\n\r\n', 'UTF-8', resolve)
    })
  }

  private onRequestData(
    res: http.ServerResponse,
    shouldIntercept: boolean,
    requestStream: CommonReadableStream,
    requestDetail: IConnectRequestDetail
  ) {
    return new Promise<{
      interceptWsRequest: boolean
      wsRequest: boolean
      shouldIntercept: boolean
    }>((resolve, reject) => {
      let wsRequest = false
      let resolved = false
      let interceptWsRequest = false
      res.on('data', chunk => {
        requestStream.push(chunk)
        if (!resolved) {
          resolved = true
          try {
            const chunkString = chunk.toString()
            if (chunkString.indexOf('GET ') === 0) {
              shouldIntercept = false // websocket, do not intercept
              wsRequest = true
              // if there is '/do-not-proxy' in the request, do not intercept the websocket
              // to avoid AnyProxy itself be proxied
              if (this.wsIntercept && chunkString.indexOf('GET /do-not-proxy') !== 0) {
                interceptWsRequest = true
              }
            }
          } catch (e) {
            console.error(e)
          }
          if (shouldIntercept) {
            log.info('will forward to local https server')
          } else {
            log.info('will bypass the man-in-the-middle proxy')
          }

          resolve({
            interceptWsRequest,
            wsRequest,
            shouldIntercept
          })
        }
      })
      res.on('error', async error => {
        log.error(collectErrorLog(error))
        try {
          await this.rule.onClientSocketError?.(requestDetail, error)
        } catch (e) {}
      })
      res.on('end', () => {
        requestStream.push(null)
      })
    })
  }
  private createProxyServer(config: {
    shouldIntercept: boolean
    port: number | string
    interceptWsRequest: boolean
    wsRequest: boolean
    host: string
  }): Promise<{ host: string; port: number | string }> {
    const { shouldIntercept, port, interceptWsRequest, host, wsRequest } = config
    if (!shouldIntercept) {
      // server info from the original request
      const originServer = {
        host,
        port: port === 80 ? 443 : port
      }
      const localHttpServer = {
        host: 'localhost',
        port: this.httpServerPort as number
      }
      // for ws request, redirect them to local ws server
      return Promise.resolve(interceptWsRequest || wsRequest ? localHttpServer : originServer)
    }
    return this.httpsServer
      .createServer(host)
      .then(serverInfo => ({ host: serverInfo.host, port: serverInfo.port }))
  }

  private connectRequest(config: {
    port: number | string
    host: string
    shouldIntercept: boolean
    requestStream: CommonReadableStream
    res: http.ServerResponse
  }) {
    const { port, host, shouldIntercept, requestStream, res } = config

    if (!port || !host) {
      throw new Error('failed to get https server info')
    }

    return new Promise((resolve, reject) => {
      const conn = net.connect(port as number, host, () => {
        //throttle for direct-foward https
        if (global._throttle && !shouldIntercept) {
          requestStream.pipe(conn)
          conn.pipe(global._throttle.throttle()).pipe(res)
        } else {
          requestStream.pipe(conn)
          conn.pipe(res)
        }

        resolve(true)
      })

      conn.on('error', e => {
        reject(e)
      })

      this.conns.set(host + ':' + port, conn)
      this.sockets.set(host + ':' + port, res)
    })
  }
  private recordResponse(resourceInfo: IReqResourceInfo, resourceInfoId: number) {
    resourceInfo.endTime = new Date().getTime()
    resourceInfo.statusCode = '200'
    resourceInfo.resHeader = {}
    resourceInfo.resBody = ''
    resourceInfo.length = 0

    this.recorder.updateRecord(resourceInfoId, resourceInfo)
  }

  private async connectError(
    error: any,
    requestDetail: IConnectRequestDetail,
    res: http.ServerResponse
  ) {
    log.error(collectErrorLog(error))

    try {
      await this.rule.onConnectError?.(requestDetail, error)
    } catch (e) {}

    try {
      let errorHeader = 'Proxy-Error: true\r\n'
      errorHeader += 'Proxy-Error-Message: ' + (error || 'null') + '\r\n'
      errorHeader += 'Content-Type: text/html\r\n'
      res.write('HTTP/1.1 502\r\n' + errorHeader + '\r\n\r\n')
    } catch (e) {}
  }
  // handler for CONNECT request
  public connectRequestHandler: http.RequestListener = async (req, res) => {
    const [host, port] = req.url!.split(':')
    const requestDetail = {
      host: req.url!,
      _req: req
    }
    const resourceInfo = {
      host,
      method: req.method!,
      path: '',
      url: 'https://' + host,
      req,
      startTime: new Date().getTime()
    }
    let resourceInfoId = -1
    const requestStream = new CommonReadableStream()
    if (this.recorder) {
      resourceInfoId = this.recorder.appendRecord(resourceInfo)
    }
    try {
      let shouldIntercept = await this.beforeDealHttpsRequest(requestDetail)
      await this.resWrite200(req, res)
      const reqResult = await this.onRequestData(res, shouldIntercept, requestStream, requestDetail)
      shouldIntercept = reqResult.shouldIntercept
      const serverInfo = await this.createProxyServer({
        port,
        host,
        ...reqResult
      })
      await this.connectRequest({
        ...serverInfo,
        shouldIntercept,
        requestStream,
        res
      })
      this.recordResponse(resourceInfo, resourceInfoId)
    } catch (error) {
      this.connectError(error, requestDetail, res)
    }
  }
}

export default ConnectRequestHandler
