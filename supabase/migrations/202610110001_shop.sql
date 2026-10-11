create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.cosmetics (
  id text primary key,
  name text not null,
  slot text not null check (slot in ('background', 'pen', 'avatar_border')),
  price integer not null check (price >= 0),
  description text not null default '',
  preview text,
  active boolean not null default true
);

create table if not exists public.player_inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cosmetic_id text not null references public.cosmetics(id),
  purchased_at timestamptz not null default now(),
  primary key (user_id, cosmetic_id)
);

create table if not exists public.player_equipment (
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot text not null check (slot in ('background', 'pen', 'avatar_border')),
  cosmetic_id text not null references public.cosmetics(id),
  equipped_at timestamptz not null default now(),
  primary key (user_id, slot),
  foreign key (user_id, cosmetic_id) references public.player_inventory(user_id, cosmetic_id) on delete cascade
);

create table if not exists public.point_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.cosmetics enable row level security;
alter table public.player_inventory enable row level security;
alter table public.player_equipment enable row level security;
alter table public.point_ledger enable row level security;

create policy "Profiles readable by owner" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Cosmetics are public" on public.cosmetics for select to anon, authenticated using (active);
create policy "Inventory readable by owner" on public.player_inventory for select to authenticated using (user_id = auth.uid());
create policy "Equipment readable by owner" on public.player_equipment for select to authenticated using (user_id = auth.uid());
create policy "Ledger readable by owner" on public.point_ledger for select to authenticated using (user_id = auth.uid());

create or replace function public.create_player_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', 'Player')) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_player_profile_after_signup on auth.users;
create trigger create_player_profile_after_signup after insert on auth.users for each row execute procedure public.create_player_profile();

create or replace function public.purchase_cosmetic(cosmetic_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  buyer uuid := auth.uid();
  item public.cosmetics%rowtype;
  balance integer;
begin
  if buyer is null then raise exception 'Sign in first.'; end if;
  select * into item from public.cosmetics where id = cosmetic_id and active = true;
  if not found then raise exception 'Item is not available.'; end if;
  select points into balance from public.profiles where id = buyer for update;
  if not found then raise exception 'Player profile not found.'; end if;
  if exists(select 1 from public.player_inventory where user_id = buyer and player_inventory.cosmetic_id = item.id) then raise exception 'You already own this item.'; end if;
  if balance < item.price then raise exception 'Not enough points.'; end if;
  update public.profiles set points = points - item.price where id = buyer returning points into balance;
  insert into public.player_inventory(user_id, cosmetic_id) values (buyer, item.id);
  insert into public.point_ledger(user_id, amount, reason) values (buyer, -item.price, 'cosmetic_purchase:' || item.id);
  return jsonb_build_object('points', balance, 'item', item.id);
end;
$$;

revoke all on function public.purchase_cosmetic(text) from public, anon;
grant execute on function public.purchase_cosmetic(text) to authenticated;

create or replace function public.equip_cosmetic(cosmetic_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare buyer uuid := auth.uid(); item public.cosmetics%rowtype;
begin
  if buyer is null then raise exception 'Sign in first.'; end if;
  select c.* into item from public.cosmetics c join public.player_inventory i on i.cosmetic_id = c.id and i.user_id = buyer where c.id = cosmetic_id and c.active = true;
  if not found then raise exception 'Buy this item before equipping it.'; end if;
  insert into public.player_equipment(user_id, slot, cosmetic_id) values (buyer, item.slot, item.id)
  on conflict (user_id, slot) do update set cosmetic_id = excluded.cosmetic_id, equipped_at = now();
  return jsonb_build_object('slot', item.slot, 'item', item.id);
end;
$$;
revoke all on function public.equip_cosmetic(text) from public, anon;
grant execute on function public.equip_cosmetic(text) to authenticated;
revoke insert, update, delete on public.profiles, public.player_inventory, public.player_equipment, public.point_ledger from anon, authenticated;
grant select on public.profiles, public.player_inventory, public.player_equipment, public.point_ledger to authenticated;
grant select on public.cosmetics to anon, authenticated;

insert into public.cosmetics(id, name, slot, price, description, preview) values
  ('paper-moon', 'Paper Moon', 'background', 180, 'A warm midnight paper texture.', '☾'),
  ('mint-grid', 'Mint Grid', 'background', 240, 'Soft graph paper for neat ideas.', '▦'),
  ('berry-ink', 'Berry Ink', 'pen', 120, 'A bright berry stroke for bold guesses.', '✎'),
  ('ocean-glow', 'Ocean Glow', 'pen', 200, 'Cool cyan ink with a clean edge.', '✦'),
  ('golden-loop', 'Golden Loop', 'avatar_border', 320, 'A little gold around your portrait.', '◉'),
  ('lilac-frame', 'Lilac Frame', 'avatar_border', 220, 'A soft lavender avatar ring.', '◉')
on conflict (id) do update set name = excluded.name, slot = excluded.slot, price = excluded.price, description = excluded.description, preview = excluded.preview, active = true;

-- Trusted server-only point grants use the service role; never expose that key in Vite.
create or replace function public.grant_game_points(target_user uuid, points_to_add integer, reason_text text)
returns integer language plpgsql security definer set search_path = '' as $$
declare balance integer;
begin
  if points_to_add <= 0 or points_to_add > 10000 then raise exception 'Invalid point amount.'; end if;
  update public.profiles set points = points + points_to_add where id = target_user returning points into balance;
  if not found then raise exception 'Player profile not found.'; end if;
  insert into public.point_ledger(user_id, amount, reason) values (target_user, points_to_add, left(reason_text, 120));
  return balance;
end;
$$;
revoke all on function public.grant_game_points(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.grant_game_points(uuid, integer, text) to service_role;
