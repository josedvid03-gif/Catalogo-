import { useMemo, useState } from 'react'
import { supabase, datos } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { cop, mesActual, moverMes, nombreMes, num } from '../lib/format'
import { fechaColombia } from '../lib/inversiones'
import { CajaError, Cargando, Dato, Vacio } from '../components/Comunes'
import { LoMasVisto } from '../components/LoMasVisto'

interface VentaR {
  id: string
  fecha: string
  total: number
  costo_total: number
  venta_items: { producto_id: string | null; cantidad: number; precio_unit: number; costo_unit: number }[]
}
interface ProductoR {
  id: string
  marca: string | null
  categoria: string | null
  created_at: string
}

type Medida = 'vendido' | 'neta'
type Vista = 'marcas' | 'categorias'

/** 1.250.000 → "1,3 M"; 450.000 → "450 mil" */
function corto(n: number): string {
  const a = Math.abs(n)
  const s = n < 0 ? '−' : ''
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`
  if (a >= 1_000) return `${s}${Math.round(a / 1_000)} mil`
  return `${s}${a}`
}

/** Escala "bonita" para el eje: 0, 250 mil, 500 mil… */
function pasoBonito(max: number): number {
  if (max <= 0) return 1
  const bruto = max / 4
  const p = Math.pow(10, Math.floor(Math.log10(bruto)))
  const f = bruto / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}

export function Reportes() {
  const [meses, setMeses] = useState(6)
  const [medida, setMedida] = useState<Medida>('vendido')
  const [vista, setVista] = useState<Vista>('marcas')
  const [activo, setActivo] = useState<string | null>(null)

  const desdeMes = moverMes(mesActual(), -(meses - 1))
  const carga = useCarga(async () => {
    const desde = `${desdeMes}-01T00:00:00-05:00`
    const [vs, gs, ps, inv] = await Promise.all([
      supabase
        .from('ventas')
        .select('id, fecha, total, costo_total, venta_items(producto_id, cantidad, precio_unit, costo_unit)')
        .eq('anulada', false)
        .gte('fecha', desde),
      supabase.from('gastos').select('fecha, monto').gte('fecha', `${desdeMes}-01`),
      supabase.from('productos').select('*'),
      supabase.from('inventario').select('producto_id, disponible').eq('activo', true),
    ])
    return {
      ventas: datos(vs) as VentaR[],
      // Sin la tabla de gastos (falta actualización) se calcula sin gastos.
      gastos: gs.error ? [] : (gs.data as { fecha: string; monto: number }[]),
      productos: datos(ps) as ProductoR[],
      inventario: datos(inv) as { producto_id: string; disponible: number }[],
    }
  }, [desdeMes])

  const r = useMemo(() => {
    if (!carga.data) return null
    const { ventas, gastos, productos, inventario } = carga.data
    const lista: string[] = []
    for (let i = 0; i < meses; i++) lista.push(moverMes(desdeMes, i))
    const porMes = new Map(lista.map((m) => [m, { vendido: 0, costo: 0, gastos: 0, ventas: 0 }]))
    for (const v of ventas) {
      const m = porMes.get(fechaColombia(v.fecha).slice(0, 7))
      if (!m) continue
      m.vendido += v.total
      m.costo += v.costo_total
      m.ventas++
    }
    for (const g of gastos) {
      const m = porMes.get(g.fecha.slice(0, 7))
      if (m) m.gastos += g.monto
    }
    const serie = lista.map((mes) => {
      const x = porMes.get(mes)!
      return { mes, ...x, neta: x.vendido - x.costo - x.gastos }
    })

    // Por marca / categoría
    const prod = new Map(productos.map((p) => [p.id, p]))
    const disponible = new Map<string, number>()
    for (const i of inventario) disponible.set(i.producto_id, (disponible.get(i.producto_id) ?? 0) + i.disponible)
    const agrupar = (clave: (p: ProductoR | undefined) => string) => {
      const g = new Map<string, { unidades: number; vendido: number; ganancia: number; dias: number; disponibles: number }>()
      for (const v of ventas) {
        for (const it of v.venta_items) {
          const p = it.producto_id ? prod.get(it.producto_id) : undefined
          const k = clave(p)
          const x = g.get(k) ?? { unidades: 0, vendido: 0, ganancia: 0, dias: 0, disponibles: 0 }
          x.unidades += it.cantidad
          x.vendido += it.cantidad * it.precio_unit
          x.ganancia += it.cantidad * (it.precio_unit - it.costo_unit)
          if (p) x.dias += it.cantidad * Math.max(0, (Date.parse(v.fecha) - Date.parse(p.created_at)) / 86_400_000)
          g.set(k, x)
        }
      }
      for (const p of productos) {
        const k = clave(p)
        const x = g.get(k)
        if (x) x.disponibles += disponible.get(p.id) ?? 0
      }
      return [...g.entries()].map(([nombre, x]) => ({
        nombre,
        ...x,
        diasPromedio: x.unidades ? x.dias / x.unidades : null,
      }))
    }
    return {
      serie,
      marcas: agrupar((p) => p?.marca || 'Sin marca'),
      categorias: agrupar((p) => p?.categoria || 'Sin categoría'),
    }
  }, [carga.data, meses, desdeMes])

  if (carga.error) return <CajaError mensaje={carga.error} reintentar={carga.recargar} />

  const valores = r?.serie.map((s) => (medida === 'vendido' ? s.vendido : s.neta)) ?? []
  const maxPos = Math.max(0, ...valores)
  const maxNeg = Math.max(0, ...valores.map((v) => -v))
  const paso = pasoBonito(Math.max(maxPos, maxNeg))
  const techo = Math.ceil(maxPos / paso) * paso
  const piso = Math.ceil(maxNeg / paso) * paso
  const rango = techo + piso || 1
  const ticks: number[] = []
  for (let v = -piso; v <= techo + 1; v += paso) ticks.push(v)
  const total = valores.reduce((s, v) => s + v, 0)
  const mejor = r ? r.serie.reduce((a, b) => ((medida === 'vendido' ? b.vendido : b.neta) > (medida === 'vendido' ? a.vendido : a.neta) ? b : a)) : null
  const seleccion = r?.serie.find((s) => s.mes === activo) ?? null
  const grupos = r ? (vista === 'marcas' ? r.marcas : r.categorias) : []
  const ordenGrupos = [...grupos].sort((a, b) => b.unidades - a.unidades)
  const maxUnidades = Math.max(1, ...grupos.map((g) => g.unidades))
  const masRapidas = [...grupos].filter((g) => g.diasPromedio !== null).sort((a, b) => a.diasPromedio! - b.diasPromedio!)

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Reportes</h1>
      </div>

      <div className="chips">
        {[3, 6, 12].map((m) => (
          <button key={m} className={`chip ${meses === m ? 'chip-activo' : ''}`} onClick={() => setMeses(m)}>
            Últimos {m} meses
          </button>
        ))}
      </div>

      {!r ? (
        <Cargando />
      ) : (
        <>
          <section className="tarjeta">
            <div className="seccion-cabeza">
              <h2>{medida === 'vendido' ? 'Ventas por mes' : 'Ganancia neta por mes'}</h2>
              <div className="pestanas pestanas-sm" role="tablist">
                <button role="tab" aria-selected={medida === 'vendido'} className={medida === 'vendido' ? 'activa' : ''} onClick={() => setMedida('vendido')}>
                  Vendido
                </button>
                <button role="tab" aria-selected={medida === 'neta'} className={medida === 'neta' ? 'activa' : ''} onClick={() => setMedida('neta')}>
                  Ganancia neta
                </button>
              </div>
            </div>
            <p className="sutil">
              {seleccion ? (
                <>
                  <strong className="texto-principal">{nombreMes(seleccion.mes)}:</strong> vendido {cop(seleccion.vendido)} ·{' '}
                  {seleccion.ventas} ventas · costo {cop(seleccion.costo)} · gastos {cop(seleccion.gastos)} · ganancia neta{' '}
                  {cop(seleccion.neta)}
                </>
              ) : (
                <>
                  Total {meses} meses: <strong className="texto-principal">{cop(total)}</strong>
                  {mejor && (medida === 'vendido' ? mejor.vendido : mejor.neta) > 0 && <> · Mejor mes: {nombreMes(mejor.mes)}</>}
                  {medida === 'neta' && ' · ventas − costo de la ropa − gastos'}
                </>
              )}
            </p>

            <div className="grafica" role="img" aria-label={`Gráfica de ${medida === 'vendido' ? 'ventas' : 'ganancia neta'} por mes`}>
              <div className="grafica-eje">
                {[...ticks].reverse().map((tk) => (
                  <span key={tk} style={{ bottom: `${((tk + piso) / rango) * 100}%` }}>
                    {tk === 0 ? '0' : corto(tk)}
                  </span>
                ))}
              </div>
              <div className="grafica-area">
                {ticks.map((tk) => (
                  <div key={tk} className={`grafica-linea ${tk === 0 ? 'cero' : ''}`} style={{ bottom: `${((tk + piso) / rango) * 100}%` }} />
                ))}
                <div className="grafica-columnas">
                  {r.serie.map((s) => {
                    const v = medida === 'vendido' ? s.vendido : s.neta
                    const alto = (Math.abs(v) / rango) * 100
                    const base = (piso / rango) * 100
                    return (
                      <button
                        key={s.mes}
                        className={`grafica-col ${activo === s.mes ? 'activa' : ''}`}
                        onMouseEnter={() => setActivo(s.mes)}
                        onMouseLeave={() => setActivo(null)}
                        onFocus={() => setActivo(s.mes)}
                        onBlur={() => setActivo(null)}
                        onClick={() => setActivo(activo === s.mes ? null : s.mes)}
                        aria-label={`${nombreMes(s.mes)}: ${cop(v)}`}
                      >
                        {v !== 0 && (
                          <span
                            className={`grafica-barra ${v < 0 ? 'negativa' : ''}`}
                            style={v >= 0 ? { bottom: `${base}%`, height: `${alto}%` } : { top: `${100 - base}%`, height: `${alto}%` }}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grafica-meses">
                {r.serie.map((s) => (
                  <span key={s.mes} className={activo === s.mes ? 'activa' : ''}>
                    {new Date(s.mes + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')}
                  </span>
                ))}
              </div>
            </div>

            <details className="tabla-detalle">
              <summary>Ver tabla</summary>
              <div className="tabla-scroll">
                <table className="tabla-caja">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      <th>Vendido</th>
                      <th>Costo</th>
                      <th>Gastos</th>
                      <th>Neta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.serie.map((s) => (
                      <tr key={s.mes}>
                        <th>{nombreMes(s.mes)}</th>
                        <td>{cop(s.vendido)}</td>
                        <td>{cop(s.costo)}</td>
                        <td>{cop(s.gastos)}</td>
                        <td>
                          <strong className={s.neta < 0 ? 'tono-mal' : ''}>{cop(s.neta)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <section className="tarjeta">
            <div className="seccion-cabeza">
              <h2>¿Qué se vende más?</h2>
              <div className="pestanas pestanas-sm" role="tablist">
                <button role="tab" aria-selected={vista === 'marcas'} className={vista === 'marcas' ? 'activa' : ''} onClick={() => setVista('marcas')}>
                  Marcas
                </button>
                <button role="tab" aria-selected={vista === 'categorias'} className={vista === 'categorias' ? 'activa' : ''} onClick={() => setVista('categorias')}>
                  Categorías
                </button>
              </div>
            </div>
            {ordenGrupos.length === 0 ? (
              <Vacio icono="ventas">Aún no hay ventas en este periodo.</Vacio>
            ) : (
              <ul className="barras-h">
                {ordenGrupos.map((g) => (
                  <li key={g.nombre}>
                    <div className="fila-total">
                      <strong>{g.nombre}</strong>
                      <span>
                        {num(g.unidades)} und · {cop(g.vendido)}
                      </span>
                    </div>
                    <div className="barra-h" title={`${g.nombre}: ${g.unidades} unidades`}>
                      <span style={{ width: `${(g.unidades / maxUnidades) * 100}%` }} />
                    </div>
                    <span className="sutil">
                      Ganancia {cop(g.ganancia)}
                      {g.diasPromedio !== null && ` · se vende en ~${Math.round(g.diasPromedio)} días`}
                      {` · ${g.disponibles} disponibles ahora`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {masRapidas.length > 0 && (
            <section className="tarjeta">
              <h2>Se venden más rápido</h2>
              <p className="sutil">
                Días promedio desde que la prenda entra al inventario hasta que se vende. Pocos días = conviene traer más.
              </p>
              <div className="datos">
                {masRapidas.slice(0, 3).map((g, i) => (
                  <Dato
                    key={g.nombre}
                    etiqueta={`${i + 1}. ${g.nombre}`}
                    valor={`${Math.round(g.diasPromedio!)} días`}
                    nota={`${g.unidades} vendidas · ${g.disponibles} en stock`}
                  />
                ))}
              </div>
              {masRapidas.length > 3 && (
                <p className="sutil">
                  Más lentas:{' '}
                  {masRapidas
                    .slice(3)
                    .slice(-3)
                    .reverse()
                    .map((g) => `${g.nombre} (${Math.round(g.diasPromedio!)} días)`)
                    .join(', ')}
                </p>
              )}
            </section>
          )}
        </>
      )}
      {carga.cargando && r && <Cargando texto="Actualizando…" />}
      <LoMasVisto />
    </div>
  )
}
