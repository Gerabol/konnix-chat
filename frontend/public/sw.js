/* Konnix Chat — Service Worker
 * Cache controlado: somente assets estáticos (HTML/JS/CSS/ícones/fontes).
 * Nunca cacheia: respostas da API, mensagens, anexos, tokens.
 */
const VERSION = 'konnix-shell-v15';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  // Never cache Vite source/HMR requests. A stale module can keep old React
  // state logic running while the rest of the page appears updated.
  if (url.pathname === '/sw.js' || url.pathname.startsWith('/@') ||
      url.pathname.startsWith('/src/') || url.pathname.startsWith('/node_modules/') ||
      url.pathname.startsWith('/api/')) {
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Konnix Chat', body: 'Nova mensagem', data: { url: '/' } };
  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json());
    } catch (err) {
      payload.body = event.data.text() || payload.body;
    }
  }
  event.waitUntil(
    (async () => {
      // Se houver uma janela aberta E visível/focada pelo usuário, o WebSocket da página
      // em primeiro plano já cuida da notificação e do som. Se todas as janelas estiverem
      // minimizadas, em segundo plano (document.hidden) ou fechadas, exibe a notificação push.
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const isForegroundAndFocused = clients.some(
        (c) => c.visibilityState === 'visible' && c.focused
      );
      if (isForegroundAndFocused) return;

      const roomId = payload.data?.roomId;
      const messageId = payload.data?.messageId;
      const notificationTag = messageId
        ? `konnix-msg-${messageId}`
        : (roomId ? `konnix-room-${roomId}` : `konnix-msg-${Date.now()}`);

      let unreadCount = typeof payload.data?.unreadCount === 'number'
        ? payload.data.unreadCount
        : (typeof payload.unreadCount === 'number' ? payload.unreadCount : null);

      if (unreadCount === null) {
        try {
          const existing = await self.registration.getNotifications();
          unreadCount = existing.length + 1;
        } catch {
          unreadCount = 1;
        }
      }

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: notificationTag,
        renotify: true,
        vibrate: [200, 100, 200],
        timestamp: Date.now(),
        data: {
          ...(payload.data || {}),
          unreadCount,
          url: payload.data?.url || (roomId ? `/room/${roomId}` : '/'),
          roomId: roomId || null,
        },
      });

      // Atualiza o app badge no PWA mobile se suportado
      if ('setAppBadge' in self.navigator) {
        try {
          if (unreadCount > 0) {
            await self.navigator.setAppBadge(unreadCount);
          } else {
            await self.navigator.clearAppBadge();
          }
        } catch {
          /* ignore badge failure */
        }
      }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const roomId = data.roomId || null;
  const target = data.url || (roomId ? `/room/${roomId}` : '/');

  event.waitUntil(
    (async () => {
      // Ajusta o badge ao clicar em uma notificação
      try {
        const notifs = await self.registration.getNotifications();
        if ('setAppBadge' in self.navigator) {
          if (notifs.length > 0) {
            await self.navigator.setAppBadge(notifs.length);
          } else {
            await self.navigator.clearAppBadge();
          }
        }
      } catch {
        /* ignore badge failure */
      }

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({ type: 'konnix:navigate', url: target, roomId });
          return;
        }
      }
      const newClient = await self.clients.openWindow(target);
      if (newClient && roomId) {
        setTimeout(() => {
          newClient.postMessage({ type: 'konnix:navigate', url: target, roomId });
        }, 1000);
      }
    })()
  );
});

// Renovação automática de subscrição push caso o browser rotacione o token (comum após 24h+)
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keyRes = await fetch('/api/v1/push/public-key').catch(() => null);
        if (!keyRes || !keyRes.ok) return;
        const keyJson = await keyRes.json();
        const pubKey = keyJson?.data?.publicKey;
        if (!pubKey) return;

        const padded = pubKey.replace(/-/g, '+').replace(/_/g, '/');
        const normalized = padded.padEnd(Math.ceil(padded.length / 4) * 4, '=');
        const binary = atob(normalized);
        const keyBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) keyBytes[i] = binary.charCodeAt(i);

        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes,
        });

        const toB64Url = (bytes) => {
          let bin = '';
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        };

        await fetch('/api/v1/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: newSub.endpoint,
            p256dh: toB64Url(new Uint8Array(newSub.getKey('p256dh'))),
            auth: toB64Url(new Uint8Array(newSub.getKey('auth'))),
          }),
        });
      } catch (err) {
        console.warn('Falha na renovação da subscrição push:', err);
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'konnix:skipWaiting') {
    self.skipWaiting();
  }
});

