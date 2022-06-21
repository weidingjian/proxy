import path from 'path'
import os from 'os'
import fs from 'fs-extra'

function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '~'
}

function getProxyRoot() {
  const root = path.join(getHomeDir(), '.node-proxy')
  if (!fs.existsSync(root)) {
    fs.ensureDirSync(root)
  }
  return root
}

export function getProxyPath(filename: string) {
  const proxyPath = path.join(getProxyRoot(), filename)
  if (!fs.existsSync(proxyPath)) {
    fs.ensureDirSync(proxyPath)
  }
  return proxyPath
}

export const getNodeProxyCachePath = function() {
  const targetPath = path.join(os.tmpdir(), 'nodeproxy', 'cache')
  if (!fs.existsSync(targetPath)) {
    fs.ensureDirSync(targetPath)
  }
  return targetPath
}
