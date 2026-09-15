-- Shared transactional writes for manual controls and reviewed AI plans.
create function public.apply_work_actions(p_actions jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a jsonb; v jsonb; target uuid; result jsonb:='[]'; affected integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_actions)<>'array' or jsonb_array_length(p_actions) not between 1 and 20 then raise exception 'Expected 1–20 actions'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 for a in select * from jsonb_array_elements(p_actions) loop
  v:=a->'values';target:=coalesce((a->>'id')::uuid,gen_random_uuid());
  if a->>'expected_updated_at' is not null then
   if a->>'tool'='update_task' then
    perform 1 from public.tasks where id=target and user_id=auth.uid() and updated_at=(a->>'expected_updated_at')::timestamptz for update;
   else
    perform 1 from public.reminders where id=target and user_id=auth.uid() and updated_at=(a->>'expected_updated_at')::timestamptz for update;
   end if;
   if not found then raise exception 'This item changed after review. Request a fresh plan.';end if;
  end if;
  case a->>'tool'
   when 'create_task' then
    insert into public.tasks(id,user_id,title,description,due_at,scheduled_start,scheduled_end,status,priority) values(target,auth.uid(),v->>'title',coalesce(v->>'description',''),(v->>'due_at')::timestamptz,(v->>'scheduled_start')::timestamptz,(v->>'scheduled_end')::timestamptz,coalesce(v->>'status','pending'),coalesce(v->>'priority','normal'));
   when 'update_task' then
    update public.tasks set title=v->>'title',description=v->>'description',due_at=(v->>'due_at')::timestamptz,scheduled_start=(v->>'scheduled_start')::timestamptz,scheduled_end=(v->>'scheduled_end')::timestamptz,status=v->>'status',priority=v->>'priority' where id=target and user_id=auth.uid();
    get diagnostics affected=row_count;if affected<>1 then raise exception 'Task not found' using errcode='42501'; end if;
   when 'create_reminder' then
    insert into public.reminders(id,user_id,title,message,scheduled_at,task_id,habit_id,only_if_incomplete) values(target,auth.uid(),v->>'title',coalesce(v->>'message',''),(v->>'scheduled_at')::timestamptz,(v->>'task_id')::uuid,(v->>'habit_id')::uuid,coalesce((v->>'only_if_incomplete')::boolean,false));
   when 'update_reminder' then
    update public.reminders set title=v->>'title',message=v->>'message',scheduled_at=(v->>'scheduled_at')::timestamptz,task_id=(v->>'task_id')::uuid,habit_id=(v->>'habit_id')::uuid,only_if_incomplete=(v->>'only_if_incomplete')::boolean where id=target and user_id=auth.uid() and status='pending';
    get diagnostics affected=row_count;if affected<>1 then raise exception 'Pending reminder not found' using errcode='42501'; end if;
   when 'cancel_reminder' then
    update public.reminders set status='cancelled' where id=target and user_id=auth.uid() and status='pending';
    get diagnostics affected=row_count;if affected<>1 then raise exception 'Pending reminder not found' using errcode='42501'; end if;
   else raise exception 'Unsupported action';
  end case;
  result:=result||jsonb_build_array(jsonb_build_object('id',target));
 end loop;return result;
end $$;
revoke all on function public.apply_work_actions(jsonb) from public,anon;
grant execute on function public.apply_work_actions(jsonb) to authenticated;

create table public.ai_plans (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 actions jsonb not null check(jsonb_typeof(actions)='array' and jsonb_array_length(actions) between 1 and 20),
 status text not null default 'pending' check(status in('pending','applied')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '20 minutes'
);
alter table public.ai_plans enable row level security;
create policy ai_plan_read on public.ai_plans for select to authenticated using(user_id=(select auth.uid()));
create policy ai_plan_insert on public.ai_plans for insert to authenticated with check(user_id=(select auth.uid()) and status='pending');
create policy ai_plan_apply on public.ai_plans for update to authenticated using(user_id=(select auth.uid()) and status='pending') with check(user_id=(select auth.uid()) and status='applied');
grant select,insert on public.ai_plans to authenticated;grant update(status) on public.ai_plans to authenticated;
create function public.apply_ai_plan(p_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare plan public.ai_plans;result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into plan from public.ai_plans where id=p_id and user_id=auth.uid() for update;
 if not found or plan.status<>'pending' or plan.expires_at<=now() then raise exception 'Plan expired or already applied'; end if;
 update public.ai_plans set status='applied' where id=p_id;
 result:=public.apply_work_actions(plan.actions);return result;
end $$;
revoke all on function public.apply_ai_plan(uuid) from public,anon;grant execute on function public.apply_ai_plan(uuid) to authenticated;

-- Persistent per-user rate limits also apply across serverless instances.
create table public.ai_usage(user_id uuid not null references auth.users(id) on delete cascade,window_start timestamptz not null,requests integer not null,primary key(user_id,window_start));
alter table public.ai_usage enable row level security;
create function public.consume_ai_request() returns void language plpgsql security definer set search_path='' as $$
declare used integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 insert into public.ai_usage(user_id,window_start,requests) values(auth.uid(),date_trunc('hour',now()),1)
 on conflict(user_id,window_start) do update set requests=public.ai_usage.requests+1 returning requests into used;
 if used>20 then raise exception 'AI request limit reached. Try again next hour.'; end if;
end $$;
revoke all on function public.consume_ai_request() from public,anon;grant execute on function public.consume_ai_request() to authenticated;
