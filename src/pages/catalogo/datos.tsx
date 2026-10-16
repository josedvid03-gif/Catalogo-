import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, datos } from '../../lib/supabase'
import { useCarga } from '../../lib/hooks'

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
}

const Contexto = createContext<Ctx | null>(null)
const CLAVE = 'pedido-catalogo-v1'

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
    }
    return {
      tienda: r.tienda,
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
  p.precio_antes && p.precio_antes > p.precio ? Math.round((1 - p.precio / p.precio_antes) * 100) : 0

export const urlPrendaPublica = (id: string) => `${window.location.origin}/catalogo/p/${id}`
