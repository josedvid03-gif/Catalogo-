-- =====================================================================
--  Actualización 05: guía de tallas, envíos y cambios, y video de
--  portada en el catálogo.
--  Pega este archivo en Supabase → SQL Editor → New query → Run.
--  Se puede ejecutar varias veces sin perder datos.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Guía de tallas, envíos y cambios en el catálogo
-- ---------------------------------------------------------------------
alter table public.ajustes add column if not exists envios      text;
alter table public.ajustes add column if not exists cambios     text;
alter table public.ajustes add column if not exists guia_tallas jsonb not null default '[]'::jsonb;
-- Video de fondo en la portada del catálogo (ruta en el almacenamiento de fotos,
-- o un archivo de la página como '/video/portada.mp4'). La primera vez queda
-- puesto el video de la marca; se cambia o se quita en Ajustes.
alter table public.ajustes add column if not exists video_portada text default '/video/portada.mp4';
alter table public.ajustes alter column video_portada drop default;

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

grant execute on function public.catalogo_publico() to anon, authenticated;

notify pgrst, 'reload schema';
