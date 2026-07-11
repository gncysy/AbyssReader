import { getGlobalHttpClient } from "../../network/client.js";
import type { RequestConfig } from "../../network/index.js";

let lastTextResponse: string = "";
let lastByteResponse: Buffer | null = null;

export const network = {
  async ajax(url: string, options: any = {}): Promise<any> {
    const httpClient = getGlobalHttpClient();
    const config: RequestConfig = {
      url,
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
      charset: options.charset || "utf-8",
      timeout: options.timeout || 30000,
    };

    try {
      const response = await httpClient.request(config);
      if (response.status >= 200 && response.status < 300) {
        lastTextResponse = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
        lastByteResponse = Buffer.from(response.data);
        return response.data;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error: any) {
      console.error("[AndroidApi.ajax] 请求失败:", error.message);
      throw error;
    }
  },

  async post(url: string, body: any, headers: Record<string, string> = {}): Promise<any> {
    return this.ajax(url, { method: "POST", body, headers });
  },

  async httpGet(url: string, headers: Record<string, string> = {}): Promise<any> {
    return this.ajax(url, { method: "GET", headers });
  },

  connect(url: string): any {
    return {
      headers: async (name: string) => {
        try {
          const httpClient = getGlobalHttpClient();
          const response = await httpClient.request({ url, method: "HEAD" });
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

  cookie: {
    async getCookie(url: string): Promise<string> {
      const httpClient = getGlobalHttpClient();
      const jar = httpClient.getCookieJar();
      return jar.getCookieString(url);
    },
    async removeCookie(url: string): Promise<void> {
      const httpClient = getGlobalHttpClient();
      const jar = httpClient.getCookieJar();
      const cookies = await jar.getCookies(url);
      // 逐个删除 cookie
      for (const cookie of cookies) {
        // 使用 setCookie 覆盖空值来模拟删除，或直接使用 removeAllCookies
        // 这里简单处理：重新设置一个过期 cookie
        await jar.setCookie(`${cookie.key}=; expires=${new Date(0).toUTCString()}`, url);
      }
    },
    async setCookie(url: string, cookieStr: string): Promise<void> {
      const httpClient = getGlobalHttpClient();
      const jar = httpClient.getCookieJar();
      await jar.setCookie(cookieStr, url);
    },
  },
};
