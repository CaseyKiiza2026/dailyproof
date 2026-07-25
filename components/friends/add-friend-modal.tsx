"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { searchProfilesByUsername, ProfileSearchResult } from "@/lib/actions/friends";
import { Friendship } from "@/lib/types";

interface AddFriendModalProps {
  friendships: Friendship[];
  onClose: () => void;
  onAdd: (username: string) => Promise<{ success: boolean; error?: string }>;
}

type RelationState = "none" | "pending-outgoing" | "pending-incoming" | "friends";

function relationTo(friendships: Friendship[], profileId: string): RelationState {
  const match = friendships.find((f) => f.otherUser.id === profileId);
  if (!match) return "none";
  if (match.status === "accepted") return "friends";
  if (match.status === "pending") return match.isRequester ? "pending-outgoing" : "pending-incoming";
  return "none";
}

export function AddFriendModal({ friendships, onClose, onAdd }: AddFriendModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [resolvedQuery, setResolvedQuery] = useState<string | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const trimmedQuery = query.trim();
  const queryTooShort = trimmedQuery.length < 2;
  const searching = !queryTooShort && resolvedQuery !== trimmedQuery;

  useEffect(() => {
    if (queryTooShort) return;

    const id = ++requestId.current;
    const timeout = setTimeout(async () => {
      const result = await searchProfilesByUsername(trimmedQuery);
      if (requestId.current !== id) return;
      setResolvedQuery(trimmedQuery);
      if (result.success) setResults(result.data);
    }, 350);

    return () => clearTimeout(timeout);
  }, [trimmedQuery, queryTooShort]);

  async function handleAdd(username: string) {
    setSendingTo(username);
    setError(null);
    const result = await onAdd(username);
    setSendingTo(null);
    if (!result.success) {
      setError(result.error ?? "Failed to send request.");
      return;
    }
    setSentTo((current) => new Set(current).add(username));
  }

  return (
    <Modal title="Add a friend" onClose={onClose}>
      <label className="proof-focus flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 py-2.5">
        <UserPlus size={15} className="text-white/35" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by username"
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
        />
      </label>

      {error && <p className="mt-2 text-xs font-semibold text-proof-red">{error}</p>}

      <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
        {!queryTooShort && searching && <p className="px-1 py-2 text-xs text-white/35">Searching…</p>}
        {!queryTooShort && !searching && results.length === 0 && (
          <p className="px-1 py-2 text-xs text-white/35">No one found with that username.</p>
        )}
        {!queryTooShort && results.map((profile) => {
          const relation = relationTo(friendships, profile.id);
          const justSent = sentTo.has(profile.username);
          return (
            <div key={profile.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-proof-green/25 bg-proof-green/10 text-[10px] font-black text-proof-green">
                  {profile.username.slice(0, 2).toUpperCase()}
                </span>
                <p className="truncate text-sm font-bold text-white/85">@{profile.username}</p>
              </div>
              {relation === "friends" ? (
                <span className="shrink-0 text-xs font-semibold text-white/35">Friends</span>
              ) : relation === "pending-outgoing" || justSent ? (
                <span className="shrink-0 text-xs font-semibold text-proof-amber">Pending</span>
              ) : relation === "pending-incoming" ? (
                <span className="shrink-0 text-xs font-semibold text-white/35">Sent you a request</span>
              ) : (
                <button
                  type="button"
                  disabled={sendingTo === profile.username}
                  onClick={() => handleAdd(profile.username)}
                  className="proof-focus flex shrink-0 items-center gap-1 rounded-full bg-proof-green px-3 py-1.5 text-xs font-bold text-black shadow-proof-button transition hover:brightness-110 active:scale-95 disabled:opacity-60"
                >
                  {sendingTo === profile.username ? <Loader2 size={13} className="animate-spin" /> : justSent ? <Check size={13} /> : null}
                  {sendingTo === profile.username ? "Sending" : "Add"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
