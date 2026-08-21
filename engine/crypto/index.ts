// ============================================
// 加密模块 — crypto-js
// ============================================

import CryptoJS from 'crypto-js'

export function md5(str: string): string {
  return CryptoJS.MD5(String(str)).toString()
}

export function md5Short(str: string): string {
  return md5(str).substring(8, 24)
}

export function sha1(str: string): string {
  return CryptoJS.SHA1(str).toString()
}

export function sha256(str: string): string {
  return CryptoJS.SHA256(str).toString()
}

export function sha512(str: string): string {
  return CryptoJS.SHA512(str).toString()
}

export function hmacSha256(str: string, key: string): string {
  return CryptoJS.HmacSHA256(str, key).toString()
}

export function hmacHex(str: string, key: string, algorithm = 'sha256'): string {
  const map: Record<string, unknown> = {
    sha1: CryptoJS.HmacSHA1,
    sha256: CryptoJS.HmacSHA256,
    sha384: CryptoJS.HmacSHA384,
    sha512: CryptoJS.HmacSHA512,
    md5: CryptoJS.HmacMD5,
  }
  const algo = map[algorithm.toLowerCase()] as ((str: string, key: string) => CryptoJS.lib.WordArray) | undefined
  if (!algo) return CryptoJS.HmacSHA256(str, key).toString()
  return algo(str, key).toString()
}

export function digestHex(str: string, algorithm = 'sha256'): string {
  const map: Record<string, unknown> = {
    sha1: CryptoJS.SHA1,
    sha256: CryptoJS.SHA256,
    sha384: CryptoJS.SHA384,
    sha512: CryptoJS.SHA512,
    md5: CryptoJS.MD5,
  }
  const algo = map[algorithm.toLowerCase()] as ((str: string) => CryptoJS.lib.WordArray) | undefined
  if (!algo) return CryptoJS.SHA256(str).toString()
  return algo(str).toString()
}

export function base64Encode(str: string): string {
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(str))
}

export function base64Decode(str: string): string {
  const parsed = CryptoJS.enc.Base64.parse(str)
  return CryptoJS.enc.Utf8.stringify(parsed)
}

export function base64DecodeToBytes(str: string): Uint8Array {
  const parsed = CryptoJS.enc.Base64.parse(str)
  const words = parsed.words
  const sigBytes = parsed.sigBytes
  const bytes = new Uint8Array(sigBytes)
  for (let i = 0; i < sigBytes; i++) {
    const word = words[i >>> 2]
    if (word !== undefined) {
      bytes[i] = (word >>> (24 - (i % 4) * 8)) & 0xff
    }
  }
  return bytes
}

export function aesEncrypt(data: string, key: string, mode: 'CBC' | 'ECB' = 'CBC', iv?: string): string {
  const keyWord = CryptoJS.enc.Utf8.parse(key)
  const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : CryptoJS.enc.Utf8.parse(key.substring(0, 16))
  return CryptoJS.AES.encrypt(data, keyWord, {
    mode: mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
    iv: ivWord,
  }).toString()
}

export function aesDecrypt(data: string, key: string, mode: 'CBC' | 'ECB' = 'CBC', iv?: string): string {
  const keyWord = CryptoJS.enc.Utf8.parse(key)
  const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : CryptoJS.enc.Utf8.parse(key.substring(0, 16))
  return CryptoJS.AES.decrypt(data, keyWord, {
    mode: mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
    iv: ivWord,
  }).toString(CryptoJS.enc.Utf8)
}

export function aesBase64DecodeToString(data: string, key: string, mode: 'CBC' | 'ECB' = 'CBC', iv?: string): string {
  return aesDecrypt(data, key, mode, iv)
}

export function desEncrypt(data: string, key: string, mode: 'CBC' | 'ECB' = 'CBC', iv?: string): string {
  const keyWord = CryptoJS.enc.Utf8.parse(key)
  const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : CryptoJS.enc.Utf8.parse(key.substring(0, 8))
  return CryptoJS.DES.encrypt(data, keyWord, {
    mode: mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
    iv: ivWord,
  }).toString()
}

export function desDecrypt(data: string, key: string, mode: 'CBC' | 'ECB' = 'CBC', iv?: string): string {
  const keyWord = CryptoJS.enc.Utf8.parse(key)
  const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : CryptoJS.enc.Utf8.parse(key.substring(0, 8))
  return CryptoJS.DES.decrypt(data, keyWord, {
    mode: mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
    iv: ivWord,
  }).toString(CryptoJS.enc.Utf8)
}

export function desEncodeToBase64String(data: string, key: string, mode: 'CBC' | 'ECB' = 'CBC', iv?: string): string {
  return desEncrypt(data, key, mode, iv)
}

export function hexEncode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function hexDecode(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return new TextDecoder().decode(bytes)
}

export interface RsaProvider {
  encrypt(publicKey: string, data: string): string
  decrypt(privateKey: string, data: string): string
}

let rsaProvider: RsaProvider | null = null

export function setRsaProvider(p: RsaProvider): void {
  rsaProvider = p
}

export function rsaEncrypt(publicKey: string, data: string): string {
  if (!rsaProvider) throw new Error('RSA provider not set')
  return rsaProvider.encrypt(publicKey, data)
}

export function rsaDecrypt(privateKey: string, data: string): string {
  if (!rsaProvider) throw new Error('RSA provider not set')
  return rsaProvider.decrypt(privateKey, data)
}

export function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export function strToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

export function bytesToStr(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
