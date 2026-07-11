export { AndroidApi, getGlobalAndroidApi, resetGlobalAndroidApi } from "./android-api.js";
export { getPlatformAdapter, setPlatformAdapter, hasPlatformAdapter, type IPlatformAdapter } from "./adapter.js";
export { buildJavaAPI } from "./java-bridge.js";

// 重新导出所有模块
export * from "./modules/network.js";
export * from "./modules/crypto.js";
export * from "./modules/dom.js";
export * from "./modules/storage.js";
export * from "./modules/ui.js";
export * from "./modules/webview.js";
export * from "./modules/context.js";
export * from "./modules/utils.js";

import { getPlatformAdapter } from "./adapter.js";
import type { IPlatformAdapter } from "./adapter.js";

export function createPlatformAdapter(): IPlatformAdapter {
  return getPlatformAdapter();
}
