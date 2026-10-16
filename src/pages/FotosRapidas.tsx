import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, datos, mensajeError, urlFoto } from '../lib/supabase'
import { subirFoto } from '../lib/imagenes'
import { useAvisar } from '../lib/aviso'
import { cop, ordenTalla } from '../lib/format'
import { CajaError, Cargando, Vacio } from '../components/Comunes'
import { Icono } from '../components/Icono'

interface Pendiente {
  id: string
  nombre: string
  precio: number
  categoria: string | null
  fotos: string[]
  publicado: boolean
  tallas: string[]
}

/**
 * Recorre los productos sin foto uno por uno: tomas la foto, se guarda
 * sola y pasas al siguiente. La lista se carga una sola vez para que no
 * cambie al volver de la cámara.
 */
export function FotosRapidas() {
  const avisar = useAvisar()
  const [lista, setLista] = useState<Pendiente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [indice, setIndice] = useState(0)
  const [subiendo, setSubiendo] = useState(0)
  const [publicar, setPublicar] = useState(true)
  const [hechos, setHechos] = useState(0)
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [prods, inv] = await Promise.all([
          supabase
            .from('productos')
            .select('id, nombre, precio, categoria, fotos, publicado')
            .eq('activo', true)
            .eq('fotos', '{}')
            .order('categoria', { nullsFirst: false })
            .order('nombre'),
          supabase.from('inventario').select('producto_id, talla, disponible'),
        ])
        const items = datos(inv) as { producto_id: string; talla: string; disponible: number }[]
        setLista(
          (datos(prods) as Omit<Pendiente, 'tallas'>[]).map((p) => ({
            ...p,
            tallas: items
              .filter((i) => i.producto_id === p.id && i.talla)
              .map((i) => i.talla)
              .sort((a, b) => ordenTalla(a) - ordenTalla(b)),
          })),
        )
      } catch (e) {
        setError(mensajeError(e))
      }
    })()
  }, [])

  if (error) return <CajaError mensaje={error} />
  if (!lista) return <Cargando />

  const actual = lista[indice]

  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length || !actual) return
    const id = actual.id
    setSubiendo((n) => n + archivos.length)
    let fotos = actual.fotos
    for (const archivo of [...archivos]) {
      try {
        const ruta = await subirFoto(id, archivo)
        fotos = [...fotos, ruta]
        const cambios = { fotos, ...(publicar ? { publicado: true } : {}) }
        datos(await supabase.from('productos').update(cambios).eq('id', id))
        setLista((l) => l?.map((p) => (p.id === id ? { ...p, ...cambios } : p)) ?? null)
      } catch (e) {
        avisar('No se pudo subir la foto: ' + mensajeError(e), 'error')
      } finally {
        setSubiendo((n) => n - 1)
      }
    }
    if (camara.current) camara.current.value = ''
    if (galeria.current) galeria.current.value = ''
  }

  const siguiente = () => {
    if (actual?.fotos.length) setHechos((n) => n + 1)
    setIndice((i) => i + 1)
  }

  return (
    <div className="pagina fotos-rapidas">
      <div className="titulo-pagina">
        <Link to="/productos" className="btn-icono" aria-label="Volver">
          <Icono nombre="atras" />
        </Link>
        <h1>Fotos rápidas</h1>
        {actual && (
          <span className="sutil">
            {indice + 1} de {lista.length}
          </span>
        )}
      </div>

      {lista.length === 0 ? (
        <Vacio icono="prendas">Todas las prendas tienen foto. 🎉</Vacio>
      ) : !actual ? (
        <Vacio icono="prendas">
          ¡Listo! Pusiste fotos a {hechos} prenda{hechos === 1 ? '' : 's'}.{' '}
          <Link to="/productos">Volver a productos</Link>
        </Vacio>
      ) : (
        <>
          <div className="plazo-barra" aria-hidden="true">
            <span style={{ width: `${(indice / lista.length) * 100}%` }} />
          </div>

          <section className="tarjeta foto-actual">
            <div>
              <h2 className="foto-actual-nombre">{actual.nombre}</h2>
              <p className="sutil">
                {actual.categoria && `${actual.categoria} · `}
                {cop(actual.precio)}
                {actual.tallas.length > 0 && ` · Talla ${actual.tallas.join(', ')}`}
              </p>
            </div>

            {actual.fotos.length > 0 && (
              <div className="fotos-editor">
                {actual.fotos.map((f, i) => (
                  <div key={f} className="foto-edit">
                    <img src={urlFoto(f)} alt={`Foto ${i + 1}`} />
                    {i === 0 && <span className="foto-principal">Principal</span>}
                  </div>
                ))}
              </div>
            )}
            {subiendo > 0 && <Cargando texto="Subiendo foto…" />}

            <button
              className="btn btn-primario btn-bloque btn-grande"
              onClick={() => camara.current?.click()}
              disabled={subiendo > 0}
            >
              <Icono nombre="camara" tam={24} />
              {actual.fotos.length ? 'Tomar otra foto' : 'Tomar foto'}
            </button>
            <button className="btn btn-bloque" onClick={() => galeria.current?.click()} disabled={subiendo > 0}>
              Elegir de la galería
            </button>
            <input
              ref={camara}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => void subir(e.target.files)}
            />
            <input
              ref={galeria}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => void subir(e.target.files)}
            />
          </section>

          <div className="fila-acciones">
            <Link to={`/productos/${actual.id}`} className="btn btn-sm">
              Abrir producto
            </Link>
            <button className="btn btn-primario" onClick={siguiente} disabled={subiendo > 0}>
              {actual.fotos.length ? 'Siguiente' : 'Saltar'} <Icono nombre="adelante" />
            </button>
          </div>

          <label className="interruptor">
            <input type="checkbox" checked={publicar} onChange={(e) => setPublicar(e.target.checked)} />
            <span>Mostrar en el catálogo al ponerle foto</span>
          </label>
          <p className="sutil">Cada foto se guarda sola, no hace falta presionar "Guardar".</p>
        </>
      )}
    </div>
  )
}
