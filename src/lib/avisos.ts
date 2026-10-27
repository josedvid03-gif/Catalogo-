import { supabase, datos } from './supabase'

/** Lo que este celular puede hacer con las notificaciones. */
export type Soporte = 'si' | 'instalar-iphone' | 'no'

export interface Suscripcion {
  endpoint: string
  ventas: boolean
  pedidos: boolean
}

const esIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
const instalada = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export function soporte(): Soporte {
  const tiene = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (esIphone() && !instalada()) return 'instalar-iphone'
  return tiene ? 'si' : 'no'
}

const b64u = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

function desdeB64u(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

/** La primera vez se crean las claves de las notificaciones (quedan solo en la base de datos). */
async function clavePublica(): Promise<string> {
  const ya = datos(await supabase.from('avisos_config').select('vapid_publica, url_sitio').maybeSingle()) as {
    vapid_publica: string
    url_sitio: string
  } | null
  const origen = window.location.origin
  if (ya) {
    // Si la app se abrió desde otra dirección pública, los avisos salen por esa.
    if (ya.url_sitio !== origen && origen.startsWith('https://')) {
      await supabase.from('avisos_config').update({ url_sitio: origen }).eq('id', 1)
    }
    return ya.vapid_publica
  }
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const publica = b64u(await crypto.subtle.exportKey('raw', par.publicKey))
  const privada = (await crypto.subtle.exportKey('jwk', par.privateKey)).d!
  const secreto = b64u(crypto.getRandomValues(new Uint8Array(32)).buffer)
  const r = await supabase
    .from('avisos_config')
    .insert({ id: 1, url_sitio: origen, vapid_publica: publica, vapid_privada: privada, secreto })
  // Si otra persona del equipo las creó al mismo tiempo, se usan las suyas.
  if (r.error && r.error.code !== '23505') throw r.error
  return r.error ? clavePublica() : publica
}

async function registro() {
  return navigator.serviceWorker.ready
}

/** La suscripción de este celular, si ya activó las notificaciones. */
export async function suscripcionActual(): Promise<Suscripcion | null> {
  if (soporte() !== 'si' || Notification.permission !== 'granted') return null
  const sub = await (await registro()).pushManager.getSubscription()
  if (!sub) return null
  const fila = datos(
    await supabase.from('suscripciones_push').select('endpoint, ventas, pedidos').eq('endpoint', sub.endpoint).maybeSingle(),
  ) as Suscripcion | null
  return fila
}

export async function activar(preferencias: { ventas: boolean; pedidos: boolean }): Promise<Suscripcion> {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('permiso')
  const clave = await clavePublica()
  const reg = await registro()
  let sub = await reg.pushManager.getSubscription()
  // Si las claves cambiaron, se vuelve a suscribir.
  if (sub && b64u(sub.options.applicationServerKey ?? new ArrayBuffer(0)) !== clave) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: desdeB64u(clave) })
  const j = sub.toJSON()
  const fila = { endpoint: sub.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth, ...preferencias }
  datos(await supabase.from('suscripciones_push').upsert(fila))
  return { endpoint: fila.endpoint, ...preferencias }
}

export async function cambiarPreferencias(endpoint: string, preferencias: { ventas: boolean; pedidos: boolean }) {
  datos(await supabase.from('suscripciones_push').update(preferencias).eq('endpoint', endpoint))
}

export async function desactivar(endpoint: string) {
  const sub = await (await registro()).pushManager.getSubscription()
  await sub?.unsubscribe()
  datos(await supabase.from('suscripciones_push').delete().eq('endpoint', endpoint))
}

export async function probar(endpoint: string) {
  datos(await supabase.rpc('probar_aviso', { p_endpoint: endpoint }))
}
