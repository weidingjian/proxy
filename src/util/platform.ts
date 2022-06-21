const { platform } = process

export const isWin = /^win/.test(platform)

export const isLinux = /^linux/.test(platform)

export const isMac = /^darwin/.test(platform)
