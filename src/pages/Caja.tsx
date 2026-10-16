import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { cop, fecha, fechaHora, hoyColombia, mesActual, moverMes, nombreMes } from '../lib/format'
import { CATEGORIAS_GASTO, METODOS, type Gasto, type MetodoPago } from '../lib/types'
import { BotonAccion, CajaError, CampoPesos, Cargando, Dato, Hoja, Total, Vacio } from '../components/Comunes'
import { SelectorMetodo, nombreMetodo } from '../components/MetodoPago'
import { Icono } from '../components/Icono'

function sumarDias(f: string, n: number): string {
  const d = new Date(f + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const inicioDia = (f: string) => `${f}T00:00:00-05:00`

export function Caja() {
  const [params, setParams] = useSearchParams()
  const pestana = params.get('ver') === 'gastos' ? 'gastos' : 'cierre'
  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Caja</h1>
      </div>
      <div className="pestanas" role="tablist">
        <button
          role="tab"
          aria-selected={pestana === 'cierre'}
          className={pestana === 'cierre' ? 'activa' : ''}
          onClick={() => setParams({}, { replace: true })}
        >
          Cierre del día
        </button>
        <button
          role="tab"
          aria-selected={pestana === 'gastos'}
          className={pestana === 'gastos' ? 'activa' : ''}
          onClick={() => setParams({ ver: 'gastos' }, { replace: true })}
        >
          Gastos
        </button>
      </div>
      {pestana === 'cierre' ? <CierreDia /> : <Gastos />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Cierre del día                                                     */
/* ------------------------------------------------------------------ */

interface Movimiento {
  clave: string
  hora: string | null
  texto: string
  metodo: MetodoPago | null // null = sin método registrado
  monto: number // positivo entra, negativo sale
}

interface DatosDia {
  movimientos: Movimiento[]
  cierre: { base: number; contado: number | null; nota: string | null } | null
}

async function cargarDia(dia: string): Promise<DatosDia> {
  const desde = inicioDia(dia)
  const hasta = inicioDia(sumarDias(dia, 1))
  const [ventasR, anticiposR, devueltosR, gastosR, pagosR, cierreR] = await Promise.all([
    supabase
      .from('ventas')
      .select('id, numero, fecha, total, metodo_pago, cliente')
      .eq('anulada', false)
      .gte('fecha', desde)
      .lt('fecha', hasta),
    supabase
      .from('apartados')
      .select('numero, fecha, anticipo, metodo_pago_anticipo, cliente')
      .gte('fecha', desde)
      .lt('fecha', hasta),
    supabase
      .from('apartados')
      .select('numero, fecha_cierre, anticipo, cliente')
      .eq('estado', 'cancelado')
      .eq('anticipo_devuelto', true)
      .gte('fecha_cierre', desde)
      .lt('fecha_cierre', hasta),
    supabase.from('gastos').select('*').eq('fecha', dia),
    supabase.from('pagos_inversion').select('id, monto, tipo, inversiones(inversores(nombre))').eq('fecha', dia),
    supabase.from('cierres_caja').select('base, contado, nota').eq('fecha', dia).maybeSingle(),
  ])
  const ventas = datos(ventasR) as {
    id: string
    numero: number
    fecha: string
    total: number
    metodo_pago: MetodoPago
    cliente: string | null
  }[]
  // Si la venta viene de un apartado, el anticipo ya entró el día que se apartó.
  const ids = ventas.map((v) => v.id)
  const deApartado = ids.length
    ? (datos(
        await supabase.from('apartados').select('venta_id, anticipo, numero').in('venta_id', ids),
      ) as { venta_id: string; anticipo: number; numero: number }[])
    : []

  const movimientos: Movimiento[] = []
  for (const v of ventas) {
    const ap = deApartado.find((a) => a.venta_id === v.id)
    movimientos.push({
      clave: 'v' + v.id,
      hora: v.fecha,
      texto: ap
        ? `Saldo apartado #${ap.numero}${v.cliente ? ` · ${v.cliente}` : ''}`
        : `Venta #${v.numero}${v.cliente ? ` · ${v.cliente}` : ''}`,
      metodo: v.metodo_pago,
      monto: v.total - (ap?.anticipo ?? 0),
    })
  }
  for (const a of datos(anticiposR) as {
    numero: number
    fecha: string
    anticipo: number
    metodo_pago_anticipo: MetodoPago
    cliente: string
  }[]) {
    if (a.anticipo > 0) {
      movimientos.push({
        clave: 'a' + a.numero,
        hora: a.fecha,
        texto: `Anticipo apartado #${a.numero} · ${a.cliente}`,
        metodo: a.metodo_pago_anticipo,
        monto: a.anticipo,
      })
    }
  }
  for (const a of datos(devueltosR) as { numero: number; fecha_cierre: string; anticipo: number; cliente: string }[]) {
    if (a.anticipo > 0) {
      movimientos.push({
        clave: 'd' + a.numero,
        hora: a.fecha_cierre,
        texto: `Devolución anticipo #${a.numero} · ${a.cliente}`,
        metodo: null,
        monto: -a.anticipo,
      })
    }
  }
  for (const g of datos(gastosR) as Gasto[]) {
    movimientos.push({
      clave: 'g' + g.id,
      hora: null,
      texto: `Gasto: ${g.categoria}${g.descripcion ? ` · ${g.descripcion}` : ''}`,
      metodo: g.metodo_pago,
      monto: -g.monto,
    })
  }
  for (const p of datos(pagosR) as unknown as {
    id: string
    monto: number
    tipo: string
    inversiones: { inversores: { nombre: string } | null } | null
  }[]) {
    movimientos.push({
      clave: 'p' + p.id,
      hora: null,
      texto: `Pago a inversor${p.inversiones?.inversores ? ` · ${p.inversiones.inversores.nombre}` : ''} (${p.tipo === 'capital' ? 'capital' : 'rendimiento'})`,
      metodo: null,
      monto: -p.monto,
    })
  }
  movimientos.sort((a, b) => (a.hora ?? '9').localeCompare(b.hora ?? '9'))
  return { movimientos, cierre: datos(cierreR) as DatosDia['cierre'] }
}

function CierreDia() {
  const avisar = useAvisar()
  const hoy = hoyColombia()
  const [dia, setDia] = useState(hoy)
  const carga = useCarga(() => cargarDia(dia), [dia], { alVolver: false })
  const [base, setBase] = useState(0)
  const [contado, setContado] = useState<number | null>(null)
  const [nota, setNota] = useState('')

  useEffect(() => {
    const c = carga.data?.cierre
    setBase(c?.base ?? 0)
    setContado(c?.contado ?? null)
    setNota(c?.nota ?? '')
  }, [carga.data])

  const movs = carga.data?.movimientos ?? []
  const porMetodo = METODOS.map((m) => {
    const delMetodo = movs.filter((x) => x.metodo === m.id)
    return {
      ...m,
      entra: delMetodo.filter((x) => x.monto > 0).reduce((s, x) => s + x.monto, 0),
      sale: -delMetodo.filter((x) => x.monto < 0).reduce((s, x) => s + x.monto, 0),
    }
  }).filter((m) => m.entra || m.sale)
  const sinMetodo = movs.filter((x) => x.metodo === null)
  const totalEntra = movs.filter((x) => x.monto > 0).reduce((s, x) => s + x.monto, 0)
  const totalSale = -movs.filter((x) => x.monto < 0).reduce((s, x) => s + x.monto, 0)
  const efectivo = porMetodo.find((m) => m.id === 'efectivo')
  const esperado = base + (efectivo ? efectivo.entra - efectivo.sale : 0)
  const diferencia = contado === null ? null : contado - esperado

  const guardar = async () => {
    try {
      datos(
        await supabase
          .from('cierres_caja')
          .upsert({ fecha: dia, base, contado, nota: nota.trim() || null, updated_at: new Date().toISOString() }),
      )
      avisar('Cierre guardado')
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  return (
    <>
      <div className="selector-mes selector-mes-grande">
        <button className="btn-icono" aria-label="Día anterior" onClick={() => setDia(sumarDias(dia, -1))}>
          <Icono nombre="atras" />
        </button>
        <input
          type="date"
          className="selector-dia"
          value={dia}
          max={hoy}
          onChange={(e) => e.target.value && setDia(e.target.value)}
          aria-label="Día"
        />
        <button
          className="btn-icono"
          aria-label="Día siguiente"
          disabled={dia >= hoy}
          onClick={() => setDia(sumarDias(dia, 1))}
        >
          <Icono nombre="adelante" />
        </button>
      </div>

      {carga.error && <CajaError mensaje={carga.error} reintentar={carga.recargar} />}
      {carga.cargando && !carga.data && <Cargando />}

      {carga.data && (
        <>
          <div className="datos">
            <Dato etiqueta="Entró" valor={cop(totalEntra)} tono="bien" />
            <Dato etiqueta="Salió" valor={cop(totalSale)} tono={totalSale ? 'mal' : undefined} />
            <Dato etiqueta="Neto del día" valor={cop(totalEntra - totalSale)} />
          </div>

          {porMetodo.length > 0 && (
            <section className="tarjeta">
              <h2>Por método de pago</h2>
              <div className="tabla-scroll">
              <table className="tabla-caja">
                <thead>
                  <tr>
                    <th />
                    <th>Entró</th>
                    <th>Salió</th>
                    <th>Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {porMetodo.map((m) => (
                    <tr key={m.id}>
                      <th>{m.nombre}</th>
                      <td>{cop(m.entra)}</td>
                      <td>{m.sale ? `− ${cop(m.sale)}` : '—'}</td>
                      <td>
                        <strong>{cop(m.entra - m.sale)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {sinMetodo.length > 0 && (
                <p className="sutil">
                  Devoluciones de anticipos y pagos a inversores ({cop(-sinMetodo.reduce((s, x) => s + x.monto, 0))}) no
                  tienen método registrado: si salieron del efectivo, tenlo en cuenta al contar.
                </p>
              )}
            </section>
          )}

          <section className="tarjeta">
            <h2>Contar el efectivo</h2>
            <div className="dos-columnas">
              <label className="campo">
                <span>Base con la que abriste</span>
                <CampoPesos valor={base} onChange={setBase} />
              </label>
              <label className="campo">
                <span>Efectivo que contaste</span>
                <CampoPesos valor={contado ?? 0} onChange={(n) => setContado(n)} />
              </label>
            </div>
            <Total etiqueta="Debería haber en efectivo" valor={esperado} fuerte />
            {diferencia !== null && (
              <div className={`fila-total ${diferencia === 0 ? 'tono-bien' : 'tono-mal'}`}>
                <span>{diferencia === 0 ? 'Cuadra ✓' : diferencia > 0 ? 'Sobra' : 'Falta'}</span>
                <strong>{cop(Math.abs(diferencia))}</strong>
              </div>
            )}
            <label className="campo">
              <span>Nota (opcional)</span>
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: faltó cambio, pagué domicilio…" />
            </label>
            <BotonAccion className="btn btn-primario" onClick={guardar}>
              Guardar cierre del {fecha(dia)}
            </BotonAccion>
          </section>

          <section className="seccion">
            <h2>Movimientos del día</h2>
            {movs.length === 0 ? (
              <Vacio icono="ventas">No hubo movimientos este día.</Vacio>
            ) : (
              <ul className="tarjeta historial lista-caja">
                {movs.map((m) => (
                  <li key={m.clave}>
                    <span className="historial-texto">
                      <strong>{m.texto}</strong>
                      <span className="sutil">
                        {m.hora ? fechaHora(m.hora).split(', ').pop() : ''}
                        {m.hora && ' · '}
                        {m.metodo ? nombreMetodo(m.metodo) : 'sin método'}
                      </span>
                    </span>
                    <strong className={m.monto >= 0 ? 'tono-bien' : 'tono-mal'}>
                      {m.monto >= 0 ? '+' : '−'} {cop(Math.abs(m.monto))}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Gastos                                                             */
/* ------------------------------------------------------------------ */

interface FormGasto {
  id?: string
  fecha: string
  categoria: string
  descripcion: string
  monto: number
  metodo_pago: MetodoPago
}

const gastoVacio = (): FormGasto => ({
  fecha: hoyColombia(),
  categoria: 'Arriendo',
  descripcion: '',
  monto: 0,
  metodo_pago: 'efectivo',
})

function Gastos() {
  const avisar = useAvisar()
  const [mes, setMes] = useState(mesActual())
  const [form, setForm] = useState<FormGasto | null>(null)
  const cerrar = useCallback(() => setForm(null), [])

  const carga = useCarga(async () => {
    const siguiente = moverMes(mes, 1)
    const [gastos, ventas] = await Promise.all([
      supabase
        .from('gastos')
        .select('*')
        .gte('fecha', `${mes}-01`)
        .lt('fecha', `${siguiente}-01`)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('ventas')
        .select('total, costo_total')
        .eq('anulada', false)
        .gte('fecha', inicioDia(`${mes}-01`))
        .lt('fecha', inicioDia(`${siguiente}-01`)),
    ])
    const vs = datos(ventas) as { total: number; costo_total: number }[]
    return {
      gastos: datos(gastos) as Gasto[],
      gananciaBruta: vs.reduce((s, v) => s + v.total - v.costo_total, 0),
    }
  }, [mes])

  const gastos = carga.data?.gastos ?? []
  const total = gastos.reduce((s, g) => s + g.monto, 0)
  const porCategoria = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of gastos) m.set(g.categoria, (m.get(g.categoria) ?? 0) + g.monto)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [gastos])
  const bruta = carga.data?.gananciaBruta ?? 0

  const guardar = async () => {
    if (!form) return
    if (form.monto <= 0) return avisar('Escribe el valor del gasto', 'error')
    if (!form.categoria.trim()) return avisar('Elige una categoría', 'error')
    const fila = {
      fecha: form.fecha,
      categoria: form.categoria.trim(),
      descripcion: form.descripcion.trim() || null,
      monto: form.monto,
      metodo_pago: form.metodo_pago,
    }
    try {
      if (form.id) datos(await supabase.from('gastos').update(fila).eq('id', form.id))
      else datos(await supabase.from('gastos').insert(fila))
      avisar(form.id ? 'Gasto actualizado' : 'Gasto registrado')
      setForm(null)
      if (fila.fecha.slice(0, 7) !== mes) setMes(fila.fecha.slice(0, 7))
      else await carga.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const borrar = async () => {
    if (!form?.id || !confirm('¿Borrar este gasto?')) return
    try {
      datos(await supabase.from('gastos').delete().eq('id', form.id))
      avisar('Gasto borrado')
      setForm(null)
      await carga.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const otra = form && !CATEGORIAS_GASTO.includes(form.categoria)

  return (
    <>
      <div className="fila-acciones">
        <div className="selector-mes">
          <button className="btn-icono" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}>
            <Icono nombre="atras" />
          </button>
          <span>{nombreMes(mes)}</span>
          <button
            className="btn-icono"
            aria-label="Mes siguiente"
            disabled={mes >= mesActual()}
            onClick={() => setMes(moverMes(mes, 1))}
          >
            <Icono nombre="adelante" />
          </button>
        </div>
        <button className="btn btn-primario" onClick={() => setForm(gastoVacio())}>
          <Icono nombre="mas" /> Gasto
        </button>
      </div>

      {carga.error && <CajaError mensaje={carga.error} reintentar={carga.recargar} />}
      {carga.cargando && !carga.data && <Cargando />}

      {carga.data && (
        <>
          <section className="tarjeta">
            <h2>Ganancia real de {nombreMes(mes).toLowerCase()}</h2>
            <div className="fila-total">
              <span>Ventas − costo de la ropa</span>
              <span>{cop(bruta)}</span>
            </div>
            <div className="fila-total">
              <span>Gastos del negocio</span>
              <span>− {cop(total)}</span>
            </div>
            <div className={`fila-total fuerte ${bruta - total < 0 ? 'tono-mal' : ''}`}>
              <span>Ganancia neta</span>
              <span>{cop(bruta - total)}</span>
            </div>
            <p className="sutil">
              Los pagos a <Link to="/inversores">inversores</Link> se restan aparte.
            </p>
          </section>

          {porCategoria.length > 0 && (
            <section className="tarjeta">
              <h2>Gastos por categoría</h2>
              <ul className="barras">
                {porCategoria.map(([cat, monto]) => (
                  <li key={cat}>
                    <div className="fila-total">
                      <span>{cat}</span>
                      <span>
                        {cop(monto)} <span className="sutil">· {Math.round((monto / total) * 100)}%</span>
                      </span>
                    </div>
                    <div className="plazo-barra" aria-hidden="true">
                      <span style={{ width: `${(monto / porCategoria[0][1]) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {gastos.length === 0 ? (
            <Vacio icono="ventas">
              No hay gastos en {nombreMes(mes).toLowerCase()}. Registra el arriendo, transporte, publicidad, bolsas…
            </Vacio>
          ) : (
            <ul className="tarjeta lista-ventas">
              {gastos.map((g) => (
                <li key={g.id}>
                  <button
                    className="venta-fila"
                    onClick={() =>
                      setForm({
                        id: g.id,
                        fecha: g.fecha,
                        categoria: g.categoria,
                        descripcion: g.descripcion ?? '',
                        monto: g.monto,
                        metodo_pago: g.metodo_pago,
                      })
                    }
                  >
                    <span className="venta-texto">
                      <strong>{g.categoria}</strong>
                      <span className="sutil">
                        {fecha(g.fecha)}
                        {g.descripcion && ` · ${g.descripcion}`}
                      </span>
                    </span>
                    <span className="venta-lado">
                      <strong>{cop(g.monto)}</strong>
                      <span className="sutil">{nombreMetodo(g.metodo_pago)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Hoja titulo={form?.id ? 'Editar gasto' : 'Nuevo gasto'} abierta={!!form} onCerrar={cerrar}>
        {form && (
          <>
            <label className="campo">
              <span>Valor *</span>
              <CampoPesos valor={form.monto} onChange={(n) => setForm({ ...form, monto: n })} autoFocus={!form.id} />
            </label>
            <div className="campo">
              <span>Categoría</span>
              <div className="chips">
                {CATEGORIAS_GASTO.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip ${form.categoria === c ? 'chip-activo' : ''}`}
                    onClick={() => setForm({ ...form, categoria: c })}
                  >
                    {c}
                  </button>
                ))}
                <button
                  type="button"
                  className={`chip ${otra ? 'chip-activo' : ''}`}
                  onClick={() => setForm({ ...form, categoria: otra ? form.categoria : '' })}
                >
                  Otra…
                </button>
              </div>
              {otra && (
                <input
                  placeholder="Nombre de la categoría"
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  autoFocus
                />
              )}
            </div>
            <label className="campo">
              <span>Descripción (opcional)</span>
              <input
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Ej: arriendo de octubre, domicilio a Chapinero…"
              />
            </label>
            <label className="campo">
              <span>Fecha</span>
              <input
                type="date"
                value={form.fecha}
                max={hoyColombia()}
                onChange={(e) => e.target.value && setForm({ ...form, fecha: e.target.value })}
              />
            </label>
            <div className="campo">
              <span>¿Cómo lo pagaste?</span>
              <SelectorMetodo valor={form.metodo_pago} onChange={(m) => setForm({ ...form, metodo_pago: m })} />
            </div>
            <BotonAccion className="btn btn-primario btn-bloque" onClick={guardar}>
              {form.id ? 'Guardar cambios' : `Registrar gasto${form.monto ? ` de ${cop(form.monto)}` : ''}`}
            </BotonAccion>
            {form.id && (
              <BotonAccion className="btn btn-peligro-suave btn-bloque" onClick={borrar}>
                <Icono nombre="basura" /> Borrar gasto
              </BotonAccion>
            )}
          </>
        )}
      </Hoja>
    </>
  )
}
