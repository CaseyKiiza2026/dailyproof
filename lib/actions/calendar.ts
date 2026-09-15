"use server";
import { requireUser } from "@/lib/server-user";
import { getTasks } from "@/lib/actions/tasks";
import { CalendarData, Commitment, validateBlock } from "@/lib/calendar";
export async function getCalendar(): Promise<CalendarData> {
 const {db,user}=await requireUser();
 const [tasks,commitments,habits]=await Promise.all([getTasks(),db.from("commitments").select("*").eq("user_id",user.id).order("start_at"),db.from("habits").select("id,name,scheduled_days,scheduled_time,duration_minutes").eq("user_id",user.id)]);
 if(commitments.error||habits.error) throw new Error("Unable to load calendar.", { cause: { code: (commitments.error ?? habits.error)?.code } });
 return {tasks,commitments:commitments.data,habits:habits.data};
}
export async function saveCommitment(id: string|null,input: Pick<Commitment,"title"|"description"|"start_at"|"end_at">) {
 validateBlock(input.title,input.start_at,input.end_at);
 if(typeof input.description!=="string"||input.description.length>10000) throw new Error("Description is too long.");
 const {db,user}=await requireUser();
 const values={title:input.title.trim(),description:input.description,start_at:input.start_at,end_at:input.end_at};
 const query=id?db.from("commitments").update(values).eq("id",id).eq("user_id",user.id):db.from("commitments").insert({...values,user_id:user.id});
 const {error}=await query.select("id").single();if(error) throw new Error("Unable to save commitment. Check for overlapping blocks.");
}
export async function deleteCommitment(id:string) {
 const {db,user}=await requireUser();const {error}=await db.from("commitments").delete().eq("id",id).eq("user_id",user.id).select("id").single();if(error) throw new Error("Unable to delete commitment.");
}
export async function setHabitTime(id:string,time:string|null,duration:number|null) {
 if(time!==null&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!Number.isInteger(duration)||duration!<5||duration!>720)) throw new Error("Enter a time and duration of 5–720 minutes.");
 const {db,user}=await requireUser();const {error}=await db.from("habits").update({scheduled_time:time,duration_minutes:time?duration:null}).eq("id",id).eq("user_id",user.id).select("id").single();if(error) throw new Error("Unable to save habit time.");
}
