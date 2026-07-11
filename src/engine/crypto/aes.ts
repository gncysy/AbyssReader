import CryptoJS from 'crypto-js'

export type AesMode = 'CBC' | 'ECB' | 'CFB' | 'OFB' | 'CTR'

export class AesCipher {
  private key: string
  private mode: AesMode
  private iv?: string

  constructor(key: string | Buffer, mode: AesMode = 'CBC', iv?: string | Buffer) {
    this.key = typeof key === 'string' ? key : key.toString('utf-8')
    this.mode = mode
    this.iv = iv ? (typeof iv === 'string' ? iv : iv.toString('utf-8')) : undefined
  }

  encrypt(data: string | Buffer): string {
    const input = typeof data === 'string' ? data : data.toString('utf-8')
    const keyWord = CryptoJS.enc.Utf8.parse(this.key)
    const ivWord = this.iv ? CryptoJS.enc.Utf8.parse(this.iv) : undefined
    
    const encrypted = CryptoJS.AES.encrypt(input, keyWord, {
      mode: this.mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
      iv: ivWord,
    })
    return encrypted.toString()
  }

  decrypt(data: string | Buffer): string {
    const input = typeof data === 'string' ? data : data.toString('base64')
    const keyWord = CryptoJS.enc.Utf8.parse(this.key)
    const ivWord = this.iv ? CryptoJS.enc.Utf8.parse(this.iv) : undefined
    
    const decrypted = CryptoJS.AES.decrypt(input, keyWord, {
      mode: this.mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
      iv: ivWord,
    })
    return decrypted.toString(CryptoJS.enc.Utf8)
  }
}

export function createAesCipher(key: string | Buffer, mode: AesMode = 'CBC', iv?: string | Buffer): AesCipher {
  return new AesCipher(key, mode, iv)
}

export function aesEncrypt(data: string, key: string, mode: AesMode = 'CBC', iv?: string): string {
  return new AesCipher(key, mode, iv).encrypt(data)
}

export function aesDecrypt(data: string, key: string, mode: AesMode = 'CBC', iv?: string): string {
  return new AesCipher(key, mode, iv).decrypt(data)
}

export function aesBase64DecodeToString(data: string, key: string, mode: AesMode = 'CBC', iv?: string): string {
  return aesDecrypt(data, key, mode, iv)
}
