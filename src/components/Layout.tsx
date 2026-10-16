import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { useAjustes } from '../lib/sesion'
import { Icono, type NombreIcono } from './Icono'

interface Seccion {
  a: string
  nombre: string
  icono: NombreIcono
}

/** Barra de abajo en el celular. */
const INFERIOR: Seccion[] = [
  { a: '/', nombre: 'Inicio', icono: 'inicio' },
  { a: '/productos', nombre: 'Productos', icono: 'prendas' },
  { a: '/vender', nombre: 'Vender', icono: 'vender' },
  { a: '/apartados', nombre: 'Apartados', icono: 'apartados' },
  { a: '/mas', nombre: 'Más', icono: 'menu' },
]

/** Todo lo que está en "Más". */
export const SECCIONES_MAS: (Seccion & { detalle: string })[] = [
  { a: '/ventas', nombre: 'Ventas', icono: 'ventas', detalle: 'Historial y anulaciones' },
  { a: '/caja', nombre: 'Caja y gastos', icono: 'billetera', detalle: 'Cierre del día y gastos' },
  { a: '/clientes', nombre: 'Clientes', icono: 'clientes', detalle: 'Historial y avisos por talla' },
  { a: '/inversores', nombre: 'Inversores', icono: 'inversores', detalle: 'Pagos, plazos y rentabilidad' },
  { a: '/reportes', nombre: 'Reportes', icono: 'grafica', detalle: 'Ventas por mes y marcas' },
  { a: '/exportar', nombre: 'Exportar a Excel', icono: 'descargar', detalle: 'Copia de seguridad' },
  { a: '/ajustes', nombre: 'Ajustes', icono: 'ajustes', detalle: 'Tienda, catálogo y equipo' },
]

/** Barra de arriba en el computador. */
const SUPERIOR: Seccion[] = [
  ...INFERIOR.slice(0, 4),
  { a: '/ventas', nombre: 'Ventas', icono: 'ventas' },
  { a: '/caja', nombre: 'Caja', icono: 'billetera' },
  { a: '/clientes', nombre: 'Clientes', icono: 'clientes' },
  { a: '/mas', nombre: 'Más', icono: 'menu' },
]

export function Layout() {
  const ajustes = useAjustes()
  const { pathname } = useLocation()
  // "Más" queda marcado también cuando se está en una de sus secciones.
  const enMas = SECCIONES_MAS.some((s) => pathname.startsWith(s.a))
  return (
    <div className="app">
      <header className="cabecera">
        <Link to="/" className="marca">
          <img src="/logo-128.png" alt="" className="marca-logo" width="34" height="34" />
          <span>{ajustes.nombre_tienda}</span>
        </Link>
        <nav className="nav-superior" aria-label="Secciones">
          {SUPERIOR.map((s) => (
            <NavLink
              key={s.a}
              to={s.a}
              end={s.a === '/'}
              className={({ isActive }) =>
                isActive || (s.a === '/mas' && enMas && !SUPERIOR.some((x) => x.a !== '/mas' && pathname.startsWith(x.a)))
                  ? 'active'
                  : ''
              }
            >
              <Icono nombre={s.icono} />
              <span>{s.nombre}</span>
            </NavLink>
          ))}
        </nav>
        <a href="/catalogo" target="_blank" rel="noreferrer" className="btn btn-sm btn-catalogo">
          <Icono nombre="ojo" tam={16} /> Catálogo
        </a>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
      <nav className="nav-inferior" aria-label="Secciones">
        {INFERIOR.map((s) => (
          <NavLink
            key={s.a}
            to={s.a}
            end={s.a === '/'}
            className={({ isActive }) => (isActive || (s.a === '/mas' && enMas) ? 'active' : '')}
          >
            <Icono nombre={s.icono} tam={22} />
            <span>{s.nombre}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function Mas() {
  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Más</h1>
      </div>
      <ul className="menu-mas">
        {SECCIONES_MAS.map((s) => (
          <li key={s.a}>
            <Link to={s.a}>
              <span className="menu-mas-icono">
                <Icono nombre={s.icono} tam={22} />
              </span>
              <span className="resultado-texto">
                <strong>{s.nombre}</strong>
                <span className="sutil">{s.detalle}</span>
              </span>
              <Icono nombre="adelante" tam={18} className="sutil" />
            </Link>
          </li>
        ))}
        <li>
          <a href="/catalogo" target="_blank" rel="noreferrer">
            <span className="menu-mas-icono">
              <Icono nombre="ojo" tam={22} />
            </span>
            <span className="resultado-texto">
              <strong>Ver catálogo de clientes</strong>
              <span className="sutil">Lo que ven tus clientes</span>
            </span>
            <Icono nombre="adelante" tam={18} className="sutil" />
          </a>
        </li>
      </ul>
    </div>
  )
}
