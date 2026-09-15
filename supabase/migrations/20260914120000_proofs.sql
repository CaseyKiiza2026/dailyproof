alter table public.habit_logs add constraint habit_logs_id_owner unique(id,user_id);
alter table public.user_preferences add column share_proofs boolean not null default false;
create table public.proofs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid, habit_log_id uuid,
 type text not null check(type in('image','note','link')),
 content text check(length(content)<=10000), storage_path text unique,
 visibility text not null default 'private' check(visibility in('private','friends')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(task_id,user_id) references public.tasks(id,user_id) on delete cascade,
 foreign key(habit_log_id,user_id) references public.habit_logs(id,user_id) on delete cascade,
 check(num_nonnulls(task_id,habit_log_id)=1),
 check((type='image' and storage_path is not null and storage_path=user_id::text||'/'||id::text and content is null)
   or (type in('note','link') and storage_path is null and content is not null and length(trim(content))>0)),
 check(type<>'link' or content ~ '^https?://[^[:space:]]+$')
);
create index proofs_task on public.proofs(task_id);
create index proofs_log on public.proofs(habit_log_id);
create index proofs_owner on public.proofs(user_id,created_at);
alter table public.proofs enable row level security;
create function public.can_read_shared_proof(owner_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.user_preferences p where p.user_id=owner_id and p.share_proofs and p.share_detailed_activity)
 and exists(select 1 from public.friendships f where f.status='accepted' and ((f.requester_id=auth.uid() and f.addressee_id=owner_id) or (f.addressee_id=auth.uid() and f.requester_id=owner_id)));
$$;
revoke all on function public.can_read_shared_proof(uuid) from public,anon;
grant execute on function public.can_read_shared_proof(uuid) to authenticated;
create policy proofs_read on public.proofs for select to authenticated using(user_id=(select auth.uid()) or (visibility='friends' and public.can_read_shared_proof(user_id)));
create policy proofs_insert on public.proofs for insert to authenticated with check(user_id=(select auth.uid()));
create policy proofs_update on public.proofs for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy proofs_delete on public.proofs for delete to authenticated using(user_id=(select auth.uid()));
grant select,insert,update,delete on public.proofs to authenticated;
create trigger proofs_stamp before update on public.proofs for each row execute function public.stamp_owned_record();
create function public.validate_proof_target() returns trigger language plpgsql set search_path='' as $$
begin
 if new.task_id is not null and not exists(select 1 from public.tasks t where t.id=new.task_id and t.user_id=new.user_id and t.status='completed') then raise exception 'Complete the task before adding proof'; end if;
 if new.habit_log_id is not null and not exists(select 1 from public.habit_logs l where l.id=new.habit_log_id and l.user_id=new.user_id and l.status='complete') then raise exception 'Complete the habit before adding proof'; end if;
 return new;
end $$;
create trigger proofs_target before insert or update on public.proofs for each row execute function public.validate_proof_target();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('proofs','proofs',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy proof_files_insert on storage.objects for insert to authenticated with check(bucket_id='proofs' and exists(select 1 from public.proofs p where p.storage_path=name and p.user_id=(select auth.uid())));
create policy proof_files_read on storage.objects for select to authenticated using(bucket_id='proofs' and exists(select 1 from public.proofs p where p.storage_path=name));
create policy proof_files_delete on storage.objects for delete to authenticated using(bucket_id='proofs' and split_part(name,'/',1)=(select auth.uid())::text);
