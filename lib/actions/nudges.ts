"use server";

import { createClient } from "@/lib/supabase/server";
import { deliverNotifications } from "@/lib/push";
import { executeWorkActions } from "@/lib/work-service";

type ActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string };

// The insert trigger creates notification history atomically with the nudge.
export async function sendNudge(
  toUserId: string,
  habitContext?: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };
  if (toUserId === user.id)
    return { success: false, error: "You can't nudge yourself." };

  const { data: friendship } = await supabase
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${toUserId}),and(requester_id.eq.${toUserId},addressee_id.eq.${user.id})`,
    )
    .maybeSingle();

  if (!friendship)
    return { success: false, error: "You can only nudge an accepted friend." };

  // Keep the legacy parameter for callers; notification content never includes
  // habit names. Both UI and assistant use the same friendship-scoped operation.
  void habitContext;
  try {
    await executeWorkActions([
      { tool: "send_nudge", id: friendship.id, values: {} },
    ]);
  } catch {
    return { success: false, error: "Unable to nudge this friend." };
  }
  try {
    await deliverNotifications();
  } catch {
    /* Durable notification remains queued for the scheduler. */
  }
  return { success: true, data: undefined };
}
