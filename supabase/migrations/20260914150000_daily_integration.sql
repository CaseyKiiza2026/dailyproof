-- Extend the established summary RPC; preserve its authorization and field shape.
create or replace function public.get_friend_day_summary(p_target_user_id uuid,p_target_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare day_key date; today_key date; zone text; details boolean; result jsonb; total integer; complete integer; missed integer; rest integer; vacation integer; empty_count integer; statuses jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not public.can_read_friend_summary(p_target_user_id) then raise exception 'Not authorized' using errcode='42501'; end if;
 zone:=public.user_timezone(p_target_user_id);today_key:=public.user_today(p_target_user_id);day_key:=coalesce(p_target_date,today_key);
 if day_key>today_key then raise exception 'Future summaries unavailable'; end if;
 details:=auth.uid()=p_target_user_id or coalesce((select share_detailed_activity from public.user_preferences where user_id=p_target_user_id),false);
 with activities as (
  select h.name,coalesce(l.status,'empty') as status,h.order_index from public.habits h left join public.habit_logs l on l.habit_id=h.id and l.user_id=h.user_id and l.log_date=day_key
  where h.user_id=p_target_user_id and (h.created_at at time zone zone)::date<=day_key and extract(isodow from day_key)::int=any(h.scheduled_days)
  union all
  select 'Task · '||t.title,case when t.status='completed' then 'complete' else 'empty' end,2147483647 from public.tasks t where t.user_id=p_target_user_id and t.status<>'cancelled'
   and ((t.due_at at time zone zone)::date=day_key or (t.scheduled_start at time zone zone)::date=day_key)
 ) select count(*),count(*) filter(where status='complete'),count(*) filter(where status='missed'),count(*) filter(where status='rest'),count(*) filter(where status='vacation'),count(*) filter(where status='empty'),coalesce(jsonb_agg(jsonb_build_object('habit_name',name,'status',status) order by order_index,name),'[]')
 into total,complete,missed,rest,vacation,empty_count,statuses from activities;
 result:=jsonb_build_object('username',(select username from public.profiles where id=p_target_user_id),'log_date',day_key,'today_key',today_key,'complete_count',complete,'total_count',total,'completion',case when total-rest-vacation=0 then 0 else round(100.0*complete/(total-rest-vacation)) end,'streak',public.compute_current_streak(p_target_user_id,today_key),'details_visible',details);
 if details then result:=result||jsonb_build_object('missed_count',missed,'rest_count',rest,'vacation_count',vacation,'empty_count',empty_count,'statuses',statuses);end if;
 return result;
end $$;
