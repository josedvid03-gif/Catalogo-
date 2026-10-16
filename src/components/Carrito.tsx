import { useMemo, useState } from 'react'
import { supabase, datos } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { cop, varianteTexto } from '../lib/format'
import type { ItemInventario, LineaCarrito } from '../lib/types'
import { CajaError, CampoPesos, Cantidad, Cargando, Foto } from './Comunes'
import { Icono } from './Icono'

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function totalCarrito(lineas: LineaCarrito[]) {
  return lineas.reduce((s, l) => s + l.cantidad * l.precio, 0)
}

export function itemsParaRPC(lineas: LineaCarrito[]) {
  return lineas.map((l) => ({ variante_id: l.item.id, cantidad: l.cantidad, precio_unit: l.precio }))
}

/** Buscador de prendas disponibles + lista de lo que se va a vender o apartar. */
export function Carrito({
  lineas,
  setLineas,
}: {
  lineas: LineaCarrito[]
  setLineas: (f: (l: LineaCarrito[]) => LineaCarrito[]) => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const inv = useCarga(async () =>
    datos(
      await supabase
        .from('inventario')
        .select('*')
        .eq('activo', true)
        .gt('disponible', 0)
        .order('nombre')
        .order('talla'),
    ) as ItemInventario[],
  )

  const resultados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    if (!q || !inv.data) return []
    const palabras = q.split(/\s+/)
    return inv.data
      .filter((i) => {
        const texto = normalizar(`${i.nombre} ${i.talla} ${i.color} ${i.categoria ?? ''}`)
        return palabras.every((p) => texto.includes(p))
      })
      .slice(0, 30)
  }, [busqueda, inv.data])

  const agregar = (item: ItemInventario) => {
    setLineas((ls) => {
      const existe = ls.find((l) => l.item.id === item.id)
      if (existe) {
        return ls.map((l) =>
          l.item.id === item.id ? { ...l, cantidad: Math.min(l.cantidad + 1, item.disponible) } : l,
        )
      }
      return [...ls, { item, cantidad: 1, precio: item.precio }]
    })
    setBusqueda('')
  }

  const cambiar = (id: string, cambios: Partial<LineaCarrito>) =>
    setLineas((ls) => ls.map((l) => (l.item.id === id ? { ...l, ...cambios } : l)))

  return (
    <div className="carrito">
      <div className="buscador">
        <Icono nombre="buscar" />
        <input
          type="search"
          placeholder="Buscar prenda, talla o color…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar prenda"
        />
      </div>

      {inv.error && <CajaError mensaje={inv.error} reintentar={inv.recargar} />}
      {busqueda.trim() && (
        <div className="resultados">
          {inv.cargando && !inv.data ? (
            <Cargando />
          ) : resultados.length === 0 ? (
            <div className="resultados-vacio">No hay prendas disponibles con “{busqueda}”</div>
          ) : (
            resultados.map((i) => (
              <button key={i.id} className="resultado" onClick={() => agregar(i)}>
                <Foto ruta={i.fotos[0]} alt={i.nombre} className="foto-sm" />
                <span className="resultado-texto">
                  <strong>{i.nombre}</strong>
                  <span className="sutil">{varianteTexto(i.talla, i.color) || 'Única'}</span>
                </span>
                <span className="resultado-lado">
                  <span>{cop(i.precio)}</span>
                  <span className="sutil">{i.disponible} disp.</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {lineas.length > 0 && (
        <ul className="lineas">
          {lineas.map((l) => (
            <li key={l.item.id} className="linea">
              <Foto ruta={l.item.fotos[0]} alt={l.item.nombre} className="foto-sm" />
              <div className="linea-info">
                <strong>{l.item.nombre}</strong>
                <span className="sutil">{varianteTexto(l.item.talla, l.item.color) || 'Única'}</span>
                <div className="linea-controles">
                  <Cantidad
                    valor={l.cantidad}
                    max={l.item.disponible}
                    onChange={(n) => cambiar(l.item.id, { cantidad: n })}
                  />
                  <CampoPesos valor={l.precio} onChange={(n) => cambiar(l.item.id, { precio: n })} />
                </div>
                {l.precio < l.item.precio && (
                  <span className="sutil">Descuento de {cop(l.item.precio - l.precio)} c/u</span>
                )}
              </div>
              <button
                className="btn-icono"
                aria-label={`Quitar ${l.item.nombre}`}
                onClick={() => setLineas((ls) => ls.filter((x) => x.item.id !== l.item.id))}
              >
                <Icono nombre="basura" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
