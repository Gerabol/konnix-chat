import { useCallback, useEffect, useState } from 'react'
import {
  detectInstalledWebApp,
  detectStandalone,
  persistAppInstalledFlag,
} from '../utils/pwa'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function usePwaInstall() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(() => {
    return (window as unknown as { __konnixInstallPrompt?: BeforeInstallPromptEvent }).__konnixInstallPrompt ?? null
  })
  const [standalone, setStandalone] = useState<boolean>(detectStandalone)
  const [appInstalled, setAppInstalled] = useState<boolean>(detectStandalone)
  const [installCardDismissed, setInstallCardDismissed] = useState<boolean>(false)

  // Listen to beforeinstallprompt and appinstalled
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      const p = e as BeforeInstallPromptEvent
      ;(window as unknown as { __konnixInstallPrompt?: BeforeInstallPromptEvent }).__konnixInstallPrompt = p
      setInstallEvent(p)
      setAppInstalled(false)
    }

    ;(window as unknown as { __onKonnixInstallReady?: (e: BeforeInstallPromptEvent) => void }).__onKonnixInstallReady = (
      e,
    ) => {
      setInstallEvent(e)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    const onAppInstalled = () => {
      setInstallEvent(null)
      setAppInstalled(true)
      persistAppInstalledFlag()
      ;(window as unknown as { __konnixInstallPrompt?: BeforeInstallPromptEvent | null }).__konnixInstallPrompt = null
    }

    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onAppInstalled)
      delete (window as unknown as { __onKonnixInstallReady?: unknown }).__onKonnixInstallReady
    }
  }, [])

  // Monitor standalone display-mode changes
  useEffect(() => {
    const modes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']
    const mqs = modes.map((mode) => window.matchMedia(`(display-mode: ${mode})`))

    const onChange = () => {
      const isNowStandalone = detectStandalone()
      setStandalone(isNowStandalone)
      if (isNowStandalone) {
        persistAppInstalledFlag()
        setAppInstalled(true)
      }
    }

    mqs.forEach((mq) => {
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange)
    })

    return () => {
      mqs.forEach((mq) => {
        if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onChange)
      })
    }
  }, [])

  // Check getInstalledRelatedApps on focus and visibilitychange
  useEffect(() => {
    let active = true
    const syncInstalled = async (): Promise<void> => {
      const installed = await detectInstalledWebApp()
      if (!active) return
      if (installed) {
        persistAppInstalledFlag()
        setAppInstalled(true)
      }
    }

    void syncInstalled()
    const onFocus = () => {
      void syncInstalled()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void syncInstalled()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const dismissCard = useCallback(() => {
    setInstallCardDismissed(true)
  }, [])

  const installApp = useCallback(async (): Promise<boolean> => {
    const prompt =
      installEvent || (window as unknown as { __konnixInstallPrompt?: BeforeInstallPromptEvent }).__konnixInstallPrompt
    if (!prompt) return false
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      if (choice.outcome === 'accepted') {
        setInstallEvent(null)
        setAppInstalled(true)
        persistAppInstalledFlag()
        ;(window as unknown as { __konnixInstallPrompt?: BeforeInstallPromptEvent | null }).__konnixInstallPrompt = null
      }
      return true
    } catch {
      return false
    }
  }, [installEvent])

  return {
    installEvent,
    standalone,
    appInstalled,
    installCardDismissed,
    dismissInstallCard: dismissCard,
    installApp,
    setAppInstalled,
  }
}
