import { requireUser } from "@/lib/server-user";
import { WorkAction, validateWorkAction } from "@/lib/work-actions";
import { cleanupProofFiles } from "@/lib/proof-cleanup";
export async function executeWorkActions(actions: WorkAction[]) {
  const { db } = await requireUser();
  const values = actions.map((a) => validateWorkAction(a));
  const { data, error } = await db.rpc("apply_work_actions", {
    p_actions: values,
  });
  if (error || !Array.isArray(data) || data.length !== values.length)
    throw new Error(
      "Unable to apply changes. Check ownership, dates and overlapping schedules.",
    );
  if (
    values.some((a) => a.tool.startsWith("delete_") || a.tool === "log_habit")
  )
    await cleanupProofFiles(db).catch(() => {});
  return data as { id: string }[];
}
