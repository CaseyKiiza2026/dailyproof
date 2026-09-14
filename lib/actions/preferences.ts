"use server";

import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/timezone";

export async function initializePreferences(detectedTimeZone: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isValidTimeZone(detectedTimeZone)) throw new Error("Invalid timezone.");

  // First setup only: another device must not silently change day boundaries
  // or reset an existing detailed-activity choice.
  const { error: insertError } = await supabase.from("user_preferences").upsert(
    { user_id: user.id, timezone: detectedTimeZone },
    { onConflict: "user_id", ignoreDuplicates: true }
  );
  if (insertError) throw new Error("Unable to initialize your preferences.");
  const { data, error } = await supabase.from("user_preferences")
    .select("timezone, share_detailed_activity").eq("user_id", user.id).single();
  if (error || !data) throw new Error("Unable to load your preferences.");
  return { userId: user.id, timeZone: data.timezone as string, shareDetailedActivity: data.share_detailed_activity as boolean };
}

export async function setDetailedActivity(enabled: boolean) {
  if (typeof enabled !== "boolean") return { success: false, error: "Invalid privacy setting." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };
  const { data, error } = await supabase.from("user_preferences")
    .update({ share_detailed_activity: enabled }).eq("user_id", user.id).select("user_id").single();
  if (error || !data) return { success: false, error: "Unable to save privacy settings." };
  return { success: true };
}
