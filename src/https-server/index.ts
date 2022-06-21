import http from 'http'
import https from 'https'
import WebSocket from 'ws'
import assert from 'assert'
import tls from 'tls'
import constants from 'constants'
import { getFreePort, isIp } from '../util'
import certificate from '../certificate'
import log from '../util/log'
import createWsServer, { WsConnectionHandler } from '../ws-server/create-server'

class HttpsServer {
  private handler: http.RequestListener
  private wsHandler?: WsConnectionHandler
  private activeServers: Map<string, https.Server | WebSocket.Server> = new Map()
  constructor(config: { handler: http.RequestListener; wsHandle?: WsConnectionHandler }) {
    this.handler = config.handler
    this.wsHandler = config.wsHandle
  }
  private createHttpsIPServer(hostname: string, port: number) {
    assert(hostname && port && this.handler, 'invalid param for https IP server')
    const certInfo = certificate.getCertificate(hostname)
    if (!certInfo) {
      throw new Error('get certificate error')
    }
    const server = https
      .createServer(
        {
          secureOptions: constants.SSL_OP_NO_SSLv3 || constants.SSL_OP_NO_TLSv1,
          key: certInfo.privateKey,
          cert: certInfo.certificate
        },
        this.handler
      )
      .listen(port)

    return server
  }
  private createHttpsSNIServer(port: number) {
    assert(port && this.handler, 'invalid param for https SNI server')
    const SNIPrepareCert: tls.TlsOptions['SNICallback'] = (serverName: string, SNICallback) => {
      try {
        const certInfo = certificate.getCertificate(serverName)
        if (!certInfo) {
          throw new Error('get certificate error')
        }
        const ctx = tls.createSecureContext({
          key: certInfo?.privateKey,
          cert: certInfo?.certificate
        })

        log.warn(`[internal https] proxy server for ${serverName} established`)
        SNICallback(null, ctx)
      } catch (err) {
        log.error(`err occurred when prepare certs for SNI - ${err}`)
        log.error(`err occurred when prepare certs for SNI - ${err.stack}`)
        SNICallback(err, null as any)
      }
    }
    const server = https
      .createServer(
        {
          secureOptions: constants.SSL_OP_NO_SSLv3 || constants.SSL_OP_NO_TLSv1,
          SNICallback: SNIPrepareCert
        },
        this.handler
      )
      .listen(port)
    return server
  }
  public async createServer(hostname: string) {
    const serverHost = '127.0.0.1'
    const isIPHost = hostname && isIp(hostname)
    const port = await getFreePort()
    const serverName = isIPHost ? hostname : serverHost
    const httpsServer: https.Server = isIPHost
      ? this.createHttpsIPServer(hostname, port)
      : this.createHttpsSNIServer(port)
    this.activeServers.set(serverName, httpsServer)

    if (this.wsHandler) {
      createWsServer({
        server: httpsServer,
        connHandler: this.wsHandler
      })
    }
    httpsServer.on('upgrade', (req, cltSocket, head) => {
      log.debug('will let WebSocket server to handle the upgrade event')
    })
    return {
      host: serverHost,
      port
    }
  }

  public close(hostnames?: string[]) {
    if (Array.isArray(hostnames)) {
      hostnames.forEach(hostname => {
        const server = this.activeServers.get(hostname)
        if (server) {
          server.close()
          this.activeServers.delete(hostname)
        }
      })
      return
    }
    this.activeServers.forEach(server => {
      server.close()
    })
    this.activeServers.clear()
  }
}

export default HttpsServer
