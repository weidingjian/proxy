import http from 'http'
import WebSocket from 'ws'
import { INetworkProxyConfig, IRequestDetail, IReqResourceInfo } from '../types'
import { WsConnectionHandler } from '../ws-server/create-server'
import log from '../util/log'

class WsRequestHandler {
  private dangerouslyIgnoreUnauthorized: INetworkProxyConfig['dangerouslyIgnoreUnauthorized'] = false
  private rule: INetworkProxyConfig['rule']
  private recorder: INetworkProxyConfig['recorder']
  constructor(config: INetworkProxyConfig) {
    this.rule = config.rule
    this.recorder = config.recorder
  }
  private getWsReqInfo(req: http.IncomingMessage) {
    const headers = req.headers || {}
    const host = headers.host!
    const hostName = host.split(':')[0]
    const port = host.split(':')[1]

    // TODO 如果是windows机器，url是不是全路径？需要对其过滤，取出
    const path = req.url || '/'
    // @ts-ignore
    const isEncript = req.connection && req.connection.encrypted
    /**
     * construct the request headers based on original connection,
     * but delete the `sec-websocket-*` headers as they are already consumed by AnyProxy
     */
    const getNoWsHeaders = () => {
      const originHeaders = Object.assign({}, headers)
      const originHeaderKeys = Object.keys(originHeaders)
      originHeaderKeys.forEach(key => {
        // if the key matchs 'sec-websocket', delete it
        if (/sec-websocket/gi.test(key)) {
          delete originHeaders[key]
        }
      })

      // delete originHeaders.connection;
      // delete originHeaders.upgrade;
      return originHeaders
    }

    return {
      headers, // the full headers of origin ws connection
      noWsHeaders: getNoWsHeaders(),
      hostName,
      port,
      path,
      protocol: isEncript ? 'wss' : 'ws'
    }
  }
  private async beforeSendRequest(requestDetail: IRequestDetail) {
    const modifedDatial = await this.rule.beforeSendRequest?.(requestDetail)
    const { protocol: wsProtocol, requestOptions = {} } = modifedDatial || {}
    const { hostname: wsHostname, port: wsPort, path: wsPath, headers: wsHeaders } = {
      ...requestDetail.requestOptions,
      ...requestOptions
    }
    const normalizedProtocol = (wsProtocol || requestDetail.protocol).replace(':', '')
    const normalizedPort = wsPort ? ':' + String(wsPort).replace(':', '') : ''
    const modifiedWsUrl = `${normalizedProtocol}://${wsHostname}${normalizedPort}${wsPath}`
    return {
      headers: wsHeaders,
      url: modifiedWsUrl
    }
  }
  private recordBeforeRequest(
    resourceInfo: any,
    options: { host: string; path: string; url: string }
  ) {
    Object.assign(resourceInfo, options)
    const id = this.recorder.appendRecord(resourceInfo)
    return id
  }

  private recordOnUpgrade(
    response: http.IncomingMessage,
    resourceInfo: IReqResourceInfo,
    resourceInfoId: number
  ) {
    resourceInfo.endTime = new Date().getTime()
    const headers = response.headers
    resourceInfo.res = {
      //construct a self-defined res object
      statusCode: response.statusCode!,
      headers: headers
    }
    resourceInfo.statusCode = response.statusCode
    resourceInfo.resHeader = headers
    resourceInfo.resBody = ''
    resourceInfo.length = resourceInfo.resBody.length

    this.recorder?.updateRecord(resourceInfoId, resourceInfo)
  }
  private recordMessage(
    messageEvent: WebSocket.MessageEvent,
    resourceInfoId: number,
    isToServer: boolean
  ) {
    const message = {
      time: Date.now(),
      message: messageEvent.data,
      isToServer
    }
    this.recorder.updateRecordWsMessage(resourceInfoId, message)
  }
  private async createProxyServer({
    url,
    headers,
    resourceInfo,
    resourceInfoId,
    wsClient
  }: {
    url: string
    headers: Record<string, any>
    resourceInfo: any
    resourceInfoId: number
    wsClient: WebSocket
  }) {
    const proxyWs = new WebSocket(url, '', {
      rejectUnauthorized: !this.dangerouslyIgnoreUnauthorized,
      headers
    })
    const clientMsgQueue: any[] = []
    const getCloseReason = (event: WebSocket.CloseEvent) => {
      const code = event.code || ''
      const reason = event.reason || ''
      let targetCode: string | number = ''
      let targetReason = ''
      if (code >= 1004 && code <= 1006) {
        targetCode = 1000 // normal closure
        targetReason = `Normally closed. The origin ws is closed at code: ${code} and reason: ${reason}`
      } else {
        targetCode = code
        targetReason = reason
      }

      return {
        code: targetCode as number,
        reason: targetReason
      }
    }
    proxyWs.onopen = () => {
      while (clientMsgQueue.length > 0) {
        const message = clientMsgQueue.shift()
        proxyWs.send(message)
      }
    }
    proxyWs.on('upgrade', response => {
      this.recordOnUpgrade(response, resourceInfo, resourceInfoId)
    })
    proxyWs.onerror = e => {
      // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent#Status_codes
      wsClient.close(1001, e.message)
      proxyWs.close(1001)
    }

    proxyWs.onmessage = event => {
      this.recordMessage(event, resourceInfoId, false)
      wsClient.readyState === 1 && wsClient.send(event.data)
    }

    proxyWs.onclose = event => {
      log.debug(`proxy ws closed with code: ${event.code} and reason: ${event.reason}`)
      const { code, reason } = getCloseReason(event)
      wsClient.readyState !== 3 && wsClient.close(code, reason)
    }

    wsClient.onmessage = event => {
      const message = event.data
      if (proxyWs.readyState === 1) {
        // if there still are msg queue consuming, keep it going
        if (clientMsgQueue.length > 0) {
          clientMsgQueue.push(message)
        } else {
          proxyWs.send(message)
        }
      } else {
        clientMsgQueue.push(message)
      }
      this.recordMessage(event, resourceInfoId, true)
    }

    wsClient.onclose = event => {
      log.debug(`original ws closed with code: ${event.code} and reason: ${event.reason}`)
      const { code, reason } = getCloseReason(event)
      proxyWs.readyState !== 3 && proxyWs.close(code, reason)
    }
  }

  private onError(error: any) {
    log.debug('WebSocket Proxy Error:' + error.message)
    log.debug(error.stack)
    console.error(error)
  }
  public wsRequestHandler: WsConnectionHandler = async (wsClient, req) => {
    let { port, path, protocol, hostName, noWsHeaders } = this.getWsReqInfo(req)
    port = port ? `:${port}` : ''
    const wsUrl = `${protocol}://${hostName}${port}${path}`
    const requestDetail = {
      requestOptions: {
        hostname: hostName,
        port,
        path: path,
        method: req.method,
        headers: noWsHeaders
      },
      protocol: protocol,
      url: wsUrl,
      requestData: Buffer.alloc(0),
      _req: req
    }
    try {
      const { headers, url } = await this.beforeSendRequest(requestDetail)

      const resourceInfo = {
        wsMessages: [], // all ws messages go through AnyProxy
        method: 'WebSocket',
        req,
        startTime: new Date().getTime()
      }
      const resourceInfoId = this.recordBeforeRequest(resourceInfo, { host: hostName, path, url })

      await this.createProxyServer({
        url,
        headers,
        resourceInfo,
        resourceInfoId,
        wsClient
      })
    } catch (err) {
      this.onError(err)
    }
  }
}

export default WsRequestHandler
