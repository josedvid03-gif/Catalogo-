-- =====================================================================
--  Inventario de tienda de ropa — esquema de base de datos (Supabase)
--
--  Cómo usarlo:
--    1. En Supabase abre "SQL Editor" → "New query".
--    2. Pega TODO este archivo y presiona "Run".
--    3. Al final del archivo cambia los correos del equipo (sección EQUIPO)
--       antes de ejecutarlo, o agrégalos después desde la app (Ajustes).
--
--  Se puede ejecutar varias veces sin perder datos.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Equipo: correos autorizados para usar la app
-- ---------------------------------------------------------------------
create table if not exists public.equipo (
  email      text primary key,
  nombre     text,
  created_at timestamptz not null default now()
);

create or replace function public.es_equipo()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.equipo
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.exigir_equipo()
returns void
language plpgsql stable
set search_path = public
as $$
begin
  if not public.es_equipo() then
    raise exception 'Tu usuario no está autorizado para usar esta tienda';
  end if;
end;
$$;

create or replace function public.hoy_colombia()
returns date
language sql stable
as $$ select (now() at time zone 'America/Bogota')::date $$;

-- ---------------------------------------------------------------------
--  Ajustes generales (una sola fila)
-- ---------------------------------------------------------------------
create table if not exists public.ajustes (
  id                  int primary key default 1 check (id = 1),
  nombre_tienda       text not null default 'Mi Tienda',
  whatsapp            text,
  instagram           text,
  porcentaje_anticipo numeric(5,2) not null default 30 check (porcentaje_anticipo between 0 and 100),
  dias_apartado       int not null default 30 check (dias_apartado > 0),
  stock_minimo        int not null default 1 check (stock_minimo >= 0),
  updated_at          timestamptz not null default now()
);
insert into public.ajustes (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
--  Productos y variantes (talla / color)
-- ---------------------------------------------------------------------
create table if not exists public.productos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(trim(nombre)) > 0),
  descripcion text,
  categoria   text,
  costo       integer not null default 0 check (costo >= 0),   -- pesos colombianos
  precio      integer not null default 0 check (precio >= 0),  -- pesos colombianos
  fotos       text[] not null default '{}',                    -- rutas en el bucket "productos"
  publicado   boolean not null default true,                   -- visible en el catálogo público
  activo      boolean not null default true,                   -- false = archivado
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.variantes (
  id          uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  talla       text not null default '',
  color       text not null default '',
  stock       integer not null default 0 check (stock >= 0),  -- unidades físicas en tienda
  created_at  timestamptz not null default now(),
  unique (producto_id, talla, color)
);
create index if not exists variantes_producto_idx on public.variantes(producto_id);

-- ---------------------------------------------------------------------
--  Ventas
-- ---------------------------------------------------------------------
create table if not exists public.ventas (
  id          uuid primary key default gen_random_uuid(),
  numero      bigint generated always as identity unique,
  fecha       timestamptz not null default now(),
  cliente     text,
  metodo_pago text not null default 'efectivo'
              check (metodo_pago in ('efectivo', 'nequi', 'transferencia', 'tarjeta', 'otro')),
  total       integer not null check (total >= 0),
  costo_total integer not null check (costo_total >= 0),
  nota        text,
  anulada     boolean not null default false,
  creado_por  text default (auth.jwt() ->> 'email')
);
create index if not exists ventas_fecha_idx on public.ventas(fecha);

create table if not exists public.venta_items (
  id          uuid primary key default gen_random_uuid(),
  venta_id    uuid not null references public.ventas(id) on delete cascade,
  variante_id uuid references public.variantes(id) on delete set null,
  producto_id uuid references public.productos(id) on delete set null,
  descripcion text not null,
  cantidad    integer not null check (cantidad > 0),
  precio_unit integer not null check (precio_unit >= 0),
  costo_unit  integer not null check (costo_unit >= 0)
);
create index if not exists venta_items_venta_idx on public.venta_items(venta_id);

-- ---------------------------------------------------------------------
--  Apartados (separados con anticipo)
-- ---------------------------------------------------------------------
create table if not exists public.apartados (
  id                   uuid primary key default gen_random_uuid(),
  numero               bigint generated always as identity unique,
  fecha                timestamptz not null default now(),
  fecha_limite         date not null,
  cliente              text not null check (length(trim(cliente)) > 0),
  telefono             text,
  total                integer not null check (total >= 0),
  anticipo             integer not null check (anticipo >= 0),
  metodo_pago_anticipo text not null default 'efectivo'
                       check (metodo_pago_anticipo in ('efectivo', 'nequi', 'transferencia', 'tarjeta', 'otro')),
  estado               text not null default 'activo'
                       check (estado in ('activo', 'completado', 'cancelado')),
  anticipo_devuelto    boolean not null default false,
  fecha_cierre         timestamptz,
  venta_id             uuid references public.ventas(id) on delete set null,
  nota                 text,
  creado_por           text default (auth.jwt() ->> 'email'),
  check (anticipo <= total)
);
create index if not exists apartados_estado_idx on public.apartados(estado);

create table if not exists public.apartado_items (
  id          uuid primary key default gen_random_uuid(),
  apartado_id uuid not null references public.apartados(id) on delete cascade,
  variante_id uuid references public.variantes(id) on delete set null,
  producto_id uuid references public.productos(id) on delete set null,
  descripcion text not null,
  cantidad    integer not null check (cantidad > 0),
  precio_unit integer not null check (precio_unit >= 0)
);
create index if not exists apartado_items_apartado_idx on public.apartado_items(apartado_id);
create index if not exists apartado_items_variante_idx on public.apartado_items(variante_id);

-- ---------------------------------------------------------------------
--  Movimientos de inventario (historial automático de cambios de stock)
-- ---------------------------------------------------------------------
create table if not exists public.movimientos (
  id              bigint generated always as identity primary key,
  fecha           timestamptz not null default now(),
  variante_id     uuid references public.variantes(id) on delete cascade,
  tipo            text not null check (tipo in ('entrada', 'ajuste', 'venta', 'anulacion')),
  cantidad        integer not null,
  stock_resultante integer not null,
  nota            text,
  creado_por      text default (auth.jwt() ->> 'email')
);
create index if not exists movimientos_variante_idx on public.movimientos(variante_id, fecha desc);

-- Registra cada cambio de stock. Las funciones de venta definen el tipo con
-- set_config('app.mov_tipo', ...); un cambio manual se registra como
-- "entrada" si sube y "ajuste" si baja.
create or replace function public.registrar_movimiento()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_delta int;
  v_tipo  text;
begin
  v_delta := new.stock - case when tg_op = 'INSERT' then 0 else old.stock end;
  if v_delta = 0 then
    return new;
  end if;
  v_tipo := nullif(current_setting('app.mov_tipo', true), '');
  if v_tipo is null then
    v_tipo := case when v_delta > 0 then 'entrada' else 'ajuste' end;
  end if;
  insert into public.movimientos (variante_id, tipo, cantidad, stock_resultante, nota)
  values (new.id, v_tipo, v_delta, new.stock, nullif(current_setting('app.mov_nota', true), ''));
  return new;
end;
$$;

drop trigger if exists variantes_movimiento on public.variantes;
create trigger variantes_movimiento
  after insert or update of stock on public.variantes
  for each row execute function public.registrar_movimiento();

-- No permitir borrar una variante que está en un apartado activo.
create or replace function public.proteger_variante_apartada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.apartado_items ai
    join public.apartados a on a.id = ai.apartado_id
    where ai.variante_id = old.id and a.estado = 'activo'
  ) then
    raise exception 'No se puede eliminar: la talla % % está en un apartado activo', old.talla, old.color;
  end if;
  return old;
end;
$$;

drop trigger if exists variantes_proteger on public.variantes;
create trigger variantes_proteger
  before delete on public.variantes
  for each row execute function public.proteger_variante_apartada();

create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Si una prenda se vendió antes de tener costo (costo 0) y luego se le pone,
-- se corrige el costo de esas ventas para que la ganancia quede bien.
create or replace function public.completar_costo_ventas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.costo = 0 and new.costo > 0 then
    update public.venta_items
       set costo_unit = new.costo
     where producto_id = new.id and costo_unit = 0;
    update public.ventas v
       set costo_total = (select coalesce(sum(i.cantidad * i.costo_unit), 0)
                          from public.venta_items i where i.venta_id = v.id)
     where v.id in (select venta_id from public.venta_items where producto_id = new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists productos_costo on public.productos;
create trigger productos_costo after update of costo on public.productos
  for each row execute function public.completar_costo_ventas();

drop trigger if exists productos_updated on public.productos;
create trigger productos_updated before update on public.productos
  for each row execute function public.tocar_updated_at();

drop trigger if exists ajustes_updated on public.ajustes;
create trigger ajustes_updated before update on public.ajustes
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------
--  Marca y precio de rebaja de cada producto
-- ---------------------------------------------------------------------
alter table public.productos add column if not exists marca text;
alter table public.productos add column if not exists precio_antes integer
  check (precio_antes is null or precio_antes >= 0);   -- precio tachado (rebaja)

-- Reconoce la marca por el nombre: "Camiseta Nike AF1" → Nike.
create or replace function public.adivinar_marca(p_nombre text)
returns text
language sql immutable
as $$
  select case
    when p_nombre ~* 'true\s*religion'                 then 'True Religion'
    when p_nombre ~* '\m(nike|jordan|air\s*max|af1)\M'  then 'Nike'
    when p_nombre ~* '\madidas\M'                       then 'Adidas'
    when p_nombre ~* '\mpuma\M'                         then 'Puma'
    when p_nombre ~* '\mreebok\M'                       then 'Reebok'
    when p_nombre ~* '\mcolumbia\M'                     then 'Columbia'
    when p_nombre ~* '\mdickies\M'                      then 'Dickies'
    when p_nombre ~* '\mchampion\M'                     then 'Champion'
    when p_nombre ~* '\mlevi''?s?\M'                   then 'Levi''s'
    when p_nombre ~* '\mn[aá]utica\M'                  then 'Náutica'
    when p_nombre ~* '\munder(\s*armou?r)?\M'          then 'Under Armour'
    when p_nombre ~* '\mtommy\M'                        then 'Tommy Hilfiger'
    when p_nombre ~* 'ralph\s*lauren|\mpolo\s+ralph'   then 'Ralph Lauren'
    when p_nombre ~* '\mcarhartt\M'                     then 'Carhartt'
    when p_nombre ~* 'new\s*balance'                    then 'New Balance'
    when p_nombre ~* '\mlacoste\M'                      then 'Lacoste'
    when p_nombre ~* '\mfila\M'                         then 'Fila'
    when p_nombre ~* '\mvans\M'                         then 'Vans'
    when p_nombre ~* '\mconverse\M'                     then 'Converse'
    when p_nombre ~* 'north\s*face'                     then 'The North Face'
    when p_nombre ~* '\mguess\M'                        then 'Guess'
    when p_nombre ~* 'calvin\s*klein'                   then 'Calvin Klein'
    when p_nombre ~* '\mdiesel\M'                       then 'Diesel'
    when p_nombre ~* '\msupreme\M'                      then 'Supreme'
    when p_nombre ~* '\mst[uü]ssy\M'                    then 'Stüssy'
    when p_nombre ~* '\mpatagonia\M'                    then 'Patagonia'
    when p_nombre ~* '\mtimberland\M'                   then 'Timberland'
    when p_nombre ~* '\mwrangler\M'                     then 'Wrangler'
    when p_nombre ~* '\mhollister\M'                    then 'Hollister'
    when p_nombre ~* '\mabercrombie\M'                  then 'Abercrombie'
    when p_nombre ~* 'american\s*eagle'                 then 'American Eagle'
    when p_nombre ~* '\mgap\M'                          then 'Gap'
    when p_nombre ~* '\mumbro\M'                        then 'Umbro'
    when p_nombre ~* '\mkappa\M'                        then 'Kappa'
    when p_nombre ~* '\mnew\s*era\M'                    then 'New Era'
  end
$$;

create or replace function public.marca_por_defecto()
returns trigger
language plpgsql
as $$
begin
  if new.marca is null or trim(new.marca) = '' then
    new.marca := public.adivinar_marca(new.nombre);
  end if;
  return new;
end;
$$;

drop trigger if exists productos_marca on public.productos;
create trigger productos_marca before insert on public.productos
  for each row execute function public.marca_por_defecto();

update public.productos set marca = public.adivinar_marca(nombre) where marca is null;

-- Textos del catálogo
alter table public.ajustes add column if not exists eslogan text default 'Original Supply · Colombia';
alter table public.ajustes add column if not exists info_catalogo text;

-- Medios de pago que se muestran en el catálogo
alter table public.ajustes add column if not exists pago_nequi text;
alter table public.ajustes add column if not exists pago_titular text;
alter table public.ajustes add column if not exists pago_qr text;      -- ruta de la imagen del QR
alter table public.ajustes add column if not exists pago_otros text;   -- otros medios (texto libre)

-- ---------------------------------------------------------------------
--  Clientes
-- ---------------------------------------------------------------------
create table if not exists public.clientes (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(trim(nombre)) > 0),
  telefono   text,
  instagram  text,
  tallas     text,                       -- ej: "S, M, 32"
  intereses  text,                       -- ej: "Nike, buzos, jeans"
  notas      text,
  avisar     boolean not null default true,  -- quiere que le avisen de novedades
  created_at timestamptz not null default now()
);
create index if not exists clientes_telefono_idx on public.clientes (telefono);

alter table public.ventas    add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.apartados add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
create index if not exists ventas_cliente_idx    on public.ventas(cliente_id);
create index if not exists apartados_cliente_idx on public.apartados(cliente_id);

-- ---------------------------------------------------------------------
--  Vista de inventario: stock, apartado (reservado) y disponible
-- ---------------------------------------------------------------------
create or replace view public.inventario
with (security_invoker = true)
as
select
  v.id,
  v.producto_id,
  v.talla,
  v.color,
  v.stock,
  coalesce(r.reservado, 0)::int            as reservado,
  (v.stock - coalesce(r.reservado, 0))::int as disponible,
  p.nombre,
  p.categoria,
  p.costo,
  p.precio,
  p.fotos,
  p.activo,
  p.publicado
from public.variantes v
join public.productos p on p.id = v.producto_id
left join (
  select ai.variante_id, sum(ai.cantidad) as reservado
  from public.apartado_items ai
  join public.apartados a on a.id = ai.apartado_id
  where a.estado = 'activo'
  group by ai.variante_id
) r on r.variante_id = v.id;

-- ---------------------------------------------------------------------
--  Funciones de negocio (se llaman desde la app)
-- ---------------------------------------------------------------------

-- Bloquea la variante y devuelve cuántas unidades hay disponibles.
create or replace function public.disponible_bloqueado(p_variante uuid)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_stock int;
  v_reservado int;
begin
  select stock into v_stock from public.variantes where id = p_variante for update;
  if not found then
    raise exception 'Una de las prendas ya no existe en el inventario';
  end if;
  select coalesce(sum(ai.cantidad), 0) into v_reservado
  from public.apartado_items ai
  join public.apartados a on a.id = ai.apartado_id
  where ai.variante_id = p_variante and a.estado = 'activo';
  return v_stock - v_reservado;
end;
$$;

create or replace function public.describir_variante(p_variante uuid)
returns text
language sql stable
set search_path = public
as $$
  select p.nombre
         || case when v.talla <> '' or v.color <> ''
                 then ' · ' || trim(both ' /' from v.talla || ' / ' || v.color)
                 else '' end
  from public.variantes v join public.productos p on p.id = v.producto_id
  where v.id = p_variante
$$;

-- Cambia el stock desde el formulario de producto. Falla si alguien más
-- cambió el stock mientras se editaba, o si queda por debajo de lo apartado.
create or replace function public.fijar_stock(p_variante uuid, p_esperado int, p_nuevo int)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_actual int;
  v_reservado int;
begin
  perform public.exigir_equipo();
  if p_nuevo < 0 then
    raise exception 'El stock no puede ser negativo';
  end if;
  select stock into v_actual from public.variantes where id = p_variante for update;
  if not found then
    raise exception 'La variante no existe';
  end if;
  if v_actual <> p_esperado then
    raise exception 'El stock de % cambió mientras editabas (ahora es %). Recarga e intenta de nuevo',
      public.describir_variante(p_variante), v_actual;
  end if;
  v_reservado := v_actual - public.disponible_bloqueado(p_variante);
  if p_nuevo < v_reservado then
    raise exception '% tiene % unidad(es) apartada(s); el stock no puede ser menor',
      public.describir_variante(p_variante), v_reservado;
  end if;
  update public.variantes set stock = p_nuevo where id = p_variante;
end;
$$;

-- p_items: [{"variante_id": "...", "cantidad": 1, "precio_unit": 50000}, ...]
create or replace function public.registrar_venta(
  p_items  jsonb,
  p_cliente text default null,
  p_metodo text default 'efectivo',
  p_nota   text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_venta uuid;
  v_item  jsonb;
  v_var   uuid;
  v_cant  int;
  v_precio int;
  v_costo int;
  v_prod  uuid;
  v_total int := 0;
  v_costo_total int := 0;
begin
  perform public.exigir_equipo();
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  insert into public.ventas (cliente, metodo_pago, total, costo_total, nota)
  values (nullif(trim(p_cliente), ''), p_metodo, 0, 0, nullif(trim(p_nota), ''))
  returning id into v_venta;

  perform set_config('app.mov_tipo', 'venta', true);
  perform set_config('app.mov_nota',
    'Venta #' || (select numero from public.ventas where id = v_venta), true);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_var    := (v_item ->> 'variante_id')::uuid;
    v_cant   := (v_item ->> 'cantidad')::int;
    v_precio := (v_item ->> 'precio_unit')::int;
    if v_cant is null or v_cant <= 0 then
      raise exception 'Cantidad inválida';
    end if;
    if v_precio is null or v_precio < 0 then
      raise exception 'Precio inválido';
    end if;
    if public.disponible_bloqueado(v_var) < v_cant then
      raise exception 'No hay suficientes unidades disponibles de %', public.describir_variante(v_var);
    end if;
    select p.costo, p.id into v_costo, v_prod
    from public.variantes v join public.productos p on p.id = v.producto_id
    where v.id = v_var;

    insert into public.venta_items (venta_id, variante_id, producto_id, descripcion, cantidad, precio_unit, costo_unit)
    values (v_venta, v_var, v_prod, public.describir_variante(v_var), v_cant, v_precio, v_costo);

    update public.variantes set stock = stock - v_cant where id = v_var;

    v_total := v_total + v_cant * v_precio;
    v_costo_total := v_costo_total + v_cant * v_costo;
  end loop;

  update public.ventas set total = v_total, costo_total = v_costo_total where id = v_venta;
  perform set_config('app.mov_tipo', '', true);
  perform set_config('app.mov_nota', '', true);
  return v_venta;
end;
$$;

-- Anula una venta registrada por error y devuelve las prendas al stock.
create or replace function public.anular_venta(p_venta uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_item record;
  v_anulada boolean;
begin
  perform public.exigir_equipo();
  select anulada into v_anulada from public.ventas where id = p_venta for update;
  if not found then
    raise exception 'La venta no existe';
  end if;
  if v_anulada then
    raise exception 'La venta ya estaba anulada';
  end if;

  perform set_config('app.mov_tipo', 'anulacion', true);
  perform set_config('app.mov_nota',
    'Venta #' || (select numero from public.ventas where id = p_venta) || ' anulada', true);
  for v_item in
    select variante_id, cantidad from public.venta_items
    where venta_id = p_venta and variante_id is not null
  loop
    update public.variantes set stock = stock + v_item.cantidad where id = v_item.variante_id;
  end loop;
  perform set_config('app.mov_tipo', '', true);
  perform set_config('app.mov_nota', '', true);

  update public.ventas set anulada = true where id = p_venta;
end;
$$;

-- Crea un apartado: reserva las prendas hasta la fecha límite.
create or replace function public.crear_apartado(
  p_items    jsonb,
  p_cliente  text,
  p_telefono text default null,
  p_anticipo int default 0,
  p_metodo   text default 'efectivo',
  p_nota     text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_apartado uuid;
  v_item jsonb;
  v_var  uuid;
  v_cant int;
  v_precio int;
  v_prod uuid;
  v_total int := 0;
  v_dias int;
begin
  perform public.exigir_equipo();
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El apartado no tiene productos';
  end if;
  if coalesce(trim(p_cliente), '') = '' then
    raise exception 'Escribe el nombre del cliente';
  end if;
  select dias_apartado into v_dias from public.ajustes where id = 1;

  insert into public.apartados (cliente, telefono, total, anticipo, metodo_pago_anticipo, nota, fecha_limite)
  values (trim(p_cliente), nullif(trim(p_telefono), ''), 0, 0, p_metodo, nullif(trim(p_nota), ''),
          public.hoy_colombia() + coalesce(v_dias, 30))
  returning id into v_apartado;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_var    := (v_item ->> 'variante_id')::uuid;
    v_cant   := (v_item ->> 'cantidad')::int;
    v_precio := (v_item ->> 'precio_unit')::int;
    if v_cant is null or v_cant <= 0 then
      raise exception 'Cantidad inválida';
    end if;
    if v_precio is null or v_precio < 0 then
      raise exception 'Precio inválido';
    end if;
    if public.disponible_bloqueado(v_var) < v_cant then
      raise exception 'No hay suficientes unidades disponibles de %', public.describir_variante(v_var);
    end if;
    select producto_id into v_prod from public.variantes where id = v_var;
    insert into public.apartado_items (apartado_id, variante_id, producto_id, descripcion, cantidad, precio_unit)
    values (v_apartado, v_var, v_prod, public.describir_variante(v_var), v_cant, v_precio);
    v_total := v_total + v_cant * v_precio;
  end loop;

  if p_anticipo is null or p_anticipo < 0 or p_anticipo > v_total then
    raise exception 'El anticipo debe estar entre 0 y el total del apartado';
  end if;
  update public.apartados set total = v_total, anticipo = p_anticipo where id = v_apartado;
  return v_apartado;
end;
$$;

-- El cliente pagó el saldo y se lleva las prendas: se convierte en venta.
create or replace function public.completar_apartado(p_apartado uuid, p_metodo text default 'efectivo')
returns uuid
language plpgsql
set search_path = public
as $$
declare
  a public.apartados%rowtype;
  v_item record;
  v_venta uuid;
  v_costo int;
  v_costo_total int := 0;
  v_stock int;
begin
  perform public.exigir_equipo();
  select * into a from public.apartados where id = p_apartado for update;
  if not found then
    raise exception 'El apartado no existe';
  end if;
  if a.estado <> 'activo' then
    raise exception 'Este apartado ya fue %', a.estado;
  end if;

  insert into public.ventas (cliente, cliente_id, metodo_pago, total, costo_total, nota)
  values (a.cliente, a.cliente_id, p_metodo, a.total, 0, 'Apartado #' || a.numero)
  returning id into v_venta;

  perform set_config('app.mov_tipo', 'venta', true);
  perform set_config('app.mov_nota', 'Entrega de apartado #' || a.numero, true);

  for v_item in select * from public.apartado_items where apartado_id = p_apartado loop
    v_costo := coalesce((select costo from public.productos where id = v_item.producto_id), 0);
    insert into public.venta_items (venta_id, variante_id, producto_id, descripcion, cantidad, precio_unit, costo_unit)
    values (v_venta, v_item.variante_id, v_item.producto_id, v_item.descripcion, v_item.cantidad, v_item.precio_unit, v_costo);
    v_costo_total := v_costo_total + v_item.cantidad * v_costo;

    if v_item.variante_id is not null then
      select stock into v_stock from public.variantes where id = v_item.variante_id for update;
      if v_stock < v_item.cantidad then
        raise exception 'El stock de % es menor que lo apartado. Revisa el inventario', v_item.descripcion;
      end if;
      update public.variantes set stock = stock - v_item.cantidad where id = v_item.variante_id;
    end if;
  end loop;

  perform set_config('app.mov_tipo', '', true);
  perform set_config('app.mov_nota', '', true);

  update public.ventas set costo_total = v_costo_total where id = v_venta;
  update public.apartados
     set estado = 'completado', fecha_cierre = now(), venta_id = v_venta
   where id = p_apartado;
  return v_venta;
end;
$$;

-- El cliente no completó el pago: se libera la ropa y se devuelve el anticipo.
create or replace function public.cancelar_apartado(p_apartado uuid, p_devolver boolean default true)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_estado text;
begin
  perform public.exigir_equipo();
  select estado into v_estado from public.apartados where id = p_apartado for update;
  if not found then
    raise exception 'El apartado no existe';
  end if;
  if v_estado <> 'activo' then
    raise exception 'Este apartado ya fue %', v_estado;
  end if;
  update public.apartados
     set estado = 'cancelado', fecha_cierre = now(), anticipo_devuelto = p_devolver
   where id = p_apartado;
end;
$$;

-- Da más días a un apartado activo.
create or replace function public.extender_apartado(p_apartado uuid, p_dias int)
returns date
language plpgsql
set search_path = public
as $$
declare
  v_fecha date;
begin
  perform public.exigir_equipo();
  if p_dias is null or p_dias <= 0 then
    raise exception 'Número de días inválido';
  end if;
  update public.apartados
     set fecha_limite = greatest(fecha_limite, public.hoy_colombia()) + p_dias
   where id = p_apartado and estado = 'activo'
  returning fecha_limite into v_fecha;
  if v_fecha is null then
    raise exception 'Solo se pueden extender apartados activos';
  end if;
  return v_fecha;
end;
$$;

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

-- ---------------------------------------------------------------------
--  Guía de tallas, envíos y cambios
-- ---------------------------------------------------------------------
alter table public.ajustes add column if not exists envios      text;
alter table public.ajustes add column if not exists cambios     text;
alter table public.ajustes add column if not exists guia_tallas jsonb not null default '[]'::jsonb;
-- Video de fondo en la portada del catálogo (ruta en el almacenamiento de fotos,
-- o un archivo de la página como '/video/portada.mp4'). La primera vez queda
-- puesto el video de la marca; se cambia o se quita en Ajustes.
alter table public.ajustes add column if not exists video_portada text default '/video/portada.mp4';
alter table public.ajustes alter column video_portada drop default;
-- Sellos de confianza y frase de impulso en cada prenda (se editan en Ajustes).
alter table public.ajustes add column if not exists sellos jsonb not null
  default '["100% original", "Pago seguro", "Envíos a toda Colombia", "Atención por WhatsApp"]'::jsonb;
alter table public.ajustes add column if not exists frase_prenda text;
-- Fotos de campaña: [{"foto": "...", "titulo": "...", "enlace": "/catalogo?c=Buzo"}].
-- La primera vez quedan las fotos de la marca; se cambian en Ajustes.
alter table public.ajustes add column if not exists campana jsonb not null default '[
  {"foto": "/campana/fuego.jpg", "titulo": "Nueva temporada", "enlace": ""},
  {"foto": "/campana/calle.jpg", "titulo": "Nike New York", "enlace": "/catalogo?q=azul%20oscuro%20ny"},
  {"foto": "/campana/cielo.jpg", "titulo": "Más que ropa, un estilo de vida", "enlace": ""}
]'::jsonb;
alter table public.ajustes alter column campana set default '[]'::jsonb;

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
                               'envios', envios, 'cambios', cambios, 'guia_tallas', guia_tallas,
                               'video', video_portada,
                               'sellos', sellos, 'frase', frase_prenda, 'campana', campana,
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

-- ---------------------------------------------------------------------
--  Inversores
--    tipo 'interes'   → tasa = % de interés mensual sobre el capital;
--                       el interés se paga cada mes y el capital al final.
--    tipo 'ganancias' → tasa = % de la ganancia de las ventas de cada mes.
-- ---------------------------------------------------------------------
create table if not exists public.inversores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(trim(nombre)) > 0),
  telefono   text,
  created_at timestamptz not null default now()
);
create unique index if not exists inversores_nombre_idx on public.inversores (lower(trim(nombre)));

create table if not exists public.inversiones (
  id           uuid primary key default gen_random_uuid(),
  inversor_id  uuid not null references public.inversores(id) on delete restrict,
  fecha_inicio date not null default public.hoy_colombia(),
  monto        integer not null check (monto > 0),
  tipo         text not null check (tipo in ('interes', 'ganancias')),
  tasa         numeric(6,3) not null check (tasa >= 0 and tasa <= 100),
  plazo_meses  int not null check (plazo_meses between 1 and 120),
  estado       text not null default 'activa' check (estado in ('activa', 'finalizada')),
  nota         text,
  created_at   timestamptz not null default now()
);
create index if not exists inversiones_inversor_idx on public.inversiones(inversor_id);

create table if not exists public.pagos_inversion (
  id           uuid primary key default gen_random_uuid(),
  inversion_id uuid not null references public.inversiones(id) on delete cascade,
  fecha        date not null default public.hoy_colombia(),
  tipo         text not null check (tipo in ('rendimiento', 'capital')),
  monto        integer not null check (monto > 0),
  periodo      text check (periodo ~ '^\d{4}-\d{2}$'),  -- mes de ganancias que se paga (AAAA-MM)
  nota         text,
  creado_por   text default (auth.jwt() ->> 'email'),
  created_at   timestamptz not null default now()
);
create index if not exists pagos_inversion_idx on public.pagos_inversion(inversion_id);

-- ---------------------------------------------------------------------
--  Gastos del negocio (arriendo, transporte, publicidad…) y cierres de caja
-- ---------------------------------------------------------------------
create table if not exists public.gastos (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null default public.hoy_colombia(),
  categoria   text not null default 'Otros',
  descripcion text,
  monto       integer not null check (monto > 0),
  metodo_pago text not null default 'efectivo'
              check (metodo_pago in ('efectivo', 'nequi', 'transferencia', 'tarjeta', 'otro')),
  creado_por  text default (auth.jwt() ->> 'email'),
  created_at  timestamptz not null default now()
);
create index if not exists gastos_fecha_idx on public.gastos(fecha);

create table if not exists public.cierres_caja (
  fecha      date primary key,
  base       integer not null default 0 check (base >= 0),     -- efectivo con el que se abrió
  contado    integer check (contado >= 0),                      -- efectivo contado al cerrar
  nota       text,
  creado_por text default (auth.jwt() ->> 'email'),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  Seguridad: solo el equipo puede leer/escribir. El público solo ve
--  el catálogo y las fotos.
-- ---------------------------------------------------------------------
alter table public.equipo         enable row level security;
alter table public.ajustes        enable row level security;
alter table public.productos      enable row level security;
alter table public.variantes      enable row level security;
alter table public.ventas         enable row level security;
alter table public.venta_items    enable row level security;
alter table public.apartados      enable row level security;
alter table public.apartado_items enable row level security;
alter table public.movimientos    enable row level security;
alter table public.inversores      enable row level security;
alter table public.inversiones     enable row level security;
alter table public.pagos_inversion enable row level security;
alter table public.gastos          enable row level security;
alter table public.cierres_caja    enable row level security;
alter table public.clientes        enable row level security;
alter table public.asesores        enable row level security;
alter table public.contactos       enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['equipo', 'ajustes', 'productos', 'variantes', 'ventas',
                           'venta_items', 'apartados', 'apartado_items', 'movimientos',
                           'inversores', 'inversiones', 'pagos_inversion',
                           'gastos', 'cierres_caja', 'clientes', 'asesores', 'contactos']
  loop
    execute format('drop policy if exists "solo equipo" on public.%I', t);
    execute format(
      'create policy "solo equipo" on public.%I for all to authenticated
         using (public.es_equipo()) with check (public.es_equipo())', t);
  end loop;
end;
$$;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo_publico() to anon;
grant execute on function public.registrar_contacto(jsonb) to anon;

-- ---------------------------------------------------------------------
--  Fotos: bucket público para leer, solo el equipo puede subir/borrar
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do update set public = true;

drop policy if exists "equipo sube fotos" on storage.objects;
create policy "equipo sube fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'productos' and public.es_equipo());

drop policy if exists "equipo edita fotos" on storage.objects;
create policy "equipo edita fotos" on storage.objects for update to authenticated
  using (bucket_id = 'productos' and public.es_equipo());

drop policy if exists "equipo borra fotos" on storage.objects;
create policy "equipo borra fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'productos' and public.es_equipo());

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

-- ---------------------------------------------------------------------
--  EQUIPO — cambia este correo por el tuyo antes de ejecutar.
--  Los demás usuarios se pueden agregar después desde Ajustes en la app.
-- ---------------------------------------------------------------------
insert into public.equipo (email, nombre) values
  ('tu-correo@ejemplo.com', 'Dueño')
on conflict (email) do nothing;
