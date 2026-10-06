// ============================================
// 正则匹配提取 Worker
// ============================================
//
// 职责：在独立线程里执行正则匹配，提取所有匹配位置。
// 主线程通过 postMessage 发送任务，Worker 返回匹配列表。
//
// 主线程可设置超时，超时后 terminate Worker 并重启。
// 这样灾难性回溯的正则不会卡死 UI。
//
// 类型由 tsconfig.worker.json 提供（lib: WebWorker）。
// 主 tsconfig 已 exclude 本目录，避免 DOM/WebWorker 类型冲突。

interface MatchResult {
  index: number
  length: number
  groups: (string | null)[]
}

interface TaskMessage {
  id: number
  text: string
  pattern: string
  flags: string
}

interface ResponseMessage {
  id: number
  success: boolean
  matches?: MatchResult[]
  error?: string
}

// Worker 上下文。tsconfig.worker.json 已引入 WebWorker lib，
// 全局 self 类型为 DedicatedWorkerGlobalScope。
const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (e: MessageEvent<TaskMessage>) => {
  const { id, text, pattern, flags } = e.data
  let response: ResponseMessage
  try {
    const re = new RegExp(pattern, flags)
    const matches: MatchResult[] = []
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const groups: (string | null)[] = []
      for (let i = 0; i < m.length; i++) {
        const v = m[i]
        groups.push(v === undefined ? null : v)
      }
      matches.push({ index: m.index, length: m[0].length, groups })
      if (m[0].length === 0) {
        re.lastIndex++
      }
    }
    response = { id, success: true, matches }
  } catch (err) {
    response = { id, success: false, error: String(err) }
  }
  ctx.postMessage(response)
}

export {}
