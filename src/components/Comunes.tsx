import { useEffect, useState, type ReactNode } from 'react'
import { urlFoto } from '../lib/supabase'
import { cop, num } from '../lib/format'
import { Icono } from './Icono'

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="cargando">
      <span className="spinner" aria-hidden="true" />
      {texto}
    </div>
  )
}

export function CajaError({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  return (
    <div className="caja-error" role="alert">
      <Icono nombre="alerta" />
      <span>{mensaje}</span>
      {reintentar && (
        <button className="btn btn-sm" onClick={reintentar}>
          Reintentar
        </button>
      )}
    </div>
  )
}

export function Vacio({ icono = 'caja', children }: { icono?: 'caja' | 'apartados' | 'ventas' | 'prendas'; children: ReactNode }) {
  return (
    <div className="vacio">
      <Icono nombre={icono} tam={32} />
      <div>{children}</div>
    </div>
  )
}

export function Foto({ ruta, alt, className = '' }: { ruta?: string | null; alt: string; className?: string }) {
  if (!ruta) {
    return (
      <div className={`foto foto-vacia ${className}`} aria-label={alt}>
        <Icono nombre="prendas" tam={22} />
      </div>
    )
  }
  return <img className={`foto ${className}`} src={urlFoto(ruta)} alt={alt} loading="lazy" />
}

/** Campo de dinero: muestra "65.000" mientras se escribe y entrega un número. */
export function CampoPesos({
  valor,
  onChange,
  id,
  placeholder = '0',
  autoFocus,
}: {
  valor: number
  onChange: (n: number) => void
  id?: string
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <div className="campo-pesos">
      <span>$</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={valor ? num(valor) : ''}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, '')
          onChange(d ? Math.min(Number(d), 2_000_000_000) : 0)
        }}
      />
    </div>
  )
}

export function Cantidad({ valor, onChange, max }: { valor: number; onChange: (n: number) => void; max?: number }) {
  return (
    <div className="cantidad">
      <button type="button" aria-label="Menos" onClick={() => onChange(Math.max(1, valor - 1))} disabled={valor <= 1}>
        <Icono nombre="menos" tam={16} />
      </button>
      <span>{valor}</span>
      <button
        type="button"
        aria-label="Más"
        onClick={() => onChange(valor + 1)}
        disabled={max !== undefined && valor >= max}
      >
        <Icono nombre="mas" tam={16} />
      </button>
    </div>
  )
}

export function Hoja({
  titulo,
  abierta,
  onCerrar,
  children,
}: {
  titulo: string
  abierta: boolean
  onCerrar: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!abierta) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', esc)
    document.body.classList.add('sin-scroll')
    return () => {
      document.removeEventListener('keydown', esc)
      document.body.classList.remove('sin-scroll')
    }
  }, [abierta, onCerrar])
  if (!abierta) return null
  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cabeza">
          <h2>{titulo}</h2>
          <button className="btn-icono" aria-label="Cerrar" onClick={onCerrar}>
            <Icono nombre="cerrar" />
          </button>
        </div>
        <div className="hoja-cuerpo">{children}</div>
      </div>
    </div>
  )
}

export function Dato({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: string; nota?: string; tono?: 'bien' | 'mal' }) {
  return (
    <div className="dato">
      <div className="dato-etiqueta">{etiqueta}</div>
      <div className={`dato-valor ${tono ? 'tono-' + tono : ''}`}>{valor}</div>
      {nota && <div className="dato-nota">{nota}</div>}
    </div>
  )
}

export function Total({ etiqueta, valor, fuerte }: { etiqueta: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={`fila-total ${fuerte ? 'fuerte' : ''}`}>
      <span>{etiqueta}</span>
      <span>{cop(valor)}</span>
    </div>
  )
}

/** Botón que se deshabilita mientras su acción async está corriendo. */
export function BotonAccion({
  onClick,
  children,
  className = 'btn',
  disabled,
  type = 'button',
}: {
  onClick?: () => Promise<unknown> | void
  children: ReactNode
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  const [ocupado, setOcupado] = useState(false)
  return (
    <button
      type={type}
      className={className}
      disabled={disabled || ocupado}
      onClick={
        onClick
          ? async () => {
              setOcupado(true)
              try {
                await onClick()
              } finally {
                setOcupado(false)
              }
            }
          : undefined
      }
    >
      {ocupado ? <span className="spinner spinner-sm" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}
