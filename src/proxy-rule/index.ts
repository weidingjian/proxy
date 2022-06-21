import { IProxyRule } from '../types'

export const defaultProxyRule: IProxyRule = {
  summary: 'the default rule for NodeProxy',

  async beforeSendRequest(requestDetail) {
    return null
  },

  async beforeSendResponse(requestDetail, responseDetail) {
    return null
  },

  async beforeDealHttpsRequest(requestDetail) {
    return null
  },

  async onError(requestDetail, error) {
    return null
  },

  async onConnectError(requestDetail, error) {
    return null
  },

  async onClientSocketError(requestDetail, error) {
    return null
  }
}
