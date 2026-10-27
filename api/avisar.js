// Envía las notificaciones al celular (ventas y pedidos del catálogo).
// Lo llama la base de datos (actualización 10) cuando se guarda una venta o
// llega un pedido; antes de enviar, confirma el secreto con la base de datos.
import webpush from 'web-push'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

async function rpc(nombre, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!r.ok) throw new Error(`${nombre}: ${r.status}`)
  return r.status === 204 ? null : r.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' })
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const { secreto, vapid, aviso, suscripciones } = b
  if (!secreto || !vapid?.publica || !vapid?.privada || !aviso || !Array.isArray(suscripciones)) {
    return res.status(400).json({ error: 'Datos incompletos' })
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Falta configurar Supabase' })
  // Solo la base de datos conoce el secreto: así nadie más puede usar esta dirección.
  if ((await rpc('avisos_secreto_valido', { p_secreto: secreto })) !== true) {
    return res.status(403).json({ error: 'No autorizado' })
  }

  webpush.setVapidDetails(vapid.contacto?.startsWith('https://') ? vapid.contacto : 'mailto:avisos@almafuerte.co', vapid.publica, vapid.privada)
  const contenido = JSON.stringify({
    titulo: String(aviso.titulo ?? 'Alma Fuerte').slice(0, 120),
    cuerpo: String(aviso.cuerpo ?? '').slice(0, 300),
    url: String(aviso.url ?? '/'),
    tag: String(aviso.tag ?? 'aviso'),
  })

  const resultados = await Promise.allSettled(
    suscripciones.slice(0, 50).map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, contenido, {
        TTL: 60 * 60 * 6,
        urgency: 'high',
      }),
    ),
  )
  // Celulares que ya no reciben (desinstalaron la app o quitaron el permiso).
  const vencidas = resultados
    .map((r, i) => (r.status === 'rejected' && [404, 410].includes(r.reason?.statusCode) ? suscripciones[i].endpoint : null))
    .filter(Boolean)
  if (vencidas.length) await rpc('quitar_suscripciones', { p_secreto: secreto, p_endpoints: vencidas }).catch(() => undefined)

  return res.status(200).json({
    enviadas: resultados.filter((r) => r.status === 'fulfilled').length,
    fallidas: resultados.filter((r) => r.status === 'rejected').length,
    quitadas: vencidas.length,
  })
}
