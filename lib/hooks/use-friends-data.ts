"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAuthorizationError, requireRead } from "@/lib/read-errors";
import { createClient } from "@/lib/supabase/client";
import { removeFriendship, respondToFriendRequest, sendFriendRequest } from "@/lib/actions/friends";
import { sendNudge } from "@/lib/actions/nudges";
import { Friendship } from "@/lib/types";

export function useFriendsData() {
  const [userId, setUserId] = useState<string | null>(null);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const generation = useRef(0);
  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    const request = ++generation.current;
    const currentRequest = () => !cancelled && request === generation.current;

    async function load() {
      setLoading(true);
      const supabase = createClient();

      const {
        data: { user }, error: authError
      } = await supabase.auth.getUser();

      if (authError && authError.name !== "AuthSessionMissingError") throw authError;
      if (!user) {
        if (currentRequest()) {
          setUserId(null);
          setFriendships([]);
          setLoading(false);
        }
        return;
      }

      const { data: rows, error: rowsError } = await supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status, created_at")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      requireRead(rows, rowsError);
      // A successful ownership read can revoke previously known friendships.
      if (currentRequest()) setFriendships(current => current.filter(f => rows.some(row => row.id === f.id && row.status === f.status)));
      const otherIds = Array.from(
        new Set((rows ?? []).map((row) => (row.requester_id === user.id ? row.addressee_id : row.requester_id)))
      );

      const { data: profileRows, error: profilesError } =
        otherIds.length > 0 ? await supabase.from("profiles").select("id, username").in("id", otherIds) : { data: [], error: null };

      requireRead(profileRows, profilesError);
      const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

      const merged: Friendship[] = (rows ?? []).flatMap((row) => {
        const isRequester = row.requester_id === user.id;
        const otherId = isRequester ? row.addressee_id : row.requester_id;
        const profile = profileById.get(otherId);
        if (!profile) return [];
        return [
          {
            id: row.id,
            status: row.status,
            requesterId: row.requester_id,
            addresseeId: row.addressee_id,
            createdAt: row.created_at,
            otherUser: profile,
            isRequester
          }
        ];
      });

      if (currentRequest()) {
        setUserId(user.id);
        setFriendships(merged);
        setLoading(false);
        setError(null);
      }
    }

    void load().catch(cause => {
      if (!currentRequest()) return;
      if (isAuthorizationError(cause)) { setFriendships([]); setUserId(null);  }
      setError("Unable to load friendships. Please try again.");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const acceptedFriends = useMemo(() => friendships.filter((f) => f.status === "accepted"), [friendships]);
  const incomingPending = useMemo(() => friendships.filter((f) => f.status === "pending" && !f.isRequester), [friendships]);
  const outgoingPending = useMemo(() => friendships.filter((f) => f.status === "pending" && f.isRequester), [friendships]);

  async function addFriend(username: string) {
    generation.current++;
    try { return await sendFriendRequest(username); }
    finally { generation.current++; reload(); }
  }

  async function respond(friendshipId: string, accept: boolean) {
    generation.current++;
    try {
      const result = await respondToFriendRequest(friendshipId, accept);
      if (result.success) setFriendships(current => accept
        ? current.map(f => f.id === friendshipId ? {...f,status:"accepted"} : f)
        : current.filter(f => f.id !== friendshipId));
      return result;
    } finally { generation.current++; reload(); }
  }

  async function remove(friendshipId: string) {
    generation.current++;
    try {
      const result = await removeFriendship(friendshipId);
      if (result.success) setFriendships(current => current.filter(f => f.id !== friendshipId));
      return result;
    } finally { generation.current++; reload(); }
  }

  async function nudge(toUserId: string) {
    return sendNudge(toUserId);
  }

  return {
    userId,
    loading,
    error,
    friendships,
    acceptedFriends,
    incomingPending,
    outgoingPending,
    addFriend,
    respond,
    remove,
    nudge,
    reload
  };
}
