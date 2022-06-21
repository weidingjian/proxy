import NetworkProxyCore from './core'
import Recorder from './recorder'
import { INetworkProxyConfig } from './types'

class NerworkProxy extends NetworkProxyCore {
  private recorder: INetworkProxyConfig['recorder']
  constructor(config: INetworkProxyConfig) {
    // prepare a recorder
    const recorder = new Recorder()
    const configForCore = Object.assign(
      {
        recorder
      },
      config
    )

    super(configForCore)

    this.recorder = recorder
  }

  async start() {
    if (this.recorder) {
      this.recorder.setDbAutoCompact()
    }

    super.start()
  }

  close() {
    const self = this
    // release recorder
    if (self.recorder) {
      self.recorder.stopDbAutoCompact()
      self.recorder.clear()
    }
    self.recorder = null

    // close ProxyCore
    return super.close()
  }
}

export default NerworkProxy
