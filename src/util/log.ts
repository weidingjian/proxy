import { formatDate } from './date'
import color from 'colorful'

enum ELogType {
  TIP = 0,
  SYS_ERR = 1,
  RULE_ERR = 2,
  WARN = 3,
  DEBUG = 4
}

const logTypeMapColorFn = {
  [ELogType.TIP]: 'cyan',
  [ELogType.SYS_ERR]: 'red',
  [ELogType.RULE_ERR]: 'red',
  [ELogType.WARN]: 'yellow',
  [ELogType.DEBUG]: 'cyan'
}

const logTypeMapConsoleFn = {
  [ELogType.TIP]: 'log',
  [ELogType.SYS_ERR]: 'error',
  [ELogType.RULE_ERR]: 'error',
  [ELogType.WARN]: 'log',
  [ELogType.DEBUG]: 'log'
}

const logTypeMap = {
  [ELogType.TIP]: 'Log',
  [ELogType.SYS_ERR]: 'ERROR',
  [ELogType.RULE_ERR]: 'RULE_ERROR',
  [ELogType.WARN]: 'WARN',
  [ELogType.DEBUG]: 'DEBUG'
}

class Log {
  private logLevel: number = 0
  private isPrint: boolean = true
  private logPrefix: string = 'NodeProxy'
  public log(content: string, type?: ELogType | string, shouldCompareLogLevel?: boolean) {
    if (!this.isPrint) {
      return
    }
    const timeString = formatDate(new Date(), 'YYYY-MM-DD hh:mm:ss')
    if (!type) {
      console.log(color.cyan(`[${this.logPrefix} Log][${timeString}]: ${content}`))
      return
    }
    if (shouldCompareLogLevel && type > this.logLevel) {
      return
    }
    const logContent = `[${this.logPrefix} ${
      logTypeMap[type as ELogType]
    }][${timeString}]: ${content}`
    const colorFn = logTypeMapColorFn[type as ELogType] || type
    const consoleFn = logTypeMapConsoleFn[type as ELogType] || 'log'
    // @ts-ignore
    const colorFormat = color[colorFn](logContent)
    // @ts-ignore
    console[consoleFn](colorFormat)
  }
  public setLogLevel(level: string | number) {
    this.logLevel = typeof level === 'number' ? level : parseInt(level, 10) || 0
  }
  public setIsPrint(isPrint: boolean) {
    this.isPrint = isPrint
  }
  public setLogPrefix(prefix: string) {
    this.logPrefix = prefix
  }

  public debug(content: string) {
    this.log(content, ELogType.DEBUG)
  }

  public info(content: string) {
    this.log(content, ELogType.TIP)
  }
  public warn(content: string) {
    this.log(content, ELogType.WARN)
  }
  public error(content: string) {
    this.log(content, ELogType.SYS_ERR)
  }
  public ruleError(content: string) {
    this.log(content, ELogType.RULE_ERR)
  }
}

const log = new Log()

export default log
