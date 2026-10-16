import { METODOS, type MetodoPago } from '../lib/types'

export function SelectorMetodo({ valor, onChange }: { valor: MetodoPago; onChange: (m: MetodoPago) => void }) {
  return (
    <div className="chips" role="radiogroup" aria-label="Método de pago">
      {METODOS.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={valor === m.id}
          className={`chip ${valor === m.id ? 'chip-activo' : ''}`}
          onClick={() => onChange(m.id)}
        >
          {m.nombre}
        </button>
      ))}
    </div>
  )
}

export const nombreMetodo = (m: MetodoPago) => METODOS.find((x) => x.id === m)?.nombre ?? m
