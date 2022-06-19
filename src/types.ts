export interface IExecResult {
    stdout: string;
    status: number;
}
export enum EProtocalType {
    HTTP = 'http',
    HTTPs = 'https'
}
export abstract class ProxyManager {
 abstract enableGlobalProxy(ip: string, port: string | number, protocolType?: EProtocalType): IExecResult;
 abstract disableGlobalProxy(protocolType?: EProtocalType): IExecResult;
 abstract enableAutoProxy(pac: string): IExecResult;
 abstract disableAutoProxy(): void;
 abstract getProxyState(): IExecResult;
 abstract getNetworkType(): string;
}