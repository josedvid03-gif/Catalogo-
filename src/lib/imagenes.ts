import { supabase, BUCKET } from './supabase'

/** Reduce la foto del celular (varios MB) a ~200 KB antes de subirla. */
async function comprimir(archivo: File, maxLado = 1400, calidad = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(archivo)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * escala)
    const h = Math.round(img.naturalHeight * escala)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return archivo
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', calidad))
    return blob ?? archivo
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function subirFoto(productoId: string, archivo: File): Promise<string> {
  const blob = await comprimir(archivo)
  const ruta = `${productoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw error
  return ruta
}

export async function borrarFotos(rutas: string[]): Promise<void> {
  if (rutas.length === 0) return
  const { error } = await supabase.storage.from(BUCKET).remove(rutas)
  if (error) throw error
}
