import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import type { Cliente } from '../lib/types'

export interface DatosCliente {
  clienteId: string | null
  nombre: string
  telefono: string
}

export const clienteVacio = (): DatosCliente => ({ clienteId: null, nombre: '', telefono: '' })

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Campo de cliente con sugerencias de clientes guardados + celular. */
export function SelectorCliente({
  valor,
  onChange,
  requerido,
  etiqueta = 'Cliente',
}: {
  valor: DatosCliente
  onChange: (v: DatosCliente) => void
  requerido?: boolean
  etiqueta?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const clientes = useCarga(async () => {
    const r = await supabase.from('clientes').select('id, nombre, telefono, tallas').order('nombre')
    // Si aún no existe la tabla de clientes, el campo funciona como texto normal.
    return r.error ? [] : (r.data as Pick<Cliente, 'id' | 'nombre' | 'telefono' | 'tallas'>[])
  })

  const sugerencias = useMemo(() => {
    const q = normalizar(valor.nombre.trim())
    if (!q || valor.clienteId) return []
    const digitos = q.replace(/\D/g, '')
    return (clientes.data ?? [])
      .filter(
        (c) =>
          normalizar(c.nombre).includes(q) ||
          (digitos.length >= 3 && (c.telefono ?? '').replace(/\D/g, '').includes(digitos)),
      )
      .slice(0, 6)
  }, [valor.nombre, valor.clienteId, clientes.data])

  return (
    <div className="selector-cliente">
      <label className="campo">
        <span>
          {etiqueta}
          {requerido ? ' *' : ' (opcional)'}
        </span>
        <input
          value={valor.nombre}
          autoComplete="off"
          placeholder="Nombre o celular"
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onChange={(e) => onChange({ ...valor, nombre: e.target.value, clienteId: null })}
        />
      </label>
      {abierto && sugerencias.length > 0 && (
        <ul className="sugerencias" role="listbox">
          {sugerencias.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ clienteId: c.id, nombre: c.nombre, telefono: c.telefono ?? '' })
                  setAbierto(false)
                }}
              >
                <strong>{c.nombre}</strong>
                <span className="sutil">
                  {c.telefono ?? 'sin celular'}
                  {c.tallas && ` · talla ${c.tallas}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {valor.clienteId ? (
        <p className="sutil cliente-elegido">
          ✓ Cliente guardado{valor.telefono && ` · ${valor.telefono}`}{' '}
          <button type="button" className="enlace" onClick={() => onChange(clienteVacio())}>
            Cambiar
          </button>
        </p>
      ) : (
        <label className="campo">
          <span>Celular (opcional)</span>
          <input
            type="tel"
            inputMode="tel"
            placeholder="300 123 4567"
            value={valor.telefono}
            onChange={(e) => onChange({ ...valor, telefono: e.target.value })}
          />
          {valor.nombre.trim() && valor.telefono.replace(/\D/g, '').length >= 7 && (
            <span className="sutil">Se guarda en Clientes para su historial de compras.</span>
          )}
        </label>
      )}
    </div>
  )
}
