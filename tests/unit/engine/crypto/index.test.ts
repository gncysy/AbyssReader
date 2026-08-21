// ============================================
// 加密工具单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import {
  md5, md5Short, sha1, sha256, sha512,
  hmacSha256, hmacHex, digestHex,
  base64Encode, base64Decode, base64DecodeToBytes,
  aesEncrypt, aesDecrypt,
  desEncrypt, desDecrypt,
  hexEncode, hexDecode,
  strToBytes, bytesToStr, randomUUID,
} from '../../../../engine/crypto/index.js'

describe('md5', () => {
  it('md5 哈希', () => {
    expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592')
  })

  it('md5Short 取第 8-24 位（substring(8, 24)）', () => {
    expect(md5Short('hello')).toBe('bc4b2a76b9719d91')
  })
})

describe('sha 系列', () => {
  it('sha1', () => {
    expect(sha1('hello')).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
  })

  it('sha256', () => {
    expect(sha256('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('sha512', () => {
    const result = sha512('hello')
    expect(result).toHaveLength(128)
    expect(result.startsWith('9b71d224bd62f378')).toBe(true)
  })
})

describe('hmac', () => {
  it('hmacSha256', () => {
    const result = hmacSha256('message', 'secret')
    expect(result).toHaveLength(64)
  })

  it('hmacHex 默认 sha256', () => {
    const result = hmacHex('message', 'secret')
    expect(result).toHaveLength(64)
  })

  it('hmacHex 指定算法', () => {
    const sha1Result = hmacHex('message', 'secret', 'sha1')
    expect(sha1Result).toHaveLength(40)

    const md5Result = hmacHex('message', 'secret', 'md5')
    expect(md5Result).toHaveLength(32)
  })

  it('digestHex 默认 sha256', () => {
    const result = digestHex('hello')
    expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('digestHex 指定算法', () => {
    expect(digestHex('hello', 'sha1')).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
    expect(digestHex('hello', 'md5')).toBe('5d41402abc4b2a76b9719d911017c592')
  })
})

describe('base64', () => {
  it('base64Encode / base64Decode 往返', () => {
    const original = 'Hello, 世界!'
    const encoded = base64Encode(original)
    expect(base64Decode(encoded)).toBe(original)
  })

  it('base64DecodeToBytes 返回字节数组', () => {
    const bytes = base64DecodeToBytes('SGVsbG8=')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111])
  })
})

describe('AES', () => {
  const key = 'tH1rU6qZ4vU1sK7pN1wO7mX4bY6dQ9gX'
  const iv = '1234567890123456'

  it('aesEncrypt / aesDecrypt 往返（CBC）', () => {
    const plaintext = 'Hello, 漫画!'
    const encrypted = aesEncrypt(plaintext, key, 'CBC', iv)
    const decrypted = aesDecrypt(encrypted, key, 'CBC', iv)
    expect(decrypted).toBe(plaintext)
  })

  it('aesEncrypt / aesDecrypt 往返（ECB）', () => {
    const plaintext = 'Hello, 漫画!'
    const encrypted = aesEncrypt(plaintext, key, 'ECB')
    const decrypted = aesDecrypt(encrypted, key, 'ECB')
    expect(decrypted).toBe(plaintext)
  })

  it('aesDecrypt 返回空字符串（密钥错误）', () => {
    const plaintext = 'Hello'
    const encrypted = aesEncrypt(plaintext, key, 'CBC', iv)
    const wrongKey = 'WrongKey1234567890123456789012'
    const decrypted = aesDecrypt(encrypted, wrongKey, 'CBC', iv)
    expect(decrypted).toBe('')
  })
})

describe('DES', () => {
  const key = '12345678'
  const iv = '12345678'

  it('desEncrypt / desDecrypt 往返（CBC）', () => {
    const plaintext = 'Hello'
    const encrypted = desEncrypt(plaintext, key, 'CBC', iv)
    const decrypted = desDecrypt(encrypted, key, 'CBC', iv)
    expect(decrypted).toBe(plaintext)
  })
})

describe('hex', () => {
  it('hexEncode / hexDecode 往返', () => {
    const original = 'Hello, 漫画!'
    const encoded = hexEncode(original)
    expect(hexDecode(encoded)).toBe(original)
  })

  it('hexEncode 输出小写十六进制', () => {
    expect(hexEncode('A')).toBe('41')
  })
})

describe('strToBytes / bytesToStr', () => {
  it('往返 UTF-8', () => {
    const original = 'Hello, 世界!'
    const bytes = strToBytes(original)
    expect(bytesToStr(bytes)).toBe(original)
  })
})

describe('randomUUID', () => {
  it('返回合法 UUID 格式', () => {
    const uuid = randomUUID()
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('每次返回不同值', () => {
    expect(randomUUID()).not.toBe(randomUUID())
  })
})
