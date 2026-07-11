export function base64Encode(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64')
}

export function base64Decode(str: string): string {
  return Buffer.from(str, 'base64').toString('utf-8')
}

export function base64UrlEncode(str: string): string {
  return base64Encode(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return base64Decode(str)
}

export function base64DecodeToByteArray(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, 'base64'))
}

export function byteArrayToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}
