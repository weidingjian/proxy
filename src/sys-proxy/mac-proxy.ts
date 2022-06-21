import { ProtocalType, IExecResult, SysProxy } from '../types'
import { address } from 'ip'
import { execSyncWithStatus } from '../util'

const networkTypes = ['Wi-Fi', 'Ethernet', 'Thunderbolt Ethernet']
const localIp = address()
class MacSysProxy implements SysProxy {
  private _networkType: string
  public getNetworkType() {
    if (this._networkType) {
      return this._networkType
    }
    const { status, stdout } = execSyncWithStatus('networksetup -listallnetworkservices')
    if (status === 0) {
      const networkTypeList = stdout
        .split(/\r?\n/)
        .slice(1)
        .filter(Boolean)
      for (const type of networkTypeList) {
        const { status: infoStatus, stdout: infoStdout } = execSyncWithStatus(
          `networksetup -getinfo "${type}"`
        )
        if (infoStatus === 0 && /IP\saddress\:\s\d+\.\d+\.\d+\.\d+/.test(infoStdout)) {
          this._networkType = type
          return type
        }
      }
    }
    for (const type of networkTypes) {
      const result = execSyncWithStatus(`networksetup -getwebproxy "${type}"`)
      if (result.status === 0) {
        this._networkType = type
        return type
      }
    }
  }
  enableGlobalProxy(ip: string, port: string | number, protocolType: ProtocalType): IExecResult {
    if (!ip || !port) {
      return {
        stdout: 'failed to set global proxy server.\n ip and port are required.',
        status: -1
      }
    }
    const c = protocolType === 'https' ? 'setsecurewebproxy' : 'setwebproxy'

    return execSyncWithStatus(
      `networksetup -${c} "${this._networkType}" ${ip} ${port} && networksetup -setproxybypassdomains "${this._networkType}" 127.0.0.1 localhost ${localIp}`
    )
  }
  disableGlobalProxy(protocolType: ProtocalType): IExecResult {
    const c = protocolType === 'https' ? 'setsecurewebproxystate' : 'setwebproxystate'
    return execSyncWithStatus(`networksetup -${c} "${this._networkType}" off`)
  }
  enableAutoProxy(pac: string): IExecResult {
    if (!pac) {
      return {
        stdout: 'failed to set auto proxy server.\n pac are required.',
        status: -1
      }
    }
    return execSyncWithStatus(`networksetup -setautoproxyurl "${this._networkType}" ${pac}`)
  }
  disableAutoProxy(): void {
    execSyncWithStatus(`networksetup -setautoproxystate "${this._networkType}" off`)
  }
  getProxyState(): IExecResult {
    return execSyncWithStatus(`networksetup -getwebproxy "${this._networkType}"`)
  }
  constructor() {
    this._networkType = this.getNetworkType()
  }
}

export default MacSysProxy
