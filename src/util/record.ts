import path from 'path'
import fs from 'fs-extra'
import fastJson from 'fast-json-stringify'
import { CACHE_DIR_PREFIX } from '../constant'
import { getNodeProxyCachePath } from './proxy-root'

export function getCacheDir() {
  const rand = Math.floor(Math.random() * 1000000),
    cachePath = path.join(getNodeProxyCachePath(), './' + CACHE_DIR_PREFIX + rand)
  fs.ensureDirSync(cachePath)
  return cachePath
}

export function deleteFolderContentsRecursive(dirPath: string, isClearFolderItself: boolean) {
  if (!dirPath.trim() || dirPath === '/') {
    throw new Error('can_not_delete_this_dir')
  }

  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach(file => {
      const curPath = path.join(dirPath, file)
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderContentsRecursive(curPath, true)
      } else {
        // delete all files
        fs.unlinkSync(curPath)
      }
    })

    if (isClearFolderItself) {
      try {
        // ref: https://github.com/shelljs/shelljs/issues/49
        const start = Date.now()
        while (true) {
          try {
            fs.rmdirSync(dirPath)
            break
          } catch (er) {
            if (
              process.platform === 'win32' &&
              (er.code === 'ENOTEMPTY' || er.code === 'EBUSY' || er.code === 'EPERM')
            ) {
              // Retry on windows, sometimes it takes a little time before all the files in the directory are gone
              if (Date.now() - start > 1000) {
                throw er
              }
            } else if (er.code === 'ENOENT') {
              break
            } else {
              throw er
            }
          }
        }
      } catch (e) {
        throw new Error(`could not remove directory (code ${e.code}): ${dirPath}`)
      }
    }
  }
}

export const wsMessageStingify = fastJson({
  title: 'ws message stringify',
  type: 'object',
  properties: {
    time: {
      type: 'integer'
    },
    message: {
      type: 'string'
    },
    isToServer: {
      type: 'boolean'
    }
  }
})

export function normalizeInfo(id: number, info: any) {
  const singleRecord: any = {}

  //general
  singleRecord._id = id
  singleRecord.id = id
  singleRecord.url = info.url
  singleRecord.host = info.host
  singleRecord.path = info.path
  singleRecord.method = info.method

  //req
  singleRecord.reqHeader = info.req.headers
  singleRecord.startTime = info.startTime
  singleRecord.reqBody = info.reqBody || ''
  singleRecord.protocol = info.protocol || ''

  //res
  if (info.endTime) {
    singleRecord.statusCode = info.statusCode
    singleRecord.endTime = info.endTime
    singleRecord.resHeader = info.resHeader
    singleRecord.length = info.length
    const contentType = info.resHeader['content-type'] || info.resHeader['Content-Type']
    if (contentType) {
      singleRecord.mime = contentType.split(';')[0]
    } else {
      singleRecord.mime = ''
    }

    singleRecord.duration = info.endTime - info.startTime
  } else {
    singleRecord.statusCode = ''
    singleRecord.endTime = ''
    singleRecord.resHeader = ''
    singleRecord.length = ''
    singleRecord.mime = ''
    singleRecord.duration = ''
  }

  return singleRecord
}
