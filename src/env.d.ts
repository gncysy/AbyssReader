/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface Window {
  __TAURI__?: {
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
  }
}

declare module '*.md?raw' {
  const content: string
  export default content
}
