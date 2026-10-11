"use server";

import { createClient } from "@/lib/supabase/server";
import { executeWorkActions } from "@/lib/work-service";

type ActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string };

export interface ProfileSearchResult {
  id: string;
  username: string;
}

export async function searchProfilesByUsername(
  query: string,
): Promise<ActionResult<ProfileSearchResult[]>> {
  const supabase = await createClient();

  const {
    data: { user },
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
export async function sendFriendRequest(
  addresseeUsername: string,
): Promise<ActionResult<FriendshipRow>> {
  try {
    const supabase = await createClient();
    const id = crypto.randomUUID();
    await executeWorkActions([
      {
        tool: "send_friend_request",
        id,
        values: { username: addresseeUsername },
      },
    ]);
    const { data, error } = await supabase
      .from("friendships")
      .select("id,requester_id,addressee_id,status,created_at")
      .eq("id", id)
      .single();
    if (error || !data) throw new Error("Unable to confirm request.");
    return { success: true, data };
  } catch {
    return {
      success: false,
      error:
        "Unable to send request. Check the username and whether you already have a friendship or pending request.",
    };
  }
}
export async function respondToFriendRequest(
  friendshipId: string,
  accept: boolean,
): Promise<ActionResult> {
  try {
    await executeWorkActions([
      { tool: "respond_friend_request", id: friendshipId, values: { accept } },
    ]);
    return { success: true, data: undefined };
  } catch {
    return {
      success: false,
      error: "Only the recipient can respond to a pending request.",
    };
  }
}
export async function removeFriendship(
  friendshipId: string,
): Promise<ActionResult> {
  try {
    await executeWorkActions([
      { tool: "remove_friendship", id: friendshipId, values: {} },
    ]);
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Unable to remove friendship." };
  }
}
