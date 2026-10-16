-- =====================================================================
--  Actualización 02: marcas, rebajas, clientes y catálogo profesional
--  Pega este archivo en Supabase → SQL Editor → New query → Run.
--  Se puede ejecutar varias veces sin perder datos.
-- =====================================================================

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
                               'eslogan', eslogan, 'info', info_catalogo)
      from public.ajustes where id = 1
    ),
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

-- Al entregar un apartado, la venta queda a nombre del mismo cliente.
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


alter table public.clientes enable row level security;
drop policy if exists "solo equipo" on public.clientes;
create policy "solo equipo" on public.clientes for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());
revoke all on public.clientes from anon;
grant select, insert, update, delete on public.clientes to authenticated;

revoke execute on function public.adivinar_marca(text) from public, anon;
grant execute on function public.adivinar_marca(text) to authenticated;
grant execute on function public.catalogo_publico() to anon, authenticated;
