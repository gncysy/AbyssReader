export function ipcInvoke<T = any>(channel: string, ...args: any[]): Promise<T> {
  const api = (window as any).electronAPI;
  if (!api) {
    console.error("[IPC] electronAPI 不存在");
    return Promise.reject(new Error("electronAPI not available"));
  }

  // 1. 直接调用
  if (typeof api[channel] === "function") {
    return api[channel](...args);
  }

  // 2. 横杠转驼峰：import-txt → importTxt
  const camelCase = channel.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  if (camelCase !== channel && typeof api[camelCase] === "function") {
    return api[camelCase](...args);
  }

  // 3. 横杠转点号：store-get → store.get
  const dotPath = channel.replace(/-/g, ".");
  if (dotPath !== channel) {
    const parts = dotPath.split(".");
    let target: any = api;
    for (const part of parts) {
      if (target && typeof target === "object") {
        target = target[part];
      } else {
        target = undefined;
        break;
      }
    }
    if (typeof target === "function") {
      return target(...args);
    }
  }

  // 4. 点号转横杠：store.get → store-get
  const dashPath = channel.replace(/\./g, "-");
  if (dashPath !== channel && typeof api[dashPath] === "function") {
    return api[dashPath](...args);
  }

  console.error("[IPC] 方法不存在:", channel);
  return Promise.reject(new Error(`Method ${channel} not found`));
}

export function ipcOn(channel: string, callback: (...args: any[]) => void): () => void {
  const api = (window as any).electronAPI;
  if (api && typeof api.on === "function") {
    const handler = (...args: any[]) => callback(...args);
    api.on(channel, handler);
    return () => {
      if (api && typeof api.off === "function") {
        api.off(channel, handler);
      }
    };
  }
  return () => {};
}

export function ipcSend(channel: string, ...args: any[]): void {
  const api = (window as any).electronAPI;
  if (api && typeof api.send === "function") {
    api.send(channel, ...args);
  }
}
