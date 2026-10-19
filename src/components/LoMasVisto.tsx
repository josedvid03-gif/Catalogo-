import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, datos } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { hoyColombia, num } from '../lib/format'
import { Dato } from './Comunes'

const GENERAL = '00000000-0000-0000-0000-000000000000'
const PERIODOS = [7, 30, 90]

interface Fila {
  producto_id: string
  tipo: 'visita' | 'vista' | 'bolsa' | 'comprar' | 'pedido'
  cantidad: number
}

function hace(dias: number): string {
  const d = new Date(hoyColombia() + 'T12:00:00-05:00')
  d.setDate(d.getDate() - (dias - 1))
  return d.toISOString().slice(0, 10)
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')

/** Qué miran los clientes en el catálogo y en qué paso se quedan. */
export function LoMasVisto() {
  const [dias, setDias] = useState(30)
  const carga = useCarga(async () => {
    const [ev, ps] = await Promise.all([
      supabase.from('eventos_dia').select('producto_id, tipo, cantidad').gte('dia', hace(dias)),
      supabase.from('productos').select('id, nombre'),
    ])
    // Sin la actualización 09 no hay datos que mostrar.
    if (ev.error) return null
    return { eventos: ev.data as Fila[], nombres: new Map((datos(ps) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre])) }
  }, [dias])

  const r = useMemo(() => {
    if (!carga.data) return null
    const t = { visita: 0, vista: 0, bolsa: 0, comprar: 0, pedido: 0 }
    const por = new Map<string, { vista: number; interes: number; pedido: number }>()
    for (const e of carga.data.eventos) {
      if (e.producto_id === GENERAL) {
        if (e.tipo === 'visita' || e.tipo === 'pedido') t[e.tipo] += e.cantidad
        continue
      }
      if (e.tipo !== 'pedido') t[e.tipo] += e.cantidad
      const x = por.get(e.producto_id) ?? { vista: 0, interes: 0, pedido: 0 }
      if (e.tipo === 'vista') x.vista += e.cantidad
      if (e.tipo === 'bolsa' || e.tipo === 'comprar') x.interes += e.cantidad
      if (e.tipo === 'pedido') x.pedido += e.cantidad
      por.set(e.producto_id, x)
    }
    const prendas = [...por.entries()]
      .map(([id, x]) => ({ id, nombre: carga.data!.nombres.get(id) ?? 'Prenda borrada', ...x }))
      .sort((a, b) => b.vista - a.vista || b.pedido - a.pedido)
    // Muy vistas pero casi nadie las pide: revisar precio, fotos o tallas.
    const frenadas = prendas.filter((p) => p.vista >= 10 && p.pedido / p.vista < 0.03).slice(0, 3)
    return { t, prendas, frenadas }
  }, [carga.data])

  return (
    <section className="tarjeta">
      <div className="tarjeta-cabeza">
        <h2>Lo más visto en el catálogo</h2>
      </div>
      <div className="chips">
        {PERIODOS.map((d) => (
          <button key={d} className={`chip ${dias === d ? 'chip-activo' : ''}`} onClick={() => setDias(d)}>
            {d} días
          </button>
        ))}
      </div>

      {carga.data === null && (
        <p className="sutil">Para ver esta sección falta la actualización 09 de la base de datos (ver README).</p>
      )}
      {r && r.t.visita === 0 && <p className="sutil">Todavía no hay visitas en este periodo. Comparte el catálogo 😉</p>}

      {r && r.t.visita > 0 && (
        <>
          <p className="sutil">Cada persona cuenta una vez por visita. No se guarda quién es.</p>
          <div className="datos">
            <Dato etiqueta="Visitas al catálogo" valor={num(r.t.visita)} />
            <Dato etiqueta="Abrieron una prenda" valor={num(r.t.vista)} nota={`${pct(r.t.vista, r.t.visita)} de las visitas`} />
            <Dato
              etiqueta="Agregaron o tocaron comprar"
              valor={num(r.t.bolsa + r.t.comprar)}
              nota={`${pct(r.t.bolsa + r.t.comprar, r.t.vista)} de quienes abren una prenda`}
            />
            <Dato
              etiqueta="Enviaron pedido por WhatsApp"
              valor={num(r.t.pedido)}
              tono="bien"
              nota={`${pct(r.t.pedido, r.t.visita)} de las visitas`}
            />
          </div>

          {r.prendas.length > 0 && (
            <div className="tabla-scroll">
              <table className="tabla-caja">
                <thead>
                  <tr>
                    <th>Prenda</th>
                    <th>Vistas</th>
                    <th>Interés</th>
                    <th>Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {r.prendas.slice(0, 12).map((p) => (
                    <tr key={p.id}>
                      <th>
                        <Link to={`/productos/${p.id}`}>{p.nombre}</Link>
                      </th>
                      <td>{num(p.vista)}</td>
                      <td>{num(p.interes)}</td>
                      <td>{num(p.pedido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {r.frenadas.length > 0 && (
            <p className="alerta-linea">
              Muy vistas pero casi sin pedidos: <strong>{r.frenadas.map((p) => p.nombre).join(', ')}</strong>. Revisa precio,
              fotos o tallas disponibles.
            </p>
          )}
        </>
      )}
    </section>
  )
}
