"use server";

import { createClient } from "@/lib/supabase/server";
import { deliverNotifications } from "@/lib/push";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

// The insert trigger creates notification history atomically with the nudge.
export async function sendNudge(toUserId: string, habitContext?: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };
  if (toUserId === user.id) return { success: false, error: "You can't nudge yourself." };

  const { data: friendship } = await supabase
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${toUserId}),and(requester_id.eq.${toUserId},addressee_id.eq.${user.id})`
    )
    .maybeSingle();

  if (!friendship) return { success: false, error: "You can only nudge an accepted friend." };

  const { error } = await supabase.from("nudges").insert({
    from_user_id: user.id,
    to_user_id: toUserId,
    habit_context: habitContext ?? null
  });

  if (error) return { success: false, error: error.message };
  try { await deliverNotifications(); } catch { /* Durable notification remains queued for the scheduler. */ }
  return { success: true, data: undefined };
}
