import { enlaceWhatsapp } from '../../lib/format'
import type { TablaTallas } from '../../lib/types'
import { Hoja } from '../../components/Comunes'
import { Icono } from '../../components/Icono'
import { useCatalogo } from './datos'

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Tablas de la guía que aplican a una categoría (si ninguna aplica, todas). */
export function tablasPara(guia: TablaTallas[] | undefined, categoria: string | null): TablaTallas[] {
  const llenas = (guia ?? []).filter((t) => t.filas.length > 0)
  if (!categoria) return llenas
  const cat = normalizar(categoria)
  const aplican = llenas.filter((t) => {
    const lista = t.categorias.split(',').map(normalizar).filter(Boolean)
    return lista.length === 0 || lista.some((c) => c === cat || cat.includes(c) || c.includes(cat))
  })
  return aplican.length ? aplican : llenas
}

/* ------------------------------------------------------------------ */
/*  Guía de tallas                                                     */
/* ------------------------------------------------------------------ */

export function GuiaTallas({ categoria, abierta, onCerrar }: { categoria: string | null; abierta: boolean; onCerrar: () => void }) {
  const { tienda, registrar } = useCatalogo()
  const tablas = tablasPara(tienda?.guia_tallas, categoria)
  const pregunta = `Hola 👋 ¿Me ayudan a escoger mi talla?${categoria ? ` (${categoria})` : ''}`
  return (
    <Hoja titulo="Guía de tallas" abierta={abierta} onCerrar={onCerrar}>
      {tablas.map((t, i) => (
        <section key={i} className="cat-guia">
          {(tablas.length > 1 || t.nombre) && <h3>{t.nombre}</h3>}
          <div className="tabla-scroll">
            <table className="cat-guia-tabla">
              <thead>
                <tr>
                  <th>Talla</th>
                  {t.columnas.map((c, j) => (
                    <th key={j}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.filas.map((f, j) => (
                  <tr key={j}>
                    {f.map((v, k) => (k === 0 ? <th key={k}>{v}</th> : <td key={k}>{v}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <p className="sutil">
        Medidas en centímetros, con la prenda extendida en plano. Tip: mide una prenda tuya que te quede bien y compárala con la
        tabla.
      </p>
      {tienda?.whatsapp && (
        <a
          className="cat-btn cat-btn-contorno-oscuro cat-btn-bloque"
          href={enlaceWhatsapp(tienda.whatsapp, pregunta)}
          onClick={() => registrar({ tipo: 'pregunta', mensaje: pregunta })}
          target="_blank"
          rel="noreferrer"
        >
          <Icono nombre="chat" tam={18} /> ¿Dudas? Te ayudamos por WhatsApp
        </a>
      )}
    </Hoja>
  )
}

/* ------------------------------------------------------------------ */
/*  Envíos, cambios y pagos                                            */
/* ------------------------------------------------------------------ */

/** Bloque "Compra segura" del catálogo (solo con lo que la tienda haya escrito). */
export function InfoCompra({ compacta = false }: { compacta?: boolean }) {
  const { tienda } = useCatalogo()
  if (!tienda) return null
  const bloques = [
    { icono: 'caja' as const, titulo: 'Envíos', texto: tienda.envios },
    { icono: 'check' as const, titulo: 'Cambios', texto: tienda.cambios },
    {
      icono: 'billetera' as const,
      titulo: 'Pagos',
      texto: [tienda.pago?.nequi && 'Nequi', tienda.pago?.otros].filter(Boolean).join(' · ') || null,
    },
  ].filter((b) => b.texto?.trim())
  if (!bloques.length) return null

  if (compacta) {
    return (
      <div className="cat-info-compacta">
        {bloques.map((b) => (
          <details key={b.titulo}>
            <summary>
              <Icono nombre={b.icono} tam={18} /> {b.titulo}
            </summary>
            <p>{b.texto}</p>
          </details>
        ))}
      </div>
    )
  }
  return (
    <section className="cat-compra" aria-label="Información de compra">
      {bloques.map((b) => (
        <div key={b.titulo} className="cat-compra-bloque">
          <Icono nombre={b.icono} tam={26} />
          <h3>{b.titulo}</h3>
          <p>{b.texto}</p>
        </div>
      ))}
    </section>
  )
}
