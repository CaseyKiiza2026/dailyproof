import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
interface DeliveryRow {id:string;user_id:string;type:string;attempts:number;}
export async function deliverNotifications() {
 const db=createAdminClient();const {error:enqueueError}=await db.rpc("enqueue_due_notifications");if(enqueueError)throw new Error("Unable to enqueue due reminders.");
 const {data,error}=await db.rpc("claim_push_notifications");if(error)throw new Error("Unable to claim notifications.");
 await Promise.all((data??[]).map(async(row:DeliveryRow)=>{
  let result="sent",failure:string|null=null;
  try{
   const {data:settings,error:settingsError}=await db.from("notification_settings").select("enabled,push_alias,nudges,friend_activity").eq("user_id",row.user_id).maybeSingle();
   if(settingsError)throw new Error("Unable to load notification preferences.");
   if(!settings?.enabled||(row.type==="nudge"&&!settings.nudges)||(row.type==="friend_activity"&&!settings.friend_activity)){result="skipped";}else{
    if(!process.env.ONESIGNAL_APP_ID||!process.env.ONESIGNAL_REST_API_KEY)throw new Error("OneSignal is not configured.");
    if(!process.env.APP_URL)throw new Error("APP_URL is not configured.");
    const response=await fetch("https://api.onesignal.com/notifications",{method:"POST",headers:{Authorization:`Key ${process.env.ONESIGNAL_REST_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({app_id:process.env.ONESIGNAL_APP_ID,include_aliases:{external_id:[settings.push_alias]},target_channel:"push",headings:{en:"DailyProof"},contents:{en:row.type==="nudge"?"A friend sent you a nudge.":"You have a DailyProof notification."},url:`${process.env.APP_URL}/notifications`,idempotency_key:row.id}),signal:AbortSignal.timeout(10000)});
    const body=await response.json();if(!response.ok||!body.id)throw new Error(`Push delivery failed (${response.status}); check subscription and OneSignal configuration.`);
   }
  }catch(e){result="failed";failure=e instanceof Error?e.message:"Push delivery failed.";}
  const {error:finishError}=await db.rpc("finish_push_notification",{p_id:row.id,p_attempt:row.attempts,p_status:result,p_error:failure});if(finishError)throw new Error("Unable to record delivery result; the same delivery key will be retried.");
 }));
 return {processed:data?.length??0};
}
