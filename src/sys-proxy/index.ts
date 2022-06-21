import { SysProxy } from '../types'
import LinuxSysProxy from './linux-proxy'
import MacSysProxy from './mac-proxy'
import WinSysProxy from './win-proxy'
import { isLinux, isWin, isMac } from '../util/platform'

const { platform } = process

export let sysProxy: SysProxy

if (isWin) {
  sysProxy = new WinSysProxy()
} else if (isLinux) {
  sysProxy = new LinuxSysProxy()
} else if (isMac) {
  sysProxy = new MacSysProxy()
}
