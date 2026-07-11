export class ContextStore {
  private data: Map<string, any> = new Map()
  private sourceVariable: Map<string, any> = new Map()

  put(key: string, value: any): void {
    this.data.set(key, value)
  }

  get(key: string): any {
    return this.data.get(key)
  }

  remove(key: string): boolean {
    return this.data.delete(key)
  }

  clear(): void {
    this.data.clear()
  }

  getAll(): Map<string, any> {
    return new Map(this.data)
  }

  setSourceVariable(key: string, value: any): void {
    this.sourceVariable.set(key, value)
  }

  getSourceVariable(key: string): any {
    return this.sourceVariable.get(key)
  }

  getAllSourceVariables(): Record<string, any> {
    const result: Record<string, any> = {}
    for (const [key, value] of this.sourceVariable) {
      result[key] = value
    }
    return result
  }

  loadFromObject(obj: Record<string, any>): void {
    for (const [key, value] of Object.entries(obj)) {
      this.put(key, value)
    }
  }

  toObject(): Record<string, any> {
    const result: Record<string, any> = {}
    for (const [key, value] of this.data) {
      result[key] = value
    }
    return result
  }
}

let globalStore: ContextStore | null = null

export function getGlobalStore(): ContextStore {
  if (!globalStore) {
    globalStore = new ContextStore()
  }
  return globalStore
}

export function resetGlobalStore(): void {
  if (globalStore) {
    globalStore.clear()
    globalStore = null
  }
}
