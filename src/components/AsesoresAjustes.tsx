import { useState } from 'react'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { BotonAccion, CajaError } from './Comunes'
import { Icono } from './Icono'

interface Asesor {
  id: string
  nombre: string
  whatsapp: string
  activo: boolean
}

/** Números de WhatsApp de los asesores que atienden el catálogo. */
export function AsesoresAjustes() {
  const avisar = useAvisar()
  const [nombre, setNombre] = useState('')
  const [numero, setNumero] = useState('')
  const lista = useCarga(
    async () => datos(await supabase.from('asesores').select('*').order('created_at')) as Asesor[],
    [],
    { alVolver: false },
  )

  const agregar = async () => {
    if (!nombre.trim()) return avisar('Escribe el nombre del asesor', 'error')
    if (numero.replace(/\D/g, '').length < 7) return avisar('Escribe un número de WhatsApp válido', 'error')
    try {
      datos(await supabase.from('asesores').insert({ nombre: nombre.trim(), whatsapp: numero.trim() }))
      setNombre('')
      setNumero('')
      avisar('Asesor agregado')
      await lista.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const cambiar = async (a: Asesor, cambios: Partial<Asesor>) => {
    try {
      datos(await supabase.from('asesores').update(cambios).eq('id', a.id))
      await lista.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const quitar = async (a: Asesor) => {
    if (!confirm(`¿Quitar a ${a.nombre}? Sus mensajes registrados se conservan.`)) return
    try {
      datos(await supabase.from('asesores').delete().eq('id', a.id))
      await lista.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  return (
    <section className="tarjeta">
      <h2>WhatsApp de asesores</h2>
      <p className="sutil">
        Si agregas asesores, a cada cliente del catálogo le toca uno al azar y siempre le escribe al mismo. Todo queda
        registrado en <strong>Más → Mensajes</strong>. Sin asesores, todo llega al WhatsApp de la tienda.
      </p>
      {lista.error ? (
        <CajaError mensaje={lista.error} />
      ) : (
        <ul className="lista-equipo">
          {(lista.data ?? []).map((a) => (
            <li key={a.id} className={a.activo ? '' : 'inactivo'}>
              <span className="historial-texto">
                <strong>{a.nombre}</strong>
                <span className="sutil">
                  {a.whatsapp}
                  {!a.activo && ' · pausado'}
                </span>
              </span>
              <label className="interruptor interruptor-sm" title="Recibe clientes nuevos">
                <input type="checkbox" checked={a.activo} onChange={(e) => void cambiar(a, { activo: e.target.checked })} />
                <span>Activo</span>
              </label>
              <button className="btn-icono" aria-label={`Quitar ${a.nombre}`} onClick={() => void quitar(a)}>
                <Icono nombre="basura" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="dos-columnas">
        <label className="campo">
          <span>Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: María" />
        </label>
        <label className="campo">
          <span>WhatsApp</span>
          <input
            type="tel"
            inputMode="tel"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="300 123 4567"
          />
        </label>
      </div>
      <BotonAccion className="btn" onClick={agregar}>
        <Icono nombre="mas" tam={16} /> Agregar asesor
      </BotonAccion>
    </section>
  )
}
