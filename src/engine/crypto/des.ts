import CryptoJS from 'crypto-js'

export type DesMode = 'CBC' | 'ECB' | 'CFB' | 'OFB'

export class DesCipher {
  private key: string
  private mode: DesMode
  private iv?: string

  constructor(key: string | Buffer, mode: DesMode = 'CBC', iv?: string | Buffer) {
    this.key = typeof key === 'string' ? key : key.toString('utf-8')
    this.mode = mode
    this.iv = iv ? (typeof iv === 'string' ? iv : iv.toString('utf-8')) : undefined
  }

  encrypt(data: string | Buffer): string {
    const input = typeof data === 'string' ? data : data.toString('utf-8')
    const keyWord = CryptoJS.enc.Utf8.parse(this.key)
    const ivWord = this.iv ? CryptoJS.enc.Utf8.parse(this.iv) : undefined
    
    const encrypted = CryptoJS.DES.encrypt(input, keyWord, {
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
    
    const decrypted = CryptoJS.DES.decrypt(input, keyWord, {
      mode: this.mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
      iv: ivWord,
    })
    return decrypted.toString(CryptoJS.enc.Utf8)
  }
}

export function createDesCipher(key: string | Buffer, mode: DesMode = 'CBC', iv?: string | Buffer): DesCipher {
  return new DesCipher(key, mode, iv)
}

export function desEncrypt(data: string, key: string, mode: DesMode = 'CBC', iv?: string): string {
  return new DesCipher(key, mode, iv).encrypt(data)
}

export function desDecrypt(data: string, key: string, mode: DesMode = 'CBC', iv?: string): string {
  return new DesCipher(key, mode, iv).decrypt(data)
}

export function desEncodeToBase64String(data: string, key: string, mode: DesMode = 'CBC', iv?: string): string {
  return desEncrypt(data, key, mode, iv)
}
