"use server";

import { createClient } from "@/lib/supabase/server";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

export interface ProfileSearchResult {
  id: string;
  username: string;
}

export async function searchProfilesByUsername(query: string): Promise<ActionResult<ProfileSearchResult[]>> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };

  const trimmed = query.trim();
  if (trimmed.length < 2) return { success: true, data: [] };

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .ilike("username", `%${trimmed}%`)
    .neq("id", user.id)
    .limit(10);

  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

export interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
}

export async function sendFriendRequest(addresseeUsername: string): Promise<ActionResult<FriendshipRow>> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };

  const { data: addressee } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", addresseeUsername.trim())
    .maybeSingle();

  if (!addressee) return { success: false, error: "No user with that username." };
  if (addressee.id === user.id) return { success: false, error: "You can't add yourself." };

  // Only pending/accepted rows block a new request — a past decline (in
  // either direction) does not, and is intentionally left untouched rather
  // than revived: the update policy only lets the addressee change status, so
  // the original requester has no RLS path to flip an old row back to
  // pending themselves. A fresh insert is the only correct way to re-request.
  const { data: existing } = await supabase
    .from("friendships")
    .select("id, status")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${addressee.id}),and(requester_id.eq.${addressee.id},addressee_id.eq.${user.id})`
    )
    .in("status", ["pending", "accepted"])
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") return { success: false, error: "You're already friends." };
    return { success: false, error: "A request is already pending with this person." };
  }

  const { data, error } = await supabase
    .from("friendships")
    .insert({ requester_id: user.id, addressee_id: addressee.id, status: "pending" })
    .select("id, requester_id, addressee_id, status, created_at")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Failed to send request." };
  return { success: true, data };
}

export async function respondToFriendRequest(friendshipId: string, accept: boolean): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };

  const { data: row } = await supabase.from("friendships").select("id, addressee_id").eq("id", friendshipId).maybeSingle();

  if (!row) return { success: false, error: "Request not found." };
  if (row.addressee_id !== user.id) return { success: false, error: "Only the recipient can respond to this request." };

  // updated_at is set by the friendships_set_updated_at trigger, not here.
  const { error } = await supabase
    .from("friendships")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", friendshipId);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

export async function removeFriendship(friendshipId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };

  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId)
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}
