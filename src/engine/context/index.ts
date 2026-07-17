import { ContextStore, getGlobalStore, resetGlobalStore } from './store.js'
import { VariablesManager, VariableResolver } from './variables.js'

export { ContextStore, getGlobalStore, resetGlobalStore }
export { VariablesManager, VariableResolver }

export interface ExecutionContext {
  sourceId?: string
  sourceName?: string
  sourceUrl?: string
  key?: string
  page?: number
  baseUrl?: string
  bookUrl?: string
  store: ContextStore
  variables: VariablesManager
  temp: Record<string, any>
  result?: any
  log: (message: string, level?: 'info' | 'warn' | 'error') => void
}

export function createContext(options: Partial<ExecutionContext> = {}): ExecutionContext {
  const store = options.store || new ContextStore()
  const variables = options.variables || new VariablesManager()
  return {
    sourceId: options.sourceId || '',
    sourceName: options.sourceName || '',
    sourceUrl: options.sourceUrl || '',
    key: options.key || '',
    page: options.page || 1,
    baseUrl: options.baseUrl || '',
    bookUrl: options.bookUrl || '',
    store,
    variables,
    temp: {},
    result: null,
    log: options.log || (() => {}),
  }
}

export function mergeContext(
  base: ExecutionContext,
  overrides: Partial<ExecutionContext>
): ExecutionContext {
  return {
    ...base,
    ...overrides,
    store: overrides.store || base.store,
    variables: overrides.variables || base.variables,
    temp: { ...base.temp, ...overrides.temp },
  }
}

export { putContext, getContext, clearContext } from './shared.js'
