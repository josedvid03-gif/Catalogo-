import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, datos } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAjustes } from '../lib/sesion'
import { cop } from '../lib/format'
import type { ItemInventario, Producto } from '../lib/types'
import { CajaError, Cargando, Foto, Vacio } from '../components/Comunes'
import { Icono } from '../components/Icono'

interface Fila extends Producto {
  stock: number
  disponible: number
  reservado: number
  variantes: number
}

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function Productos() {
  const ajustes = useAjustes()
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('')
  const [archivados, setArchivados] = useState(false)
  const [soloSinFoto, setSoloSinFoto] = useState(false)

  const carga = useCarga(async () => {
    const [productos, inv] = await Promise.all([
      supabase.from('productos').select('*').order('nombre'),
      supabase.from('inventario').select('producto_id, stock, disponible, reservado'),
    ])
    const filas = datos(productos) as Producto[]
    const items = datos(inv) as Pick<ItemInventario, 'producto_id' | 'stock' | 'disponible' | 'reservado'>[]
    return filas.map<Fila>((p) => {
      const vs = items.filter((i) => i.producto_id === p.id)
      return {
        ...p,
        stock: vs.reduce((s, v) => s + v.stock, 0),
        disponible: vs.reduce((s, v) => s + v.disponible, 0),
        reservado: vs.reduce((s, v) => s + v.reservado, 0),
        variantes: vs.length,
      }
    })
  })

  const categorias = useMemo(
    () => [...new Set((carga.data ?? []).map((p) => p.categoria).filter(Boolean) as string[])].sort(),
    [carga.data],
  )

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return (carga.data ?? []).filter(
      (p) =>
        p.activo !== archivados &&
        (!soloSinFoto || p.fotos.length === 0) &&
        (!categoria || p.categoria === categoria) &&
        (!q || normalizar(`${p.nombre} ${p.categoria ?? ''} ${p.descripcion ?? ''}`).includes(q)),
    )
  }, [carga.data, busqueda, categoria, archivados, soloSinFoto])

  const sinCosto = (carga.data ?? []).filter((p) => p.activo && p.costo === 0).length
  const sinFoto = (carga.data ?? []).filter((p) => p.activo && p.fotos.length === 0).length

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Productos</h1>
        <div className="acciones">
          <Link to="/productos/importar" className="btn">
            Importar
          </Link>
          <Link to="/productos/nuevo" className="btn btn-primario">
            <Icono nombre="mas" /> Nuevo
          </Link>
        </div>
      </div>

      <div className="filtros">
        <div className="buscador">
          <Icono nombre="buscar" />
          <input
            type="search"
            placeholder="Buscar producto…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar producto"
          />
        </div>
        <div className="fila-filtros">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="interruptor">
            <input type="checkbox" checked={soloSinFoto} onChange={(e) => setSoloSinFoto(e.target.checked)} />
            <span>Sin foto</span>
          </label>
          <label className="interruptor">
            <input type="checkbox" checked={archivados} onChange={(e) => setArchivados(e.target.checked)} />
            <span>Archivados</span>
          </label>
        </div>
      </div>

      {sinFoto > 0 && (
        <Link to="/productos/fotos" className="alerta-linea alerta-info">
          <Icono nombre="camara" />
          {sinFoto} producto{sinFoto === 1 ? '' : 's'} sin foto · Fotos rápidas
        </Link>
      )}

      {sinCosto > 0 && (
        <Link to="/productos/costos" className="alerta-linea">
          <Icono nombre="alerta" />
          {sinCosto} producto{sinCosto === 1 ? '' : 's'} sin costo de compra · Ponerlos
        </Link>
      )}

      {carga.error && <CajaError mensaje={carga.error} reintentar={carga.recargar} />}
      {carga.cargando && !carga.data && <Cargando />}
      {carga.data && visibles.length === 0 && (
        <Vacio icono="prendas">
          {carga.data.length === 0 ? (
            <>
              Aún no tienes productos. <Link to="/productos/nuevo">Crea el primero</Link> o{' '}
              <Link to="/productos/importar">impórtalos desde Excel</Link>.
            </>
          ) : (
            'No hay productos con esos filtros.'
          )}
        </Vacio>
      )}

      <div className="rejilla-productos">
        {visibles.map((p) => (
          <Link key={p.id} to={`/productos/${p.id}`} className="tarjeta-producto">
            <Foto ruta={p.fotos[0]} alt={p.nombre} className="foto-producto" />
            <div className="tarjeta-producto-info">
              <strong className="nombre-producto">{p.nombre}</strong>
              <span className="precio">{cop(p.precio)}</span>
              <span className="sutil">
                {p.disponible} disponible{p.disponible === 1 ? '' : 's'}
                {p.reservado > 0 && ` · ${p.reservado} apartado${p.reservado === 1 ? '' : 's'}`}
              </span>
              <div className="etiquetas">
                {p.disponible === 0 ? (
                  <span className="etiqueta etiqueta-mal">Agotado</span>
                ) : p.disponible <= ajustes.stock_minimo ? (
                  <span className="etiqueta etiqueta-aviso">Poco stock</span>
                ) : null}
                {!p.publicado && <span className="etiqueta">Oculto en catálogo</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
