// ============================================
// 正则匹配 Worker 池
// ============================================
//
// 单例 Worker，每次匹配任务分配唯一 id，通过 pending 表管理。
// 超时后 terminate Worker 并重启，避免灾难性回溯卡死 UI。

const WORKER_TIMEOUT_MS = 3000

export interface RegexMatch {
  index: number
  length: number
  groups: (string | null)[]
}

interface PendingTask {
  resolve: (matches: RegexMatch[]) => void
  reject: (err: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

class RegexWorkerPool {
  private worker: Worker | null = null
  private taskId = 0
  private pending = new Map<number, PendingTask>()

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const w = new Worker(
      new URL('../workers/regex-replace.worker.ts', import.meta.url),
      { type: 'module' },
    )
    w.onmessage = (e: MessageEvent) => this.handleMessage(e)
    w.onerror = () => this.handleWorkerError()
    this.worker = w
    return w
  }

  private handleMessage(e: MessageEvent): void {
    const data = e.data as { id?: number; success?: boolean; matches?: RegexMatch[]; error?: string }
    const id = data.id
    if (typeof id !== 'number') return
    const task = this.pending.get(id)
    if (!task) return
    this.pending.delete(id)
    clearTimeout(task.timeoutId)
    if (data.success) {
      task.resolve(data.matches || [])
    } else {
      task.reject(new Error(data.error || 'Worker 执行失败'))
    }
  }

  private handleWorkerError(): void {
    // Worker 内部未捕获异常，拒绝所有 pending 任务并重建
    for (const [, task] of this.pending) {
      clearTimeout(task.timeoutId)
      task.reject(new Error('Worker 异常'))
    }
    this.pending.clear()
    this.terminate()
  }

  private terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }

  findMatches(text: string, pattern: string, flags = 'g'): Promise<RegexMatch[]> {
    const w = this.ensureWorker()
    const id = ++this.taskId
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id)
        this.terminate()
        reject(new Error('正则执行超时'))
      }, WORKER_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timeoutId })
      w.postMessage({ id, text, pattern, flags })
    })
  }

  destroy(): void {
    for (const [, task] of this.pending) {
      clearTimeout(task.timeoutId)
      task.reject(new Error('Worker 已销毁'))
    }
    this.pending.clear()
    this.terminate()
  }
}

let globalPool: RegexWorkerPool | null = null

export function getRegexWorkerPool(): RegexWorkerPool {
  if (!globalPool) globalPool = new RegexWorkerPool()
  return globalPool
}

export function destroyRegexWorkerPool(): void {
  if (globalPool) {
    globalPool.destroy()
    globalPool = null
  }
}
