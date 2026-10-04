// ============================================
// 数据同步（占位）
// ============================================

export interface SyncConfig {
  server: string
  username: string
  password: string
  folder: string
}

export interface SyncResult {
  success: boolean
  message: string
}

export async function backup(_config: SyncConfig, _data: unknown): Promise<SyncResult> {
  return { success: false, message: '未实现' }
}

export async function restore(_config: SyncConfig): Promise<SyncResult> {
  return { success: false, message: '未实现' }
}
