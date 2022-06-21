import net from 'net'
export const getFreePort = function() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo
      server.close(() => {
        resolve(port)
      })
    })
  })
}

export const isIp = function(domain: string) {
  if (!domain) {
    return false
  }
  const ipReg = /^\d+?\.\d+?\.\d+?\.\d+?$/

  return ipReg.test(domain)
}
