import { useEffect } from 'react'
import { detectPlatform, detectStandalone, isMobilePlatform } from '../utils/pwa'

export function useMobileViewport() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const platform = detectPlatform()
    const isStandalone = detectStandalone()
    if (platform === 'ios') {
      document.documentElement.classList.add('is-ios')
    }
    if (isStandalone) {
      document.documentElement.classList.add('is-standalone')
    }

    let wasKeyboardOpen = false

    const handleViewport = () => {
      const vv = window.visualViewport
      const vh = vv ? Math.round(vv.height) : window.innerHeight
      const vt = vv ? Math.round(vv.offsetTop) : 0
      const vl = vv ? Math.round(vv.offsetLeft) : 0

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

      if (isKeyboardOpen) {
        wasKeyboardOpen = true
        document.documentElement.style.setProperty('--app-height', `${vh}px`)
        document.documentElement.style.setProperty('--app-top', `${vt}px`)
        document.documentElement.style.setProperty('--app-left', `${vl}px`)
        document.documentElement.classList.add('keyboard-open')
        document.body.classList.add('keyboard-open')
      } else {
        document.documentElement.style.removeProperty('--app-height')
        document.documentElement.style.removeProperty('--app-top')
        document.documentElement.style.removeProperty('--app-left')
        document.documentElement.classList.remove('keyboard-open')
        document.body.classList.remove('keyboard-open')
        if (wasKeyboardOpen) {
          wasKeyboardOpen = false
          void document.body?.offsetHeight
          if (typeof window !== 'undefined') {
            window.scrollTo(0, 0)
            setTimeout(() => window.scrollTo(0, 0), 100)
            setTimeout(() => window.scrollTo(0, 0), 300)
          }
        }
      }

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

    handleViewport()

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

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleViewport)
      window.removeEventListener('focusin', handleViewport)
      window.removeEventListener('focusout', handleViewport)
      window.removeEventListener('orientationchange', handleViewport)
      if (vv) {
        vv.removeEventListener('resize', handleViewport)
        vv.removeEventListener('scroll', handleViewport)
      }
      document.documentElement.style.removeProperty('--app-height')
      document.documentElement.style.removeProperty('--app-top')
      document.documentElement.style.removeProperty('--app-left')
      document.documentElement.classList.remove('keyboard-open')
      document.documentElement.classList.remove('is-ios')
      document.documentElement.classList.remove('is-standalone')
      document.body?.classList.remove('keyboard-open')
    }
  }, [])
}
