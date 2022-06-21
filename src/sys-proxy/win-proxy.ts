import { IExecResult, SysProxy } from '../types'
import { execSyncWithStatus } from '../util'

class WinSysProxy implements SysProxy {
  public getNetworkType() {
    return ''
  }
  enableGlobalProxy(ip: string, port: string | number): IExecResult {
    if (!ip || !port) {
      return {
        stdout: 'failed to set global proxy server.\n ip and port are required.',
        status: -1
      }
    }

    return execSyncWithStatus(
      `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /t REG_SZ /d ${ip}:${port} /f & reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f`
    )
  }
  disableGlobalProxy(): IExecResult {
    return execSyncWithStatus(
      `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f`
    )
  }
  enableAutoProxy(pac: string): IExecResult {
    if (!pac) {
      return {
        stdout: 'failed to set auto proxy server.\n pac are required.',
        status: -1
      }
    }
    return execSyncWithStatus(
      `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v AutoConfigURL /t REG_SZ /d ${pac} /f`
    )
  }
  disableAutoProxy(): void {
    execSyncWithStatus(
      `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v AutoConfigURL /t REG_DWORD /d 0 /f`
    )
  }
  getProxyState(): IExecResult {
    return {
      status: 0,
      stdout: ''
    }
  }
}

export default WinSysProxy
