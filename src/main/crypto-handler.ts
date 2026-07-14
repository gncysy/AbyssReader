import { ipcMain } from 'electron'
import crypto from 'node:crypto'

// ============================================================
// 主进程 Crypto 处理器
// 渲染进程通过 IPC 调用 RSA 相关功能
// ============================================================

export function setupCryptoHandlers() {
  ipcMain.handle('crypto:rsaEncrypt', (event, publicKey: string, data: string) => {
    const buffer = Buffer.from(data, 'utf-8')
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      buffer
    )
    return encrypted.toString('base64')
  })

  ipcMain.handle('crypto:rsaDecrypt', (event, privateKey: string, data: string) => {
    const buffer = Buffer.from(data, 'base64')
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      buffer
    )
    return decrypted.toString('utf-8')
  })

  ipcMain.handle('crypto:randomUUID', () => {
    return crypto.randomUUID()
  })
}
