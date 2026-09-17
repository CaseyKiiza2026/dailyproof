"use client";

import { useState } from "react";
import { Check, Search, Sparkles, UserPlus, UsersRound, X } from "lucide-react";
import { useFriendsData } from "@/lib/hooks/use-friends-data";
import { AddFriendModal } from "@/components/friends/add-friend-modal";
import { FriendRowMenu } from "@/components/friends/friend-row-menu";
import { RemoveFriendDialog } from "@/components/friends/remove-friend-dialog";
import { NudgeButton } from "@/components/friends/nudge-button";
import { Friendship } from "@/lib/types";
import { FriendHistory } from "@/components/friends/friend-history";

function initialsOf(username: string) {
  return username.slice(0, 2).toUpperCase();
}

export default function FriendsPage() {
  const friends = useFriendsData();
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Friendship | null>(null);
  const [search, setSearch] = useState("");
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const query = search.trim().toLowerCase();
  const visibleAccepted = friends.acceptedFriends.filter((f) => f.otherUser.username.toLowerCase().includes(query));
  const visibleOutgoing = friends.outgoingPending.filter((f) => f.otherUser.username.toLowerCase().includes(query));

  const hasNothingAtAll =
    friends.ready && !friends.error && friends.acceptedFriends.length === 0 && friends.incomingPending.length === 0 && friends.outgoingPending.length === 0;

  const circleIsEmpty = friends.ready && !friends.error && visibleAccepted.length === 0 && visibleOutgoing.length === 0;

  async function handleRespond(friendshipId: string, accept: boolean) {
    setRespondingId(friendshipId);
    await friends.respond(friendshipId, accept);
    setRespondingId(null);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="proof-kicker">Accountability circle</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Friends</h1>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="proof-pill proof-focus h-11 px-4 text-sm font-bold text-proof-green transition active:scale-[0.96]"
        >
          <UserPlus size={17} className="mr-2" />
          Add
        </button>
      </header>

      {friends.error&&<p role="alert" className="text-proof-red">{friends.error} <button className="proof-action" onClick={friends.reload}>Retry</button></p>}

      <label className="proof-panel proof-focus flex items-center gap-3 px-4 py-3">
        <Search size={17} className="text-white/30" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full bg-transparent text-sm outline-none placeholder:text-white/25"
          placeholder="Search friends or username"
        />
      </label>

      {!friends.ready && <section aria-label="Loading friendships and requests" className="proof-panel min-h-[280px] space-y-3 p-5"><p className="text-sm text-white/35">{friends.error ? "Friends and requests unavailable." : "Loading friends and requests..."}</p>{[0,1,2].map(i => <div key={i} aria-hidden="true" className="h-16 rounded-xl bg-white/[0.04]" />)}</section>}

      {friends.incomingPending.length > 0 && (
        <section className="proof-panel overflow-hidden">
          <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-4">
            <UserPlus size={18} className="text-proof-amber" />
            <h2 className="font-bold">Requests</h2>
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-proof-amber/15 px-1.5 text-[11px] font-bold text-proof-amber">
              {friends.incomingPending.length}
            </span>
          </div>
          {friends.incomingPending.map((request) => (
            <div key={request.id} className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4 last:border-0">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-proof-amber/25 bg-proof-amber/10 text-xs font-black text-proof-amber">
                {initialsOf(request.otherUser.username)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">@{request.otherUser.username}</p>
                <p className="text-xs text-white/30">wants to be friends</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  aria-label="Decline"
                  disabled={respondingId === request.id}
                  onClick={() => handleRespond(request.id, false)}
                  className="proof-focus grid h-11 w-11 sm:h-9 sm:w-9 place-items-center rounded-full border border-white/[0.09] text-white/45 transition hover:border-proof-red/40 hover:text-proof-red active:scale-90 disabled:opacity-50"
                >
                  <X size={15} />
                </button>
                <button
                  aria-label="Accept"
                  disabled={respondingId === request.id}
                  onClick={() => handleRespond(request.id, true)}
                  className="proof-focus grid h-11 w-11 sm:h-9 sm:w-9 place-items-center rounded-full bg-proof-green text-black shadow-proof-button transition hover:brightness-110 active:scale-90 disabled:opacity-50"
                >
                  <Check size={15} />
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {hasNothingAtAll ? (
        <section className="proof-panel flex flex-col items-center gap-4 px-6 py-14 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-proof-green">
            <UsersRound size={20} />
          </div>
          <div>
            <p className="text-base font-bold text-white/85">Your circle is empty</p>
            <p className="mt-1.5 max-w-sm text-sm leading-6 text-white/40">
              Add a friend to share streaks and keep each other honest — no likes, no noise, just real accountability.
            </p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="proof-focus mt-1 h-10 rounded-full bg-proof-green px-5 text-sm font-bold text-black shadow-proof-button transition hover:brightness-110 active:scale-95"
          >
            Add a friend
          </button>
        </section>
      ) : (
        <section className="proof-panel overflow-hidden">
          <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-4">
            <UsersRound size={18} className="text-proof-green" />
            <h2 className="font-bold">Your circle</h2>
          </div>

          {circleIsEmpty ? (
            <p className="px-5 py-8 text-center text-sm text-white/35">No friends here yet — accept a request above, or add someone new.</p>
          ) : (
            <>
              {visibleOutgoing.map((friendship) => (
                <div key={friendship.id} className="group flex items-center gap-3 border-b border-white/[0.06] px-5 py-4 last:border-0">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/[0.09] bg-white/[0.03] text-xs font-black text-white/50">
                    {initialsOf(friendship.otherUser.username)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white/70">@{friendship.otherUser.username}</p>
                    <p className="text-xs font-semibold text-proof-amber">Pending</p>
                  </div>
                  <FriendRowMenu label="Cancel request" onRemove={() => setRemoveTarget(friendship)} />
                </div>
              ))}
              {visibleAccepted.map((friendship) => (
                <div key={friendship.id} className="group space-y-3 border-b border-white/[0.06] px-4 py-4 last:border-0 sm:px-5">
                 <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-proof-green/25 bg-proof-green/10 text-xs font-black text-proof-green">
                    {initialsOf(friendship.otherUser.username)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">@{friendship.otherUser.username}</p>
                    <p className="text-xs text-white/30">Friends</p>
                  </div>
                  <NudgeButton onNudge={() => friends.nudge(friendship.otherUser.id)} />
                  <FriendRowMenu label="Unfriend" onRemove={() => setRemoveTarget(friendship)} />
                 </div>
                 <FriendHistory userId={friendship.otherUser.id} />
                </div>
              ))}
            </>
          )}
        </section>
      )}

      <section className="proof-panel p-5">
        <p className="proof-kicker">Shared template</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/35">
            <Sparkles size={17} />
          </div>
          <div>
            <p className="text-sm font-bold text-white/70">No shared templates yet</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-white/35">
              When a friend shares a habit template, you&rsquo;ll be able to copy and customize it here. Template sharing isn&rsquo;t built yet.
            </p>
          </div>
        </div>
      </section>

      {addOpen && <AddFriendModal friendships={friends.friendships} onClose={() => setAddOpen(false)} onAdd={friends.addFriend} />}

      {removeTarget && (
        <RemoveFriendDialog
          username={removeTarget.otherUser.username}
          isPendingOutgoing={removeTarget.status === "pending" && removeTarget.isRequester}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => friends.remove(removeTarget.id)}
        />
      )}
    </div>
  );
}
