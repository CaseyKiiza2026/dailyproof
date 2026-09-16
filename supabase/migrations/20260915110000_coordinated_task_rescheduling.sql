-- P0-A / R-03: validate coordinated moves against the final schedule.
-- CREATE OR REPLACE preserves the existing invoker security and EXECUTE ACL.
create or replace function public.apply_work_actions(p_actions jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a jsonb; v jsonb; target uuid; result jsonb:='[]'; affected integer; task_action_count integer; current_task public.tasks;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_actions)<>'array' or jsonb_array_length(p_actions) not between 1 and 20 then raise exception 'Expected 1–20 actions'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));

 -- Inspect the original rows before any staging writes change updated_at.
 -- The existing owner lock serializes this with task/commitment/habit scheduling.
 if exists (
   select 1 from jsonb_array_elements(p_actions) item
   where item->>'tool' in ('create_task','update_task') and item->>'id' is not null
   group by (item->>'id')::uuid having count(*) > 1
 ) then raise exception 'Propose only one final change per task'; end if;
 select count(*) into task_action_count from jsonb_array_elements(p_actions) item
 where item->>'tool' in ('create_task','update_task');
 for a in select * from jsonb_array_elements(p_actions) loop
  target:=(a->>'id')::uuid;
  if a->>'tool'='update_task' then
   select * into current_task from public.tasks where id=target and user_id=auth.uid() for update;
   if not found then raise exception 'Task not found' using errcode='42501'; end if;
   if a->>'expected_updated_at' is not null and current_task.updated_at<>(a->>'expected_updated_at')::timestamptz then
    raise exception 'This item changed after review. Request a fresh plan.';
   end if;
  end if;
 end loop;
 if task_action_count>1 then
  -- Vacate only intervals being changed, inside this same transaction. All
  -- final writes still execute the unchanged overlap/habit/identity triggers
  -- and CHECK constraints. Any failure rolls back this staging and the plan.
  -- No trigger, RLS policy, constraint or session-level bypass is disabled.
  update public.tasks t set scheduled_start=null,scheduled_end=null
  from jsonb_array_elements(p_actions) item
  where item->>'tool'='update_task' and t.id=(item->>'id')::uuid and t.user_id=auth.uid()
   and t.scheduled_start is not null
   and (t.scheduled_start is distinct from (item->'values'->>'scheduled_start')::timestamptz
     or t.scheduled_end is distinct from (item->'values'->>'scheduled_end')::timestamptz
     or t.status is distinct from item->'values'->>'status');
 end if;
 for a in select * from jsonb_array_elements(p_actions) loop
  v:=a->'values';target:=coalesce((a->>'id')::uuid,gen_random_uuid());
  -- Reminder writes are not staged; retain their original per-action stale check.
  if a->>'tool'<>'update_task' and a->>'expected_updated_at' is not null then
   perform 1 from public.reminders where id=target and user_id=auth.uid()
    and updated_at=(a->>'expected_updated_at')::timestamptz for update;
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
