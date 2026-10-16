import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { useAjustes } from '../lib/sesion'
import { cop, enlaceWhatsapp, fecha, hoyColombia } from '../lib/format'
import { cargarInversion } from '../lib/datosInversiones'
import { NOMBRE_ESTADO, resumirInversion, type Cuota, type Inversion, type ResumenInversion } from '../lib/inversiones'
import { BotonAccion, CajaError, CampoPesos, Cargando, Dato, Hoja, Total } from '../components/Comunes'
import { Icono } from '../components/Icono'
import { pct } from './Inversores'

const CLASE_ESTADO: Record<string, string> = {
  pagada: 'etiqueta-bien',
  parcial: 'etiqueta-aviso',
  vencida: 'etiqueta-mal',
  hoy: 'etiqueta-aviso',
}

function extracto(inv: Inversion, r: ResumenInversion, tienda: string): string {
  const lineas = [
    `*${tienda}* — Extracto de inversión`,
    `Inversor: ${inv.inversores.nombre}`,
    `Capital: ${cop(inv.monto)} desde el ${fecha(inv.fecha_inicio)} hasta el ${fecha(r.fin)} (${inv.plazo_meses} meses)`,
    inv.tipo === 'interes'
      ? `Interés: ${pct(inv.tasa)} mensual (${cop(Math.round((inv.monto * inv.tasa) / 100))} por mes)`
      : `Participación: ${pct(inv.tasa)} de la ganancia mensual`,
    `Rendimientos generados: ${cop(r.rendimientoGenerado)}`,
    `Pagado: ${cop(r.rendimientoPagado)}`,
    r.rendimientoPendiente > 0 ? `Pendiente por pagar: ${cop(r.rendimientoPendiente)}` : 'Rendimientos al día',
    `Rentabilidad: ${pct(r.rentabilidadTotal)} del capital`,
    r.capitalDevuelto > 0 ? `Capital devuelto: ${cop(r.capitalDevuelto)}` : `Capital a devolver el ${fecha(r.fin)}`,
  ]
  const pagos = [...inv.pagos_inversion].sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (pagos.length) {
    lineas.push('', 'Pagos:')
    for (const p of pagos) {
      lineas.push(`• ${fecha(p.fecha)} — ${cop(p.monto)} (${p.tipo === 'capital' ? 'capital' : 'rendimiento'})`)
    }
  }
  return lineas.join('\n')
}

export function InversionDetalle() {
  const { id } = useParams()
  const navegar = useNavigate()
  const avisar = useAvisar()
  const ajustes = useAjustes()
  const carga = useCarga(() => cargarInversion(id!), [id])
  const hoy = hoyColombia()

  const [cuota, setCuota] = useState<Cuota | null>(null)
  const [montoPago, setMontoPago] = useState(0)
  const [fechaPago, setFechaPago] = useState(hoy)
  const [notaPago, setNotaPago] = useState('')
  const cerrar = useCallback(() => setCuota(null), [])

  const inv = carga.data?.inversiones[0]
  const r = useMemo(
    () => (inv && carga.data ? resumirInversion(inv, hoy, carga.data.ganancias) : null),
    [inv, carga.data, hoy],
  )

  if (carga.error) return <CajaError mensaje={carga.error} reintentar={carga.recargar} />
  if (!inv || !r) return <Cargando />

  const abrirPago = (c: Cuota) => {
    setCuota(c)
    setMontoPago(Math.max(0, c.monto - c.pagado))
    setFechaPago(hoy)
    setNotaPago('')
  }

  const pagar = async () => {
    if (!cuota || montoPago <= 0) return
    try {
      datos(
        await supabase.from('pagos_inversion').insert({
          inversion_id: inv.id,
          tipo: cuota.tipo,
          monto: montoPago,
          fecha: fechaPago,
          periodo: cuota.periodo ?? null,
          nota: notaPago.trim() || null,
        }),
      )
      avisar('Pago registrado')
      setCuota(null)
      await carga.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const borrarPago = async (pagoId: string) => {
    if (!confirm('¿Borrar este pago?')) return
    try {
      datos(await supabase.from('pagos_inversion').delete().eq('id', pagoId))
      await carga.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const cambiarEstado = async () => {
    const finalizar = inv.estado === 'activa'
    if (finalizar && r.capitalPendiente > 0 && !confirm(`Aún falta devolver ${cop(r.capitalPendiente)} de capital. ¿Finalizar igual?`)) return
    try {
      datos(await supabase.from('inversiones').update({ estado: finalizar ? 'finalizada' : 'activa' }).eq('id', inv.id))
      avisar(finalizar ? 'Inversión finalizada' : 'Inversión reactivada')
      await carga.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const eliminar = async () => {
    if (!confirm(`¿Eliminar la inversión de ${inv.inversores.nombre} y todos sus pagos? No se puede deshacer.`)) return
    try {
      datos(await supabase.from('inversiones').delete().eq('id', inv.id))
      avisar('Inversión eliminada')
      navegar('/inversores', { replace: true })
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const pagos = [...inv.pagos_inversion].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const avance = Math.min(100, Math.round((r.mesesTranscurridos / inv.plazo_meses) * 100))

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <Link to="/inversores" className="btn-icono" aria-label="Volver">
          <Icono nombre="atras" />
        </Link>
        <h1>{inv.inversores.nombre}</h1>
        <Link to={`/inversores/${inv.id}/editar`} className="btn btn-sm">
          Editar
        </Link>
      </div>

      <p className="sutil">
        {inv.tipo === 'interes'
          ? `Interés fijo de ${pct(inv.tasa)} mensual · interés cada mes y capital al final`
          : `${pct(inv.tasa)} de la ganancia de las ventas de cada mes · capital al final`}
        {inv.estado === 'finalizada' && ' · FINALIZADA'}
        {inv.nota && ` · ${inv.nota}`}
      </p>

      <div className="datos">
        <Dato etiqueta="Capital" valor={cop(inv.monto)} nota={r.capitalDevuelto ? `Devuelto ${cop(r.capitalDevuelto)}` : undefined} />
        <Dato
          etiqueta="Rentabilidad"
          valor={pct(r.rentabilidadTotal)}
          nota={
            inv.tipo === 'interes'
              ? `${pct(r.rentabilidadMensual)} mensual · ${pct(r.rentabilidadAnual)} anual`
              : `Hasta hoy · ≈${pct(r.rentabilidadMensual)} mensual`
          }
        />
        <Dato
          etiqueta={inv.tipo === 'interes' ? 'Intereses pagados' : 'Ganancias pagadas'}
          valor={cop(r.rendimientoPagado)}
          nota={r.totalEsperado !== null ? `de ${cop(r.totalEsperado)} en total` : `generado ${cop(r.rendimientoGenerado)}`}
        />
        <Dato
          etiqueta="Pendiente por pagar"
          valor={cop(r.rendimientoPendiente)}
          tono={r.rendimientoPendiente > 0 ? 'mal' : undefined}
          nota="Rendimientos ya causados"
        />
      </div>

      <section className="tarjeta">
        <h2>Plazo</h2>
        <div className="plazo">
          <div className="plazo-barra" aria-hidden="true">
            <span style={{ width: `${avance}%` }} />
          </div>
          <div className="fila-total">
            <span>
              {fecha(inv.fecha_inicio)} → {fecha(r.fin)}
            </span>
            <span>
              {r.mesesTranscurridos} de {inv.plazo_meses} meses
            </span>
          </div>
          {inv.estado === 'activa' && (
            <p className="sutil">
              {r.diasRestantes > 0 ? `Faltan ${r.diasRestantes} días para devolver el capital.` : 'El plazo ya terminó.'}
            </p>
          )}
        </div>
      </section>

      <section className="tarjeta">
        <h2>Cronograma de pagos</h2>
        {inv.tipo === 'ganancias' && (
          <p className="sutil">
            Cada periodo se paga cuando termina. La ganancia es ventas − costo de la ropa vendida − gastos del negocio en ese periodo.
          </p>
        )}
        <ul className="cronograma">
          {r.cuotas.map((c) => {
            const falta = c.monto - c.pagado
            const pagable = inv.estado === 'activa' && falta > 0 && c.estado !== 'en-curso'
            return (
              <li key={c.clave} className={c.tipo === 'capital' ? 'cuota-capital' : ''}>
                <div className="resultado-texto">
                  <strong>{c.titulo}</strong>
                  <span className="sutil">
                    {c.estado === 'en-curso' ? 'Acumulado hasta hoy' : `Fecha de pago: ${fecha(c.fecha)}`}
                    {c.ganancia !== undefined && ` · ganancia ${cop(c.ganancia)}`}
                    {c.pagado > 0 && c.pagado < c.monto && ` · pagado ${cop(c.pagado)}`}
                  </span>
                </div>
                <div className="venta-lado">
                  <strong>{c.estado === 'pendiente' && c.monto === 0 ? '—' : cop(c.monto)}</strong>
                  {pagable ? (
                    <button className="btn btn-sm" onClick={() => abrirPago(c)}>
                      Pagar
                    </button>
                  ) : (
                    <span className={`etiqueta ${CLASE_ESTADO[c.estado] ?? ''}`}>{NOMBRE_ESTADO[c.estado]}</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="tarjeta">
        <h2>Pagos realizados</h2>
        {pagos.length === 0 ? (
          <p className="sutil">Aún no hay pagos registrados.</p>
        ) : (
          <ul className="historial">
            {pagos.map((p) => (
              <li key={p.id}>
                <span className="historial-texto">
                  <strong>
                    {cop(p.monto)} · {p.tipo === 'capital' ? 'Capital' : inv.tipo === 'interes' ? 'Interés' : 'Ganancias'}
                  </strong>
                  <span className="sutil">
                    {fecha(p.fecha)}
                    {p.periodo && ` · periodo ${p.periodo}`}
                    {p.nota && ` · ${p.nota}`}
                  </span>
                </span>
                <button className="btn-icono" aria-label="Borrar pago" onClick={() => borrarPago(p.id)}>
                  <Icono nombre="basura" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tarjeta zona-peligro">
        <h2>Más opciones</h2>
        {inv.inversores.telefono && (
          <a
            className="btn"
            href={enlaceWhatsapp(inv.inversores.telefono, extracto(inv, r, ajustes.nombre_tienda))}
            target="_blank"
            rel="noreferrer"
          >
            <Icono nombre="chat" tam={16} /> Enviar extracto por WhatsApp
          </a>
        )}
        <BotonAccion className="btn" onClick={cambiarEstado}>
          {inv.estado === 'activa' ? 'Finalizar inversión' : 'Reactivar'}
        </BotonAccion>
        <BotonAccion className="btn btn-peligro-suave" onClick={eliminar}>
          <Icono nombre="basura" /> Eliminar
        </BotonAccion>
      </section>

      <Hoja titulo={cuota ? `Pagar: ${cuota.titulo}` : ''} abierta={!!cuota} onCerrar={cerrar}>
        {cuota && (
          <>
            <Total etiqueta="Corresponde" valor={cuota.monto} />
            {cuota.pagado > 0 && <Total etiqueta="Ya pagado" valor={cuota.pagado} />}
            <label className="campo">
              <span>Monto que pagas ahora</span>
              <CampoPesos valor={montoPago} onChange={setMontoPago} />
            </label>
            <label className="campo">
              <span>Fecha del pago</span>
              <input type="date" value={fechaPago} onChange={(e) => e.target.value && setFechaPago(e.target.value)} />
            </label>
            <label className="campo">
              <span>Nota (opcional)</span>
              <input value={notaPago} onChange={(e) => setNotaPago(e.target.value)} placeholder="Ej: transferencia Daviplata" />
            </label>
            <BotonAccion className="btn btn-primario btn-bloque" onClick={pagar} disabled={montoPago <= 0}>
              Registrar pago de {cop(montoPago)}
            </BotonAccion>
          </>
        )}
      </Hoja>
    </div>
  )
}
