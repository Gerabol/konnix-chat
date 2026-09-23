import { useEffect } from 'react'
import { isMobilePlatform } from '../utils/pwa'

let viewportSyncHandler: (() => void) | null = null

export function requestViewportSync() {
  viewportSyncHandler?.()
}

function readSafeAreaInsets() {
  if (typeof document === 'undefined' || !document.body) {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }
  // env(safe-area-inset-*) only has an effect in standalone PWA mode with
  // viewport-fit=cover (content drawn under the status bar / home indicator).
  // Measure it through a probe element so the app can mirror the plain-browser
  // layout, where the OS chrome is never part of the page.
  const probe = document.createElement('div')
  probe.style.position = 'fixed'
  probe.style.top = '0'
  probe.style.left = '0'
  probe.style.width = '1px'
  probe.style.height = '0'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  probe.style.paddingTop = 'env(safe-area-inset-top, 0px)'
  probe.style.paddingRight = 'env(safe-area-inset-right, 0px)'
  probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)'
  probe.style.paddingLeft = 'env(safe-area-inset-left, 0px)'
  document.body.appendChild(probe)
  const computed = window.getComputedStyle(probe)
  const parsePx = (value: string) => {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const insets = {
    top: parsePx(computed.paddingTop),
    right: parsePx(computed.paddingRight),
    bottom: parsePx(computed.paddingBottom),
    left: parsePx(computed.paddingLeft),
  }
  probe.remove()
  return insets
}

export function useMobileViewport() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    let pointerActive = false
    let pendingUpdate = false
    let flushTimer: number | null = null
    let safetyTimer: number | null = null

    const clearSafetyTimer = () => {
      if (safetyTimer !== null) {
        window.clearTimeout(safetyTimer)
        safetyTimer = null
      }
    }

    const clearFlushTimer = () => {
      if (flushTimer !== null) {
        window.clearTimeout(flushTimer)
        flushTimer = null
      }
    }

    const applyPendingViewport = () => {
      pointerActive = false
      pendingUpdate = false
      applyViewport()
    }

    const applyViewport = () => {
      const vv = window.visualViewport
      const vh = vv ? Math.round(vv.height) : window.innerHeight
      const vt = vv ? Math.round(vv.offsetTop) : 0
      const vl = vv ? Math.round(vv.offsetLeft) : 0

      // Expoe os insets de safe-area como px resolvidos (sobrepoe o env() do
      // :root) para que a posicao dos modais fique igual a do navegador no
      // PWA standalone sem deslocar o restante do aplicativo.
      const insets = readSafeAreaInsets()
      document.documentElement.style.setProperty('--safe-top', `${insets.top}px`)
      document.documentElement.style.setProperty('--safe-right', `${insets.right}px`)
      document.documentElement.style.setProperty('--safe-bottom', `${insets.bottom}px`)
      document.documentElement.style.setProperty('--safe-left', `${insets.left}px`)

      document.documentElement.style.setProperty('--app-height', `${vh}px`)
      document.documentElement.style.setProperty('--app-top', `${vt}px`)
      document.documentElement.style.setProperty('--app-left', `${vl}px`)
      // Height the app would occupy with the virtual keyboard hidden. Modals
      // (which cover the full screen) must use this, not the keyboard-reduced
      // height, so they look the same regardless of how they were opened.
      const fullHeight = Math.max(
        vh,
        window.innerHeight,
        window.screen?.height ? Math.round(window.screen.height) : 0,
      )
      document.documentElement.style.setProperty('--app-height-full', `${fullHeight}px`)

      // Detect whether virtual keyboard is open
      const isMobile =
        isMobilePlatform() ||
        window.matchMedia('(pointer: coarse)').matches ||
        window.matchMedia('(max-width: 768px)').matches

      const activeEl = typeof document !== 'undefined' ? document.activeElement : null
      const isInputFocused =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        Boolean((activeEl as HTMLElement)?.isContentEditable)

      const isKeyboardOpen =
        isMobile &&
        isInputFocused &&
        Boolean(
          (vv && window.innerHeight - vv.height > 80) ||
            (vv && window.screen && window.screen.height - vv.height > 120),
        )

      document.documentElement.classList.toggle('keyboard-open', isKeyboardOpen)
      document.body.classList.toggle('keyboard-open', isKeyboardOpen)

      // Ensure window scroll stays at top to prevent dead gap below composer
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0)
      }
      if (document.body && document.body.scrollTop !== 0) {
        document.body.scrollTop = 0
      }
      if (document.documentElement && document.documentElement.scrollTop !== 0) {
        document.documentElement.scrollTop = 0
      }
    }

    const handleViewport = () => {
      // While a pointer is down (a tap in progress), the visual viewport can
      // shift because focusing/blurring inputs opens or hides the keyboard.
      // Applying the resize synchronously would move the element under the
      // finger between pointerdown and pointerup and drop the resulting click,
      // forcing the user to tap twice. Defer until the tap fully finishes.
      if (pointerActive) {
        pendingUpdate = true
        return
      }
      applyViewport()
    }

    const onPointerDown = () => {
      pointerActive = true
      clearFlushTimer()
      // If a pointerup is never delivered, never leave the viewport frozen.
      clearSafetyTimer()
      safetyTimer = window.setTimeout(() => {
        safetyTimer = null
        if (pendingUpdate) {
          applyPendingViewport()
        } else {
          pointerActive = false
        }
      }, 4000)
    }

    const onPointerEnd = () => {
      clearFlushTimer()
      // The browser does not guarantee `click` is dispatched right after
      // pointerup; on mobile it can be queued after the current task or even
      // after a timer. Keep the layout frozen through the click by waiting
      // well beyond pointerup before applying any deferred viewport change.
      flushTimer = window.setTimeout(() => {
        flushTimer = null
        clearSafetyTimer()
        if (pendingUpdate) {
          applyPendingViewport()
        } else {
          pointerActive = false
        }
      }, 150)
    }

    handleViewport()

    viewportSyncHandler = applyViewport

    const handleScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0)
      }
    }

    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', handleViewport)
      vv.addEventListener('scroll', handleViewport)
    }
    window.addEventListener('resize', handleViewport)
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('focusin', handleViewport)
    window.addEventListener('focusout', handleViewport)
    window.addEventListener('orientationchange', handleViewport)
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointerup', onPointerEnd)
    window.addEventListener('pointercancel', onPointerEnd)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleViewport)
      window.removeEventListener('focusin', handleViewport)
      window.removeEventListener('focusout', handleViewport)
      window.removeEventListener('orientationchange', handleViewport)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
      if (vv) {
        vv.removeEventListener('resize', handleViewport)
        vv.removeEventListener('scroll', handleViewport)
      }
      clearFlushTimer()
      clearSafetyTimer()
      viewportSyncHandler = null
    }
  }, [])
}