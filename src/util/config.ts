import certificate from '../certificate'
import { INetworkProxyConfig } from '../types'
import { ThrottleGroup } from 'stream-throttle'
import log from './log'

export const handleProxyConfig = (config: Partial<INetworkProxyConfig>) => {
  if (parseInt(process.versions.node.split('.')[0], 10) < 4) {
    throw new Error('node.js >= v4.x is required for nodeproxy')
  }
  if (config.forceProxyHttps && !certificate.isRootCAFileExists()) {
    log.log('You can run `nodeproxy-ca` to generate one root CA and then re-run this command')
    throw new Error('root CA not found. Please run `nodeproxy-ca` to generate one first.')
  }

  if (config.protocolType === 'https' && !config.hostname) {
    throw new Error('hostname is required in https proxy')
  }
  if (!config.port) {
    throw new Error('proxy port is required')
  }

  if (!config.recorder) {
    throw new Error('recorder is required')
  }
  if (config.forceProxyHttps && config.rule && config.rule.beforeDealHttpsRequest) {
    log.warn(
      'both "-i(--intercept)" and rule.beforeDealHttpsRequest are specified, the "-i" option will be ignored.'
    )
    config.forceProxyHttps = false
  }
  if (config.silent) {
    log.setIsPrint(false)
  }

  if (config.throttle) {
    log.log(`throttle :${config.throttle}kb/s`)
    const rate = config.throttle
    if (rate < 1) {
      throw new Error('Invalid throttle rate value, should be positive integer')
    }
    global._throttle = new ThrottleGroup({ rate: 1024 * rate }) // rate - byte/sec
  }
}
