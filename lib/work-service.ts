import { requireUser } from "@/lib/server-user";
import { WorkAction,validateWorkAction } from "@/lib/work-actions";
export async function executeWorkActions(actions:WorkAction[]){
 const {db}=await requireUser();const values=actions.map(a=>validateWorkAction(a));const {data,error}=await db.rpc("apply_work_actions",{p_actions:values});if(error)throw new Error("Unable to apply changes. Check ownership, dates and overlapping schedules.");return data as {id:string}[];
}
