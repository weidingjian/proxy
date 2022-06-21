import events from 'events'
import fs from 'fs-extra'
import path from 'path'
import iconv from 'iconv-lite'
import Datastore from 'nedb'
import { BODY_FILE_PRFIX, WS_MESSAGE_FILE_PRFIX } from '../constant'
import {
  deleteFolderContentsRecursive,
  getCacheDir,
  normalizeInfo,
  wsMessageStingify
} from '../util'
import log from '../util/log'

class Recorder extends events.EventEmitter {
  private globalId: number = 1
  private cachePath: string = getCacheDir()
  private db: Datastore = new Datastore()
  private recordBodyMap: Map<string, any> = new Map()
  constructor() {
    super()
  }
  public setDbAutoCompact() {
    this.db.persistence.setAutocompactionInterval(5001)
  }

  stopDbAutoCompact() {
    try {
      this.db.persistence.stopAutocompaction()
    } catch (e) {
      log.error(e)
    }
  }

  emitUpdate(id: number, info?: any) {
    if (info) {
      this.emit('update', info)
    } else {
      this.getSingleRecord(id, (err, doc) => {
        if (!err && !!doc && !!doc[0]) {
          this.emit('update', doc[0])
        }
      })
    }
  }
  emitUpdateLatestWsMessage(id: number, message: any) {
    this.emit('updateLatestWsMsg', message)
  }

  updateRecord(id: number, info: any) {
    if (id < 0) return
    const self = this
    const db = self.db

    const finalInfo = normalizeInfo(id, info)

    db.update({ _id: id }, finalInfo)
    this.updateRecordBody(id, info)

    this.emitUpdate(id, finalInfo)
  }

  updateRecordWsMessage(id: number, message: any) {
    if (id < 0) return
    try {
      this.getCacheFile(WS_MESSAGE_FILE_PRFIX + id, (err, recordWsMessageFile) => {
        if (err) return
        fs.appendFile(recordWsMessageFile, wsMessageStingify(message) + ',', () => {})
      })
    } catch (e) {
      console.error(e)
      log.error(e.message + e.stack)
    }

    this.emitUpdateLatestWsMessage(id, {
      id: id,
      message: message
    })
  }

  updateExtInfo(id: number, extInfo: any) {
    const self = this
    const db = self.db

    db.update({ _id: id }, { $set: { ext: extInfo } }, {}, (err, nums) => {
      if (!err) {
        this.emitUpdate(id)
      }
    })
  }

  appendRecord(info: any) {
    if (info.req.headers.anyproxy_web_req) {
      //TODO request from web interface
      return -1
    }
    const thisId = this.globalId++
    const finalInfo = normalizeInfo(thisId, info)
    this.db.insert(finalInfo)
    this.updateRecordBody(thisId, info)

    this.emitUpdate(thisId, finalInfo)
    return thisId
  }

  updateRecordBody(id: number, info: any) {
    const self = this

    if (id === -1) return

    if (!id || typeof info.resBody === 'undefined') return
    //add to body map
    //ignore image data
    this.getCacheFile(BODY_FILE_PRFIX + id, (err, bodyFile) => {
      if (err) return
      fs.writeFile(bodyFile, info.resBody, () => {})
    })
  }

  /**
   * get body and websocket file
   *
   */
  getBody(id: number, cb: (error?: any, content?: any) => void) {
    if (id < 0) {
      cb && cb('')
      return
    }
    this.getCacheFile(BODY_FILE_PRFIX + id, (error, bodyFile) => {
      if (error) {
        cb && cb(error)
        return
      }
      // @ts-ignore
      fs.access(bodyFile, fs.F_OK || fs.R_OK, err => {
        if (err) {
          cb && cb(err)
        } else {
          fs.readFile(bodyFile, cb)
        }
      })
    })
  }

  getDecodedBody(id: number, cb: any) {
    const result: any = {
      method: '',
      type: 'unknown',
      mime: '',
      content: ''
    }
    this.getSingleRecord(id, (err, doc) => {
      //check whether this record exists
      if (!doc || !doc[0]) {
        cb(new Error('failed to find record for this id'))
        return
      }

      // also put the `method` back, so the client can decide whether to load ws messages
      result.method = doc[0].method

      this.getBody(id, (error, bodyContent) => {
        if (error) {
          cb(error)
        } else if (!bodyContent) {
          cb(null, result)
        } else {
          const record = doc[0],
            resHeader = record.resHeader || {}
          try {
            const headerStr = JSON.stringify(resHeader),
              charsetMatch = headerStr.match(/charset='?([a-zA-Z0-9-]+)'?/),
              contentType = resHeader && (resHeader['content-type'] || resHeader['Content-Type'])

            if (charsetMatch && charsetMatch.length) {
              const currentCharset = charsetMatch[1].toLowerCase()
              if (currentCharset !== 'utf-8' && iconv.encodingExists(currentCharset)) {
                bodyContent = iconv.decode(bodyContent, currentCharset)
              }

              result.content = bodyContent.toString()
              result.type = contentType && /application\/json/i.test(contentType) ? 'json' : 'text'
            } else if (contentType && /image/i.test(contentType)) {
              result.type = 'image'
              result.content = bodyContent
            } else {
              result.type = contentType
              result.content = bodyContent.toString()
            }
            result.mime = contentType
            result.fileName = path.basename(record.path)
            result.statusCode = record.statusCode
          } catch (e) {
            console.error(e)
          }
          cb(null, result)
        }
      })
    })
  }

  /**
   * get decoded WebSoket messages
   *
   */
  getDecodedWsMessage(id: number, cb: (err: any, d?: any) => void) {
    if (id < 0) {
      cb && cb([])
      return
    }

    this.getCacheFile(WS_MESSAGE_FILE_PRFIX + id, (outError, wsMessageFile) => {
      if (outError) {
        cb && cb(outError)
        return
      }
      // @ts-ignore
      fs.access(wsMessageFile, fs.F_OK || fs.R_OK, err => {
        if (err) {
          cb && cb(err)
        } else {
          fs.readFile(wsMessageFile, 'utf8', (error, content) => {
            if (error) {
              cb && cb(err)
            }

            try {
              // remove the last dash "," if it has, since it's redundant
              // and also add brackets to make it a complete JSON structure
              content = `[${content.replace(/,$/, '')}]`
              const messages = JSON.parse(content)
              cb(null, messages)
            } catch (e) {
              console.error(e)
              log.error(e.message + e.stack)
              cb(e)
            }
          })
        }
      })
    })
  }

  getSingleRecord(id: number, cb: (err: any, doc: any) => void) {
    this.db.find({ _id: id }, cb)
  }

  getSummaryList(cb: any) {
    this.db.find({}, cb)
  }

  getRecords(idStart: number, limit: number, cb: any) {
    limit = limit || 10
    idStart = typeof idStart === 'number' ? idStart : this.globalId - limit
    this.db
      .find({ _id: { $gte: idStart } })
      .sort({ _id: 1 })
      .limit(limit)
      .exec(cb)
  }

  clear() {
    log.info('clearing cache file...')
    const self = this
    deleteFolderContentsRecursive(self.cachePath, true)
  }

  getCacheFile(fileName: string, cb: (error: null | Error, data?: any) => void) {
    const self = this
    const cachePath = self.cachePath
    const filepath = path.join(cachePath, fileName)

    if (filepath.indexOf(cachePath) !== 0) {
      cb && cb(new Error('invalid cache file path'))
    } else {
      cb && cb(null, filepath)
      return filepath
    }
  }
}

export default Recorder
