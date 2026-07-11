import { CookieJar, Cookie } from 'tough-cookie'

export class CookieManager {
  private jar: CookieJar

  constructor(jar?: CookieJar) {
    this.jar = jar || new CookieJar()
  }

  async setCookie(cookie: string | Cookie, url: string): Promise<void> {
    await this.jar.setCookie(cookie, url)
  }

  async getCookieString(url: string): Promise<string> {
    const cookies = await this.jar.getCookies(url)
    return cookies.map((c) => c.toString()).join('; ')
  }

  async getCookies(url: string): Promise<Cookie[]> {
    return this.jar.getCookies(url)
  }

  async removeCookie(key: string, url: string): Promise<void> {
    const allCookies = await this.jar.getCookies(url)
    const filteredCookies = allCookies.filter((c) => c.key !== key)

    if (filteredCookies.length === allCookies.length) {
      return
    }

    const serialized = await this.jar.serialize()
    const newSerialized = {
      ...serialized,
      cookies: serialized.cookies.filter((c: any) => c.key !== key),
    }
    this.jar = await CookieJar.deserialize(newSerialized) as CookieJar
  }

  clear(): void {
    this.jar = new CookieJar()
  }

  async export(): Promise<any> {
    return this.jar.serialize()
  }

  async import(data: any): Promise<void> {
    this.jar = await CookieJar.deserialize(data) as CookieJar
  }

  getJar(): CookieJar {
    return this.jar
  }
}

export function createCookieManager(): CookieManager {
  return new CookieManager()
}
