import { EventEmitter } from 'events'
import net from 'net'
import https from 'https'
import http from 'http'
import certificate from './certificate'
import RequestHandler from './request-handler'
import { INetworkProxyConfig } from './types'
import { handleProxyConfig } from './util/config'
import log from './util/log'
import createWsServer from './ws-server/create-server'

enum EProxyStatus {
  INIT = 'INIT',
  READY = 'READY',
  CLOSED = 'CLOSED'
}
export default class NetworkProxyCore extends EventEmitter {
  private proxyStatus: EProxyStatus = EProxyStatus.INIT
  private proxyPort?: INetworkProxyConfig['port']
  private proxyProtocolType?: INetworkProxyConfig['protocolType'] = 'http'
  private proxyHostname?: INetworkProxyConfig['hostname']
  private socketIndex: number = 0
  private socketPool: Map<string, net.Socket> = new Map()
  private httpProxyServer: https.Server | http.Server | null = null
  private requestHandler: RequestHandler | null = null
  private proxyRule: INetworkProxyConfig['rule']
  constructor(
    config: Partial<INetworkProxyConfig> = {
      hostname: 'localhost',
      forceProxyHttps: true,
      protocolType: 'https'
    }
  ) {
    super()
    handleProxyConfig(config)
    this.proxyPort = config.port
    this.proxyProtocolType = config.protocolType
    this.proxyHostname = config.hostname
    this.proxyRule = config.rule!
    this.requestHandler = new RequestHandler({
      wsIntercept: config.wsIntercept!,
      port: config.port!,
      forceProxyHttps: Boolean(config.forceProxyHttps),
      dangerouslyIgnoreUnauthorized: Boolean(config.dangerouslyIgnoreUnauthorized),
      rule: this.proxyRule!,
      recorder: config.recorder!,
      hostname: this.proxyHostname!,
      protocolType: this.proxyProtocolType!,
      throttle: config.throttle!,
      silent: config.silent!
    })
  }
  private createServer() {
    if (this.proxyProtocolType === 'https') {
      const certInfo = certificate.getCertificate(this.proxyHostname!)
      if (certInfo) {
        this.httpProxyServer = https.createServer(
          {
            key: certInfo.privateKey,
            cert: certInfo.certificate
          },
          this.requestHandler?.httpHandler
        )
        return
      }
    }
    this.httpProxyServer = http.createServer(this.requestHandler?.httpHandler)
  }

  private startServer() {
    this.httpProxyServer?.on('connect', this.requestHandler?.connectHandler!)

    createWsServer({
      server: this.httpProxyServer!,
      connHandler: this.requestHandler?.wsHandler!
    })

    this.httpProxyServer?.on('connection', socket => {
      this.handleExistConnections(socket)
    })
    this.httpProxyServer?.listen(this.proxyPort)
  }
  private handleExistConnections(socket: net.Socket) {
    this.socketIndex++
    const key = `socketIndex_${this.socketIndex}`
    this.socketPool.set(key, socket)

    socket.on('close', () => {
      this.socketPool.delete(key)
    })
  }
  private async onServerReady() {
    const tipText = `${this.proxyProtocolType} proxy started on port ${this.proxyPort}`
    log.log(tipText, 'green')

    let ruleSummaryString = ''
    const ruleSummary: string | Function = this.proxyRule.summary
    if (ruleSummary) {
      if (typeof ruleSummary === 'string') {
        ruleSummaryString = ruleSummary
      } else {
        // @ts-ignore
        ruleSummaryString = await ruleSummary()
      }
      log.log(`Active rule is: ${ruleSummaryString}`, 'green')
    }
    this.proxyStatus = EProxyStatus.READY
    this.emit('ready')
  }

  private onServerError(err: any) {
    const tipText = 'err when start proxy server :('
    log.error(tipText)
    log.error(err)
    this.emit('error', {
      error: err
    })
  }
  public async start() {
    this.socketIndex = 0
    this.socketPool = new Map()
    this.proxyStatus = EProxyStatus.INIT

    if (this.proxyStatus !== EProxyStatus.INIT) {
      throw new Error('server status is not EProxyStatus.INIT, can not run start()')
    }
    try {
      this.createServer()
      this.startServer()
      await this.onServerReady()
    } catch (err) {
      this.onServerError(err)
    }
  }

  public close() {
    return new Promise<any>(resolve => {
      if (this.httpProxyServer) {
        // destroy conns & cltSockets when closing proxy server
        this.requestHandler?.conns.forEach((socket, key) => {
          log.info(`destorying https connection : ${key}`)
          socket.end()
        })

        this.requestHandler?.sockets.forEach((socket, key) => {
          log.info(`closing https socket : ${key}`)
          socket.end()
        })

        if (this.requestHandler?.httpsSever) {
          this.requestHandler.httpsSever.close()
        }

        if (this.socketPool) {
          for (const key in this.socketPool) {
            this.socketPool.get(key)?.destroy()
            this.socketPool.delete(key)
          }
        }

        this.httpProxyServer.close(error => {
          if (error) {
            console.error(error)
            log.error(`proxy server close FAILED : ${error.message}`)
          } else {
            this.httpProxyServer = null

            this.proxyStatus = EProxyStatus.CLOSED
            log.info(`proxy server closed at ${this.proxyHostname}:${this.proxyPort}`)
          }
          resolve(error)
        })
      } else {
        resolve(null)
      }
    })
  }
}
