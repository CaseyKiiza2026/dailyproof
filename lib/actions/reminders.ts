"use server";
import { requireUser } from "@/lib/server-user";
import {
  Reminder,
  ReminderInput,
  Notification,
  NotificationSettings,
  validateReminder,
} from "@/lib/notifications";
import { executeWorkActions } from "@/lib/work-service";
export async function getReminders(): Promise<Reminder[]> {
  const { db, user } = await requireUser();
  const { data, error } = await db
    .from("reminders")
    .select("*")
    .eq("user_id", user.id)
    .order("scheduled_at");
  if (error)
    throw new Error("Unable to load reminders.", {
      cause: { code: error?.code },
    });
  return data;
}
export async function saveReminder(id: string | null, input: ReminderInput) {
  const values = validateReminder(input);
  const data = await executeWorkActions([
    {
      tool: id ? "update_reminder" : "create_reminder",
      id: id ?? crypto.randomUUID(),
      values,
    },
  ]);
  return data[0];
}
export async function cancelReminder(id: string) {
  await executeWorkActions([{ tool: "cancel_reminder", id, values: {} }]);
}
export async function getNotifications(): Promise<Notification[]> {
  const { db, user } = await requireUser();
  const { data, error } = await db
    .from("notifications")
    .select("id,type,title,body,read_at,created_at,push_status,error")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Unable to load notifications.");
  return data;
}
export async function markNotificationRead(id: string) {
  await executeWorkActions([
    { tool: "mark_notification_read", id, values: {} },
  ]);
}
export async function getNotificationSettings(): Promise<NotificationSettings> {
  const { db, user } = await requireUser();
  await db
    .from("notification_settings")
    .upsert(
      { user_id: user.id },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  const { data, error } = await db
    .from("notification_settings")
    .select("enabled,daily_time,friend_activity,nudges")
    .eq("user_id", user.id)
    .single();
  if (error) throw new Error("Unable to load notification settings.");
  return data;
}
export async function saveNotificationSettings(input: NotificationSettings) {
  await executeWorkActions([
    {
      tool: "update_notification_settings",
      id: crypto.randomUUID(),
      values: { ...input },
    },
  ]);
}
export async function getPushIdentity() {
  const { db, user } = await requireUser();
  if (!process.env.ONESIGNAL_APP_ID)
    throw new Error("Push notifications are not configured yet.");
  await getNotificationSettings();
  const { data, error } = await db
    .from("notification_settings")
    .select("push_alias")
    .eq("user_id", user.id)
    .single();
  if (error) throw new Error("Unable to prepare push notifications.");
  return {
    appId: process.env.ONESIGNAL_APP_ID,
    alias: data.push_alias as string,
  };
}
