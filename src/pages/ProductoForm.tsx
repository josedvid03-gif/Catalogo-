import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, datos, mensajeError, urlFoto } from '../lib/supabase'
import { borrarFotos, subirFoto } from '../lib/imagenes'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { cop, fechaHora, margen, ordenTalla, porcentajeRebaja, varianteTexto } from '../lib/format'
import type { ItemInventario, Producto } from '../lib/types'
import { BotonAccion, CajaError, CampoPesos, Cargando } from '../components/Comunes'
import { Icono } from '../components/Icono'
import { ClientesInteresados } from './Clientes'

interface FilaVariante {
  clave: string
  id?: string
  talla: string
  color: string
  stock: number
  stockOriginal?: number
  tallaOriginal?: string
  colorOriginal?: string
  reservado: number
}

interface Movimiento {
  id: number
  fecha: string
  tipo: string
  cantidad: number
  stock_resultante: number
  nota: string | null
  creado_por: string | null
  variantes: { talla: string; color: string } | null
}

const TALLAS_RAPIDAS = ['XS', 'S', 'M', 'L', 'XL', 'Única']
const NOMBRE_TIPO: Record<string, string> = {
  entrada: 'Entrada',
  ajuste: 'Ajuste',
  venta: 'Venta',
  anulacion: 'Venta anulada',
}

let contador = 0
const nuevaClave = () => `n${++contador}`

export function ProductoForm() {
  const { id: idParam } = useParams()
  const esNuevo = !idParam
  const navegar = useNavigate()
  const avisar = useAvisar()
  const id = useMemo(() => idParam ?? crypto.randomUUID(), [idParam])

  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [costo, setCosto] = useState(0)
  const [precio, setPrecio] = useState(0)
  const [precioAntes, setPrecioAntes] = useState(0)
  const [marca, setMarca] = useState('')
  const [publicado, setPublicado] = useState(true)
  const [activo, setActivo] = useState(true)
  const [fotos, setFotos] = useState<string[]>([])
  const [fotosBorradas, setFotosBorradas] = useState<string[]>([])
  const [subiendo, setSubiendo] = useState(0)
  const [variantes, setVariantes] = useState<FilaVariante[]>([
    { clave: nuevaClave(), talla: '', color: '', stock: 1, reservado: 0 },
  ])
  const [borradas, setBorradas] = useState<FilaVariante[]>([])
  const [error, setError] = useState<string | null>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  const listas = useCarga(async () => {
    const filas = datos(await supabase.from('productos').select('categoria, marca')) as {
      categoria: string | null
      marca: string | null
    }[]
    const unicos = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])].sort()
    return { categorias: unicos(filas.map((f) => f.categoria)), marcas: unicos(filas.map((f) => f.marca)) }
  })

  const carga = useCarga(async () => {
    if (esNuevo) return null
    const [p, inv, movs] = await Promise.all([
      supabase.from('productos').select('*').eq('id', id).single(),
      supabase.from('inventario').select('*').eq('producto_id', id),
      supabase
        .from('movimientos')
        .select('id, fecha, tipo, cantidad, stock_resultante, nota, creado_por, variantes!inner(talla, color, producto_id)')
        .eq('variantes.producto_id', id)
        .order('fecha', { ascending: false })
        .limit(30),
    ])
    return {
      producto: datos(p) as Producto,
      items: datos(inv) as ItemInventario[],
      movimientos: datos(movs) as unknown as Movimiento[],
    }
  }, [id], { alVolver: false })

  // Cargar datos al editar (y cada vez que se recargan).
  const cargado = carga.data
  useEffect(() => {
    if (!cargado) return
    const p = cargado.producto
    setNombre(p.nombre)
    setCategoria(p.categoria ?? '')
    setDescripcion(p.descripcion ?? '')
    setCosto(p.costo)
    setPrecio(p.precio)
    setPrecioAntes(p.precio_antes ?? 0)
    setMarca(p.marca ?? '')
    setPublicado(p.publicado)
    setActivo(p.activo)
    setFotos(p.fotos)
    setFotosBorradas([])
    setBorradas([])
    setVariantes(
      cargado.items
        .sort((a, b) => a.color.localeCompare(b.color) || ordenTalla(a.talla) - ordenTalla(b.talla))
        .map((i) => ({
          clave: i.id,
          id: i.id,
          talla: i.talla,
          color: i.color,
          stock: i.stock,
          stockOriginal: i.stock,
          tallaOriginal: i.talla,
          colorOriginal: i.color,
          reservado: i.reservado,
        })),
    )
  }, [cargado])

  const cambiarVariante = (clave: string, cambios: Partial<FilaVariante>) =>
    setVariantes((vs) => vs.map((v) => (v.clave === clave ? { ...v, ...cambios } : v)))

  const agregarVariante = (talla = '') => {
    setVariantes((vs) => {
      const ultima = vs[vs.length - 1]
      // Si la única fila está vacía, la reutilizamos.
      if (vs.length === 1 && !ultima.id && !ultima.talla && !ultima.color) {
        return [{ ...ultima, talla }]
      }
      return [...vs, { clave: nuevaClave(), talla, color: ultima?.color ?? '', stock: 1, reservado: 0 }]
    })
  }

  const quitarVariante = (v: FilaVariante) => {
    if (v.reservado > 0) {
      avisar(`Esa talla tiene ${v.reservado} unidad(es) apartada(s); no se puede quitar`, 'error')
      return
    }
    setVariantes((vs) => vs.filter((x) => x.clave !== v.clave))
    if (v.id) setBorradas((b) => [...b, v])
  }

  const elegirFotos = async (archivos: FileList | null) => {
    if (!archivos?.length) return
    // Al ponerle la primera foto, la prenda pasa a mostrarse en el catálogo.
    if (fotos.length === 0 && !publicado) {
      setPublicado(true)
      avisar('Se mostrará en el catálogo cuando guardes')
    }
    const lista = [...archivos]
    setSubiendo((n) => n + lista.length)
    for (const archivo of lista) {
      try {
        const ruta = await subirFoto(id, archivo)
        setFotos((f) => [...f, ruta])
      } catch (e) {
        avisar('No se pudo subir una foto: ' + mensajeError(e), 'error')
      } finally {
        setSubiendo((n) => n - 1)
      }
    }
    if (archivoRef.current) archivoRef.current.value = ''
  }

  const quitarFoto = (ruta: string) => {
    setFotos((f) => f.filter((x) => x !== ruta))
    setFotosBorradas((b) => [...b, ruta])
  }

  const hacerPrincipal = (ruta: string) => setFotos((f) => [ruta, ...f.filter((x) => x !== ruta)])

  const guardar = async (e?: FormEvent) => {
    e?.preventDefault()
    setError(null)
    if (!nombre.trim()) return setError('Escribe el nombre del producto')
    if (variantes.length === 0) return setError('Agrega al menos una talla (puede ser "Única")')
    const llaves = variantes.map((v) => `${v.talla.trim().toLowerCase()}|${v.color.trim().toLowerCase()}`)
    if (new Set(llaves).size !== llaves.length) return setError('Hay tallas/colores repetidos')
    if (subiendo > 0) return setError('Espera a que terminen de subir las fotos')

    try {
      const fila = {
        id,
        nombre: nombre.trim(),
        categoria: categoria.trim() || null,
        marca: marca.trim() || null,
        precio_antes: precioAntes > precio ? precioAntes : null,
        descripcion: descripcion.trim() || null,
        costo,
        precio,
        publicado,
        activo,
        fotos,
      }
      const guardarFila = (f: Record<string, unknown>) =>
        esNuevo ? supabase.from('productos').insert(f) : supabase.from('productos').update(f).eq('id', id)
      let r = await guardarFila(fila)
      // Sin la actualización 02 de la base de datos no existen marca ni precio antes.
      if (r.error?.code === 'PGRST204') {
        const { marca: _m, precio_antes: _p, ...basica } = fila
        void _m
        void _p
        r = await guardarFila(basica)
      }
      datos(r)

      for (const v of borradas) {
        datos(await supabase.from('variantes').delete().eq('id', v.id!))
      }
      for (const v of variantes) {
        const talla = v.talla.trim()
        const color = v.color.trim()
        if (!v.id) {
          datos(await supabase.from('variantes').insert({ producto_id: id, talla, color, stock: v.stock }))
          continue
        }
        if (talla !== v.tallaOriginal || color !== v.colorOriginal) {
          datos(await supabase.from('variantes').update({ talla, color }).eq('id', v.id))
        }
        if (v.stock !== v.stockOriginal) {
          datos(
            await supabase.rpc('fijar_stock', { p_variante: v.id, p_esperado: v.stockOriginal, p_nuevo: v.stock }),
          )
        }
      }
      if (fotosBorradas.length) await borrarFotos(fotosBorradas).catch(() => undefined)

      avisar(esNuevo ? 'Producto creado' : 'Cambios guardados')
      if (esNuevo) navegar(`/productos/${id}`, { replace: true })
      else await carga.recargar()
    } catch (e) {
      setError(mensajeError(e))
      if (!esNuevo) await carga.recargar()
    }
  }

  const eliminar = async () => {
    if (!confirm(`¿Eliminar "${nombre}" definitivamente? Las ventas pasadas se conservan.`)) return
    try {
      datos(await supabase.from('productos').delete().eq('id', id))
      await borrarFotos([...fotos, ...fotosBorradas]).catch(() => undefined)
      avisar('Producto eliminado')
      navegar('/productos', { replace: true })
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  if (!esNuevo && carga.error && !carga.data) return <CajaError mensaje={carga.error} reintentar={carga.recargar} />
  if (!esNuevo && !carga.data) return <Cargando />

  const ganancia = precio - costo
  const pct = margen(costo, precio)
  const totalStock = variantes.reduce((s, v) => s + v.stock, 0)

  return (
    <form className="pagina formulario" onSubmit={guardar}>
      <div className="titulo-pagina">
        <Link to="/productos" className="btn-icono" aria-label="Volver">
          <Icono nombre="atras" />
        </Link>
        <h1>{esNuevo ? 'Nuevo producto' : nombre || 'Producto'}</h1>
      </div>

      <section className="tarjeta">
        <h2>Fotos</h2>
        <div className="fotos-editor">
          {fotos.map((ruta, i) => (
            <div key={ruta} className="foto-edit">
              <img src={urlFoto(ruta)} alt={`Foto ${i + 1}`} />
              {i === 0 ? (
                <span className="foto-principal">Principal</span>
              ) : (
                <button type="button" className="foto-btn foto-btn-izq" onClick={() => hacerPrincipal(ruta)}>
                  Hacer principal
                </button>
              )}
              <button type="button" className="foto-btn" aria-label="Quitar foto" onClick={() => quitarFoto(ruta)}>
                <Icono nombre="cerrar" tam={16} />
              </button>
            </div>
          ))}
          {Array.from({ length: subiendo }).map((_, i) => (
            <div key={`s${i}`} className="foto-edit foto-subiendo">
              <span className="spinner" />
            </div>
          ))}
          <button type="button" className="foto-agregar" onClick={() => archivoRef.current?.click()}>
            <Icono nombre="camara" tam={26} />
            <span>Agregar</span>
          </button>
          <input
            ref={archivoRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void elegirFotos(e.target.files)}
          />
        </div>
      </section>

      <section className="tarjeta">
        <h2>Datos</h2>
        <label className="campo">
          <span>Nombre *</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Blusa de lino manga corta" />
        </label>
        <label className="campo">
          <span>Categoría</span>
          <input
            list="categorias"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Ej: Blusas, Jeans, Vestidos"
          />
          <datalist id="categorias">
            {(listas.data?.categorias ?? []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="campo">
          <span>Marca</span>
          <input
            list="marcas"
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
            placeholder={esNuevo ? 'Se detecta sola por el nombre (Nike, Dickies…)' : 'Ej: Nike, Dickies, Columbia'}
          />
          <datalist id="marcas">
            {(listas.data?.marcas ?? []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="campo">
          <span>Descripción (se ve en el catálogo)</span>
          <textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
        <div className="dos-columnas">
          <label className="campo">
            <span>Costo (lo que te costó)</span>
            <CampoPesos valor={costo} onChange={setCosto} />
          </label>
          <label className="campo">
            <span>Precio de venta</span>
            <CampoPesos valor={precio} onChange={setPrecio} />
          </label>
        </div>
        {precio > 0 && (
          <p className={`nota-margen ${ganancia < 0 ? 'tono-mal' : ''}`}>
            Ganas {cop(ganancia)} por prenda{pct !== null && ` (${pct}% de margen)`}
          </p>
        )}
        <label className="campo">
          <span>Precio antes (para mostrar rebaja, opcional)</span>
          <CampoPesos valor={precioAntes} onChange={setPrecioAntes} placeholder="Sin rebaja" />
        </label>
        {precioAntes > 0 && precio > 0 && (
          <p className={precioAntes > precio ? 'nota-margen' : 'texto-error'}>
            {precioAntes > precio
              ? `En el catálogo sale tachado ${cop(precioAntes)} → ${cop(precio)} (-${porcentajeRebaja(precio, precioAntes)}%)`
              : 'El precio antes debe ser mayor que el precio de venta'}
          </p>
        )}
        <label className="interruptor">
          <input type="checkbox" checked={publicado} onChange={(e) => setPublicado(e.target.checked)} />
          <span>Mostrar en el catálogo público</span>
        </label>
      </section>

      <section className="tarjeta">
        <div className="seccion-cabeza">
          <h2>Tallas, colores y stock</h2>
          <span className="sutil">{totalStock} en total</span>
        </div>
        <div className="chips">
          {TALLAS_RAPIDAS.map((t) => (
            <button type="button" key={t} className="chip" onClick={() => agregarVariante(t)}>
              + {t}
            </button>
          ))}
        </div>
        <div className="variantes">
          <div className="variante variante-cabeza" aria-hidden="true">
            <span>Talla</span>
            <span>Color</span>
            <span>Stock</span>
            <span />
          </div>
          {variantes.map((v) => (
            <div key={v.clave} className="variante">
              <input
                aria-label="Talla"
                placeholder="Talla"
                value={v.talla}
                onChange={(e) => cambiarVariante(v.clave, { talla: e.target.value })}
              />
              <input
                aria-label="Color"
                placeholder="Color"
                value={v.color}
                onChange={(e) => cambiarVariante(v.clave, { color: e.target.value })}
              />
              <div className="variante-stock">
                <input
                  aria-label="Stock"
                  inputMode="numeric"
                  value={String(v.stock)}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, '')
                    cambiarVariante(v.clave, { stock: d ? Math.min(Number(d), 99999) : 0 })
                  }}
                />
                {v.reservado > 0 && <span className="sutil">{v.reservado} apart.</span>}
              </div>
              <button
                type="button"
                className="btn-icono"
                aria-label={`Quitar ${varianteTexto(v.talla, v.color) || 'variante'}`}
                onClick={() => quitarVariante(v)}
              >
                <Icono nombre="basura" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-sm" onClick={() => agregarVariante()}>
          <Icono nombre="mas" tam={16} /> Otra talla / color
        </button>
        <p className="sutil">
          El stock es lo que hay físicamente en la tienda, incluyendo lo apartado. Si llega mercancía, súmala aquí.
        </p>
      </section>

      {error && <CajaError mensaje={error} />}

      <div className="barra-guardar">
        <BotonAccion type="button" className="btn btn-primario btn-bloque" onClick={() => guardar()} disabled={subiendo > 0}>
          {esNuevo ? 'Crear producto' : 'Guardar cambios'}
        </BotonAccion>
      </div>

      {!esNuevo && carga.data && (
        <>
          <ClientesInteresados
            productoId={id}
            nombre={nombre}
            precio={precio}
            marca={marca}
            categoria={categoria}
            tallas={carga.data.items.filter((i) => i.disponible > 0).map((i) => i.talla)}
          />

          <section className="tarjeta">
            <h2>Historial de inventario</h2>
            {carga.data.movimientos.length === 0 ? (
              <p className="sutil">Sin movimientos todavía.</p>
            ) : (
              <ul className="historial">
                {carga.data.movimientos.map((m) => (
                  <li key={m.id}>
                    <span className={`cantidad-mov ${m.cantidad > 0 ? 'tono-bien' : 'tono-mal'}`}>
                      {m.cantidad > 0 ? '+' : ''}
                      {m.cantidad}
                    </span>
                    <span className="historial-texto">
                      <strong>
                        {NOMBRE_TIPO[m.tipo] ?? m.tipo}
                        {m.variantes && ` · ${varianteTexto(m.variantes.talla, m.variantes.color) || 'Única'}`}
                      </strong>
                      <span className="sutil">
                        {fechaHora(m.fecha)}
                        {m.nota && ` · ${m.nota}`}
                        {m.creado_por && ` · ${m.creado_por.split('@')[0]}`}
                      </span>
                    </span>
                    <span className="sutil">quedan {m.stock_resultante}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tarjeta zona-peligro">
            <h2>Más opciones</h2>
            <BotonAccion
              className="btn"
              onClick={async () => {
                try {
                  datos(await supabase.from('productos').update({ activo: !activo }).eq('id', id))
                  setActivo(!activo)
                  avisar(activo ? 'Producto archivado' : 'Producto restaurado')
                } catch (e) {
                  avisar(mensajeError(e), 'error')
                }
              }}
            >
              {activo ? 'Archivar (ocultar sin borrar)' : 'Restaurar producto'}
            </BotonAccion>
            <BotonAccion className="btn btn-peligro" onClick={eliminar}>
              <Icono nombre="basura" /> Eliminar
            </BotonAccion>
          </section>
        </>
      )}
    </form>
  )
}
