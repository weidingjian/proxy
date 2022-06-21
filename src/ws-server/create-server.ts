import WebSocket from 'ws'
import https from 'https'
import http from 'http'
import log from '../util/log'
type WsConnectionHandlerParameters<T> = T extends (event: 'connection', ...arg: infer P) => any
  ? P
  : never
export type WsConnectionHandler = WsConnectionHandlerParameters<WebSocket.Server['on']>[0]

const createWsServer = (config: {
  server: https.Server | http.Server
  connHandler: WsConnectionHandler
}) => {
  const wss = new WebSocket.Server({
    server: config.server
  })

  wss.on('connection', config.connHandler)

  wss.on('headers', headers => {
    headers.push('x-anyproxy-websocket:true')
  })

  wss.on('error', e => {
    log.error(`error in websocket proxy: ${e.message},\r\n ${e.stack}`)
    console.error('error happened in proxy websocket:', e)
  })

  wss.on('close', () => {
    console.error('==> closing the ws server')
  })
}

export default createWsServer
