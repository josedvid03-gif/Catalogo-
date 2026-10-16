import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { cop, fecha, hoyColombia } from '../lib/format'
import { anual, sumarMeses, type Inversion, type TipoInversion } from '../lib/inversiones'
import { BotonAccion, CajaError, CampoPesos, Cargando } from '../components/Comunes'
import { Icono } from '../components/Icono'
import { pct } from './Inversores'

const PLAZOS = [3, 6, 12, 24]

function leerDecimal(v: string): number {
  const n = Number(v.replace(',', '.').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? Math.min(n, 100) : 0
}

export function InversionForm() {
  const { id } = useParams()
  const esNueva = !id
  const navegar = useNavigate()
  const avisar = useAvisar()

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [monto, setMonto] = useState(0)
  const [inicio, setInicio] = useState(hoyColombia())
  const [tipo, setTipo] = useState<TipoInversion>('interes')
  const [tasaTexto, setTasaTexto] = useState('')
  const [plazo, setPlazo] = useState(6)
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)

  const inversores = useCarga(
    async () =>
      datos(await supabase.from('inversores').select('id, nombre, telefono').order('nombre')) as {
        id: string
        nombre: string
        telefono: string | null
      }[],
  )
  const existente = useCarga(async () => {
    if (!id) return null
    return datos(
      await supabase.from('inversiones').select('*, inversores(nombre, telefono)').eq('id', id).single(),
    ) as Omit<Inversion, 'pagos_inversion'>
  }, [id], { alVolver: false })

  useEffect(() => {
    const e = existente.data
    if (!e) return
    setNombre(e.inversores.nombre)
    setTelefono(e.inversores.telefono ?? '')
    setMonto(e.monto)
    setInicio(e.fecha_inicio)
    setTipo(e.tipo)
    setTasaTexto(String(e.tasa).replace('.', ','))
    setPlazo(e.plazo_meses)
    setNota(e.nota ?? '')
  }, [existente.data])

  const tasa = leerDecimal(tasaTexto)
  const fin = sumarMeses(inicio, plazo || 1)
  const interesMes = Math.round((monto * tasa) / 100)

  const guardar = async () => {
    setError(null)
    if (!nombre.trim()) return setError('Escribe el nombre del inversor')
    if (monto <= 0) return setError('Escribe cuánto dinero invirtió')
    if (!tasa) return setError(tipo === 'interes' ? 'Escribe el interés mensual' : 'Escribe el % de las ganancias')
    if (!plazo || plazo < 1 || plazo > 120) return setError('El plazo debe estar entre 1 y 120 meses')
    try {
      const lista = inversores.data ?? []
      let inversor = lista.find((i) => i.nombre.trim().toLowerCase() === nombre.trim().toLowerCase())
      if (inversor) {
        if (telefono.trim() && telefono.trim() !== (inversor.telefono ?? '')) {
          datos(await supabase.from('inversores').update({ telefono: telefono.trim() }).eq('id', inversor.id))
        }
      } else {
        inversor = datos(
          await supabase
            .from('inversores')
            .insert({ nombre: nombre.trim(), telefono: telefono.trim() || null })
            .select('id, nombre, telefono')
            .single(),
        ) as { id: string; nombre: string; telefono: string | null }
      }
      const fila = {
        inversor_id: inversor.id,
        monto,
        fecha_inicio: inicio,
        tipo,
        tasa,
        plazo_meses: plazo,
        nota: nota.trim() || null,
      }
      let destino = id
      if (esNueva) {
        const r = datos(await supabase.from('inversiones').insert(fila).select('id').single()) as { id: string }
        destino = r.id
      } else {
        datos(await supabase.from('inversiones').update(fila).eq('id', id!))
      }
      avisar(esNueva ? 'Inversión registrada' : 'Cambios guardados')
      navegar(`/inversores/${destino}`, { replace: true })
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  if (!esNueva && !existente.data) {
    return existente.error ? <CajaError mensaje={existente.error} reintentar={existente.recargar} /> : <Cargando />
  }

  return (
    <div className="pagina formulario">
      <div className="titulo-pagina">
        <Link to={esNueva ? '/inversores' : `/inversores/${id}`} className="btn-icono" aria-label="Volver">
          <Icono nombre="atras" />
        </Link>
        <h1>{esNueva ? 'Nueva inversión' : 'Editar inversión'}</h1>
      </div>

      <section className="tarjeta">
        <h2>Inversor</h2>
        <label className="campo">
          <span>Nombre *</span>
          <input
            list="inversores"
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value)
              const ya = inversores.data?.find((i) => i.nombre.toLowerCase() === e.target.value.trim().toLowerCase())
              if (ya?.telefono && !telefono) setTelefono(ya.telefono)
            }}
            autoComplete="off"
          />
          <datalist id="inversores">
            {(inversores.data ?? []).map((i) => (
              <option key={i.id} value={i.nombre} />
            ))}
          </datalist>
        </label>
        <label className="campo">
          <span>Celular (para enviarle su extracto)</span>
          <input type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </label>
      </section>

      <section className="tarjeta">
        <h2>Inversión</h2>
        <div className="dos-columnas">
          <label className="campo">
            <span>Monto invertido *</span>
            <CampoPesos valor={monto} onChange={setMonto} />
          </label>
          <label className="campo">
            <span>Fecha en que lo recibiste</span>
            <input type="date" value={inicio} onChange={(e) => e.target.value && setInicio(e.target.value)} />
          </label>
        </div>

        <div className="campo">
          <span>¿Cómo gana el inversor?</span>
          <div className="chips" role="radiogroup">
            {(
              [
                ['interes', 'Interés fijo mensual'],
                ['ganancias', '% de las ganancias'],
              ] as const
            ).map(([t, n]) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tipo === t}
                className={`chip ${tipo === t ? 'chip-activo' : ''}`}
                onClick={() => setTipo(t)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <label className="campo">
          <span>{tipo === 'interes' ? 'Interés mensual (%) *' : 'Porcentaje de la ganancia mensual (%) *'}</span>
          <input
            inputMode="decimal"
            placeholder={tipo === 'interes' ? 'Ej: 3' : 'Ej: 30'}
            value={tasaTexto}
            onChange={(e) => setTasaTexto(e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </label>

        <div className="campo">
          <span>Plazo (meses)</span>
          <div className="fila-plazo">
            <div className="chips">
              {PLAZOS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`chip ${plazo === p ? 'chip-activo' : ''}`}
                  onClick={() => setPlazo(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              aria-label="Meses"
              inputMode="numeric"
              value={plazo ? String(plazo) : ''}
              onChange={(e) => setPlazo(Math.min(120, Number(e.target.value.replace(/\D/g, '') || 0)))}
            />
          </div>
        </div>

        <label className="campo">
          <span>Nota (opcional)</span>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: acuerdo por escrito, cuenta donde se paga…" />
        </label>
      </section>

      {monto > 0 && tasa > 0 && plazo > 0 && (
        <section className="tarjeta resumen-inversion">
          <h2>Así queda</h2>
          {tipo === 'interes' ? (
            <>
              <div className="fila-total">
                <span>Pago de interés cada mes</span>
                <span>{cop(interesMes)}</span>
              </div>
              <div className="fila-total">
                <span>Total de intereses en {plazo} meses</span>
                <span>{cop(interesMes * plazo)}</span>
              </div>
              <div className="fila-total">
                <span>Devolución del capital ({fecha(fin)})</span>
                <span>{cop(monto)}</span>
              </div>
              <div className="fila-total fuerte">
                <span>Total a pagar</span>
                <span>{cop(monto + interesMes * plazo)}</span>
              </div>
              <p className="sutil">
                Rentabilidad para el inversor: {pct(tasa * plazo)} en el plazo · {pct(anual(tasa))} efectivo anual.
                El primer pago es el {fecha(sumarMeses(inicio, 1))}.
              </p>
            </>
          ) : (
            <>
              <p>
                Cada mes recibe el <strong>{pct(tasa)}</strong> de la ganancia neta del negocio (ventas − costo de la
                ropa vendida − gastos), desde el {fecha(inicio)} hasta el {fecha(fin)}.
              </p>
              <div className="fila-total">
                <span>Si la ganancia de un mes es {cop(1_000_000)}</span>
                <span>recibe {cop((1_000_000 * tasa) / 100)}</span>
              </div>
              <div className="fila-total fuerte">
                <span>Devolución del capital ({fecha(fin)})</span>
                <span>{cop(monto)}</span>
              </div>
            </>
          )}
        </section>
      )}

      {error && <CajaError mensaje={error} />}
      <div className="barra-guardar">
        <BotonAccion className="btn btn-primario btn-bloque" onClick={guardar}>
          {esNueva ? 'Registrar inversión' : 'Guardar cambios'}
        </BotonAccion>
      </div>
    </div>
  )
}
