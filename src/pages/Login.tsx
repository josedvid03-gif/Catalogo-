import { useState, type FormEvent } from 'react'
import { supabase, mensajeError } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave })
    setOcupado(false)
    if (error) {
      setError(
        error.message.includes('Invalid login credentials')
          ? 'Correo o contraseña incorrectos'
          : mensajeError(error),
      )
    }
  }

  return (
    <div className="pantalla-centro">
      <form className="tarjeta login" onSubmit={entrar}>
        <img src="/logo.png" alt="Alma Fuerte" className="login-logo" width="112" height="112" />
        <h1>Inventario de la tienda</h1>
        <label className="campo">
          <span>Correo</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="campo">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
        </label>
        {error && <p className="texto-error">{error}</p>}
        <button className="btn btn-primario btn-bloque" disabled={ocupado}>
          {ocupado ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

export function NoAutorizado({ email, salir }: { email: string; salir: () => void }) {
  return (
    <div className="pantalla-centro">
      <div className="tarjeta login">
        <h1>Sin acceso</h1>
        <p>
          El correo <strong>{email}</strong> no está en el equipo de la tienda. Pide al dueño que lo agregue en{' '}
          <em>Ajustes → Equipo</em>.
        </p>
        <button className="btn btn-bloque" onClick={salir}>
          Salir
        </button>
      </div>
    </div>
  )
}

export function SinConfigurar() {
  return (
    <div className="pantalla-centro">
      <div className="tarjeta login">
        <h1>Falta configurar</h1>
        <p>
          La app no tiene los datos de Supabase. Define <code>VITE_SUPABASE_URL</code> y{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (ver README).
        </p>
      </div>
    </div>
  )
}
