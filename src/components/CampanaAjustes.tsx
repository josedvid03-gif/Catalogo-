import { useState } from 'react'
import { supabase, datos, mensajeError, urlFoto } from '../lib/supabase'
import { subirFoto } from '../lib/imagenes'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import type { FotoCampana } from '../lib/types'
import { Icono } from './Icono'

/** Editor de las fotos de campaña (lookbook): subir, titular, enlazar, ordenar y quitar. */
export function CampanaAjustes({ valor, onChange }: { valor: FotoCampana[]; onChange: (v: FotoCampana[]) => void }) {
  const avisar = useAvisar()
  const [subiendo, setSubiendo] = useState<number | 'nueva' | null>(null)
  const opciones = useCarga(async () => {
    const ps = datos(
      await supabase.from('productos').select('id, nombre, categoria').eq('activo', true).eq('publicado', true).order('nombre'),
    ) as { id: string; nombre: string; categoria: string | null }[]
    return { productos: ps, categorias: [...new Set(ps.map((p) => p.categoria).filter(Boolean) as string[])].sort() }
  })

  const cambiar = (i: number, f: Partial<FotoCampana>) => onChange(valor.map((x, j) => (j === i ? { ...x, ...f } : x)))
  const mover = (i: number, d: -1 | 1) => {
    const n = [...valor]
    ;[n[i], n[i + d]] = [n[i + d], n[i]]
    onChange(n)
  }
  const subir = async (archivo: File | undefined, i: number | 'nueva') => {
    if (!archivo) return
    setSubiendo(i)
    try {
      const ruta = await subirFoto('campana', archivo)
      if (i === 'nueva') onChange([...valor, { foto: ruta, titulo: '', enlace: '' }])
      else cambiar(i, { foto: ruta })
      avisar('Foto lista. Toca "Guardar ajustes" para publicarla')
    } catch (e) {
      avisar(mensajeError(e), 'error')
    } finally {
      setSubiendo(null)
    }
  }

  return (
    <div className="campana-editor">
      {valor.map((f, i) => (
        <div key={`${f.foto}-${i}`} className="campana-item">
          <label className="campana-miniatura" title="Cambiar foto">
            <img src={urlFoto(f.foto)} alt="" />
            <span>{subiendo === i ? 'Subiendo…' : 'Cambiar'}</span>
            <input type="file" accept="image/*" hidden onChange={(e) => void subir(e.target.files?.[0], i)} />
          </label>
          <div className="campana-datos">
            <input value={f.titulo} placeholder="Título (opcional)" onChange={(e) => cambiar(i, { titulo: e.target.value })} />
            <select value={f.enlace} onChange={(e) => cambiar(i, { enlace: e.target.value })} aria-label="Al tocarla lleva a">
              <option value="">Sin enlace</option>
              {f.enlace && !opcionConocida(f.enlace, opciones.data) && <option value={f.enlace}>
                  {f.enlace.includes('?q=') ? `Búsqueda: ${decodeURIComponent(f.enlace.split('?q=')[1])}` : 'Enlace actual'}
                </option>}
              <option value="/catalogo?rebajas">Rebajas</option>
              {opciones.data?.categorias.map((c) => (
                <option key={c} value={`/catalogo?c=${encodeURIComponent(c)}`}>
                  Categoría: {c}
                </option>
              ))}
              {opciones.data?.productos.map((p) => (
                <option key={p.id} value={`/catalogo/p/${p.id}`}>
                  Prenda: {p.nombre}
                </option>
              ))}
            </select>
            <div className="campana-botones">
              <button type="button" className="btn-icono" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>
                <Icono nombre="atras" tam={16} className="girar-90" />
              </button>
              <button
                type="button"
                className="btn-icono"
                aria-label="Bajar"
                disabled={i === valor.length - 1}
                onClick={() => mover(i, 1)}
              >
                <Icono nombre="adelante" tam={16} className="girar-90" />
              </button>
              <button
                type="button"
                className="btn-icono"
                aria-label="Quitar foto"
                onClick={() => onChange(valor.filter((_, j) => j !== i))}
              >
                <Icono nombre="basura" tam={16} />
              </button>
            </div>
          </div>
        </div>
      ))}
      <label className={`btn ${subiendo === 'nueva' ? 'deshabilitado' : ''}`}>
        <Icono nombre="camara" tam={16} /> {subiendo === 'nueva' ? 'Subiendo…' : 'Agregar foto'}
        <input type="file" accept="image/*" hidden onChange={(e) => void subir(e.target.files?.[0], 'nueva')} />
      </label>
    </div>
  )
}

function opcionConocida(enlace: string, d?: { productos: { id: string }[]; categorias: string[] } | null) {
  if (enlace === '/catalogo?rebajas') return true
  return Boolean(
    d?.categorias.some((c) => enlace === `/catalogo?c=${encodeURIComponent(c)}`) ||
      d?.productos.some((p) => enlace === `/catalogo/p/${p.id}`),
  )
}
