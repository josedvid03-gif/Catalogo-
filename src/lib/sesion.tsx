import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, datos } from './supabase'
import type { Ajustes } from './types'

interface Sesion {
  session: Session | null
  cargando: boolean
  autorizado: boolean | null
  ajustes: Ajustes | null
  recargarAjustes: () => Promise<void>
  salir: () => Promise<void>
}

const Ctx = createContext<Sesion | null>(null)

const AJUSTES_POR_DEFECTO: Ajustes = {
  nombre_tienda: 'Mi Tienda',
  whatsapp: null,
  instagram: null,
  porcentaje_anticipo: 30,
  dias_apartado: 30,
  stock_minimo: 1,
  eslogan: 'Original Supply · Colombia',
  info_catalogo: null,
  pago_nequi: null,
  pago_titular: null,
  envios: null,
  cambios: null,
  guia_tallas: [],
  video_portada: null,
  pago_qr: null,
  pago_otros: null,
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)
  const [autorizado, setAutorizado] = useState<boolean | null>(null)
  const [ajustes, setAjustes] = useState<Ajustes | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCargando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const recargarAjustes = useCallback(async () => {
    const fila = datos(await supabase.from('ajustes').select('*').eq('id', 1).maybeSingle())
    setAjustes({ ...AJUSTES_POR_DEFECTO, ...(fila ?? {}) })
  }, [])

  const email = session?.user.email
  useEffect(() => {
    if (!email) {
      setAutorizado(null)
      return
    }
    let vivo = true
    supabase.rpc('es_equipo').then(async ({ data, error }) => {
      if (!vivo) return
      const ok = !error && data === true
      if (ok) await recargarAjustes().catch(() => setAjustes(AJUSTES_POR_DEFECTO))
      if (vivo) setAutorizado(ok)
    })
    return () => {
      vivo = false
    }
  }, [email, recargarAjustes])

  const salir = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <Ctx.Provider value={{ session, cargando, autorizado, ajustes, recargarAjustes, salir }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSesion(): Sesion {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSesion fuera de ProveedorSesion')
  return s
}

export function useAjustes(): Ajustes {
  return useSesion().ajustes ?? AJUSTES_POR_DEFECTO
}
