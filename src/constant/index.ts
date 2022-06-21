import path from 'path'
import { getProxyPath } from '../util/proxy-root'

export const CERTIFICATE_ROOT = getProxyPath('certificates')
export const CA_CERT_FILENAME = 'proxyRootCA.crt'
export const CA_KEY_FILENAME = 'proxyRootCA.key'
export const CA_CERT_PATH = path.resolve(CERTIFICATE_ROOT, CA_CERT_FILENAME)
export const CA_KEY_PATH = path.resolve(CERTIFICATE_ROOT, CA_KEY_FILENAME)
export const DEFAULT_CHUNK_COLLECT_THRESHOLD = 200 * 1024 * 1024

export const CACHE_DIR_PREFIX = 'cache_r'

export const WS_MESSAGE_FILE_PRFIX = 'ws_message_'
export const BODY_FILE_PRFIX = 'res_body_'
