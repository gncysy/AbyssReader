import CryptoJS from 'crypto-js'

// ============================================================
// 纯 JS 加密模块（不依赖 node:crypto）
// AES/DES/MD5/SHA/Base64 全部用 crypto-js 实现
// RSA 通过 IPC 调用主进程
// ============================================================

export const cryptoApi = {
  base64Encode(str: string): string {
    return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(str))
  },

  base64Decode(str: string): string {
    const parsed = CryptoJS.enc.Base64.parse(str)
    return CryptoJS.enc.Utf8.stringify(parsed)
  },

  base64DecodeToByteArray(str: string): Uint8Array {
    const parsed = CryptoJS.enc.Base64.parse(str)
    const words = parsed.words
    const byteArray = new Uint8Array(words.length * 4)
    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      byteArray[i * 4] = (word >> 24) & 0xFF
      byteArray[i * 4 + 1] = (word >> 16) & 0xFF
      byteArray[i * 4 + 2] = (word >> 8) & 0xFF
      byteArray[i * 4 + 3] = word & 0xFF
    }
    return byteArray
  },

  getByteArray(data: any): Uint8Array {
    if (typeof data === 'string') {
      return new TextEncoder().encode(data)
    }
    if (data instanceof Uint8Array) {
      return data
    }
    if (data && typeof data === 'object' && data.words) {
      // CryptoJS WordArray
      const words = data.words
      const byteArray = new Uint8Array(words.length * 4)
      for (let i = 0; i < words.length; i++) {
        const word = words[i]
        byteArray[i * 4] = (word >> 24) & 0xFF
        byteArray[i * 4 + 1] = (word >> 16) & 0xFF
        byteArray[i * 4 + 2] = (word >> 8) & 0xFF
        byteArray[i * 4 + 3] = word & 0xFF
      }
      return byteArray
    }
    return new Uint8Array()
  },

  hexDecodeToString(hex: string): string {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
    }
    return new TextDecoder().decode(bytes)
  },

  hexEncode(str: string): string {
    const bytes = new TextEncoder().encode(str)
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  },

  md5Encode(str: string): string {
    return CryptoJS.MD5(str).toString()
  },

  digestHex(str: string, algorithm: string = 'sha256'): string {
    const map: Record<string, any> = {
      sha1: CryptoJS.SHA1,
      sha256: CryptoJS.SHA256,
      sha384: CryptoJS.SHA384,
      sha512: CryptoJS.SHA512,
      md5: CryptoJS.MD5,
    }
    const algo = map[algorithm.toLowerCase()]
    if (!algo) return CryptoJS.SHA256(str).toString()
    return algo(str).toString()
  },

  HMacHex(str: string, key: string, algorithm: string = 'sha256'): string {
    const map: Record<string, any> = {
      sha1: CryptoJS.HmacSHA1,
      sha256: CryptoJS.HmacSHA256,
      sha384: CryptoJS.HmacSHA384,
      sha512: CryptoJS.HmacSHA512,
      md5: CryptoJS.HmacMD5,
    }
    const algo = map[algorithm.toLowerCase()]
    if (!algo) return CryptoJS.HmacSHA256(str, key).toString()
    return algo(str, key).toString()
  },

  aesBase64DecodeToString(data: string, key: string, mode: string = 'CBC', iv?: string): string {
    const keyWord = CryptoJS.enc.Utf8.parse(key)
    const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined
    const encrypted = CryptoJS.enc.Base64.parse(data)

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: encrypted } as any,
      keyWord,
      {
        mode: mode.includes('ECB') ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: ivWord,
      }
    )
    return decrypted.toString(CryptoJS.enc.Utf8)
  },

  desEncodeToBase64String(data: string, key: string, mode: string = 'CBC', iv?: string): string {
    const keyWord = CryptoJS.enc.Utf8.parse(key)
    const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined

    const encrypted = CryptoJS.DES.encrypt(data, keyWord, {
      mode: mode.includes('ECB') ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
      iv: ivWord,
    })
    return encrypted.toString()
  },

  createSymmetricCrypto(
    algorithm: string,
    key: string,
    iv?: string
  ): {
    encryptStr: (data: string) => string
    decryptStr: (data: string) => string
  } {
    const alg = algorithm.toLowerCase()
    const keyWord = CryptoJS.enc.Utf8.parse(key)
    const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined

    const mode: any = alg.includes('ecb') ? CryptoJS.mode.ECB : CryptoJS.mode.CBC
    const cipher: any = alg.includes('des') ? CryptoJS.DES : CryptoJS.AES

    return {
      encryptStr: (data: string): string => {
        const encrypted = cipher.encrypt(data, keyWord, {
          mode,
          padding: CryptoJS.pad.Pkcs7,
          iv: ivWord,
        })
        return encrypted.toString()
      },
      decryptStr: (data: string): string => {
        const decrypted = cipher.decrypt(data, keyWord, {
          mode,
          padding: CryptoJS.pad.Pkcs7,
          iv: ivWord,
        })
        return decrypted.toString(CryptoJS.enc.Utf8)
      },
    }
  },

  // ============================================================
  // RSA：通过 IPC 调用主进程
  // ============================================================
  createAsymmetricCrypto(type: string = 'RSA'): {
    setPublicKey: (key: string) => void
    setPrivateKey: (key: string) => void
    encryptStr: (data: string) => string
    decryptStr: (data: string) => string
  } {
    let publicKey: string | null = null
    let privateKey: string | null = null

    const api = (window as any).electronAPI

    return {
      setPublicKey: (key: string) => {
        publicKey = key
      },
      setPrivateKey: (key: string) => {
        privateKey = key
      },
      encryptStr: (data: string): string => {
        if (!publicKey) {
          throw new Error('RSA 公钥未设置')
        }
        if (!api || typeof api.invoke !== 'function') {
          throw new Error('electronAPI 不可用，RSA 加密无法执行')
        }
        // 同步转异步：返回 Promise，但书源期望同步返回
        // 这里使用一个技巧：通过 ipcRenderer.sendSync 实现同步 IPC
        try {
          const result = api.invokeSync('crypto:rsaEncrypt', publicKey, data)
          return result
        } catch (err: any) {
          throw new Error(`RSA 加密失败: ${err.message}`)
        }
      },
      decryptStr: (data: string): string => {
        if (!privateKey) {
          throw new Error('RSA 私钥未设置')
        }
        if (!api || typeof api.invoke !== 'function') {
          throw new Error('electronAPI 不可用，RSA 解密无法执行')
        }
        try {
          const result = api.invokeSync('crypto:rsaDecrypt', privateKey, data)
          return result
        } catch (err: any) {
          throw new Error(`RSA 解密失败: ${err.message}`)
        }
      },
    }
  },

  randomUUID(): string {
    const api = (window as any).electronAPI
    if (api && typeof api.invoke === 'function') {
      try {
        const result = api.invokeSync('crypto:randomUUID')
        return result
      } catch {
        // 降级
      }
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  },
}

export const crypto = cryptoApi

