import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { cop } from '../lib/format'
import {
  adivinarColumnas,
  convertirFilas,
  leerTabla,
  tieneEncabezado,
  type Columnas,
  type FilaImportada,
} from '../lib/importar'
import { BotonAccion, CajaError, CampoPesos } from '../components/Comunes'
import { Icono } from '../components/Icono'

const letra = (i: number) => String.fromCharCode(65 + (i % 26))
const llaveProducto = (nombre: string, talla: string) => `${normalizar(nombre)}|${normalizar(talla) || 'unica'}`
const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export function Importar() {
  const navegar = useNavigate()
  const avisar = useAvisar()
  const [texto, setTexto] = useState('')
  const [cols, setCols] = useState<Columnas | null>(null)
  const [saltarPrimera, setSaltarPrimera] = useState(false)
  const [formatear, setFormatear] = useState(true)
  const [unirIguales, setUnirIguales] = useState(true)
  const [publicar, setPublicar] = useState(false)
  const [filas, setFilas] = useState<FilaImportada[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const existentes = useCarga(async () => {
    const r = datos(await supabase.from('inventario').select('nombre, talla')) as { nombre: string; talla: string }[]
    return new Set(r.map((x) => llaveProducto(x.nombre, x.talla)))
  })

  const tabla = useMemo(() => (texto.trim() ? leerTabla(texto) : []), [texto])
  const ancho = Math.max(0, ...tabla.map((f) => f.length))

  const cargarTexto = (t: string) => {
    setTexto(t)
    setFilas(null)
    const tb = t.trim() ? leerTabla(t) : []
    const c = adivinarColumnas(tb)
    setCols(c)
    setSaltarPrimera(tieneEncabezado(tb, c))
  }

  const leerArchivo = async (archivo?: File) => {
    if (!archivo) return
    if (/\.xlsx?$/i.test(archivo.name)) {
      setError('Ese es un archivo de Excel. Guárdalo como CSV (Archivo → Descargar → CSV) o copia y pega las filas.')
      return
    }
    setError(null)
    cargarTexto(await archivo.text())
  }

  const yaExiste = (f: FilaImportada) =>
    existentes.data?.has(llaveProducto(f.nombre, f.talla)) ?? false

  const revisar = () => {
    if (!cols) return
    setError(null)
    const r = convertirFilas(tabla, cols, { saltarPrimera, formatear, unirIguales }).map((f) => ({
      ...f,
      incluir: !yaExiste(f),
    }))
    if (r.length === 0) setError('No encontré productos. Revisa qué columna tiene el nombre.')
    setFilas(r)
  }

  const cambiar = (clave: string, cambios: Partial<FilaImportada>) =>
    setFilas((fs) => fs?.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)) ?? null)

  const elegidas = (filas ?? []).filter((f) => f.incluir && f.nombre.trim())
  const unidades = elegidas.reduce((s, f) => s + f.cantidad, 0)
  const valor = elegidas.reduce((s, f) => s + f.cantidad * f.precio, 0)
  const sinCosto = elegidas.filter((f) => !f.costo).length
  const sinPrecio = elegidas.filter((f) => !f.precio).length

  const importar = async () => {
    setError(null)
    // Mismo nombre y precio con distinta talla = un producto con varias tallas.
    const grupos = new Map<string, { producto: Record<string, unknown>; tallas: Map<string, number> }>()
    for (const f of elegidas) {
      const llave = `${normalizar(f.nombre)}|${f.precio}|${f.costo}`
      let g = grupos.get(llave)
      if (!g) {
        g = {
          producto: {
            id: crypto.randomUUID(),
            nombre: f.nombre.trim(),
            categoria: f.categoria.trim() || null,
            precio: f.precio,
            costo: f.costo,
            publicado: publicar,
          },
          tallas: new Map(),
        }
        grupos.set(llave, g)
      }
      const talla = f.talla.trim() || 'Única'
      g.tallas.set(talla, (g.tallas.get(talla) ?? 0) + f.cantidad)
    }
    const productos = [...grupos.values()].map((g) => g.producto)
    const variantes = [...grupos.values()].flatMap((g) =>
      [...g.tallas.entries()].map(([talla, stock]) => ({ producto_id: g.producto.id, talla, color: '', stock })),
    )
    try {
      for (let i = 0; i < productos.length; i += 100) {
        datos(await supabase.from('productos').insert(productos.slice(i, i + 100)))
      }
      for (let i = 0; i < variantes.length; i += 200) {
        datos(await supabase.from('variantes').insert(variantes.slice(i, i + 200)))
      }
      avisar(`${productos.length} productos importados`)
      navegar('/productos')
    } catch (e) {
      setError('Error al importar: ' + mensajeError(e) + '. Revisa en Productos qué alcanzó a entrar.')
    }
  }

  return (
    <div className="pagina formulario">
      <div className="titulo-pagina">
        <Link to="/productos" className="btn-icono" aria-label="Volver">
          <Icono nombre="atras" />
        </Link>
        <h1>Importar desde Excel</h1>
      </div>

      <section className="tarjeta">
        <h2>1. Copia tu lista</h2>
        <ol className="pasos">
          <li>
            En Excel o Google Sheets selecciona las filas de productos, desde la columna del nombre hasta la del precio.
          </li>
          <li>Copia (Ctrl + C) y pégalas aquí abajo (Ctrl + V).</li>
        </ol>
        <textarea
          rows={6}
          placeholder={'CAMISETA NIKE AF1 TALLA S\t110.000\nGORRA COLUMBIA VERDE PANA\t100.000'}
          value={texto}
          onChange={(e) => cargarTexto(e.target.value)}
          aria-label="Filas pegadas"
          className="area-pegar"
        />
        <label className="btn btn-sm subir-csv">
          <Icono nombre="compartir" tam={16} /> O sube un archivo CSV
          <input type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => void leerArchivo(e.target.files?.[0])} />
        </label>
        <p className="sutil">
          Tip: si la talla está en el nombre (“CAMISETA NIKE TALLA S”), la app la separa sola. Si tienes una columna
          con el costo, inclúyela para poder calcular la ganancia.
        </p>
      </section>

      {cols && tabla.length > 0 && (
        <section className="tarjeta">
          <h2>2. ¿Qué hay en cada columna?</h2>
          <p className="sutil">
            {tabla.length} filas leídas. Primera fila: {tabla[0].filter(Boolean).slice(0, 4).join(' · ')}
          </p>
          <div className="dos-columnas">
            {(
              [
                ['nombre', 'Nombre del producto'],
                ['precio', 'Precio de venta'],
                ['costo', 'Costo (opcional)'],
                ['cantidad', 'Cantidad (opcional)'],
              ] as const
            ).map(([k, etiqueta]) => (
              <label key={k} className="campo">
                <span>{etiqueta}</span>
                <select
                  value={cols[k]}
                  onChange={(e) => {
                    setCols({ ...cols, [k]: Number(e.target.value) })
                    setFilas(null)
                  }}
                >
                  {(k === 'costo' || k === 'cantidad' || k === 'precio') && <option value={-1}>No tengo</option>}
                  {Array.from({ length: ancho }, (_, i) => {
                    const ejemplo = tabla.find((f) => f[i])?.[i] ?? ''
                    return (
                      <option key={i} value={i}>
                        Columna {letra(i)}
                        {ejemplo ? ` (ej: ${ejemplo.slice(0, 24)})` : ' (vacía)'}
                      </option>
                    )
                  })}
                </select>
              </label>
            ))}
          </div>
          <label className="interruptor">
            <input type="checkbox" checked={saltarPrimera} onChange={(e) => (setSaltarPrimera(e.target.checked), setFilas(null))} />
            <span>La primera fila son títulos (no es un producto)</span>
          </label>
          <label className="interruptor">
            <input type="checkbox" checked={formatear} onChange={(e) => (setFormatear(e.target.checked), setFilas(null))} />
            <span>Pasar nombres de MAYÚSCULAS a formato normal</span>
          </label>
          <label className="interruptor">
            <input type="checkbox" checked={unirIguales} onChange={(e) => (setUnirIguales(e.target.checked), setFilas(null))} />
            <span>Juntar filas repetidas como varias unidades</span>
          </label>
          <BotonAccion className="btn btn-primario" onClick={async () => revisar()}>
            Revisar productos
          </BotonAccion>
        </section>
      )}

      {filas && filas.length > 0 && (
        <section className="tarjeta">
          <div className="seccion-cabeza">
            <h2>3. Revisa antes de importar</h2>
            <span className="sutil">
              {elegidas.length} de {filas.length}
            </span>
          </div>
          <p className="sutil">
            Desmarca lo que ya se vendió. Lo que esté separado, impórtalo y luego créale el apartado en{' '}
            <em>Apartados → Nuevo</em>.
          </p>
          <ul className="lista-importar">
            {filas.map((f) => (
              <li key={f.clave} className={f.incluir ? '' : 'excluida'}>
                <label className="importar-check">
                  <input
                    type="checkbox"
                    checked={f.incluir}
                    onChange={(e) => cambiar(f.clave, { incluir: e.target.checked })}
                    aria-label={`Importar ${f.nombre}`}
                  />
                </label>
                <div className="importar-campos">
                  <input
                    aria-label="Nombre"
                    value={f.nombre}
                    onChange={(e) => cambiar(f.clave, { nombre: e.target.value })}
                  />
                  <div className="importar-fila">
                    <input
                      aria-label="Talla"
                      placeholder="Talla"
                      value={f.talla}
                      onChange={(e) => cambiar(f.clave, { talla: e.target.value })}
                    />
                    <input
                      aria-label="Categoría"
                      placeholder="Categoría"
                      value={f.categoria}
                      onChange={(e) => cambiar(f.clave, { categoria: e.target.value })}
                    />
                    <input
                      aria-label="Cantidad"
                      inputMode="numeric"
                      value={String(f.cantidad)}
                      onChange={(e) =>
                        cambiar(f.clave, { cantidad: Math.max(1, Number(e.target.value.replace(/\D/g, '') || 1)) })
                      }
                    />
                  </div>
                  <div className="importar-fila importar-precios">
                    <label>
                      <span className="sutil">Precio</span>
                      <CampoPesos valor={f.precio} onChange={(n) => cambiar(f.clave, { precio: n })} />
                    </label>
                    <label>
                      <span className="sutil">Costo</span>
                      <CampoPesos valor={f.costo} onChange={(n) => cambiar(f.clave, { costo: n })} />
                    </label>
                  </div>
                  {yaExiste(f) && <span className="etiqueta etiqueta-aviso">Ya existe en la app</span>}
                </div>
              </li>
            ))}
          </ul>

          <div className="resumen-apartado">
            <div className="fila-total">
              <span>Productos</span>
              <span>{elegidas.length}</span>
            </div>
            <div className="fila-total">
              <span>Unidades</span>
              <span>{unidades}</span>
            </div>
            <div className="fila-total fuerte">
              <span>Valor a precio de venta</span>
              <span>{cop(valor)}</span>
            </div>
          </div>
          {sinPrecio > 0 && (
            <div className="alerta-linea">
              <Icono nombre="alerta" /> {sinPrecio} sin precio de venta
            </div>
          )}
          {sinCosto > 0 && (
            <div className="alerta-linea">
              <Icono nombre="alerta" /> {sinCosto} sin costo: la ganancia de esas prendas no se podrá calcular hasta que
              le pongas el costo (puedes hacerlo después en cada producto).
            </div>
          )}
          <label className="interruptor">
            <input type="checkbox" checked={publicar} onChange={(e) => setPublicar(e.target.checked)} />
            <span>Mostrar ya en el catálogo público (mejor actívalo cuando tengan foto)</span>
          </label>
          {error && <CajaError mensaje={error} />}
          <BotonAccion className="btn btn-primario btn-bloque" onClick={importar} disabled={elegidas.length === 0}>
            Importar {elegidas.length} productos
          </BotonAccion>
        </section>
      )}

      {error && !filas?.length && <CajaError mensaje={error} />}
    </div>
  )
}
