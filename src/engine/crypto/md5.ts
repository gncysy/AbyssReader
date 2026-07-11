import { createHash } from 'crypto'

export function md5Encode(str: string): string {
  return createHash('md5').update(String(str)).digest('hex')
}

export function md5Buffer(str: string): Buffer {
  return createHash('md5').update(String(str)).digest()
}
