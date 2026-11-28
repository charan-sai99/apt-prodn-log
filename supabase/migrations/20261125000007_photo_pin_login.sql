-- =============================================================================
-- APT Production Log — 0007 photo + PIN sign-in for operators and supervisors
-- =============================================================================
-- Operators and supervisors sign in by tapping their photo and entering a
-- 4-digit PIN that only an administrator can set. Administrators keep their
-- email + password sign-in and can never use a PIN.
--
--   * profiles: + designation, display_order, show_on_login
--   * profile_pins   — PIN hash + lockout state. No access for app users at all;
--                      only the SECURITY DEFINER functions below touch it.
--   * profile_photos — small JPEG avatars (base64). Read through
--                      get_profile_photo() by the server; written by admins.
--   * Lockout: 5 wrong PINs → locked 15 minutes; 10 wrong in a row → locked
--     until an administrator unlocks it.
--   * verify_profile_pin(), login_roster(), get_profile_photo() are callable
--     only by the server (service_role), never from the browser.
-- Additive and re-runnable; changes no existing data.
-- =============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ profiles
alter table public.profiles add column if not exists designation   text;
alter table public.profiles add column if not exists display_order integer not null default 100;
alter table public.profiles add column if not exists show_on_login boolean not null default true;

alter table public.profiles drop constraint if exists profiles_designation_length;
alter table public.profiles
  add constraint profiles_designation_length check (designation is null or length(designation) <= 60);

-- ------------------------------------------------------------------ PINs
create table if not exists public.profile_pins (
  profile_id         uuid primary key references public.profiles(id) on delete cascade,
  pin_hash           text not null,
  failed_attempts    integer not null default 0,
  locked_until       timestamptz,
  needs_admin_unlock boolean not null default false,
  last_used_at       timestamptz,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles(id)
);
alter table public.profile_pins enable row level security;
revoke all on public.profile_pins from public, anon, authenticated;
grant select, insert, update, delete on public.profile_pins to service_role;

-- ------------------------------------------------------------------ photos
create table if not exists public.profile_photos (
  profile_id   uuid primary key references public.profiles(id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  data_base64  text not null check (length(data_base64) between 100 and 400000),
  updated_at   timestamptz not null default now()
);
alter table public.profile_photos enable row level security;
revoke all on public.profile_photos from public, anon, authenticated;
grant select, insert, update, delete on public.profile_photos to service_role;

-- The import script (service role) writes profiles directly.
grant select, insert, update on public.profiles to service_role;
grant select on public.machine_assignments, public.machines to service_role;

-- ------------------------------------------------------------------ helpers
create or replace function public.prodlog_pin_audit(p_profile uuid, p_action text, p_details jsonb default null)
returns void
language sql security definer
set search_path = public
as $$
  insert into public.production_audit_logs (entity_type, entity_id, changed_by, action, new_values)
  values ('profile_pin', p_profile::text, auth.uid(), p_action, p_details);
$$;
revoke all on function public.prodlog_pin_audit(uuid, text, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------ admin: set / unlock / clear PIN
create or replace function public.set_profile_pin(p_profile_id uuid, p_pin text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_role text;
begin
  if not public.is_prodlog_admin() then
    raise exception 'FORBIDDEN: only administrators can set PINs';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'INVALID_INPUT: the PIN must be exactly 4 digits';
  end if;
  select role into v_role from public.profiles where id = p_profile_id;
  if v_role is null then
    raise exception 'NOT_FOUND: person not found';
  end if;
  if v_role not in ('operator', 'supervisor') then
    raise exception 'INVALID_INPUT: administrators sign in with their password, not a PIN';
  end if;

  insert into public.profile_pins (profile_id, pin_hash, failed_attempts, locked_until, needs_admin_unlock, updated_at, updated_by)
  values (p_profile_id, crypt(p_pin, gen_salt('bf', 8)), 0, null, false, now(), auth.uid())
  on conflict (profile_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null,
        needs_admin_unlock = false, updated_at = now(), updated_by = auth.uid();
  perform public.prodlog_pin_audit(p_profile_id, 'pin_set');
end;
$$;

create or replace function public.unlock_profile_pin(p_profile_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_prodlog_admin() then
    raise exception 'FORBIDDEN: only administrators can unlock PINs';
  end if;
  update public.profile_pins
     set failed_attempts = 0, locked_until = null, needs_admin_unlock = false, updated_at = now(), updated_by = auth.uid()
   where profile_id = p_profile_id;
  perform public.prodlog_pin_audit(p_profile_id, 'pin_unlocked');
end;
$$;

create or replace function public.clear_profile_pin(p_profile_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_prodlog_admin() then
    raise exception 'FORBIDDEN: only administrators can remove PINs';
  end if;
  delete from public.profile_pins where profile_id = p_profile_id;
  perform public.prodlog_pin_audit(p_profile_id, 'pin_removed');
end;
$$;

-- PIN status for the admin Users page (never returns the hash).
create or replace function public.profile_pin_status()
returns table (profile_id uuid, has_pin boolean, locked boolean, needs_admin_unlock boolean, failed_attempts integer, last_used_at timestamptz)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_prodlog_admin() then
    raise exception 'FORBIDDEN: only administrators can see PIN status';
  end if;
  return query
    select p.profile_id, true,
           (p.needs_admin_unlock or coalesce(p.locked_until > now(), false)),
           p.needs_admin_unlock, p.failed_attempts, p.last_used_at
      from public.profile_pins p;
end;
$$;

-- ------------------------------------------------------------------ server only: verify PIN
-- Returns {ok, reason, remaining, locked_until, role}. reason ∈
-- wrong_pin | locked | locked_admin | no_pin | unavailable.
create or replace function public.verify_profile_pin(p_profile_id uuid, p_pin text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles;
  v_pin     public.profile_pins;
  v_failed  integer;
begin
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or not v_profile.is_active or v_profile.role not in ('operator', 'supervisor') or not v_profile.show_on_login then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  select * into v_pin from public.profile_pins where profile_id = p_profile_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;
  if v_pin.needs_admin_unlock then
    return jsonb_build_object('ok', false, 'reason', 'locked_admin');
  end if;
  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_pin.locked_until);
  end if;

  if p_pin ~ '^[0-9]{4}$' and v_pin.pin_hash = crypt(p_pin, v_pin.pin_hash) then
    update public.profile_pins
       set failed_attempts = 0, locked_until = null, last_used_at = now()
     where profile_id = p_profile_id;
    return jsonb_build_object('ok', true, 'role', v_profile.role);
  end if;

  v_failed := v_pin.failed_attempts + 1;
  if v_failed >= 10 then
    update public.profile_pins set failed_attempts = v_failed, needs_admin_unlock = true where profile_id = p_profile_id;
    perform public.prodlog_pin_audit(p_profile_id, 'pin_locked_admin', jsonb_build_object('failed_attempts', v_failed));
    return jsonb_build_object('ok', false, 'reason', 'locked_admin');
  elsif v_failed % 5 = 0 then
    update public.profile_pins set failed_attempts = v_failed, locked_until = now() + interval '15 minutes' where profile_id = p_profile_id;
    perform public.prodlog_pin_audit(p_profile_id, 'pin_locked', jsonb_build_object('failed_attempts', v_failed));
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', now() + interval '15 minutes');
  else
    update public.profile_pins set failed_attempts = v_failed where profile_id = p_profile_id;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin', 'remaining', 5 - (v_failed % 5));
  end if;
end;
$$;

-- ------------------------------------------------------------------ server only: login screen
create or replace function public.login_roster()
returns table (
  id uuid, display_name text, designation text, role text, display_order integer,
  photo_version bigint, has_pin boolean, machines text[]
)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.display_name, p.designation, p.role, p.display_order,
         (extract(epoch from ph.updated_at) * 1000)::bigint,
         pin.profile_id is not null,
         coalesce(array(
           select m.machine_code from public.machine_assignments a
             join public.machines m on m.id = a.machine_id
            where a.operator_id = p.id and a.is_active and m.is_active
            order by m.sort_order
         ), '{}')
    from public.profiles p
    left join public.profile_photos ph on ph.profile_id = p.id
    left join public.profile_pins pin on pin.profile_id = p.id
   where p.is_active and p.show_on_login and p.role in ('operator', 'supervisor')
   order by p.display_order, lower(p.display_name);
$$;

create or replace function public.get_profile_photo(p_profile_id uuid)
returns table (content_type text, data_base64 text, updated_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select content_type, data_base64, updated_at from public.profile_photos where profile_id = p_profile_id;
$$;

-- ------------------------------------------------------------------ admin: photos
create or replace function public.set_profile_photo(p_profile_id uuid, p_content_type text, p_data_base64 text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_prodlog_admin() then
    raise exception 'FORBIDDEN: only administrators can change photos';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'NOT_FOUND: person not found';
  end if;
  insert into public.profile_photos (profile_id, content_type, data_base64, updated_at)
  values (p_profile_id, p_content_type, p_data_base64, now())
  on conflict (profile_id) do update
    set content_type = excluded.content_type, data_base64 = excluded.data_base64, updated_at = now();
  perform public.prodlog_pin_audit(p_profile_id, 'photo_set');
end;
$$;

create or replace function public.clear_profile_photo(p_profile_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_prodlog_admin() then
    raise exception 'FORBIDDEN: only administrators can change photos';
  end if;
  delete from public.profile_photos where profile_id = p_profile_id;
  perform public.prodlog_pin_audit(p_profile_id, 'photo_removed');
end;
$$;

-- Signed-in staff see when a photo exists (for avatars inside the app).
create or replace function public.profile_photo_versions()
returns table (profile_id uuid, photo_version bigint)
language sql stable security definer
set search_path = public
as $$
  select ph.profile_id, (extract(epoch from ph.updated_at) * 1000)::bigint
    from public.profile_photos ph
   where public.prodlog_role() is not null;
$$;

-- ------------------------------------------------------------------ grants
do $$
declare f text;
begin
  -- admin functions: signed-in users (each checks is_prodlog_admin itself)
  foreach f in array array[
    'public.set_profile_pin(uuid,text)', 'public.unlock_profile_pin(uuid)', 'public.clear_profile_pin(uuid)',
    'public.profile_pin_status()', 'public.set_profile_photo(uuid,text,text)', 'public.clear_profile_photo(uuid)',
    'public.profile_photo_versions()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- server-only functions: never callable from a browser
  foreach f in array array[
    'public.verify_profile_pin(uuid,text)', 'public.login_roster()', 'public.get_profile_photo(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
