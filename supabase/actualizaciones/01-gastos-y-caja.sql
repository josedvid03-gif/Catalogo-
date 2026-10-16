-- =====================================================================
--  Actualización: Gastos y cierre de caja
--  Pega este archivo en Supabase → SQL Editor → New query → Run.
--  Se puede ejecutar varias veces sin perder datos.
-- =====================================================================

create table if not exists public.gastos (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null default public.hoy_colombia(),
  categoria   text not null default 'Otros',
  descripcion text,
  monto       integer not null check (monto > 0),
  metodo_pago text not null default 'efectivo'
              check (metodo_pago in ('efectivo', 'transferencia', 'tarjeta', 'otro')),
  creado_por  text default (auth.jwt() ->> 'email'),
  created_at  timestamptz not null default now()
);
create index if not exists gastos_fecha_idx on public.gastos(fecha);

create table if not exists public.cierres_caja (
  fecha      date primary key,
  base       integer not null default 0 check (base >= 0),
  contado    integer check (contado >= 0),
  nota       text,
  creado_por text default (auth.jwt() ->> 'email'),
  updated_at timestamptz not null default now()
);

alter table public.gastos       enable row level security;
alter table public.cierres_caja enable row level security;

drop policy if exists "solo equipo" on public.gastos;
create policy "solo equipo" on public.gastos for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

drop policy if exists "solo equipo" on public.cierres_caja;
create policy "solo equipo" on public.cierres_caja for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

revoke all on public.gastos, public.cierres_caja from anon;
grant select, insert, update, delete on public.gastos, public.cierres_caja to authenticated;
