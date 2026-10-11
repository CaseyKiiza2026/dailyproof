import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Called with the signed-in user's client after UI/assistant writes, or the
// existing authenticated worker's client. Model inputs never select paths.
export async function cleanupProofFiles(db: SupabaseClient) {
  const { data, error } = await db
    .from("proof_file_cleanup")
    .select("proof_id,storage_path")
    .order("created_at")
    .limit(50);
  if (error || !data) return { removed: 0, pending: true };
  if (!data.length) return { removed: 0, pending: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let storageFailed = true;
  try {
    const result = await Promise.race([
      db.storage.from("proofs").remove(data.map((file) => file.storage_path)),
      new Promise<{ error: Error }>((resolve) => {
        timer = setTimeout(
          () => resolve({ error: new Error("Storage cleanup timed out") }),
          4000,
        );
      }),
    ]);
    storageFailed = Boolean(result.error);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (storageFailed) return { removed: 0, pending: true };
  let removed = 0;
  for (const file of data) {
    const { error: receiptError } = await db
      .from("proof_file_cleanup")
      .delete()
      .eq("proof_id", file.proof_id);
    if (!receiptError) removed++;
  }
  return { removed, pending: removed !== data.length };
}
