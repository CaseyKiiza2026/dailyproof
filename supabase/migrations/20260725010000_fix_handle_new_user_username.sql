-- Bug fix: handle_new_user() was deriving the new profile's username from the
-- signup email's local-part, silently discarding whatever username the person
-- actually typed into the signup form (passed as raw_user_meta_data.username
-- by the client's supabase.auth.signUp({ options: { data: { username } } })
-- call). The collision-avoidance loop (append 1, 2, 3... on conflict) is
-- unchanged; only the source of `base_username` changes.
--
-- Falls back to the email local-part only when no username was submitted at
-- all (raw_user_meta_data.username is null/blank) — preserves behavior for
-- the one existing account that predates the username field.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
declare
  base_username text;
  final_username text;
  counter int := 0;
begin
  base_username := coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1));
  final_username := base_username;

  while exists (select 1 from public.profiles where username = final_username) loop
    counter := counter + 1;
    final_username := base_username || counter::text;
  end loop;

  insert into public.profiles (id, username)
  values (new.id, final_username);
  return new;
end;
$function$;
