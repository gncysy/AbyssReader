import CryptoJS from 'crypto-js'

export function md5Encode(str: string): string {
  return CryptoJS.MD5(String(str)).toString()
}

export function md5Buffer(str: string): string {
  return CryptoJS.MD5(String(str)).toString()
}
