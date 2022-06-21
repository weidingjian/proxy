import http from 'http'
export interface IExecResult {
  stdout: string
  status: number
}

export type ProtocalType = 'http' | 'https'

export abstract class SysProxy {
  abstract enableGlobalProxy(
    ip: string,
    port: string | number,
    protocolType?: ProtocalType
  ): IExecResult
  abstract disableGlobalProxy(protocolType?: ProtocalType): IExecResult
  abstract enableAutoProxy(pac: string): IExecResult
  abstract disableAutoProxy(): void
  abstract getProxyState(): IExecResult
  abstract getNetworkType(): string
}

export interface INetworkProxyConfig {
  port: number | string
  rule: IProxyRule
  protocolType: ProtocalType
  hostname: string
  throttle: number
  forceProxyHttps: boolean
  silent: boolean
  dangerouslyIgnoreUnauthorized: any
  recorder: any
  wsIntercept: boolean
}

export interface IRequestDetail {
  protocol: string
  requestOptions: {
    hostname: string
    port: number | string
    path: string
    method: string
    headers: Record<string, any>
    rejectUnauthorized?: boolean
  }
  requestData: Buffer
  response?: {
    statusCode: number
    header: Record<string, any>
    body: Buffer
  }
  _directlyPassToRespond?: boolean
}

export interface IResponseDetail {}
export interface IProxyRule {
  summary: string
  beforeSendRequest(requestDetail: IRequestDetail): Promise<IRequestDetail>
  beforeSendResponse(requestDetail: IRequestDetail, responseDetail: IRequestDetail): Promise<any>
  beforeDealHttpsRequest(requestDetail: IConnectRequestDetail): Promise<any>
  onError(requestDetail: IRequestDetail, error: any): Promise<any>
  onConnectError(requestDetail: IConnectRequestDetail, error: any): Promise<any>
  onClientSocketError(requestDetail: IConnectRequestDetail, error: any): Promise<any>
}

export interface IConnectRequestDetail {
  host: string
  _req: http.IncomingMessage
}

export interface IReqResourceInfo {
  host: string
  method: string
  path: string
  protocol?: 'http' | 'https'
  url: string
  req: http.IncomingMessage
  startTime: number
  endTime?: number
  reqBody?: string
  res?: {
    statusCode: number | string
    headers: Record<string, any>
  }
  statusCode?: number | string
  resHeader?: Record<string, any>
  resBody?: Buffer | string
  length?: number
}
