// Vista previa de una prenda al compartir su enlace (WhatsApp, Instagram, Facebook…).
// vercel.json manda aquí solo a los "robots" de esas apps: devuelve la página normal
// con la foto, el nombre y el precio de la prenda en las etiquetas og:.
export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

const escapar = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const pesos = (n) => '$ ' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.')

/** Cambia (o agrega) <meta property|name="clave" content="…">. */
function poner(html, atributo, clave, valor) {
  const etiqueta = `<meta ${atributo}="${clave}" content="${escapar(valor)}" />`
  const re = new RegExp(`<meta\\s+${atributo}="${clave}"[^>]*>`, 'i')
  return re.test(html) ? html.replace(re, etiqueta) : html.replace('</head>', `    ${etiqueta}\n  </head>`)
}

async function buscarPrenda(id) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !/^[0-9a-f-]{36}$/.test(id)) return null
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/catalogo_publico`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) return null
  const d = await r.json()
  const p = (d.productos ?? []).find((x) => x.id === id)
  return p ? { p, tienda: d.tienda?.nombre ?? '' } : null
}

export default async function handler(req) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id') ?? ''
  const pagina = await fetch(`${url.origin}/index.html`)
  let html = await pagina.text()

  try {
    const r = await buscarPrenda(id)
    if (r) {
      const { p, tienda } = r
      const enlace = `${url.origin}/catalogo/p/${p.id}`
      const rebaja = p.precio_antes && p.precio_antes > p.precio ? ` (antes ${pesos(p.precio_antes)})` : ''
      const tallas = [...new Set((p.variantes ?? []).map((v) => v.talla).filter(Boolean))]
      const titulo = `${p.nombre} — ${pesos(p.precio)}${rebaja}`
      const descripcion = [p.marca, tallas.length ? `Tallas ${tallas.join(', ')}` : null, 'Pide por WhatsApp']
        .filter(Boolean)
        .join(' · ')
      html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapar(`${p.nombre} · ${tienda}`)}</title>`)
      html = poner(html, 'name', 'description', descripcion)
      html = poner(html, 'property', 'og:type', 'product')
      html = poner(html, 'property', 'og:title', titulo)
      html = poner(html, 'property', 'og:description', descripcion)
      html = poner(html, 'property', 'og:url', enlace)
      if (p.fotos?.[0]) {
        html = poner(html, 'property', 'og:image', `${SUPABASE_URL}/storage/v1/object/public/productos/${p.fotos[0]}`)
        html = poner(html, 'name', 'twitter:card', 'summary_large_image')
      }
    }
  } catch {
    // Si algo falla, se devuelve la página normal (con el logo).
  }

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
    },
  })
}
