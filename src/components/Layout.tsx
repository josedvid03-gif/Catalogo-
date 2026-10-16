import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAjustes } from '../lib/sesion'
import { Icono, type NombreIcono } from './Icono'

const SECCIONES: { a: string; nombre: string; icono: NombreIcono }[] = [
  { a: '/', nombre: 'Inicio', icono: 'inicio' },
  { a: '/productos', nombre: 'Productos', icono: 'prendas' },
  { a: '/vender', nombre: 'Vender', icono: 'vender' },
  { a: '/apartados', nombre: 'Apartados', icono: 'apartados' },
  { a: '/ventas', nombre: 'Ventas', icono: 'ventas' },
]

export function Layout() {
  const ajustes = useAjustes()
  return (
    <div className="app">
      <header className="cabecera">
        <Link to="/" className="marca">
          <Icono nombre="tienda" />
          <span>{ajustes.nombre_tienda}</span>
        </Link>
        <nav className="nav-superior" aria-label="Secciones">
          {SECCIONES.map((s) => (
            <NavLink key={s.a} to={s.a} end={s.a === '/'}>
              <Icono nombre={s.icono} />
              <span>{s.nombre}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink to="/inversores" className="btn-icono enlace-ajustes" aria-label="Inversores">
          <Icono nombre="inversores" />
          <span className="solo-escritorio">Inversores</span>
        </NavLink>
        <NavLink to="/ajustes" className="btn-icono enlace-ajustes" aria-label="Ajustes">
          <Icono nombre="ajustes" />
          <span className="solo-escritorio">Ajustes</span>
        </NavLink>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
      <nav className="nav-inferior" aria-label="Secciones">
        {SECCIONES.map((s) => (
          <NavLink key={s.a} to={s.a} end={s.a === '/'}>
            <Icono nombre={s.icono} tam={22} />
            <span>{s.nombre}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
