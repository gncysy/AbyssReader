export * from './base64.js'
export * from './md5.js'
export * from './aes.js'
export * from './des.js'
export * from './hash.js'

export const Crypto = {
  base64Encode: (str: string): string => Buffer.from(str).toString('base64'),
  base64Decode: (str: string): string => Buffer.from(str, 'base64').toString('utf-8'),
  md5Encode: (str: string): string => {
    const CryptoJS = require('crypto-js')
    return CryptoJS.MD5(str).toString()
  },
  sha1Encode: (str: string): string => {
    const CryptoJS = require('crypto-js')
    return CryptoJS.SHA1(str).toString()
  },
  sha256Encode: (str: string): string => {
    const CryptoJS = require('crypto-js')
    return CryptoJS.SHA256(str).toString()
  },
  sha512Encode: (str: string): string => {
    const CryptoJS = require('crypto-js')
    return CryptoJS.SHA512(str).toString()
  },
  hmacSha256: (str: string, key: string): string => {
    const CryptoJS = require('crypto-js')
    return CryptoJS.HmacSHA256(str, key).toString()
  },
  randomUUID: (): string => {
    const CryptoJS = require('crypto-js')
    return CryptoJS.lib.WordArray.random(16).toString()
  },
}
