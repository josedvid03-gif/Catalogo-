import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, datos } from '../../lib/supabase'
import { useCarga } from '../../lib/hooks'
import { porcentajeRebaja } from '../../lib/format'
import type { TablaTallas } from '../../lib/types'

export interface VarianteCatalogo {
  id: string
  talla: string
  color: string
  disponible: number
}

export interface PrendaCatalogo {
  id: string
  nombre: string
  descripcion: string | null
  categoria: string | null
  marca: string | null
  precio: number
  precio_antes: number | null
  fotos: string[]
  created_at: string
  variantes: VarianteCatalogo[]
}

export interface TiendaCatalogo {
  nombre: string
  whatsapp: string | null
  instagram: string | null
  eslogan: string | null
  info: string | null
  envios?: string | null
  cambios?: string | null
  guia_tallas?: TablaTallas[]
  video?: string | null
  pago?: { nequi: string | null; titular: string | null; qr: string | null; otros: string | null }
}

export interface Asesor {
  id: string
  nombre: string
  whatsapp: string
}

/** Lo que se guarda en "Mensajes del catálogo" cuando el cliente toca WhatsApp. */
export interface DatosContacto {
  tipo: 'pedido' | 'pregunta' | 'general'
  mensaje: string
  producto_id?: string
  producto_nombre?: string
  total?: number
  cliente_nombre?: string
  cliente_celular?: string
  cliente_cedula?: string
  cliente_ciudad?: string
  cliente_direccion?: string
  entrega?: 'envio' | 'recoger'
}

export interface LineaPedido {
  varianteId: string
  productoId: string
  nombre: string
  talla: string
  color: string
  precio: number
  foto: string | null
  cantidad: number
}

interface Ctx {
  tienda: TiendaCatalogo | null
  prendas: PrendaCatalogo[]
  cargando: boolean
  error: string | null
  recargar: () => Promise<void>
  pedido: LineaPedido[]
  agregar: (p: PrendaCatalogo, v: VarianteCatalogo) => void
  cambiarCantidad: (varianteId: string, cantidad: number) => void
  quitar: (varianteId: string) => void
  vaciar: () => void
  maximo: (varianteId: string) => number
  pedidoAbierto: boolean
  setPedidoAbierto: (v: boolean) => void
  asesor: Asesor | null
  registrar: (d: DatosContacto) => void
}

const Contexto = createContext<Ctx | null>(null)
const CLAVE = 'pedido-catalogo-v1'
const CLAVE_ASESOR = 'asesor-catalogo-v1'

/** A cada cliente le toca un asesor al azar y siempre le escribe al mismo. */
function elegirAsesor(lista: Asesor[]): Asesor | null {
  if (!lista.length) return null
  let guardado: string | null = null
  try {
    guardado = localStorage.getItem(CLAVE_ASESOR)
  } catch {
    /* sin almacenamiento */
  }
  const ya = lista.find((a) => a.id === guardado)
  if (ya) return ya
  const nuevo = lista[Math.floor(Math.random() * lista.length)]
  try {
    localStorage.setItem(CLAVE_ASESOR, nuevo.id)
  } catch {
    /* sin almacenamiento */
  }
  return nuevo
}

function leerPedido(): LineaPedido[] {
  try {
    const t = localStorage.getItem(CLAVE)
    return t ? (JSON.parse(t) as LineaPedido[]) : []
  } catch {
    return []
  }
}

export function ProveedorCatalogo({ children }: { children: ReactNode }) {
  const carga = useCarga(async () => {
    const r = datos(await supabase.rpc('catalogo_publico')) as {
      tienda: TiendaCatalogo
      productos: PrendaCatalogo[]
      asesores?: Asesor[]
    }
    const asesor = elegirAsesor(r.asesores ?? [])
    return {
      asesor,
      // Todos los botones de WhatsApp del catálogo usan el número del asesor asignado.
      tienda: { ...r.tienda, whatsapp: asesor?.whatsapp ?? r.tienda.whatsapp },
      prendas: r.productos.map((p) => ({
        ...p,
        // Compatibilidad con la versión anterior de la base de datos (sin id ni cantidad por talla).
        variantes: (p.variantes ?? []).map((v) => ({
          ...v,
          id: v.id ?? `${p.id}|${v.talla}|${v.color}`,
          disponible: v.disponible ?? 1,
        })),
      })),
    }
  })
  const [pedido, setPedido] = useState<LineaPedido[]>(leerPedido)
  const [pedidoAbierto, setPedidoAbierto] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(pedido))
    } catch {
      /* navegador sin almacenamiento */
    }
  }, [pedido])

  const disponibles = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of carga.data?.prendas ?? []) for (const v of p.variantes) m.set(v.id, v.disponible)
    return m
  }, [carga.data])

  // Quitar del pedido lo que ya se vendió y ajustar cantidades.
  useEffect(() => {
    if (!carga.data) return
    setPedido((ls) =>
      ls
        .filter((l) => (disponibles.get(l.varianteId) ?? 0) > 0)
        .map((l) => ({ ...l, cantidad: Math.min(l.cantidad, disponibles.get(l.varianteId)!) })),
    )
  }, [carga.data, disponibles])

  const maximo = useCallback((id: string) => disponibles.get(id) ?? 0, [disponibles])

  const agregar = useCallback(
    (p: PrendaCatalogo, v: VarianteCatalogo) =>
      setPedido((ls) => {
        const ya = ls.find((l) => l.varianteId === v.id)
        if (ya) {
          return ls.map((l) =>
            l.varianteId === v.id ? { ...l, cantidad: Math.min(l.cantidad + 1, v.disponible) } : l,
          )
        }
        return [
          ...ls,
          {
            varianteId: v.id,
            productoId: p.id,
            nombre: p.nombre,
            talla: v.talla,
            color: v.color,
            precio: p.precio,
            foto: p.fotos[0] ?? null,
            cantidad: 1,
          },
        ]
      }),
    [],
  )

  const asesor = carga.data?.asesor ?? null
  const registrar = useCallback(
    (d: DatosContacto) => {
      // Si falla (p. ej. falta la actualización 04), el cliente igual llega a WhatsApp.
      void supabase.rpc('registrar_contacto', { p: { ...d, asesor_id: asesor?.id ?? null } }).then(
        () => undefined,
        () => undefined,
      )
    },
    [asesor],
  )

  const valor: Ctx = {
    tienda: carga.data?.tienda ?? null,
    prendas: carga.data?.prendas ?? [],
    cargando: carga.cargando,
    error: carga.error,
    recargar: carga.recargar,
    pedido,
    agregar,
    cambiarCantidad: (id, cantidad) =>
      setPedido((ls) => ls.map((l) => (l.varianteId === id ? { ...l, cantidad: Math.max(1, cantidad) } : l))),
    quitar: (id) => setPedido((ls) => ls.filter((l) => l.varianteId !== id)),
    vaciar: () => setPedido([]),
    maximo,
    pedidoAbierto,
    setPedidoAbierto,
    asesor,
    registrar,
  }
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useCatalogo(): Ctx {
  const c = useContext(Contexto)
  if (!c) throw new Error('useCatalogo fuera de ProveedorCatalogo')
  return c
}

export const esNueva = (p: PrendaCatalogo) => Date.now() - new Date(p.created_at).getTime() < 14 * 86_400_000

export const descuento = (p: Pick<PrendaCatalogo, 'precio' | 'precio_antes'>) =>
  p.precio_antes && p.precio_antes > p.precio ? porcentajeRebaja(p.precio, p.precio_antes) : 0

export const urlPrendaPublica = (id: string) => `${window.location.origin}/catalogo/p/${id}`
