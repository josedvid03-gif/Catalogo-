import { Link } from 'react-router-dom'
import { urlFoto } from '../../lib/supabase'
import { Icono } from '../../components/Icono'
import { useCatalogo } from './datos'

/** Fotos de campaña (lookbook) en el inicio: se deslizan de lado y cada una puede llevar a prendas. */
export function Campana() {
  const { tienda } = useCatalogo()
  const fotos = (tienda?.campana ?? []).filter((f) => f.foto)
  if (!fotos.length) return null
  return (
    <section className="cat-campana" aria-label="La campaña">
      <div className="cat-campana-cabeza">
        <h2>La campaña</h2>
        {fotos.length > 1 && <span className="sutil">Desliza →</span>}
      </div>
      <div className="cat-campana-fila">
        {fotos.map((f, i) => {
          const contenido = (
            <>
              <img src={urlFoto(f.foto)} alt={f.titulo || `Campaña ${i + 1}`} loading={i ? 'lazy' : 'eager'} />
              {(f.titulo || f.enlace) && (
                <span className="cat-campana-pie">
                  <span>{f.titulo}</span>
                  {f.enlace && (
                    <span className="cat-campana-ver">
                      Ver <Icono nombre="adelante" tam={14} />
                    </span>
                  )}
                </span>
              )}
            </>
          )
          return f.enlace ? (
            <Link key={i} to={f.enlace} className="cat-campana-foto">
              {contenido}
            </Link>
          ) : (
            <div key={i} className="cat-campana-foto">
              {contenido}
            </div>
          )
        })}
      </div>
    </section>
  )
}
