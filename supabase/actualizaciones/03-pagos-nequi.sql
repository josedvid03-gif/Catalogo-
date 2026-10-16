-- =====================================================================
--  Actualización 03: pagos por Nequi
--  Pega este archivo en Supabase → SQL Editor → New query → Run.
--  Se puede ejecutar varias veces sin perder datos.
-- =====================================================================

-- Nequi como método de pago en ventas, apartados y gastos
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tabla, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.ventas'::regclass, 'public.apartados'::regclass, 'public.gastos'::regclass)
      and pg_get_constraintdef(c.oid) ilike '%metodo_pago%'
  loop
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
  end loop;
end;
$$;

alter table public.ventas add constraint ventas_metodo_pago_check
  check (metodo_pago in ('efectivo', 'nequi', 'transferencia', 'tarjeta', 'otro'));
alter table public.apartados add constraint apartados_metodo_pago_anticipo_check
  check (metodo_pago_anticipo in ('efectivo', 'nequi', 'transferencia', 'tarjeta', 'otro'));
alter table public.gastos add constraint gastos_metodo_pago_check
  check (metodo_pago in ('efectivo', 'nequi', 'transferencia', 'tarjeta', 'otro'));

-- Medios de pago que se muestran en el catálogo
alter table public.ajustes add column if not exists pago_nequi text;
alter table public.ajustes add column if not exists pago_titular text;
alter table public.ajustes add column if not exists pago_qr text;
alter table public.ajustes add column if not exists pago_otros text;

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

grant execute on function public.catalogo_publico() to anon, authenticated;
