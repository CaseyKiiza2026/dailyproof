"use server";

import { createClient } from "@/lib/supabase/server";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

// Stopgap: logs the nudge so it exists once notifications/feed are built (see
// SPEC.md section 7/10). No delivery mechanism yet — this just records intent.
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
  return { success: true, data: undefined };
}
