// 共享上下文存储（供 toc.ts 和 content.ts 复用）

const contextStore = new Map<string, Map<string, any>>()

export function getSourceContext(sourceId: string): Map<string, any> {
  if (!contextStore.has(sourceId)) {
    contextStore.set(sourceId, new Map())
  }
  return contextStore.get(sourceId)!
}

export function putContext(sourceId: string, key: string, value: any): void {
  const ctx = getSourceContext(sourceId)
  ctx.set(key, value)
}

export function getContext(sourceId: string, key: string): any {
  const ctx = getSourceContext(sourceId)
  return ctx.get(key)
}

export function clearContext(sourceId?: string): void {
  if (sourceId) {
    contextStore.delete(sourceId)
  } else {
    contextStore.clear()
  }
}
