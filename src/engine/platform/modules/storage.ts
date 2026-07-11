import { getGlobalStore } from "../../context/store.js";

export const storage = {
  getVariable(key: string): any {
    const store = getGlobalStore();
    return store.get(key);
  },

  setVariable(key: string, value: any): void {
    const store = getGlobalStore();
    store.put(key, value);
  },

  getLoginInfoMap(): Record<string, any> {
    const store = getGlobalStore();
    return store.getAll() || {};
  },

  putLoginHeader(headers: Record<string, string>): void {
    const store = getGlobalStore();
    store.put("loginHeaders", headers);
  },

  getLoginHeader(): Record<string, string> | null {
    const store = getGlobalStore();
    return store.get("loginHeaders") || null;
  },
};
