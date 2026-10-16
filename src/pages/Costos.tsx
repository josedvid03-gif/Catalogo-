import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { cop, margen } from '../lib/format'
import type { Producto } from '../lib/types'
import { BotonAccion, CajaError, CampoPesos, Cargando, Foto, Vacio } from '../components/Comunes'
import { Icono } from '../components/Icono'

type Fila = Pick<Producto, 'id' | 'nombre' | 'categoria' | 'costo' | 'precio' | 'fotos'>

/** Lista para llenar rápido el costo de compra de muchos productos. */
export function Costos() {
  const avisar = useAvisar()
  const [todos, setTodos] = useState(false)
  const [cambios, setCambios] = useState<Record<string, number>>({})

  const carga = useCarga(async () => {
    let q = supabase.from('productos').select('id, nombre, categoria, costo, precio, fotos').eq('activo', true)
    if (!todos) q = q.eq('costo', 0)
    return datos(await q.order('categoria', { nullsFirst: false }).order('nombre')) as Fila[]
  }, [todos])

  const pendientes = Object.keys(cambios).length
  const filas = useMemo(() => carga.data ?? [], [carga.data])

  const guardar = async () => {
    const lista = Object.entries(cambios)
    try {
      for (const [id, costo] of lista) {
        datos(await supabase.from('productos').update({ costo }).eq('id', id))
      }
      avisar(`${lista.length} costo${lista.length === 1 ? '' : 's'} guardado${lista.length === 1 ? '' : 's'}`)
      setCambios({})
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
        <h1>Costos de compra</h1>
      </div>

      <p className="sutil">
        Escribe lo que te costó cada prenda. Con eso la app calcula la ganancia real de cada venta y del inventario.
      </p>

      <label className="interruptor">
        <input
          type="checkbox"
          checked={todos}
          onChange={(e) => {
            setTodos(e.target.checked)
            setCambios({})
          }}
        />
        <span>Mostrar también los que ya tienen costo</span>
      </label>

      {carga.error && <CajaError mensaje={carga.error} reintentar={carga.recargar} />}
      {carga.cargando && !carga.data && <Cargando />}
      {carga.data && filas.length === 0 && <Vacio icono="prendas">Todos los productos tienen costo. ¡Listo!</Vacio>}

      {filas.length > 0 && (
        <ul className="tarjeta lista-costos">
          {filas.map((p) => {
            const costo = cambios[p.id] ?? p.costo
            const m = costo ? margen(costo, p.precio) : null
            return (
              <li key={p.id}>
                <Foto ruta={p.fotos[0]} alt={p.nombre} className="foto-sm" />
                <div className="costo-info">
                  <Link to={`/productos/${p.id}`} className="costo-nombre">
                    {p.nombre}
                  </Link>
                  <span className="sutil">
                    Precio {cop(p.precio)}
                    {m !== null && ` · ganas ${cop(p.precio - costo)} (${m}%)`}
                  </span>
                </div>
                <div className="costo-campo">
                  <CampoPesos
                    valor={costo}
                    onChange={(n) => setCambios((c) => ({ ...c, [p.id]: n }))}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {pendientes > 0 && (
        <div className="barra-guardar">
          <BotonAccion className="btn btn-primario btn-bloque" onClick={guardar}>
            Guardar {pendientes} costo{pendientes === 1 ? '' : 's'}
          </BotonAccion>
        </div>
      )}
    </div>
  )
}
