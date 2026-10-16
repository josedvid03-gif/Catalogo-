import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCarga } from '../lib/hooks'
import { cop, fecha, hoyColombia, mesActual, nombreMes } from '../lib/format'
import { cargarInversiones } from '../lib/datosInversiones'
import { gananciaEntre, rendimientoDelMes, resumirInversion, sumarMeses } from '../lib/inversiones'
import { CajaError, Cargando, Dato, Vacio } from '../components/Comunes'
import { Icono } from '../components/Icono'

export const pct = (n: number, dec = 1) =>
  `${n.toLocaleString('es-CO', { maximumFractionDigits: dec, minimumFractionDigits: 0 })}%`

export function Inversores() {
  const [ver, setVer] = useState<'activa' | 'finalizada'>('activa')
  const mes = mesActual()
  const carga = useCarga(() => cargarInversiones(mes))
  const hoy = hoyColombia()

  const filas = useMemo(() => {
    if (!carga.data) return []
    return carga.data.inversiones.map((inv) => ({ inv, r: resumirInversion(inv, hoy, carga.data!.ganancias) }))
  }, [carga.data, hoy])

  if (carga.error) return <CajaError mensaje={carga.error} reintentar={carga.recargar} />
  if (!carga.data) return <Cargando />

  const activas = filas.filter((f) => f.inv.estado === 'activa')
  const capital = activas.reduce((s, f) => s + f.r.capitalPendiente, 0)
  const porPagar = activas.reduce(
    (s, f) => s + f.r.vencidas.reduce((x, c) => x + c.monto - c.pagado, 0),
    0,
  )
  const delMes = activas.reduce((s, f) => s + rendimientoDelMes(f.inv, mes, carga.data!.ganancias), 0)
  const gananciaMes = gananciaEntre(carga.data.ganancias, `${mes}-01`, sumarMeses(`${mes}-01`, 1))
  const ponderada = capital
    ? activas.reduce((s, f) => s + f.r.rentabilidadMensual * f.r.capitalPendiente, 0) / capital
    : 0
  const alertas = activas
    .flatMap((f) =>
      f.r.cuotas
        .filter((c) => c.monto - c.pagado > 0 && ['vencida', 'hoy', 'parcial', 'pendiente'].includes(c.estado))
        .map((c) => ({ ...c, inv: f.inv })),
    )
    .filter((c) => c.fecha <= addDias(hoy, 7))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  const visibles = filas.filter((f) => f.inv.estado === ver)

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Inversores</h1>
        <div className="acciones">
          <Link to="/inversores/nueva" className="btn btn-primario">
            <Icono nombre="mas" /> Nueva
          </Link>
        </div>
      </div>

      <div className="datos">
        <Dato etiqueta="Capital de inversores" valor={cop(capital)} nota={`${activas.length} inversión(es) activa(s)`} />
        <Dato
          etiqueta="Por pagar ya"
          valor={cop(porPagar)}
          tono={porPagar > 0 ? 'mal' : undefined}
          nota={porPagar > 0 ? 'Pagos vencidos o de hoy' : 'Al día'}
        />
        <Dato
          etiqueta="Costo promedio"
          valor={`${pct(ponderada)} mensual`}
          nota="Lo que te cuesta el dinero de inversores"
        />
      </div>

      <section className="tarjeta">
        <h2>{nombreMes(mes)}: ¿cuánto te queda?</h2>
        <div className="fila-total">
          <span>Ganancia de las ventas</span>
          <span>{cop(gananciaMes)}</span>
        </div>
        <div className="fila-total">
          <span>Para inversores este mes</span>
          <span>− {cop(delMes)}</span>
        </div>
        <div className={`fila-total fuerte ${gananciaMes - delMes < 0 ? 'tono-mal' : ''}`}>
          <span>Te queda</span>
          <span>{cop(gananciaMes - delMes)}</span>
        </div>
        <p className="sutil">
          Ganancia = ventas − costo de la ropa vendida. No incluye otros gastos (arriendo, servicios…). Si faltan
          costos de compra, la ganancia se ve más alta.
        </p>
      </section>

      {alertas.length > 0 && (
        <section className="seccion">
          <h2>Pagos próximos</h2>
          <ul className="tarjeta lista-pagos">
            {alertas.map((c) => (
              <li key={c.inv.id + c.clave}>
                <Link to={`/inversores/${c.inv.id}`}>
                  <span className="resultado-texto">
                    <strong>{c.inv.inversores.nombre}</strong>
                    <span className="sutil">
                      {c.titulo} · {fecha(c.fecha)}
                    </span>
                  </span>
                  <span className="venta-lado">
                    <strong>{cop(c.monto - c.pagado)}</strong>
                    <span className={`etiqueta ${c.fecha < hoy ? 'etiqueta-mal' : c.fecha === hoy ? 'etiqueta-aviso' : ''}`}>
                      {c.fecha < hoy ? 'Vencido' : c.fecha === hoy ? 'Hoy' : 'Próximo'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="pestanas" role="tablist">
        <button role="tab" aria-selected={ver === 'activa'} className={ver === 'activa' ? 'activa' : ''} onClick={() => setVer('activa')}>
          Activas
        </button>
        <button
          role="tab"
          aria-selected={ver === 'finalizada'}
          className={ver === 'finalizada' ? 'activa' : ''}
          onClick={() => setVer('finalizada')}
        >
          Finalizadas
        </button>
      </div>

      {visibles.length === 0 && (
        <Vacio icono="caja">
          {ver === 'activa' ? (
            <>
              No hay inversiones activas. <Link to="/inversores/nueva">Registra la primera</Link>.
            </>
          ) : (
            'No hay inversiones finalizadas.'
          )}
        </Vacio>
      )}

      <div className="lista-tarjetas">
        {visibles.map(({ inv, r }) => {
          const avance = Math.min(100, Math.round((r.mesesTranscurridos / inv.plazo_meses) * 100))
          return (
            <Link key={inv.id} to={`/inversores/${inv.id}`} className="tarjeta tarjeta-inversion">
              <div className="apartado-cabeza">
                <div>
                  <strong className="apartado-cliente">{inv.inversores.nombre}</strong>
                  <div className="sutil">
                    {inv.tipo === 'interes' ? `Interés ${pct(inv.tasa)} mensual` : `${pct(inv.tasa)} de las ganancias`}
                  </div>
                </div>
                {inv.estado === 'finalizada' ? (
                  <span className="etiqueta">Finalizada</span>
                ) : r.vencidas.length > 0 ? (
                  <span className="etiqueta etiqueta-mal">Pago vencido</span>
                ) : (
                  <span className="etiqueta etiqueta-bien">Al día</span>
                )}
              </div>
              <div className="apartado-montos">
                <div>
                  <span className="sutil">Capital</span>
                  <strong>{cop(inv.monto)}</strong>
                </div>
                <div>
                  <span className="sutil">Pagado</span>
                  <strong>{cop(r.rendimientoPagado)}</strong>
                </div>
                <div>
                  <span className="sutil">Rentab.</span>
                  <strong>{pct(r.rentabilidadTotal)}</strong>
                </div>
              </div>
              <div className="plazo">
                <div className="plazo-barra" aria-hidden="true">
                  <span style={{ width: `${avance}%` }} />
                </div>
                <span className="sutil">
                  {fecha(inv.fecha_inicio)} → {fecha(r.fin)} · {inv.plazo_meses} meses
                  {inv.estado === 'activa' && ` · faltan ${r.diasRestantes} días`}
                </span>
              </div>
              {inv.estado === 'activa' && r.proxima && (
                <span className="sutil">
                  Próximo pago: <strong>{cop(r.proxima.monto - r.proxima.pagado)}</strong> el {fecha(r.proxima.fecha)}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function addDias(f: string, n: number): string {
  const d = new Date(f + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
