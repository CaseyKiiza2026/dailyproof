import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Please sign in.");
  const { data, error } = await db.from("user_preferences").select("timezone").eq("user_id", user.id).single();
  if (error || !data) throw new Error("Unable to load your saved timezone.");
  return { db, user, timeZone: data.timezone as string };
}
