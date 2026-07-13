import { getGlobalHttpClient } from '../../network/client.js';
import type { RequestConfig } from '../../network/index.js';

let lastTextResponse: string = '';
let lastByteResponse: Buffer | null = null;

export const network = {
  // ===== 核心请求 =====
  async ajax(url: string, options: any = {}): Promise<any> {
    const httpClient = getGlobalHttpClient();
    const config: RequestConfig = {
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      charset: options.charset || 'utf-8',
      timeout: options.timeout || 30000,
    };

    try {
      const response = await httpClient.request(config);
      if (response.status >= 200 && response.status < 300) {
        lastTextResponse = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        lastByteResponse = Buffer.from(response.data);
        return response.data;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error: any) {
      console.error('[network.ajax] 请求失败:', error.message);
      throw error;
    }
  },

  async post(url: string, body: any, headers: Record<string, string> = {}): Promise<any> {
    return this.ajax(url, { method: 'POST', body, headers });
  },

  async httpGet(url: string, headers: Record<string, string> = {}): Promise<any> {
    return this.ajax(url, { method: 'GET', headers });
  },

  // ===== connect 方法（Legado 兼容） =====
  connect(url: string): any {
    return {
      headers: async (name: string) => {
        try {
          const httpClient = getGlobalHttpClient();
          const response = await httpClient.request({ url, method: 'HEAD' });
          return response.headers[name.toLowerCase()] || null;
        } catch {
          return null;
        }
      },
    };
  },

  getStrResponse(): string {
    return lastTextResponse;
  },

  getByteResponse(): Buffer | null {
    return lastByteResponse;
  },

  // ===== 并发请求 =====
  async ajaxAll(urls: string[]): Promise<any[]> {
    const promises = urls.map(async (url) => {
      try {
        return await this.ajax(url);
      } catch {
        return null;
      }
    });
    return Promise.all(promises);
  },

  // ============================================================
  // Cookie 管理
  // ============================================================

  cookie: {
    async getCookie(url: string): Promise<string> {
      const httpClient = getGlobalHttpClient();
      const jar = httpClient.getCookieJar();
      try {
        const cookies = await jar.getCookies(url);
        return cookies.map(c => c.toString()).join('; ');
      } catch {
        return '';
      }
    },

    async getCookieValue(url: string, key: string): Promise<string> {
      const httpClient = getGlobalHttpClient();
      const jar = httpClient.getCookieJar();
      try {
        const cookies = await jar.getCookies(url);
        for (const cookie of cookies) {
          if (cookie.key === key) {
            return cookie.value;
          }
        }
        return '';
      } catch {
        return '';
      }
    },

    async getAllCookies(url: string): Promise<Array<{ key: string; value: string }>> {
      const httpClient = getGlobalHttpClient();
      const jar = httpClient.getCookieJar();
      try {
        const cookies = await jar.getCookies(url);
        return cookies.map(c => ({ key: c.key, value: c.value }));
      } catch {
        return [];
      }
    },

    async removeCookie(url: string): Promise<void> {
      const httpClient = getGlobalHttpClient();
      const jar = httpClient.getCookieJar();
      try {
        const cookies = await jar.getCookies(url);
        for (const cookie of cookies) {
          await jar.setCookie(`${cookie.key}=; expires=${new Date(0).toUTCString()}`, url);
        }
      } catch {
        // ignore
      }
    },

    async setCookie(url: string, cookieStr: string): Promise<void> {
      const httpClient = getGlobalHttpClient();
      const jar = httpClient.getCookieJar();
      try {
        await jar.setCookie(cookieStr, url);
      } catch {
        // ignore
      }
    },

    async clearCookies(): Promise<void> {
      const httpClient = getGlobalHttpClient();
      httpClient.clearCookies();
    }
  }
};
