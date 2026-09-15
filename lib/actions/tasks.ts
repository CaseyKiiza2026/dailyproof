"use server";
import { requireUser } from "@/lib/server-user";
import { Task, TaskInput, validateTask } from "@/lib/tasks";
import { executeWorkActions } from "@/lib/work-service";

export async function getTasks(): Promise<Task[]> {
  const { db, user } = await requireUser();
  const { data, error } = await db.from("tasks").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load tasks.");
  return data as Task[];
}
export async function saveTask(id: string | null, input: TaskInput): Promise<Task> {
  const values = validateTask(input);
  const { db, user } = await requireUser();
  const target=id??crypto.randomUUID();
  await executeWorkActions([{tool:id?"update_task":"create_task",id:target,values}]);
  const { data, error } = await db.from("tasks").select().eq("id",target).eq("user_id",user.id).single();
  if (error || !data) throw new Error("Unable to save task. Check its schedule and try again.");
  return data as Task;
}
export async function deleteTask(id: string) {
  const { db, user } = await requireUser();
  const { data, error } = await db.from("tasks").delete().eq("id", id).eq("user_id", user.id).select("id").single();
  if (error || !data) throw new Error("Unable to delete task.");
}
