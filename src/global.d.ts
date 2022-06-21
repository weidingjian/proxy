declare module 'colorful' {
  function cyan(content: string): string
  function red(content: string): string
  function yellow(content: string): string
  export interface Color {
    cyan(content: string): string
    red(content: string): string
    yellow(content: string): string
    [colorType: string]: (content: string) => string
  }
}

declare namespace NodeJS {
  interface Global {
    _throttle: any
  }
}
