import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/timezone";

// Request-scoped, read-only seed. Missing preferences still require browser
// timezone initialization; no guessed timezone is persisted on the server.
export async function readPreferencesSeed() {
  const db = await createClient();
  const auth = await db.auth.getUser().catch(() => null);
  if (!auth) return undefined;
  const {
    data: { user },
    error: authError,
  } = auth;
  if (authError && authError.name !== "AuthSessionMissingError")
    return undefined;
  if (!user) return { preferences: null, now: new Date().toISOString() };
  try {
    const { data, error } = await db
      .from("user_preferences")
      .select("timezone, share_detailed_activity")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !data || !isValidTimeZone(data.timezone)) return undefined;
    return {
      preferences: {
        userId: user.id,
        timeZone: data.timezone as string,
        shareDetailedActivity: data.share_detailed_activity as boolean,
      },
      now: new Date().toISOString(),
    };
  } catch {
    return undefined;
  }
}
