import { defaultProxyRule } from '../proxy-rule'
import { INetworkProxyConfig } from '../types'
import HttpRequestHandler from './http-request-handler'
import WsRequestHandler from './ws-request-handler'
import ConnectRequestHandler from './connect-request-handler'
import HttpsServer from '../https-server/index'

class RequestHandler {
  private config: INetworkProxyConfig
  public httpHandler: HttpRequestHandler['requestHandler']
  public wsHandler: WsRequestHandler['wsRequestHandler']
  public connectHandler: ConnectRequestHandler['connectRequestHandler']
  public httpsSever: HttpsServer
  public conns: ConnectRequestHandler['conns'] = new Map()
  public sockets: ConnectRequestHandler['sockets'] = new Map()
  constructor(config: INetworkProxyConfig) {
    const rule = { ...defaultProxyRule, ...config.rule }
    this.config = config
    this.config.rule = rule
    this.httpHandler = new HttpRequestHandler(this.config).requestHandler
    this.wsHandler = new WsRequestHandler(this.config).wsRequestHandler
    this.httpsSever = new HttpsServer({
      handler: this.httpHandler,
      wsHandle: this.wsHandler
      // hostname: '127.0.0.1',
    })
    const connectRequestHandlerIns = new ConnectRequestHandler(this.config, this.httpsSever)
    this.connectHandler = connectRequestHandlerIns.connectRequestHandler
    this.conns = connectRequestHandlerIns.conns
    this.sockets = connectRequestHandlerIns.sockets
  }
}

export default RequestHandler
