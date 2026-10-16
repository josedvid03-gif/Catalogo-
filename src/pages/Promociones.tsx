import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { cop, porcentajeRebaja } from '../lib/format'
import type { Producto } from '../lib/types'
import { BotonAccion, CajaError, Cargando, Foto, Vacio } from '../components/Comunes'
import { Icono } from '../components/Icono'

type Fila = Pick<Producto, 'id' | 'nombre' | 'categoria' | 'marca' | 'costo' | 'precio' | 'precio_antes' | 'fotos' | 'publicado'>

const PORCENTAJES = [10, 15, 20, 25, 30, 40, 50]

const enPromo = (p: Fila) => Boolean(p.precio_antes && p.precio_antes > p.precio)
/** Precio normal: si ya está en promoción, el de antes. */
const precioNormal = (p: Fila) => (enPromo(p) ? p.precio_antes! : p.precio)
/** Precio con descuento, redondeado hacia abajo a los $1.000 (el cliente recibe al menos el % anunciado). */
const conDescuento = (precio: number, pct: number) => Math.max(1000, Math.floor((precio * (1 - pct / 100)) / 1000) * 1000)

/** Poner o quitar descuentos (precio antes / ahora) a varias prendas a la vez. */
export function Promociones() {
  const avisar = useAvisar()
  const [pct, setPct] = useState(20)
  const [categoria, setCategoria] = useState('')
  const [marca, setMarca] = useState('')
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())

  const carga = useCarga(
    async () =>
      datos(
        await supabase
          .from('productos')
          .select('id, nombre, categoria, marca, costo, precio, precio_antes, fotos, publicado')
          .eq('activo', true)
          .order('nombre'),
      ) as Fila[],
  )
  const todos = useMemo(() => carga.data ?? [], [carga.data])
  const activas = todos.filter(enPromo)
  const categorias = [...new Set(todos.map((p) => p.categoria).filter(Boolean) as string[])].sort()
  const marcas = [...new Set(todos.map((p) => p.marca).filter(Boolean) as string[])].sort()
  const lista = todos.filter((p) => (!categoria || p.categoria === categoria) && (!marca || p.marca === marca))
  const todosElegidos = lista.length > 0 && lista.every((p) => elegidos.has(p.id))

  const alternar = (id: string) =>
    setElegidos((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const aplicar = async () => {
    const sel = todos.filter((p) => elegidos.has(p.id))
    try {
      for (const p of sel) {
        const antes = precioNormal(p)
        datos(await supabase.from('productos').update({ precio_antes: antes, precio: conDescuento(antes, pct) }).eq('id', p.id))
      }
      avisar(`-${pct}% aplicado a ${sel.length} prenda${sel.length === 1 ? '' : 's'}`)
      setElegidos(new Set())
      await carga.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const quitar = async (sel: Fila[]) => {
    if (sel.length > 1 && !confirm(`¿Quitar la promoción a ${sel.length} prendas? Vuelven a su precio normal.`)) return
    try {
      for (const p of sel) {
        datos(await supabase.from('productos').update({ precio: p.precio_antes, precio_antes: null }).eq('id', p.id))
      }
      avisar(sel.length === 1 ? 'Promoción quitada' : `Promoción quitada a ${sel.length} prendas`)
      await carga.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  return (
    <div className="pagina formulario">
      <div className="titulo-pagina">
        <Link to="/productos" className="btn-icono" aria-label="Volver">
          <Icono nombre="atras" />
        </Link>
        <h1>Promociones</h1>
      </div>
      <p className="sutil">
        En el catálogo las prendas en promoción salen con el precio de antes tachado, el % de descuento y en la sección
        Rebajas. Al vender se cobra el precio de ahora.
      </p>

      {carga.error && <CajaError mensaje={carga.error} reintentar={carga.recargar} />}
      {carga.cargando && !carga.data && <Cargando />}

      {carga.data && (
        <>
          <section className="tarjeta">
            <div className="tarjeta-cabeza">
              <h2>En promoción ({activas.length})</h2>
              {activas.length > 1 && (
                <BotonAccion className="btn btn-sm" onClick={() => quitar(activas)}>
                  Quitar todas
                </BotonAccion>
              )}
            </div>
            {activas.length === 0 ? (
              <p className="sutil">Ninguna prenda tiene descuento ahora.</p>
            ) : (
              <ul className="lista-promo">
                {activas.map((p) => (
                  <li key={p.id}>
                    <Foto ruta={p.fotos[0]} alt={p.nombre} className="foto-sm" />
                    <div className="costo-info">
                      <Link to={`/productos/${p.id}`} className="costo-nombre">
                        {p.nombre}
                      </Link>
                      <span>
                        <s className="precio-antes">{cop(p.precio_antes!)}</s> <strong>{cop(p.precio)}</strong>{' '}
                        <span className="etiqueta etiqueta-rebaja">-{porcentajeRebaja(p.precio, p.precio_antes!)}%</span>
                      </span>
                    </div>
                    <BotonAccion className="btn btn-sm" onClick={() => quitar([p])}>
                      Quitar
                    </BotonAccion>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tarjeta">
            <h2>Nueva promoción</h2>
            <span className="etiqueta-campo">Descuento</span>
            <div className="chips">
              {PORCENTAJES.map((n) => (
                <button key={n} className={`chip ${pct === n ? 'chip-activo' : ''}`} onClick={() => setPct(n)}>
                  -{n}%
                </button>
              ))}
              <label className="chip chip-numero">
                -
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={90}
                  value={pct}
                  onChange={(e) => setPct(Math.min(90, Math.max(1, Number(e.target.value) || 1)))}
                  aria-label="Otro porcentaje"
                />
                %
              </label>
            </div>

            <div className="dos-columnas">
              {categorias.length > 1 && (
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría">
                  <option value="">Todas las categorías</option>
                  {categorias.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              )}
              {marcas.length > 1 && (
                <select value={marca} onChange={(e) => setMarca(e.target.value)} aria-label="Marca">
                  <option value="">Todas las marcas</option>
                  {marcas.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>

            {lista.length === 0 ? (
              <Vacio icono="prendas">No hay productos con ese filtro.</Vacio>
            ) : (
              <>
                <label className="interruptor">
                  <input
                    type="checkbox"
                    checked={todosElegidos}
                    onChange={() =>
                      setElegidos((s) => {
                        const n = new Set(s)
                        for (const p of lista) {
                          if (todosElegidos) n.delete(p.id)
                          else n.add(p.id)
                        }
                        return n
                      })
                    }
                  />
                  <span>Elegir todas ({lista.length})</span>
                </label>
                <ul className="lista-promo">
                  {lista.map((p) => {
                    const antes = precioNormal(p)
                    const ahora = conDescuento(antes, pct)
                    const ganancia = p.costo ? ahora - p.costo : null
                    return (
                      <li key={p.id} className={elegidos.has(p.id) ? 'elegido' : ''}>
                        <label className="promo-fila">
                          <input type="checkbox" checked={elegidos.has(p.id)} onChange={() => alternar(p.id)} />
                          <Foto ruta={p.fotos[0]} alt={p.nombre} className="foto-sm" />
                          <span className="costo-info">
                            <span className="costo-nombre">
                              {p.nombre}
                              {!p.publicado && <span className="sutil"> · no publicado</span>}
                            </span>
                            <span>
                              <s className="precio-antes">{cop(antes)}</s> → <strong>{cop(ahora)}</strong>
                            </span>
                            {ganancia !== null && (
                              <span className={`sutil ${ganancia <= 0 ? 'tono-mal' : ''}`}>
                                {ganancia <= 0 ? `Pierdes ${cop(-ganancia)}` : `Te quedan ${cop(ganancia)} de ganancia`}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>

          <div className="barra-guardar">
            <BotonAccion className="btn btn-primario btn-bloque" disabled={elegidos.size === 0} onClick={aplicar}>
              {elegidos.size === 0
                ? 'Elige las prendas'
                : `Aplicar -${pct}% a ${elegidos.size} prenda${elegidos.size === 1 ? '' : 's'}`}
            </BotonAccion>
          </div>
        </>
      )}
    </div>
  )
}
