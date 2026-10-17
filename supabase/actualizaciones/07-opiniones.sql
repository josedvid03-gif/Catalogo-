-- =====================================================================
--  Actualización 07: opiniones de clientes en el catálogo.
--  Pega este archivo en Supabase → SQL Editor → New query → Run.
--  Se puede ejecutar varias veces sin perder datos.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Opiniones de clientes
--    Solo se publican las que el equipo aprueba. "Compra verificada"
--    solo cuando la opinión está ligada a una venta registrada.
-- ---------------------------------------------------------------------

-- Enlace personal que se le envía al cliente después de una venta.
create table if not exists public.invitaciones_resena (
  token      uuid primary key default gen_random_uuid(),
  venta_id   uuid not null references public.ventas(id) on delete cascade,
  nombre     text,
  created_at timestamptz not null default now(),
  usada_at   timestamptz
);
create index if not exists invitaciones_resena_venta_idx on public.invitaciones_resena (venta_id);

create table if not exists public.resenas (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  producto_id uuid references public.productos(id) on delete set null,
  venta_id    uuid references public.ventas(id) on delete set null,
  nombre      text not null check (length(trim(nombre)) > 0),
  estrellas   integer not null check (estrellas between 1 and 5),
  texto       text,
  fotos       text[] not null default '{}',
  estado      text not null default 'pendiente' check (estado in ('pendiente', 'publicada', 'oculta'))
);
create index if not exists resenas_estado_idx on public.resenas (estado);
create index if not exists resenas_producto_idx on public.resenas (producto_id);

-- ¿El enlace sirve todavía? (60 días y una sola opinión por enlace)
create or replace function public.invitacion_vigente(p_token text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.invitaciones_resena i
     where p_token ~ '^[0-9a-f-]{36}$'
       and i.token = p_token::uuid
       and i.usada_at is null
       and i.created_at > now() - interval '60 days'
  );
$$;

-- Lo que ve el cliente al abrir su enlace: su nombre y las prendas que compró.
create or replace function public.ver_invitacion(p_token text)
returns json
language sql stable security definer
set search_path = public
as $$
  select case when not public.invitacion_vigente(p_token) then null else (
    select json_build_object(
      'nombre', i.nombre,
      'tienda', (select nombre_tienda from public.ajustes where id = 1),
      'prendas', coalesce((
        select json_agg(distinct jsonb_build_object('id', p.id, 'nombre', p.nombre, 'foto', p.fotos[1]))
          from public.venta_items vi join public.productos p on p.id = vi.producto_id
         where vi.venta_id = i.venta_id
      ), '[]'::json)
    )
    from public.invitaciones_resena i where i.token = p_token::uuid
  ) end;
$$;

-- El cliente envía su opinión (queda pendiente hasta que el equipo la apruebe).
create or replace function public.enviar_resena(p jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_token    text := p ->> 'token';
  v_inv      public.invitaciones_resena;
  v_producto uuid;
  v_fotos    text[];
begin
  if not public.invitacion_vigente(v_token) then
    raise exception 'Este enlace ya se usó o venció';
  end if;
  select * into v_inv from public.invitaciones_resena where token = v_token::uuid for update;
  if (p ->> 'estrellas') !~ '^[1-5]$' then
    raise exception 'Elige de 1 a 5 estrellas';
  end if;
  -- Solo una prenda de esa misma venta.
  if (p ->> 'producto_id') ~ '^[0-9a-f-]{36}$' then
    select vi.producto_id into v_producto from public.venta_items vi
     where vi.venta_id = v_inv.venta_id and vi.producto_id = (p ->> 'producto_id')::uuid limit 1;
  end if;
  -- Si la venta tiene una sola prenda, la opinión es de esa prenda.
  if v_producto is null then
    select min(vi.producto_id::text)::uuid into v_producto from public.venta_items vi
     where vi.venta_id = v_inv.venta_id and vi.producto_id is not null
    having count(distinct vi.producto_id) = 1;
  end if;
  -- Solo fotos subidas con este mismo enlace (máximo 3).
  select coalesce(array_agg(f), '{}') into v_fotos
    from (
      select f from jsonb_array_elements_text(coalesce(p -> 'fotos', '[]'::jsonb)) f
       where f like 'resenas/' || v_token || '/%'
       limit 3
    ) x;

  insert into public.resenas (producto_id, venta_id, nombre, estrellas, texto, fotos)
  values (
    v_producto,
    v_inv.venta_id,
    coalesce(nullif(left(trim(p ->> 'nombre'), 60), ''), v_inv.nombre, 'Cliente'),
    (p ->> 'estrellas')::int,
    nullif(left(trim(p ->> 'texto'), 1000), ''),
    v_fotos
  );
  update public.invitaciones_resena set usada_at = now() where token = v_inv.token;
end;
$$;

-- El cliente solo puede subir fotos dentro de resenas/<su enlace>/
drop policy if exists "clientes suben fotos de opinion" on storage.objects;
create policy "clientes suben fotos de opinion" on storage.objects for insert to anon
  with check (
    bucket_id = 'productos'
    and (storage.foldername(name))[1] = 'resenas'
    and public.invitacion_vigente((storage.foldername(name))[2])
  );

-- Catálogo público: agrega las opiniones publicadas (nombre corto: "Alberto R.").
create or replace function public.opiniones_publicas()
returns json
language sql stable security definer
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
           'id', r.id,
           'nombre', split_part(trim(r.nombre), ' ', 1)
                     || coalesce(' ' || nullif(left(split_part(trim(r.nombre), ' ', 2), 1), '') || '.', ''),
           'estrellas', r.estrellas,
           'texto', r.texto,
           'fotos', r.fotos,
           'verificada', r.venta_id is not null,
           'producto_id', r.producto_id,
           'fecha', r.created_at
         ) order by r.created_at desc), '[]'::json)
    from (select * from public.resenas where estado = 'publicada' order by created_at desc limit 200) r;
$$;

alter table public.resenas             enable row level security;
alter table public.invitaciones_resena enable row level security;
drop policy if exists "solo equipo" on public.resenas;
create policy "solo equipo" on public.resenas for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());
drop policy if exists "solo equipo" on public.invitaciones_resena;
create policy "solo equipo" on public.invitaciones_resena for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());
revoke all on public.resenas, public.invitaciones_resena from anon;
grant select, insert, update, delete on public.resenas, public.invitaciones_resena to authenticated;

revoke all on function public.invitacion_vigente(text) from public;
revoke all on function public.ver_invitacion(text) from public;
revoke all on function public.enviar_resena(jsonb) from public;
revoke all on function public.opiniones_publicas() from public;
grant execute on function public.invitacion_vigente(text) to anon, authenticated;
grant execute on function public.ver_invitacion(text) to anon, authenticated;
grant execute on function public.enviar_resena(jsonb) to anon, authenticated;
grant execute on function public.opiniones_publicas() to anon, authenticated;

notify pgrst, 'reload schema';
