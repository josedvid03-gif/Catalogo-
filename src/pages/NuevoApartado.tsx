import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useAvisar } from '../lib/aviso'
import { useAjustes } from '../lib/sesion'
import { cop, enlaceWhatsapp, fecha, hoyColombia } from '../lib/format'
import type { Apartado, LineaCarrito, MetodoPago } from '../lib/types'
import { Carrito, itemsParaRPC, totalCarrito } from '../components/Carrito'
import { BotonAccion, CajaError, CampoPesos, Total, Vacio } from '../components/Comunes'
import { SelectorMetodo } from '../components/MetodoPago'
import { Icono } from '../components/Icono'

export function anticipoSugerido(total: number, porcentaje: number) {
  return Math.min(total, Math.ceil((total * porcentaje) / 100 / 1000) * 1000)
}

export function textoComprobante(a: Apartado, tienda: string) {
  const prendas = a.apartado_items.map((i) => `• ${i.cantidad} x ${i.descripcion} — ${cop(i.precio_unit)}`).join('\n')
  return [
    `*${tienda}* — Apartado #${a.numero}`,
    `Cliente: ${a.cliente}`,
    prendas,
    `Total: ${cop(a.total)}`,
    `Anticipo: ${cop(a.anticipo)}`,
    `Saldo: ${cop(a.total - a.anticipo)}`,
    `Fecha límite para recoger: ${fecha(a.fecha_limite)}`,
    `Si no se completa el pago a tiempo, se devuelve el anticipo y las prendas vuelven a la venta.`,
  ].join('\n')
}

export function NuevoApartado() {
  const avisar = useAvisar()
  const ajustes = useAjustes()
  const [lineas, setLineas] = useState<LineaCarrito[]>([])
  const [cliente, setCliente] = useState('')
  const [telefono, setTelefono] = useState('')
  const [anticipoManual, setAnticipoManual] = useState<number | null>(null)
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reinicio, setReinicio] = useState(0)
  const [creado, setCreado] = useState<Apartado | null>(null)

  const total = totalCarrito(lineas)
  const anticipo = anticipoManual ?? anticipoSugerido(total, ajustes.porcentaje_anticipo)
  const limite = new Date(hoyColombia() + 'T12:00:00')
  limite.setDate(limite.getDate() + ajustes.dias_apartado)

  const crear = async () => {
    setError(null)
    if (!cliente.trim()) return setError('Escribe el nombre del cliente')
    if (anticipo > total) return setError('El anticipo no puede ser mayor al total')
    try {
      const id = datos(
        await supabase.rpc('crear_apartado', {
          p_items: itemsParaRPC(lineas),
          p_cliente: cliente,
          p_telefono: telefono,
          p_anticipo: anticipo,
          p_metodo: metodo,
          p_nota: nota,
        }),
      ) as string
      const a = datos(await supabase.from('apartados').select('*, apartado_items(*)').eq('id', id).single()) as Apartado
      setCreado(a)
      avisar(`Apartado #${a.numero} creado`)
      setLineas([])
      setCliente('')
      setTelefono('')
      setNota('')
      setAnticipoManual(null)
      setReinicio((n) => n + 1)
    } catch (e) {
      setError(mensajeError(e))
      setReinicio((n) => n + 1)
    }
  }

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <Link to="/apartados" className="btn-icono" aria-label="Volver">
          <Icono nombre="atras" />
        </Link>
        <h1>Nuevo apartado</h1>
      </div>

      {creado && lineas.length === 0 && (
        <div className="exito exito-columna">
          <div>
            <Icono nombre="check" /> Apartado #{creado.numero} de {creado.cliente}: saldo{' '}
            <strong>{cop(creado.total - creado.anticipo)}</strong> hasta el {fecha(creado.fecha_limite)}.
          </div>
          <div className="acciones">
            {creado.telefono && (
              <a
                className="btn btn-sm"
                href={enlaceWhatsapp(creado.telefono, textoComprobante(creado, ajustes.nombre_tienda))}
                target="_blank"
                rel="noreferrer"
              >
                <Icono nombre="chat" tam={16} /> Enviar comprobante por WhatsApp
              </a>
            )}
            <Link to="/apartados" className="btn btn-sm">
              Ver apartados
            </Link>
          </div>
        </div>
      )}

      <Carrito key={reinicio} lineas={lineas} setLineas={setLineas} />

      {lineas.length === 0 ? (
        <Vacio icono="apartados">
          Busca las prendas que el cliente quiere apartar. Se reservan por {ajustes.dias_apartado} días.
        </Vacio>
      ) : (
        <section className="tarjeta">
          <Total etiqueta="Total de las prendas" valor={total} fuerte />
          <label className="campo">
            <span>Cliente *</span>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} autoComplete="off" />
          </label>
          <label className="campo">
            <span>Celular (para WhatsApp)</span>
            <input
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="300 123 4567"
            />
          </label>
          <label className="campo">
            <span>
              Anticipo{' '}
              {total > 0 && <span className="sutil">({Math.round((anticipo / total) * 100)}% del total)</span>}
            </span>
            <CampoPesos valor={anticipo} onChange={(n) => setAnticipoManual(n)} />
          </label>
          {anticipoManual !== null && (
            <button type="button" className="enlace" onClick={() => setAnticipoManual(null)}>
              Usar {ajustes.porcentaje_anticipo}% ({cop(anticipoSugerido(total, ajustes.porcentaje_anticipo))})
            </button>
          )}
          <div className="campo">
            <span>¿Cómo pagó el anticipo?</span>
            <SelectorMetodo valor={metodo} onChange={setMetodo} />
          </div>
          <label className="campo">
            <span>Nota (opcional)</span>
            <input value={nota} onChange={(e) => setNota(e.target.value)} />
          </label>
          <div className="resumen-apartado">
            <Total etiqueta="Saldo pendiente" valor={total - anticipo} />
            <div className="fila-total">
              <span>Fecha límite</span>
              <span>{limite.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}</span>
            </div>
          </div>
          {error && <CajaError mensaje={error} />}
          <BotonAccion className="btn btn-primario btn-bloque" onClick={crear}>
            Apartar · recibir {cop(anticipo)}
          </BotonAccion>
        </section>
      )}
    </div>
  )
}
