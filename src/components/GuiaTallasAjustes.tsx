import { supabase, datos } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import type { TablaTallas } from '../lib/types'
import { Icono } from './Icono'

/** Medidas aproximadas para empezar; la tienda las ajusta a sus prendas. */
export const GUIA_EJEMPLO: TablaTallas[] = [
  {
    nombre: 'Buzos y camibuzos',
    categorias: 'Buzo, Camibuzo, Hoodie, Saco',
    columnas: ['Pecho (ancho)', 'Largo', 'Manga'],
    filas: [
      ['S', '52', '68', '60'],
      ['M', '55', '70', '62'],
      ['L', '58', '72', '64'],
      ['XL', '61', '74', '66'],
      ['XXL', '64', '76', '67'],
    ],
  },
  {
    nombre: 'Camisetas',
    categorias: 'Camiseta, Camisa, Polo',
    columnas: ['Pecho (ancho)', 'Largo'],
    filas: [
      ['S', '49', '69'],
      ['M', '52', '71'],
      ['L', '55', '73'],
      ['XL', '58', '75'],
      ['XXL', '61', '77'],
    ],
  },
  {
    nombre: 'Pantalones y jeans',
    categorias: 'Pantalón, Jean, Jeans, Jogger',
    columnas: ['Cintura', 'Largo'],
    filas: [
      ['28', '72', '102'],
      ['30', '77', '104'],
      ['32', '82', '106'],
      ['34', '87', '107'],
      ['36', '92', '108'],
    ],
  },
]

/** Quita filas vacías y espacios antes de guardar. */
export function limpiarGuia(guia: TablaTallas[]): TablaTallas[] {
  return guia
    .map((t) => ({
      nombre: t.nombre.trim(),
      categorias: t.categorias.trim(),
      columnas: t.columnas.map((c) => c.trim()),
      filas: t.filas.map((f) => f.map((v) => v.trim())).filter((f) => f[0]),
    }))
    .filter((t) => t.filas.length > 0)
}

export function GuiaTallasAjustes({ valor, onChange }: { valor: TablaTallas[]; onChange: (g: TablaTallas[]) => void }) {
  const categorias = useCarga(async () => {
    const filas = datos(await supabase.from('productos').select('categoria').eq('activo', true)) as { categoria: string | null }[]
    return [...new Set(filas.map((f) => f.categoria).filter(Boolean) as string[])].sort()
  })

  const cambiar = (i: number, t: Partial<TablaTallas>) => onChange(valor.map((x, j) => (j === i ? { ...x, ...t } : x)))
  const cambiarColumnas = (i: number, texto: string) => {
    const columnas = texto
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
    // Cada fila queda con la talla + una casilla por medida.
    const filas = valor[i].filas.map((f) => [f[0] ?? '', ...columnas.map((_, k) => f[k + 1] ?? '')])
    cambiar(i, { columnas, filas })
  }
  const cambiarCelda = (i: number, fila: number, col: number, v: string) =>
    cambiar(i, { filas: valor[i].filas.map((f, j) => (j === fila ? f.map((x, k) => (k === col ? v : x)) : f)) })

  return (
    <div className="guia-editor">
      {valor.map((t, i) => (
        <div key={i} className="guia-tabla">
          <div className="dos-columnas">
            <label className="campo">
              <span>Nombre de la tabla</span>
              <input value={t.nombre} placeholder="Ej: Buzos" onChange={(e) => cambiar(i, { nombre: e.target.value })} />
            </label>
            <label className="campo">
              <span>Para las categorías</span>
              <input
                value={t.categorias}
                placeholder="Ej: Buzo, Camibuzo (vacío = todas)"
                onChange={(e) => cambiar(i, { categorias: e.target.value })}
              />
            </label>
          </div>
          <label className="campo">
            <span>Medidas (separadas por coma)</span>
            <input
              key={t.columnas.join('|')}
              defaultValue={t.columnas.join(', ')}
              placeholder="Pecho, Largo, Manga"
              onBlur={(e) => cambiarColumnas(i, e.target.value)}
            />
          </label>
          <div className="tabla-scroll">
            <table className="guia-tabla-editar">
              <thead>
                <tr>
                  <th>Talla</th>
                  {t.columnas.map((c, k) => (
                    <th key={k}>{c} (cm)</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {t.filas.map((f, j) => (
                  <tr key={j}>
                    {f.map((v, k) => (
                      <td key={k}>
                        <input
                          value={v}
                          inputMode={k === 0 ? 'text' : 'decimal'}
                          aria-label={k === 0 ? 'Talla' : t.columnas[k - 1]}
                          onChange={(e) => cambiarCelda(i, j, k, k === 0 ? e.target.value.toUpperCase() : e.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="btn-icono"
                        aria-label={`Quitar talla ${f[0]}`}
                        onClick={() => cambiar(i, { filas: t.filas.filter((_, x) => x !== j) })}
                      >
                        <Icono nombre="cerrar" tam={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="acciones">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => cambiar(i, { filas: [...t.filas, ['', ...t.columnas.map(() => '')]] })}
            >
              <Icono nombre="mas" tam={16} /> Talla
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => confirm(`¿Quitar la tabla "${t.nombre || 'sin nombre'}"?`) && onChange(valor.filter((_, j) => j !== i))}
            >
              <Icono nombre="basura" tam={16} /> Quitar tabla
            </button>
          </div>
        </div>
      ))}

      {categorias.data && categorias.data.length > 0 && (
        <p className="sutil">Tus categorías: {categorias.data.join(', ')}</p>
      )}
      <div className="acciones">
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange([...valor, { nombre: '', categorias: '', columnas: ['Pecho', 'Largo'], filas: [['S', '', ''], ['M', '', ''], ['L', '', '']] }])
          }
        >
          <Icono nombre="mas" tam={16} /> Agregar tabla
        </button>
        {valor.length === 0 && (
          <button type="button" className="btn" onClick={() => onChange(GUIA_EJEMPLO)}>
            Usar guía de ejemplo
          </button>
        )}
      </div>
    </div>
  )
}
