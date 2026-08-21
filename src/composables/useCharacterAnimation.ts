// ============================================
// useCharacterAnimation — 角色动画逻辑（从 SidebarCharacters 提取）
// ============================================

import { bounce, pulse, jump, shake, eyeFollow, faceFollow, blink } from '@/animations/index.js'

export interface CharacterDef {
  id: string
  eyeType: 'white' | 'dot'
  action: 'theme' | 'openBook' | 'report' | 'dance'
  talks: string[]
  idle: string[]
}

export function useCharacterAnimation() {
  const mouse = { x: 0, y: 0 }
  let rafId = 0
  let isAnimationRunning = false
  let mouseMoveHandler: ((e: MouseEvent) => void) | null = null

  function startMouseTracking(): void {
    // 保存 handler 引用，以便正确移除
    mouseMoveHandler = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY }
    document.addEventListener('mousemove', mouseMoveHandler, { passive: true })
  }

  function stopMouseTracking(): void {
    if (mouseMoveHandler) {
      document.removeEventListener('mousemove', mouseMoveHandler)
      mouseMoveHandler = null
    }
  }

  function tick(refs: Record<string, HTMLElement | null>, characters: CharacterDef[]): void {
    for (const ch of characters) {
      const el = refs[ch.id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      const dx = mouse.x - (r.left + r.width / 2)
      const dy = mouse.y - (r.top + r.height * 0.3)

      const faceEl = el.querySelector('.sc-face') as HTMLElement
      const mouthEl = el.querySelector('.sc-mouth') as HTMLElement

      if (ch.eyeType === 'white') {
        if (faceEl) faceFollow(faceEl, dx, dy, 6, 4)
        el.querySelectorAll('.sc-pupil').forEach((p) => {
          eyeFollow(p as HTMLElement, dx / 16, dy / 22, 5)
        })
      } else {
        if (faceEl) faceFollow(faceEl, dx, dy, 8, 6)
        if (mouthEl) faceFollow(mouthEl, dx, dy, 8, 6)
        el.querySelectorAll('.sc-dot').forEach((d) => {
          eyeFollow(d as HTMLElement, dx / 12, dy / 18, 5)
        })
      }
    }
    rafId = requestAnimationFrame(() => tick(refs, characters))
  }

  function startAnimation(refs: Record<string, HTMLElement | null>, characters: CharacterDef[]): void {
    if (isAnimationRunning) return
    isAnimationRunning = true
    rafId = requestAnimationFrame(() => tick(refs, characters))
  }

  function stopAnimation(): void {
    if (!isAnimationRunning) return
    isAnimationRunning = false
    cancelAnimationFrame(rafId)
  }

  function performBounce(el: HTMLElement): void { bounce(el, -10) }
  function performPulse(el: HTMLElement): void { pulse(el, 1.1, 0.2) }
  function performJump(el: HTMLElement): void { jump(el, -5) }
  function performShake(el: HTMLElement): void { shake(el, 6, 5) }
  function performBlink(eyes: HTMLElement[]): void { blink(eyes, 0.06) }

  return {
    isAnimationRunning: () => isAnimationRunning,
    startMouseTracking,
    stopMouseTracking,
    startAnimation,
    stopAnimation,
    performBounce,
    performPulse,
    performJump,
    performShake,
    performBlink,
  }
}
