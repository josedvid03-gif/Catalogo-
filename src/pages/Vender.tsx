import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useAvisar } from '../lib/aviso'
import { cop } from '../lib/format'
import type { LineaCarrito, MetodoPago } from '../lib/types'
import { Carrito, itemsParaRPC, totalCarrito } from '../components/Carrito'
import { BotonAccion, CajaError, Total, Vacio } from '../components/Comunes'
import { SelectorMetodo } from '../components/MetodoPago'
import { Icono } from '../components/Icono'

export function Vender() {
  const avisar = useAvisar()
  const [lineas, setLineas] = useState<LineaCarrito[]>([])
  const [cliente, setCliente] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reinicio, setReinicio] = useState(0)
  const [ultima, setUltima] = useState<{ total: number; numero: number } | null>(null)

  const total = totalCarrito(lineas)
  const ganancia = lineas.reduce((s, l) => s + l.cantidad * (l.precio - l.item.costo), 0)

  const registrar = async () => {
    setError(null)
    try {
      const id = datos(
        await supabase.rpc('registrar_venta', {
          p_items: itemsParaRPC(lineas),
          p_cliente: cliente,
          p_metodo: metodo,
          p_nota: nota,
        }),
      ) as string
      const venta = datos(await supabase.from('ventas').select('numero, total').eq('id', id).single()) as {
        numero: number
        total: number
      }
      setUltima(venta)
      avisar(`Venta #${venta.numero} registrada`)
      setLineas([])
      setCliente('')
      setNota('')
      setMetodo('efectivo')
      setReinicio((n) => n + 1)
    } catch (e) {
      setError(mensajeError(e))
      setReinicio((n) => n + 1)
    }
  }

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Vender</h1>
        <div className="acciones">
          <Link to="/apartados/nuevo" className="btn">
            <Icono nombre="apartados" /> Apartar
          </Link>
        </div>
      </div>

      {ultima && lineas.length === 0 && (
        <div className="exito">
          <Icono nombre="check" />
          <span>
            Venta #{ultima.numero} por <strong>{cop(ultima.total)}</strong> registrada.
          </span>
          <Link to="/ventas" className="enlace">
            Ver ventas
          </Link>
        </div>
      )}

      <Carrito key={reinicio} lineas={lineas} setLineas={setLineas} />

      {lineas.length === 0 ? (
        <Vacio icono="prendas">Busca y toca las prendas que se llevan.</Vacio>
      ) : (
        <section className="tarjeta">
          <Total etiqueta="Total a cobrar" valor={total} fuerte />
          <p className="sutil">Ganancia de esta venta: {cop(ganancia)}</p>
          <div className="campo">
            <span>Método de pago</span>
            <SelectorMetodo valor={metodo} onChange={setMetodo} />
          </div>
          <label className="campo">
            <span>Cliente (opcional)</span>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} />
          </label>
          <label className="campo">
            <span>Nota (opcional)</span>
            <input value={nota} onChange={(e) => setNota(e.target.value)} />
          </label>
          {error && <CajaError mensaje={error} />}
          <BotonAccion className="btn btn-primario btn-bloque" onClick={registrar}>
            Registrar venta · {cop(total)}
          </BotonAccion>
        </section>
      )}
    </div>
  )
}
