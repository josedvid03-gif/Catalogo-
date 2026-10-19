-- =====================================================================
--  Actualización 09: medición del catálogo (qué miran y qué piden).
--  Pega este archivo en Supabase → SQL Editor → New query → Run.
--  Se puede ejecutar varias veces sin perder datos.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Medición del catálogo
--    Solo cuenta, por día y por prenda: visitas, prendas vistas,
--    agregadas a la bolsa y pedidos enviados. No guarda datos de nadie.
-- ---------------------------------------------------------------------
create table if not exists public.eventos_dia (
  dia         date not null,
  -- 00000000-… = el catálogo en general (visitas, pedidos)
  producto_id uuid not null default '00000000-0000-0000-0000-000000000000',
  tipo        text not null check (tipo in ('visita', 'vista', 'bolsa', 'comprar', 'pedido')),
  cantidad    integer not null default 0,
  primary key (dia, producto_id, tipo)
);

-- El catálogo (sin sesión) suma 1 al contador; no puede leer nada.
create or replace function public.registrar_evento(p_tipo text, p_producto text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto uuid := '00000000-0000-0000-0000-000000000000';
begin
  if p_tipo not in ('visita', 'vista', 'bolsa', 'comprar', 'pedido') then
    return;
  end if;
  if p_producto ~ '^[0-9a-f-]{36}$' and exists (select 1 from public.productos where id = p_producto::uuid) then
    v_producto := p_producto::uuid;
  end if;
  -- Vista, bolsa y comprar siempre son de una prenda.
  if p_tipo in ('vista', 'bolsa', 'comprar') and v_producto = '00000000-0000-0000-0000-000000000000' then
    return;
  end if;
  insert into public.eventos_dia (dia, producto_id, tipo, cantidad)
  values ((now() at time zone 'America/Bogota')::date, v_producto, p_tipo, 1)
  on conflict (dia, producto_id, tipo) do update set cantidad = public.eventos_dia.cantidad + 1;
end;
$$;

alter table public.eventos_dia enable row level security;
drop policy if exists "solo equipo" on public.eventos_dia;
create policy "solo equipo" on public.eventos_dia for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());
revoke all on public.eventos_dia from anon;
grant select, insert, update, delete on public.eventos_dia to authenticated;

revoke all on function public.registrar_evento(text, text) from public;
grant execute on function public.registrar_evento(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
