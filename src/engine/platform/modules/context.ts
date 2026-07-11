export const context = {
  put(key: string, value: any): void {
    (global as any).__bookSourceContext = (global as any).__bookSourceContext || new Map();
    (global as any).__bookSourceContext.set(key, value);
  },

  get(key: string): any {
    const ctx = (global as any).__bookSourceContext;
    if (!ctx) return undefined;
    return ctx.get(key);
  },

  clear(): void {
    (global as any).__bookSourceContext = new Map();
  },
};
