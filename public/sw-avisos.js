/* Notificaciones al celular (ventas y pedidos del catálogo).
   Se carga dentro del service worker de la app (ver vite.config.ts → importScripts). */

self.addEventListener('push', (evento) => {
  let datos = {}
  try {
    datos = evento.data ? evento.data.json() : {}
  } catch {
    datos = { cuerpo: evento.data ? evento.data.text() : '' }
  }
  evento.waitUntil(
    self.registration.showNotification(datos.titulo || 'Alma Fuerte', {
      body: datos.cuerpo || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-64.png',
      tag: datos.tag ? `${datos.tag}-${Date.now()}` : undefined,
      data: { url: datos.url || '/' },
    }),
  )
})

// Al tocar la notificación se abre la app en la sección que corresponde.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = new URL(evento.notification.data?.url || '/', self.location.origin).href
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (new URL(v.url).origin === self.location.origin && 'focus' in v) {
          v.navigate(destino)
          return v.focus()
        }
      }
      return self.clients.openWindow(destino)
    }),
  )
})
