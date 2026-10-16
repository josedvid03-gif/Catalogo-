-- =====================================================================
--  Actualización 04: varios WhatsApp (asesores) y registro de mensajes
--  Pega este archivo en Supabase → SQL Editor → New query → Run.
--  Se puede ejecutar varias veces sin perder datos.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Asesores de WhatsApp y registro de mensajes del catálogo
-- ---------------------------------------------------------------------
create table if not exists public.asesores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(trim(nombre)) > 0),
  whatsapp   text not null check (length(regexp_replace(whatsapp, '\D', '', 'g')) >= 7),
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cada vez que un cliente toca un botón de WhatsApp en el catálogo.
create table if not exists public.contactos (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  tipo              text not null check (tipo in ('pedido', 'pregunta', 'general')),
  asesor_id         uuid references public.asesores(id) on delete set null,
  asesor_nombre     text,
  whatsapp_destino  text,
  mensaje           text,
  producto_id       uuid references public.productos(id) on delete set null,
  producto_nombre   text,
  total             integer,
  cliente_nombre    text,
  cliente_celular   text,
  cliente_cedula    text,
  cliente_ciudad    text,
  cliente_direccion text,
  entrega           text,
  estado            text not null default 'nuevo'
                    check (estado in ('nuevo', 'atendido', 'vendido', 'descartado')),
  nota              text,
  atendido_por      text,
  actualizado_at    timestamptz
);
create index if not exists contactos_fecha_idx on public.contactos(created_at desc);
create index if not exists contactos_estado_idx on public.contactos(estado);

-- El catálogo (público) registra el contacto; no puede leer ni cambiar nada.
create or replace function public.registrar_contacto(p jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_asesor public.asesores%rowtype;
  v_tipo text := p ->> 'tipo';
  v_producto uuid;
begin
  if v_tipo not in ('pedido', 'pregunta', 'general') then
    return;
  end if;
  -- Freno básico contra abuso: máximo 120 registros por minuto.
  if (select count(*) from public.contactos where created_at > now() - interval '1 minute') > 120 then
    return;
  end if;
  if (p ->> 'asesor_id') ~ '^[0-9a-f-]{36}$' then
    select * into v_asesor from public.asesores where id = (p ->> 'asesor_id')::uuid and activo;
  end if;
  if (p ->> 'producto_id') ~ '^[0-9a-f-]{36}$' then
    select id into v_producto from public.productos where id = (p ->> 'producto_id')::uuid;
  end if;
  insert into public.contactos (
    tipo, asesor_id, asesor_nombre, whatsapp_destino, mensaje, producto_id, producto_nombre, total,
    cliente_nombre, cliente_celular, cliente_cedula, cliente_ciudad, cliente_direccion, entrega
  ) values (
    v_tipo,
    v_asesor.id,
    v_asesor.nombre,
    coalesce(v_asesor.whatsapp, (select whatsapp from public.ajustes where id = 1)),
    left(p ->> 'mensaje', 3000),
    v_producto,
    left(p ->> 'producto_nombre', 200),
    case when (p ->> 'total') ~ '^\d{1,10}$' then (p ->> 'total')::int end,
    left(p ->> 'cliente_nombre', 120),
    left(p ->> 'cliente_celular', 40),
    left(p ->> 'cliente_cedula', 30),
    left(p ->> 'cliente_ciudad', 80),
    left(p ->> 'cliente_direccion', 300),
    case when p ->> 'entrega' in ('envio', 'recoger') then p ->> 'entrega' end
  );
end;
$$;

-- Catálogo público: fotos, precios, rebajas y tallas disponibles.
-- Nunca expone costos ni datos de clientes.
create or replace function public.catalogo_publico()
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object(
    'tienda', (
      select json_build_object('nombre', nombre_tienda, 'whatsapp', whatsapp, 'instagram', instagram,
                               'eslogan', eslogan, 'info', info_catalogo,
                               'pago', json_build_object('nequi', pago_nequi, 'titular', pago_titular,
                                                         'qr', pago_qr, 'otros', pago_otros))
      from public.ajustes where id = 1
    ),
    'asesores', coalesce((
      select json_agg(json_build_object('id', a.id, 'nombre', a.nombre, 'whatsapp', a.whatsapp) order by a.created_at)
      from public.asesores a where a.activo
    ), '[]'::json),
    'productos', coalesce((
      select json_agg(x order by x.created_at desc)
      from (
        select p.id, p.nombre, p.descripcion, p.categoria, p.marca, p.precio, p.precio_antes,
               p.fotos, p.created_at,
               (
                 select json_agg(json_build_object('id', i.id, 'talla', i.talla, 'color', i.color,
                                                   'disponible', i.disponible)
                                 order by i.color, i.talla)
                 from public.inventario i
                 where i.producto_id = p.id and i.disponible > 0
               ) as variantes
        from public.productos p
        where p.activo and p.publicado
          and exists (select 1 from public.inventario i where i.producto_id = p.id and i.disponible > 0)
      ) x
    ), '[]'::json)
  );
$$;

alter table public.asesores  enable row level security;
alter table public.contactos enable row level security;
drop policy if exists "solo equipo" on public.asesores;
create policy "solo equipo" on public.asesores for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());
drop policy if exists "solo equipo" on public.contactos;
create policy "solo equipo" on public.contactos for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());
revoke all on public.asesores, public.contactos from anon;
grant select, insert, update, delete on public.asesores, public.contactos to authenticated;

revoke execute on function public.registrar_contacto(jsonb) from public;
grant execute on function public.registrar_contacto(jsonb) to anon, authenticated;
grant execute on function public.catalogo_publico() to anon, authenticated;
