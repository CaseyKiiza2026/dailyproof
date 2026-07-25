"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { removeFriendship, respondToFriendRequest, sendFriendRequest } from "@/lib/actions/friends";
import { sendNudge } from "@/lib/actions/nudges";
import { Friendship } from "@/lib/types";

export function useFriendsData() {
  const [userId, setUserId] = useState<string | null>(null);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = createClient();

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setUserId(null);
          setFriendships([]);
          setLoading(false);
        }
        return;
      }

      const { data: rows } = await supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status, created_at")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      const otherIds = Array.from(
        new Set((rows ?? []).map((row) => (row.requester_id === user.id ? row.addressee_id : row.requester_id)))
      );

      const { data: profileRows } =
        otherIds.length > 0 ? await supabase.from("profiles").select("id, username").in("id", otherIds) : { data: [] };

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

      if (!cancelled) {
        setUserId(user.id);
        setFriendships(merged);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const acceptedFriends = useMemo(() => friendships.filter((f) => f.status === "accepted"), [friendships]);
  const incomingPending = useMemo(() => friendships.filter((f) => f.status === "pending" && !f.isRequester), [friendships]);
  const outgoingPending = useMemo(() => friendships.filter((f) => f.status === "pending" && f.isRequester), [friendships]);

  async function addFriend(username: string) {
    const result = await sendFriendRequest(username);
    if (result.success) reload();
    return result;
  }

  async function respond(friendshipId: string, accept: boolean) {
    const result = await respondToFriendRequest(friendshipId, accept);
    if (result.success) reload();
    return result;
  }

  async function remove(friendshipId: string) {
    const result = await removeFriendship(friendshipId);
    if (result.success) reload();
    return result;
  }

  async function nudge(toUserId: string) {
    return sendNudge(toUserId);
  }

  return {
    userId,
    loading,
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
