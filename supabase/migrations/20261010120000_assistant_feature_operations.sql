-- Extend the shared operation boundary. RLS, ownership triggers and calendar
-- constraints remain active. No dynamic SQL and no caller-supplied owner IDs.
-- Deleting image proof metadata revokes future reads immediately. A durable
-- queue removes the Storage bytes through its API, including cascade deletes.
create table public.proof_file_cleanup (
 proof_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 storage_path text not null unique check(storage_path=user_id::text||'/'||proof_id::text),
 created_at timestamptz not null default now()
);
alter table public.proof_file_cleanup enable row level security;
create policy proof_cleanup_owner_read on public.proof_file_cleanup for select to authenticated using(user_id=(select auth.uid()));
create policy proof_cleanup_owner_delete on public.proof_file_cleanup for delete to authenticated using(user_id=(select auth.uid()));
create policy proof_cleanup_owner_insert on public.proof_file_cleanup for insert to authenticated with check(
 user_id=(select auth.uid()) and exists(select 1 from public.proofs where id=proof_id and user_id=(select auth.uid()) and storage_path=proof_file_cleanup.storage_path)
);
revoke all on public.proof_file_cleanup from public,anon,authenticated;
grant select,insert,delete on public.proof_file_cleanup to authenticated;
grant select,delete on public.proof_file_cleanup to service_role;
create function public.queue_deleted_proof_file() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.storage_path is not null then
  insert into public.proof_file_cleanup(proof_id,user_id,storage_path) values(old.id,old.user_id,old.storage_path) on conflict(proof_id) do nothing;
 end if;
 return old;
end $$;
revoke all on function public.queue_deleted_proof_file() from public,anon,authenticated;
create trigger proof_deleted_file before delete on public.proofs for each row execute function public.queue_deleted_proof_file();
alter function public.apply_work_actions(jsonb) rename to apply_work_actions_core;
create function public.apply_work_actions(p_actions jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a jsonb; v jsonb; target uuid; affected integer; peer uuid; log_id uuid; phase integer;
 core jsonb; result jsonb:='[]'; local_today date; zone text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_actions)<>'array' or jsonb_array_length(p_actions) not between 1 and 20 then raise exception 'Expected 1–20 actions'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select timezone into zone from public.user_preferences where user_id=auth.uid();
 if zone is null then raise exception 'Finish timezone setup first'; end if;
 local_today:=(now() at time zone zone)::date;
 select coalesce(jsonb_agg(item),'[]') into core from jsonb_array_elements(p_actions) item
 where item->>'tool' in ('create_task','update_task','create_commitment','update_commitment','create_reminder','update_reminder','cancel_reminder');
 -- Apply calendar removals and habit changes before validating final task
 -- schedules. Proofs/logs and other dependent operations follow core writes.
 -- Everything remains one transaction: any failure rolls all stages back.
 for phase in 0..1 loop
 if phase=1 and jsonb_array_length(core)>0 then perform public.apply_work_actions_core(core); end if;
 for a in select item from jsonb_array_elements(p_actions) item
 where (item->>'tool' in ('delete_task','delete_commitment','delete_habit','delete_all_habits','create_habit','update_habit','set_habit_time','seed_starter_habits')) = (phase=0) loop
  v:=a->'values'; target:=(a->>'id')::uuid;
  if target is null or jsonb_typeof(v)<>'object' then raise exception 'Invalid operation'; end if;
  affected:=1;
  case a->>'tool'
   when 'delete_all_habits' then
    if jsonb_typeof(a->'expected_habit_ids') is distinct from 'array'
     or (select count(*) from public.habits where user_id=auth.uid()) <> jsonb_array_length(a->'expected_habit_ids')
     or exists(select 1 from jsonb_array_elements_text(a->'expected_habit_ids') i where not exists(select 1 from public.habits where id=i::uuid and user_id=auth.uid()))
    then raise exception 'Your habits changed. Request a fresh deletion review'; end if;
    delete from public.habits where user_id=auth.uid();
   when 'seed_starter_habits' then
    if exists(select 1 from public.habits where user_id=auth.uid()) then raise exception 'Starter habits require an empty habit list'; end if;
    insert into public.habits(user_id,name,category,is_core,order_index,scheduled_days)
    select auth.uid(),s.name,s.category,true,s.ordinal,array[1,2,3,4,5,6,7]
    from (values ('45 min ML minimum','ML / Career',0),('Code something','ML / Career',1),
     ('Protein target','Fitness / Bulk',2),('Calories target','Fitness / Bulk',3),
     ('Gym or recovery','Fitness / Bulk',4),('Water','Sleep / Recovery',5),
     ('No social before 5 PM','Discipline',6),('Plan tomorrow','Discipline',7)) s(name,category,ordinal);
   when 'create_task','update_task','create_commitment','update_commitment','create_reminder','update_reminder','cancel_reminder' then null;
   when 'create_habit','update_habit' then
    if length(trim(v->>'name')) not between 1 and 200 or length(v->>'category')>100 or jsonb_typeof(v->'is_core')<>'boolean'
      or jsonb_typeof(v->'scheduled_days')<>'array' or jsonb_array_length(v->'scheduled_days') not between 1 and 7
      or exists(select 1 from jsonb_array_elements_text(v->'scheduled_days') d where d !~ '^[1-7]$') then raise exception 'Invalid habit'; end if;
    if a->>'tool'='create_habit' then
     insert into public.habits(id,user_id,name,category,is_core,order_index,scheduled_days,scheduled_time,duration_minutes)
     values(target,auth.uid(),trim(v->>'name'),v->>'category',(v->>'is_core')::boolean,
      (select coalesce(max(order_index),-1)+1 from public.habits where user_id=auth.uid()),
      array(select distinct d::integer from jsonb_array_elements_text(v->'scheduled_days') d order by d::integer),
      (v->>'scheduled_time')::time,(v->>'duration_minutes')::integer);
    else
     update public.habits set name=trim(v->>'name'),category=v->>'category',is_core=(v->>'is_core')::boolean,
      scheduled_days=array(select distinct d::integer from jsonb_array_elements_text(v->'scheduled_days') d order by d::integer),
      scheduled_time=(v->>'scheduled_time')::time,duration_minutes=(v->>'duration_minutes')::integer where id=target and user_id=auth.uid();
     get diagnostics affected=row_count;
    end if;
   when 'set_habit_time' then
    update public.habits set scheduled_time=(v->>'scheduled_time')::time,duration_minutes=(v->>'duration_minutes')::integer where id=target and user_id=auth.uid();
    get diagnostics affected=row_count;
   when 'log_habit' then
    perform 1 from public.habits where id=target and user_id=auth.uid();
    if not found then raise exception 'Habit unavailable' using errcode='42501'; end if;
    if (v->>'log_date')::date not in (local_today,local_today-1) then raise exception 'This day is outside the edit window'; end if;
    if v->>'status'='empty' then
     delete from public.habit_logs where habit_id=target and user_id=auth.uid() and log_date=(v->>'log_date')::date;
    else
     insert into public.habit_logs(habit_id,user_id,log_date,status,logged_late,updated_at)
     values(target,auth.uid(),(v->>'log_date')::date,v->>'status',(v->>'log_date')::date=local_today-1,now())
     on conflict(habit_id,log_date) do update set status=excluded.status,logged_late=excluded.logged_late,updated_at=excluded.updated_at;
    end if;
   when 'delete_habit' then
    delete from public.habits where id=target and user_id=auth.uid(); get diagnostics affected=row_count;
   when 'delete_task' then
    delete from public.tasks where id=target and user_id=auth.uid(); get diagnostics affected=row_count;
   when 'delete_commitment' then
    delete from public.commitments where id=target and user_id=auth.uid(); get diagnostics affected=row_count;
   when 'add_proof' then
    if v->>'type' not in ('note','link') then raise exception 'Use the upload UI for images'; end if;
    log_id:=null;
    if v->>'habit_id' is not null then
     select id into log_id from public.habit_logs where habit_id=(v->>'habit_id')::uuid and user_id=auth.uid() and log_date=(v->>'log_date')::date and status='complete';
     if log_id is null then raise exception 'Completed habit log unavailable' using errcode='42501'; end if;
    end if;
    insert into public.proofs(id,user_id,task_id,habit_log_id,type,content,visibility)
    values(target,auth.uid(),(v->>'task_id')::uuid,log_id,v->>'type',trim(v->>'content'),'private');
   when 'delete_proof' then
    delete from public.proofs where id=target and user_id=auth.uid(); get diagnostics affected=row_count;
   when 'send_friend_request' then
    select id into peer from public.profiles where username=trim(v->>'username');
    if peer is null or peer=auth.uid() then raise exception 'Username unavailable'; end if;
    insert into public.friendships(id,requester_id,addressee_id,status) values(target,auth.uid(),peer,'pending');
   when 'respond_friend_request' then
    update public.friendships set status=case when (v->>'accept')::boolean then 'accepted' else 'declined' end
    where id=target and addressee_id=auth.uid() and status='pending'; get diagnostics affected=row_count;
   when 'remove_friendship' then
    delete from public.friendships where id=target and (requester_id=auth.uid() or addressee_id=auth.uid()); get diagnostics affected=row_count;
   when 'send_nudge' then
    select case when requester_id=auth.uid() then addressee_id else requester_id end into peer
    from public.friendships where id=target and status='accepted' and (requester_id=auth.uid() or addressee_id=auth.uid());
    if peer is null then raise exception 'Accepted friend unavailable' using errcode='42501'; end if;
    insert into public.nudges(from_user_id,to_user_id) values(auth.uid(),peer);
   when 'mark_notification_read' then
    update public.notifications set read_at=coalesce(read_at,now()) where id=target and user_id=auth.uid(); get diagnostics affected=row_count;
   when 'update_notification_settings' then
    insert into public.notification_settings(user_id) values(auth.uid()) on conflict(user_id) do nothing;
    update public.notification_settings set
     enabled=case when v ? 'enabled' then (v->>'enabled')::boolean else enabled end,
     daily_time=case when v ? 'daily_time' then (v->>'daily_time')::time else daily_time end,
     friend_activity=case when v ? 'friend_activity' then (v->>'friend_activity')::boolean else friend_activity end,
     nudges=case when v ? 'nudges' then (v->>'nudges')::boolean else nudges end where user_id=auth.uid(); get diagnostics affected=row_count;
   else raise exception 'Unsupported action';
  end case;
  if affected<>1 then raise exception 'Item unavailable or operation unsupported for this item' using errcode='42501'; end if;
 end loop;
 end loop;
 select jsonb_agg(jsonb_build_object('id',item->>'id') order by ordinal) into result
 from jsonb_array_elements(p_actions) with ordinality as changes(item,ordinal);
 return result;
end $$;

-- A client-generated request key protects complete conversational executions
-- against HTTP retries and concurrent submissions, not only individual Apply.
create table public.assistant_runs (
 id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
 question text not null check(length(question) between 1 and 4000),
 response jsonb, created_at timestamptz not null default now(),
 primary key(user_id,id)
);
alter table public.assistant_runs enable row level security;
create policy assistant_runs_owner on public.assistant_runs for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.assistant_runs from public,anon,authenticated;
grant select,insert,update on public.assistant_runs to authenticated;
create function public.retry_assistant_run(p_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 update public.assistant_runs set response=null where id=p_id and user_id=auth.uid()
  and response->>'blocked'='true' and response->>'savedCount'='0' and response->>'planId' is null;
 get diagnostics affected=row_count;
 return affected=1;
end $$;
revoke all on function public.retry_assistant_run(uuid) from public,anon;
grant execute on function public.retry_assistant_run(uuid) to authenticated;
revoke all on function public.apply_work_actions(jsonb) from public,anon;
grant execute on function public.apply_work_actions(jsonb) to authenticated;

-- Rebind the existing plan function after renaming its former callee.
create or replace function public.apply_ai_plan(p_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare plan public.ai_plans; result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 -- Reading an applied receipt must not require UPDATE permission: the existing
 -- UPDATE RLS policy deliberately allows only pending -> applied transitions.
 select * into plan from public.ai_plans where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Plan unavailable' using errcode='42501'; end if;
 if plan.status='applied' then
  return (select jsonb_agg(jsonb_build_object('id',a->>'id')) from jsonb_array_elements(plan.actions) a);
 end if;
 if plan.expires_at<=now() then raise exception 'Plan expired'; end if;
 result:=public.apply_work_actions(plan.actions);
 update public.ai_plans set status='applied' where id=p_id and user_id=auth.uid();
 return result;
end $$;
