import { useCallback, useEffect, useRef, useState } from 'react'
import { mensajeError } from './supabase'

/**
 * Carga datos y los vuelve a pedir cuando la app vuelve a primer plano,
 * así lo que cambió en otro dispositivo aparece al regresar.
 */
export function useCarga<T>(cargar: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const fn = useRef(cargar)
  fn.current = cargar
  const peticion = useRef(0)

  const recargar = useCallback(async () => {
    const id = ++peticion.current
    setCargando(true)
    try {
      const r = await fn.current()
      if (id === peticion.current) {
        setData(r)
        setError(null)
      }
    } catch (e) {
      if (id === peticion.current) setError(mensajeError(e))
    } finally {
      if (id === peticion.current) setCargando(false)
    }
  }, [])

  useEffect(() => {
    void recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') void recargar()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [recargar])

  return { data, error, cargando, recargar }
}
