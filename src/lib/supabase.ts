import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configurado = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost', key || 'sin-configurar')

export const BUCKET = 'productos'

export function urlFoto(ruta: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl
}

/** Convierte errores de Supabase/Postgres en un mensaje legible. */
export function mensajeError(e: unknown): string {
  if (!e) return 'Error desconocido'
  if (typeof e === 'string') return e
  const err = e as { message?: string; code?: string }
  if (err.code === '23505') return 'Ya existe un registro igual (revisa tallas/colores repetidos)'
  if (err.code === 'PGRST205' || err.code === '42P01') {
    return 'Falta actualizar la base de datos: en Supabase → SQL Editor ejecuta el archivo de supabase/actualizaciones (ver README)'
  }
  if (err.message?.includes('Failed to fetch')) return 'Sin conexión a internet. Intenta de nuevo'
  return err.message || 'Error desconocido'
}

/** Lanza el error de una respuesta de Supabase o devuelve sus datos. */
export function datos<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error
  return res.data as T
}
