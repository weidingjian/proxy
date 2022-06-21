import { IExecResult, SysProxy } from '../types'
// import { execSyncWithStatus } from "../util.ts";

class LinuxSysProxy implements SysProxy {
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

    return {
      stdout: 'unsupport to set proxy in linux',
      status: -1
    }
  }
  disableGlobalProxy(): IExecResult {
    return {
      status: 0,
      stdout: ''
    }
  }
  enableAutoProxy(pac: string): IExecResult {
    return {
      status: -1,
      stdout: 'failed to set auto proxy'
    }
  }
  disableAutoProxy(): void {}
  getProxyState(): IExecResult {
    return {
      status: 0,
      stdout: ''
    }
  }
}

export default LinuxSysProxy
