import http from 'http'
import { Readable } from 'stream'
import { DEFAULT_CHUNK_COLLECT_THRESHOLD } from '../constant'
export const getHeaderFromRawHeaders = function(rawHeaders?: http.IncomingMessage['rawHeaders']) {
  const header: Record<string, any> = {}
  if (!rawHeaders) {
    return header
  }
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const key = rawHeaders[i]
    let value = rawHeaders[i + 1]
    if (typeof value === 'string') {
      value = value.replace(/\0+$/g, '') // 去除 \u0000的null字符串
    }
    if (!header[key]) {
      header[key] = value
      continue
    }
    // headers with same fields could be combined with comma. Ref: https://www.w3.org/Protocols/rfc2616/rfc2616-sec4.html#sec4.2
    // set-cookie should NOT be combined. Ref: https://tools.ietf.org/html/rfc6265
    if (key.toLowerCase() === 'set-cookie') {
      if (Array.isArray(header[key])) {
        header[key].push(value)
        continue
      }
      header[key] = [header[key], value]
      continue
    }
    header[key] = `${header[key]}, ${value}`
  }
  return header
}

export class CommonReadableStream extends Readable {
  constructor(config?: any) {
    super({
      highWaterMark: DEFAULT_CHUNK_COLLECT_THRESHOLD * 5
    })
  }
  _read(size: number) {}
}

export const collectErrorLog = function(error: any) {
  if (error && error.code && error.toString()) {
    return error.toString()
  } else {
    let result = [error, error.stack].join('\n')
    try {
      const errorString = error.toString()
      if (errorString.indexOf('You may only yield a function') >= 0) {
        result =
          'Function is not yieldable. Did you forget to provide a generator or promise in rule file ? \nFAQ http://anyproxy.io/4.x/#faq'
      }
    } catch (e) {}
    return result
  }
}
