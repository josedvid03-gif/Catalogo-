import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { configurado } from './lib/supabase'
import { ProveedorSesion, useSesion } from './lib/sesion'
import { ProveedorAvisos } from './lib/aviso'
import { Cargando } from './components/Comunes'
import { Layout, Mas } from './components/Layout'
import { Login, NoAutorizado, SinConfigurar } from './pages/Login'
import { Resumen } from './pages/Resumen'
import { Productos } from './pages/Productos'
import { ProductoForm } from './pages/ProductoForm'
import { Vender } from './pages/Vender'
import { Apartados } from './pages/Apartados'
import { NuevoApartado } from './pages/NuevoApartado'
import { Ventas } from './pages/Ventas'
import { Ajustes } from './pages/Ajustes'
import { Catalogo, MarcoCatalogo } from './pages/catalogo/Catalogo'
import { PrendaPublica } from './pages/catalogo/Prenda'
import { Clientes, ClienteDetalle } from './pages/Clientes'
import { Reportes } from './pages/Reportes'
import { Exportar } from './pages/Exportar'
import { Mensajes } from './pages/Mensajes'
import { Importar } from './pages/Importar'
import { Costos } from './pages/Costos'
import { Inversores } from './pages/Inversores'
import { InversionForm } from './pages/InversionForm'
import { InversionDetalle } from './pages/InversionDetalle'
import { Caja } from './pages/Caja'
import { FotosRapidas } from './pages/FotosRapidas'

function AppPrivada() {
  const { session, cargando, autorizado, salir } = useSesion()
  if (cargando) return <Cargando />
  if (!session) return <Login />
  if (autorizado === null) return <Cargando texto="Verificando acceso…" />
  if (!autorizado) return <NoAutorizado email={session.user.email ?? ''} salir={salir} />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Resumen />} />
        <Route path="productos" element={<Productos />} />
        <Route path="productos/fotos" element={<FotosRapidas />} />
        <Route path="productos/costos" element={<Costos />} />
        <Route path="productos/importar" element={<Importar />} />
        <Route path="productos/nuevo" element={<ProductoForm key="nuevo" />} />
        <Route path="productos/:id" element={<ProductoForm />} />
        <Route path="vender" element={<Vender />} />
        <Route path="apartados" element={<Apartados />} />
        <Route path="apartados/nuevo" element={<NuevoApartado />} />
        <Route path="ventas" element={<Ventas />} />
        <Route path="caja" element={<Caja />} />
        <Route path="inversores" element={<Inversores />} />
        <Route path="inversores/nueva" element={<InversionForm key="nueva" />} />
        <Route path="inversores/:id" element={<InversionDetalle />} />
        <Route path="inversores/:id/editar" element={<InversionForm />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="clientes/:id" element={<ClienteDetalle />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="exportar" element={<Exportar />} />
        <Route path="mas" element={<Mas />} />
        <Route path="mensajes" element={<Mensajes />} />
        <Route path="ajustes" element={<Ajustes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  if (!configurado) return <SinConfigurar />
  return (
    <BrowserRouter>
      <ProveedorAvisos>
        <Routes>
          <Route path="/catalogo" element={<MarcoCatalogo />}>
            <Route index element={<Catalogo />} />
            <Route path="p/:id" element={<PrendaPublica />} />
          </Route>
          <Route
            path="/*"
            element={
              <ProveedorSesion>
                <AppPrivada />
              </ProveedorSesion>
            }
          />
        </Routes>
      </ProveedorAvisos>
    </BrowserRouter>
  )
}
