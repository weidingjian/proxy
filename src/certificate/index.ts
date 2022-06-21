import EasyCert from 'node-easy-cert'
import inquirer from 'inquirer'
import { getProxyPath, isWin, isMac, execSyncWithStatus } from '../util'
import log from '../util/log'
import { guideToInstallCA } from '../util/guide'
import getCertificateInfo from './getCertificate'

export class Certificate {
  private options: { sharedProxy: boolean }
  private easyCert: EasyCert
  constructor(options = { sharedProxy: false }) {
    this.options = options
    this.easyCert = new EasyCert(this.easyCertOptions)
  }
  private getCommonName() {
    return `Node Proxy Root CA`
  }
  private get easyCertOptions() {
    return {
      rootDirPath: getProxyPath('certificates'),
      inMemory: false,
      defaultCertAttrs: [
        { name: 'countryName', value: 'CN' },
        { name: 'organizationName', value: this.getCommonName() },
        { shortName: 'ST', value: 'SZ' },
        { shortName: 'OU', value: 'Node Proxy SSL Authority' }
      ]
    }
  }
  public isRootCAFileExists() {
    return this.easyCert.isRootCAFileExists()
  }

  public generateRootCA(
    cb: (error: any, keyPath: string, crtPath: string) => void,
    overwrite: boolean = false
  ) {
    this.easyCert.generateRootCA(
      {
        commonName: this.getCommonName(),
        overwrite
      },
      (error, keyPath, crtPath) => {
        cb(error, keyPath, crtPath)
      }
    )
  }

  public async getCAStatus(): Promise<{ exist: boolean; trusted: boolean }> {
    if (!this.isRootCAFileExists()) {
      return {
        exist: false,
        trusted: false
      }
    }
    const status = {
      exist: true,
      trusted: !!isWin
    }
    if (!isWin) {
      status.trusted = await this.easyCert.ifRootCATrusted()
    }
    return status
  }
  public async trustRootCA() {
    const rootCAPath = this.easyCert.getRootCAFilePath()
    log.info(`The root CA file path is: ${rootCAPath}`)
    if (isMac) {
      const { trustCA } = await inquirer.prompt([
        {
          type: 'list',
          name: 'trustCA',
          message: 'The rootCA is not trusted yet, install it to the trust store now?',
          choices: ['Yes', "No, I'll do it myself"]
        }
      ])
      if (trustCA === 'Yes') {
        log.info('About to trust the root CA, this may requires your password')
        const { status, stdout } = execSyncWithStatus(
          `sudo security add-trusted-cert -d -k /Library/Keychains/System.keychain ${rootCAPath}`
        )
        if (status === 0) {
          log.info('Root CA installed, you are ready to intercept the https now')
          return
        }
        console.error(stdout)
        log.info('Failed to trust the root CA, please trust it manually')
        guideToInstallCA()
        return
      }
      log.info('Please trust the root CA manually so https interception works')
      guideToInstallCA()
      return
    }
    if (isWin) {
      log.info('You can install the root CA manually.')
    }
  }
  public getCertificate(hostname: string) {
    return getCertificateInfo(hostname)
  }
}

const certificate = new Certificate()
export default certificate
