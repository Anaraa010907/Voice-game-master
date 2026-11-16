-- Native Facebook sign-in on the Android app. The app signs in through the installed Facebook
-- app and sends the Facebook access token to the facebook-login Edge Function, which checks it
-- with Facebook and then uses these helpers (service role only) to find or link the account.

-- The account for a Facebook user: the one already linked to that Facebook ID, otherwise the
-- account with the same (Facebook-verified) e-mail, as Supabase's own Facebook sign-in links them.
create or replace function public.facebook_account(p_facebook_id text, p_email text)
returns table (user_id uuid, email text, linked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select found.user_id, found.email, found.linked from (
    select i.user_id, u.email, true as linked
    from auth.identities i join auth.users u on u.id = i.user_id
    where i.provider = 'facebook' and i.provider_id = p_facebook_id
    union all
    select u.id, u.email, false
    from auth.users u
    where nullif(trim(p_email), '') is not null and lower(u.email) = lower(trim(p_email)) and u.deleted_at is null
  ) found
  order by found.linked desc
  limit 1;
$$;

-- Records the Facebook identity on the account (or refreshes it), so the browser sign-in finds it too.
create or replace function public.link_facebook_identity(p_user uuid, p_facebook_id text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_facebook_id, p_user, p_data, 'facebook', now(), now(), now())
  on conflict (provider_id, provider) do update
    set identity_data = excluded.identity_data, last_sign_in_at = now(), updated_at = now()
    where auth.identities.user_id = p_user;

  update auth.users u
  set raw_app_meta_data = jsonb_set(
    coalesce(u.raw_app_meta_data, '{}'::jsonb), '{providers}',
    (select coalesce(jsonb_agg(distinct name), '[]'::jsonb)
       from (select jsonb_array_elements_text(coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb)) as name
             union select 'facebook') names))
  where u.id = p_user;
end;
$$;

revoke all on function public.facebook_account(text, text) from public, anon, authenticated;
revoke all on function public.link_facebook_identity(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.facebook_account(text, text) to service_role;
grant execute on function public.link_facebook_identity(uuid, text, jsonb) to service_role;
