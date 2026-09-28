export type AppEnvironment = 'web' | 'pwa' | 'tauri'

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export function appEnvironment(): AppEnvironment {
  if (isTauri) return 'tauri'
  if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) return 'pwa'
  return 'web'
}

export async function notifyDesktop(title: string, body: string, roomId?: string, messageId?: string): Promise<void> {
  if (!isTauri && (typeof Notification === 'undefined' || Notification.permission !== 'granted')) return
  const tag = messageId
    ? `konnix-msg-${messageId}`
    : (roomId ? `konnix-room-${roomId}` : `konnix-msg-${Date.now()}`)

  // Em navegadores mobile (ex: Android Chrome), `new Notification()` no contexto da janela é proibido
  // e lança TypeError. O caminho padrão e suportado é ServiceWorkerRegistration.showNotification().
  if (!isTauri && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, {
          body,
          tag,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          renotify: true,
          data: { roomId, messageId, url: roomId ? `/room/${roomId}` : '/' },
        } as NotificationOptions)
        return
      }
    } catch {
      /* fallback para Notification() */
    }
  }

  try {
    const notification = new Notification(title, {
      body,
      tag,
      icon: '/icons/icon-192.png',
    })
    notification.onclick = () => {
      window.focus()
      if (isTauri) {
        void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
          const appWindow = getCurrentWindow()
          return appWindow.unminimize()
            .catch(() => undefined)
            .then(() => appWindow.show())
            .then(() => appWindow.setFocus())
        }).catch(() => undefined)
      }
      if (roomId) window.dispatchEvent(new CustomEvent('konnix:navigate', { detail: { roomId } }))
      notification.close()
    }
  } catch {
    /* ignore fallback failure */
  }
}

export async function listenDesktopNotificationAction(onRoomClick?: (roomId: string) => void): Promise<() => void> {
  if (!isTauri) return () => undefined
  const [{ onAction }, { getCurrentWindow }] = await Promise.all([
    import('@tauri-apps/plugin-notification'),
    import('@tauri-apps/api/window'),
  ])
  const listener = await onAction((notification) => {
    const window = getCurrentWindow()
    const roomId = notification.extra?.roomId
    void window.unminimize()
      .catch(() => undefined)
      .then(() => window.show())
      .then(() => window.setFocus())
      .catch(() => undefined)
      .finally(() => {
        if (typeof roomId === 'string' && roomId) onRoomClick?.(roomId)
      })
  })
  return () => { void listener.unregister() }
}

export function updateAppBadge(count: number): void {
  if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
    try {
      if (count > 0) {
        void (navigator as unknown as { setAppBadge: (c: number) => Promise<void> }).setAppBadge(count).catch(() => undefined)
      } else {
        void (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => undefined)
      }
    } catch {
      /* Graceful fallback where unsupported */
    }
  }
}

export function clearAppBadge(): void {
  if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
    try {
      void (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => undefined)
    } catch {
      /* Graceful fallback where unsupported */
    }
  }
}

export async function setDesktopAutostart(enabled: boolean): Promise<void> {
  if (!isTauri) return
  const { disable, enable } = await import('@tauri-apps/plugin-autostart')
  if (enabled) await enable()
  else await disable()
}

export async function desktopAutostartEnabled(): Promise<boolean> {
  if (!isTauri) return false
  const { isEnabled } = await import('@tauri-apps/plugin-autostart')
  return isEnabled()
}

export async function saveDownloadedBlob(blob: Blob, suggestedName: string): Promise<boolean> {
  if (!isTauri) return false
  const [{ save }, { writeFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ])
  const path = await save({ defaultPath: suggestedName, title: 'Salvar arquivo' })
  if (!path) return true
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()))
  return true
}
