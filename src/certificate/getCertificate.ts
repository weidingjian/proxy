import forge from 'node-forge'
import fs from 'fs'
import { CA_CERT_PATH, CA_KEY_PATH } from '../constant'

function geneCertificate(
  domain: string,
  altName: string,
  _caCert: string,
  caKey: string,
  serial: string
) {
  const privateKey = forge.pki.privateKeyFromPem(caKey)
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  const caCert = forge.pki.certificateFromPem(_caCert)

  cert.publicKey = keys.publicKey
  cert.serialNumber = serial
  cert.validity.notBefore = new Date()
  cert.validity.notBefore.setDate(cert.validity.notBefore.getDate() - 1)
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2)

  cert.setSubject([
    {
      name: 'commonName',
      value: domain
    },
    {
      name: 'organizationName',
      value: 'Eden Proxy Authority'
    }
  ])
  cert.setIssuer(caCert.subject.attributes)

  cert.setExtensions([
    {
      name: 'subjectAltName',
      altNames: [
        {
          type: 2, // DNS
          // type: 6, // URI
          value: altName
        }
      ]
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true
    }
  ])

  cert.sign(privateKey, forge.md.sha256.create())
  const pem = {
    privateKey: forge.pki.privateKeyToPem(keys.privateKey),
    publicKey: forge.pki.publicKeyToPem(keys.publicKey),
    certificate: forge.pki.certificateToPem(cert)
  }
  return pem
}

function getCertificateInfo(
  hostname: string
): undefined | { privateKey: string; publicKey: string; certificate: string } {
  if (fs.existsSync(CA_CERT_PATH)) {
    const caCert = fs.readFileSync(CA_CERT_PATH).toString()
    const caKey = fs.readFileSync(CA_KEY_PATH).toString()
    const serialNumber = Math.floor(Math.random() * 1000000)
    return geneCertificate(hostname, hostname, caCert, caKey, serialNumber.toString())
  }
}

export default getCertificateInfo
