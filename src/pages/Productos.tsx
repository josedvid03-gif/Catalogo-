import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useAvisar } from '../lib/aviso'
import { useCarga } from '../lib/hooks'
import { useAjustes } from '../lib/sesion'
import { cop, porcentajeRebaja } from '../lib/format'
import type { ItemInventario, Producto } from '../lib/types'
import { BotonAccion, CajaError, Cargando, Foto, Vacio } from '../components/Comunes'
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
  const [marca, setMarca] = useState('')
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

  const marcas = useMemo(
    () => [...new Set((carga.data ?? []).map((p) => p.marca).filter(Boolean) as string[])].sort(),
    [carga.data],
  )

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return (carga.data ?? []).filter(
      (p) =>
        p.activo !== archivados &&
        (!soloSinFoto || p.fotos.length === 0) &&
        (!categoria || p.categoria === categoria) &&
        (!marca || p.marca === marca) &&
        (!q || normalizar(`${p.nombre} ${p.categoria ?? ''} ${p.marca ?? ''} ${p.descripcion ?? ''}`).includes(q)),
    )
  }, [carga.data, busqueda, categoria, marca, archivados, soloSinFoto])

  const sinCosto = (carga.data ?? []).filter((p) => p.activo && p.costo === 0).length
  const sinFoto = (carga.data ?? []).filter((p) => p.activo && p.fotos.length === 0).length
  // Prendas con foto y con unidades disponibles que todavía no se ven en el catálogo.
  const ocultasConFoto = (carga.data ?? []).filter(
    (p) => p.activo && !p.publicado && p.fotos.length > 0 && p.disponible > 0,
  )
  const avisar = useAvisar()
  const publicarConFoto = async () => {
    try {
      datos(
        await supabase
          .from('productos')
          .update({ publicado: true })
          .in(
            'id',
            ocultasConFoto.map((p) => p.id),
          ),
      )
      avisar(`${ocultasConFoto.length} prenda${ocultasConFoto.length === 1 ? '' : 's'} publicada${ocultasConFoto.length === 1 ? '' : 's'} en el catálogo`)
      await carga.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Productos</h1>
        <div className="acciones">
          <Link to="/productos/promociones" className="btn" aria-label="Promociones">
            <Icono nombre="porcentaje" /> Promos
          </Link>
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
          {marcas.length > 0 && (
            <select value={marca} onChange={(e) => setMarca(e.target.value)} aria-label="Marca">
              <option value="">Todas las marcas</option>
              {marcas.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
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

      {ocultasConFoto.length > 0 && (
        <div className="alerta-linea alerta-info alerta-accion">
          <Icono nombre="ojo" />
          <span>
            {ocultasConFoto.length} prenda{ocultasConFoto.length === 1 ? '' : 's'} con foto no se ve
            {ocultasConFoto.length === 1 ? '' : 'n'} en el catálogo
          </span>
          <BotonAccion className="btn btn-sm btn-primario" onClick={publicarConFoto}>
            Publicar
          </BotonAccion>
        </div>
      )}

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
              {p.marca && <span className="sutil marca-producto">{p.marca}</span>}
              <span className="precio">
                {cop(p.precio)}
                {p.precio_antes && p.precio_antes > p.precio ? (
                  <s className="precio-antes"> {cop(p.precio_antes)}</s>
                ) : null}
              </span>
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
                {p.precio_antes && p.precio_antes > p.precio ? (
                  <span className="etiqueta etiqueta-rebaja">-{porcentajeRebaja(p.precio, p.precio_antes)}%</span>
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
