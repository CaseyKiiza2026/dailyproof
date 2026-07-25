-- Friends system: request/accept flow between two users, plus a lightweight
-- nudge log. Matches the conventions of the existing habits/habit_logs schema
-- (see SPEC.md section 8): gen_random_uuid() PKs, auth.users FKs with
-- on delete cascade, timestamptz created_at/updated_at, RLS enabled on every
-- table with explicit per-operation policies.

-- friendships: one row per requester/addressee pair. Direction matters only
-- for who sent the request; once accepted, either side is "friends" with the
-- other. A user can never have more than one active (pending/accepted)
-- friendship row with the same other user, in either direction.
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users on delete cascade,
  addressee_id uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint friendships_no_self_friend check (requester_id <> addressee_id)
);

-- Only one PENDING or ACCEPTED row may exist between any two users regardless
-- of direction. Declined rows are excluded on purpose: re-requesting after a
-- decline is a fresh INSERT of a brand-new row (the app never tries to UPDATE
-- someone else's declined row back to pending — the update policy below only
-- lets the addressee change status, so the original requester couldn't do
-- that anyway). Old declined rows are simply left in place as history.
create unique index friendships_unique_active_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where status in ('pending', 'accepted');

create index friendships_requester_idx on public.friendships (requester_id);
create index friendships_addressee_idx on public.friendships (addressee_id);

-- Keep updated_at honest on every status transition (accept/decline) without
-- relying on the caller to remember to set it.
create or replace function public.set_friendships_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger friendships_set_updated_at
  before update on public.friendships
  for each row
  execute function public.set_friendships_updated_at();

alter table public.friendships enable row level security;

-- Either party to a friendship can see it.
create policy "friendships_select_participant"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Only the requester can create a request, and only as themselves.
create policy "friendships_insert_as_requester"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

-- Only the addressee can change status (accept/decline).
create policy "friendships_update_as_addressee"
  on public.friendships for update
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

-- Either party can delete the row (unfriending an accepted friendship, or
-- canceling a pending request they sent).
create policy "friendships_delete_participant"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- nudges: an append-only log of "hey, log today" taps between friends. No
-- delivery/notification mechanism exists yet (see SPEC.md section 7/10) — this
-- table is the stopgap record to build that on top of later.
create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users on delete cascade,
  to_user_id uuid not null references auth.users on delete cascade,
  habit_context text,
  created_at timestamptz default now(),
  constraint nudges_no_self_nudge check (from_user_id <> to_user_id)
);

create index nudges_to_user_idx on public.nudges (to_user_id);
create index nudges_from_user_idx on public.nudges (from_user_id);

alter table public.nudges enable row level security;

-- Either the sender or the recipient can see a nudge (recipient visibility is
-- for when a notifications UI exists; sender visibility lets the app show
-- "nudged" state without a separate round trip).
create policy "nudges_select_participant"
  on public.nudges for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- A user can only nudge an ACCEPTED friend, and only as themselves.
create policy "nudges_insert_as_sender_if_friends"
  on public.nudges for insert
  with check (
    auth.uid() = from_user_id
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = nudges.to_user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = nudges.to_user_id)
        )
    )
  );

-- No update/delete policies for nudges — it's an immutable log, so those
-- operations are denied by default now that RLS is enabled.
