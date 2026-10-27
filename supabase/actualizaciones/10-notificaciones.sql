-- =====================================================================
--  Actualización 10: notificaciones al celular (ventas y pedidos).
--  Pega este archivo en Supabase → SQL Editor → New query → Run.
--  Se puede ejecutar varias veces sin perder datos.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Notificaciones al celular
--    Cuando se guarda una venta o llega un pedido del catálogo, la base
--    de datos le pide a la página (api/avisar) que envíe la notificación
--    a los celulares que la activaron en Ajustes.
-- ---------------------------------------------------------------------

-- pg_net permite que la base de datos llame a la página. En Supabase ya viene.
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net no está disponible: las notificaciones no se enviarán';
end;
$$;

-- Claves de las notificaciones: se crean solas la primera vez que alguien
-- las activa en Ajustes. Solo el equipo puede verlas.
create table if not exists public.avisos_config (
  id            integer primary key default 1 check (id = 1),
  url_sitio     text not null,
  vapid_publica text not null,
  vapid_privada text not null,
  secreto       text not null,
  created_at    timestamptz not null default now()
);

-- Cada celular que activó las notificaciones.
create table if not exists public.suscripciones_push (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  email      text default (auth.jwt() ->> 'email'),
  ventas     boolean not null default true,
  pedidos    boolean not null default true,
  created_at timestamptz not null default now()
);

-- La página (api/avisar) confirma que el pedido de envío viene de esta base de datos.
create or replace function public.avisos_secreto_valido(p_secreto text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.avisos_config where secreto = p_secreto and length(p_secreto) >= 32);
$$;

-- La página avisa qué celulares ya no existen (se desinstaló la app, etc.).
create or replace function public.quitar_suscripciones(p_secreto text, p_endpoints text[])
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if public.avisos_secreto_valido(p_secreto) then
    delete from public.suscripciones_push where endpoint = any (p_endpoints);
  end if;
end;
$$;

-- Arma la notificación y se la pasa a la página. Nunca bloquea una venta:
-- si algo falla, simplemente no se avisa.
create or replace function public.enviar_aviso(
  p_tipo text, p_titulo text, p_cuerpo text, p_url text,
  p_excluir_email text default null, p_solo_endpoint text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c    public.avisos_config;
  subs jsonb;
begin
  select * into c from public.avisos_config where id = 1;
  if not found then
    return;
  end if;
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
    into subs
    from public.suscripciones_push s
   where (p_solo_endpoint is not null and s.endpoint = p_solo_endpoint)
      or (p_solo_endpoint is null
          and (case p_tipo when 'venta' then s.ventas when 'pedido' then s.pedidos else false end)
          and (p_excluir_email is null or s.email is distinct from p_excluir_email));
  if subs is null then
    return;
  end if;
  perform net.http_post(
    url := c.url_sitio || '/api/avisar',
    body := jsonb_build_object(
      'secreto', c.secreto,
      'vapid', jsonb_build_object('publica', c.vapid_publica, 'privada', c.vapid_privada, 'contacto', c.url_sitio),
      'aviso', jsonb_build_object('titulo', p_titulo, 'cuerpo', p_cuerpo, 'url', p_url, 'tag', p_tipo),
      'suscripciones', subs
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  raise notice 'No se pudo enviar el aviso: %', sqlerrm;
end;
$$;

create or replace function public.pesos_texto(n integer)
returns text
language sql immutable
as $$
  select '$ ' || replace(to_char(coalesce(n, 0), 'FM999,999,999,999'), ',', '.');
$$;

-- Venta guardada (al final de la transacción, cuando ya tiene sus prendas y total).
create or replace function public.aviso_venta()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v       public.ventas;
  prendas text;
  n       integer;
begin
  select * into v from public.ventas where id = new.id;
  if not found or v.anulada then
    return null;
  end if;
  select string_agg(descripcion, ', '), count(*) into prendas, n
    from (select descripcion from public.venta_items where venta_id = v.id order by descripcion limit 3) x;
  if (select count(*) from public.venta_items where venta_id = v.id) > 3 then
    prendas := prendas || '…';
  end if;
  perform public.enviar_aviso(
    'venta',
    'Venta #' || v.numero || ' · ' || public.pesos_texto(v.total),
    concat_ws(' · ', prendas, nullif(trim(v.cliente), ''), 'vendió ' || split_part(coalesce(v.creado_por, 'alguien'), '@', 1)),
    '/ventas',
    v.creado_por
  );
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists aviso_venta on public.ventas;
create constraint trigger aviso_venta
  after insert on public.ventas
  deferrable initially deferred
  for each row execute function public.aviso_venta();

-- Pedido enviado desde el catálogo.
create or replace function public.aviso_pedido()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.enviar_aviso(
    'pedido',
    'Pedido del catálogo' || coalesce(' · ' || public.pesos_texto(new.total), ''),
    concat_ws(' · ', nullif(trim(new.cliente_nombre), ''), nullif(trim(new.cliente_ciudad), ''),
              'para ' || coalesce(new.asesor_nombre, 'la tienda')),
    '/mensajes',
    null
  );
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists aviso_pedido on public.contactos;
create trigger aviso_pedido
  after insert on public.contactos
  for each row when (new.tipo = 'pedido')
  execute function public.aviso_pedido();

-- Botón "Enviar prueba" de Ajustes: solo a ese mismo celular.
create or replace function public.probar_aviso(p_endpoint text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.es_equipo() then
    raise exception 'Solo el equipo';
  end if;
  perform public.enviar_aviso('prueba', 'Notificaciones activadas ✅',
    'Así te llegarán las ventas y los pedidos del catálogo.', '/', null, p_endpoint);
end;
$$;

alter table public.avisos_config      enable row level security;
alter table public.suscripciones_push enable row level security;
drop policy if exists "solo equipo" on public.avisos_config;
create policy "solo equipo" on public.avisos_config for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());
drop policy if exists "solo equipo" on public.suscripciones_push;
create policy "solo equipo" on public.suscripciones_push for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());
revoke all on public.avisos_config, public.suscripciones_push from anon;
grant select, insert, update, delete on public.avisos_config, public.suscripciones_push to authenticated;

revoke all on function public.avisos_secreto_valido(text) from public;
revoke all on function public.quitar_suscripciones(text, text[]) from public;
revoke all on function public.enviar_aviso(text, text, text, text, text, text) from public;
revoke all on function public.aviso_venta() from public;
revoke all on function public.aviso_pedido() from public;
revoke all on function public.probar_aviso(text) from public;
grant execute on function public.avisos_secreto_valido(text) to anon, authenticated;
grant execute on function public.quitar_suscripciones(text, text[]) to anon, authenticated;
grant execute on function public.probar_aviso(text) to authenticated;

notify pgrst, 'reload schema';
