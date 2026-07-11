import CryptoJS from 'crypto-js'

export type HashAlgorithm = 'sha1' | 'sha256' | 'sha384' | 'sha512'

export function shaHash(str: string, algorithm: HashAlgorithm = 'sha256'): string {
  const map = {
    'sha1': CryptoJS.SHA1,
    'sha256': CryptoJS.SHA256,
    'sha384': CryptoJS.SHA384,
    'sha512': CryptoJS.SHA512,
  }
  return map[algorithm](str).toString()
}

export function sha1Hash(str: string): string {
  return shaHash(str, 'sha1')
}

export function sha256Hash(str: string): string {
  return shaHash(str, 'sha256')
}

export function sha384Hash(str: string): string {
  return shaHash(str, 'sha384')
}

export function sha512Hash(str: string): string {
  return shaHash(str, 'sha512')
}

export function hmacHash(str: string, key: string, algorithm: HashAlgorithm = 'sha256'): string {
  const map = {
    'sha1': CryptoJS.HmacSHA1,
    'sha256': CryptoJS.HmacSHA256,
    'sha384': CryptoJS.HmacSHA384,
    'sha512': CryptoJS.HmacSHA512,
  }
  return map[algorithm](str, key).toString()
}

export function hmacSha256(str: string, key: string): string {
  return hmacHash(str, key, 'sha256')
}

export function hmacSha512(str: string, key: string): string {
  return hmacHash(str, key, 'sha512')
}

export function hmacHex(str: string, key: string, algorithm: HashAlgorithm = 'sha256'): string {
  return hmacHash(str, key, algorithm)
}

export function digestHex(str: string, algorithm: HashAlgorithm = 'sha256'): string {
  return shaHash(str, algorithm)
}
