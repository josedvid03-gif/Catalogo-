import { useCallback, useMemo, useState } from 'react'
import { supabase, datos, urlFoto } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { cop, enlaceWhatsapp, ordenTalla } from '../lib/format'
import { CajaError, Cargando, Foto, Hoja, Vacio } from '../components/Comunes'
import { Icono } from '../components/Icono'

interface ProductoCatalogo {
  id: string
  nombre: string
  descripcion: string | null
  categoria: string | null
  precio: number
  fotos: string[]
  variantes: { talla: string; color: string }[]
}

interface DatosCatalogo {
  tienda: { nombre: string; whatsapp: string | null; instagram: string | null }
  productos: ProductoCatalogo[]
}

function tallas(p: ProductoCatalogo) {
  return [...new Set(p.variantes.map((v) => v.talla).filter(Boolean))].sort((a, b) => ordenTalla(a) - ordenTalla(b))
}
function colores(p: ProductoCatalogo) {
  return [...new Set(p.variantes.map((v) => v.color).filter(Boolean))]
}

export function Catalogo() {
  const [categoria, setCategoria] = useState('')
  const [abierto, setAbierto] = useState<ProductoCatalogo | null>(null)
  const [fotoIdx, setFotoIdx] = useState(0)
  const carga = useCarga(async () => datos(await supabase.rpc('catalogo_publico')) as DatosCatalogo)

  const productos = carga.data?.productos ?? []
  const tienda = carga.data?.tienda
  const categorias = useMemo(
    () => [...new Set(productos.map((p) => p.categoria).filter(Boolean) as string[])].sort(),
    [productos],
  )
  const visibles = categoria ? productos.filter((p) => p.categoria === categoria) : productos
  const cerrar = useCallback(() => setAbierto(null), [])

  if (tienda?.nombre) document.title = tienda.nombre

  return (
    <div className="catalogo">
      <header className="catalogo-cabeza">
        <h1>{tienda?.nombre ?? 'Catálogo'}</h1>
        <div className="catalogo-redes">
          {tienda?.whatsapp && (
            <a
              className="btn btn-sm"
              href={enlaceWhatsapp(tienda.whatsapp, `Hola ${tienda.nombre}, vi su catálogo y quisiera más información.`)}
              target="_blank"
              rel="noreferrer"
            >
              <Icono nombre="chat" tam={16} /> WhatsApp
            </a>
          )}
          {tienda?.instagram && (
            <a
              className="btn btn-sm"
              href={`https://instagram.com/${tienda.instagram}`}
              target="_blank"
              rel="noreferrer"
            >
              @{tienda.instagram}
            </a>
          )}
        </div>
      </header>

      {categorias.length > 1 && (
        <nav className="chips catalogo-categorias" aria-label="Categorías">
          <button className={`chip ${!categoria ? 'chip-activo' : ''}`} onClick={() => setCategoria('')}>
            Todo
          </button>
          {categorias.map((c) => (
            <button key={c} className={`chip ${categoria === c ? 'chip-activo' : ''}`} onClick={() => setCategoria(c)}>
              {c}
            </button>
          ))}
        </nav>
      )}

      <main className="catalogo-cuerpo">
        {carga.error && <CajaError mensaje={carga.error} reintentar={carga.recargar} />}
        {carga.cargando && !carga.data && <Cargando />}
        {carga.data && visibles.length === 0 && <Vacio icono="prendas">Pronto tendremos prendas nuevas.</Vacio>}
        <div className="rejilla-catalogo">
          {visibles.map((p) => (
            <button
              key={p.id}
              className="tarjeta-catalogo"
              onClick={() => {
                setFotoIdx(0)
                setAbierto(p)
              }}
            >
              <Foto ruta={p.fotos[0]} alt={p.nombre} className="foto-catalogo" />
              <span className="tarjeta-catalogo-info">
                <span className="nombre-producto">{p.nombre}</span>
                <strong className="precio">{cop(p.precio)}</strong>
                {tallas(p).length > 0 && <span className="sutil">Tallas: {tallas(p).join(', ')}</span>}
              </span>
            </button>
          ))}
        </div>
      </main>

      <Hoja titulo={abierto?.nombre ?? ''} abierta={!!abierto} onCerrar={cerrar}>
        {abierto && (
          <div className="detalle-catalogo">
            {abierto.fotos.length > 0 ? (
              <div className="galeria">
                <img src={urlFoto(abierto.fotos[fotoIdx] ?? abierto.fotos[0])} alt={abierto.nombre} />
                {abierto.fotos.length > 1 && (
                  <div className="miniaturas">
                    {abierto.fotos.map((f, i) => (
                      <button
                        key={f}
                        className={i === fotoIdx ? 'activa' : ''}
                        onClick={() => setFotoIdx(i)}
                        aria-label={`Foto ${i + 1}`}
                      >
                        <img src={urlFoto(f)} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Foto alt={abierto.nombre} className="foto-catalogo" />
            )}
            <p className="precio precio-grande">{cop(abierto.precio)}</p>
            {abierto.descripcion && <p>{abierto.descripcion}</p>}
            {tallas(abierto).length > 0 && (
              <p>
                <strong>Tallas disponibles:</strong> {tallas(abierto).join(', ')}
              </p>
            )}
            {colores(abierto).length > 0 && (
              <p>
                <strong>Colores:</strong> {colores(abierto).join(', ')}
              </p>
            )}
            {tienda?.whatsapp && (
              <a
                className="btn btn-primario btn-bloque"
                href={enlaceWhatsapp(
                  tienda.whatsapp,
                  `Hola, me interesa: ${abierto.nombre} (${cop(abierto.precio)}). ¿Está disponible en talla/color: ?`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                <Icono nombre="chat" /> Pedir por WhatsApp
              </a>
            )}
          </div>
        )}
      </Hoja>
    </div>
  )
}
