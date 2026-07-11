export class VariablesManager {
  private variables: Map<string, any> = new Map()
  private history: Array<{ key: string; oldValue: any; newValue: any }> = []

  set(key: string, value: any): void {
    const oldValue = this.variables.get(key)
    this.history.push({ key, oldValue, newValue: value })
    this.variables.set(key, value)
  }

  get(key: string): any {
    return this.variables.get(key)
  }

  getAll(): Record<string, any> {
    const result: Record<string, any> = {}
    for (const [key, value] of this.variables) {
      result[key] = value
    }
    return result
  }

  delete(key: string): boolean {
    return this.variables.delete(key)
  }

  has(key: string): boolean {
    return this.variables.has(key)
  }

  clear(): void {
    this.variables.clear()
    this.history = []
  }

  setAll(obj: Record<string, any>): void {
    for (const [key, value] of Object.entries(obj)) {
      this.set(key, value)
    }
  }

  getHistory(): Array<{ key: string; oldValue: any; newValue: any }> {
    return [...this.history]
  }

  rollback(): boolean {
    const last = this.history.pop()
    if (!last) return false
    this.variables.set(last.key, last.oldValue)
    return true
  }

  toObject(): Record<string, any> {
    return this.getAll()
  }

  fromObject(obj: Record<string, any>): void {
    this.clear()
    this.setAll(obj)
  }
}

export class VariableResolver {
  private variables: VariablesManager

  constructor(variables: VariablesManager) {
    this.variables = variables
  }

  resolve(template: string): string {
    if (!template || typeof template !== 'string') return template
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.resolvePath(path.trim())
      return value !== undefined && value !== null ? String(value) : match
    })
  }

  resolvePath(path: string): any {
    if (!path) return undefined
    const parts = path.split('.')
    let current: any = this.variables.getAll()
    for (const part of parts) {
      if (current === null || current === undefined) return undefined
      if (part.match(/^\d+$/)) {
        const index = parseInt(part, 10)
        if (Array.isArray(current) && index < current.length) {
          current = current[index]
        } else {
          return undefined
        }
      } else if (typeof current === 'object') {
        current = current[part]
      } else {
        return undefined
      }
    }
    return current
  }

  resolveObject(obj: any): any {
    if (typeof obj === 'string') return this.resolve(obj)
    if (Array.isArray(obj)) return obj.map(item => this.resolveObject(item))
    if (typeof obj === 'object' && obj !== null) {
      const result: Record<string, any> = {}
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.resolveObject(value)
      }
      return result
    }
    return obj
  }
}
