import { timingSafeEqual } from "node:crypto";
import { deliverNotifications } from "@/lib/push";
export const maxDuration=60;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;const actual=request.headers.get("authorization")??"";const expected=`Bearer ${secret}`;
 if(!secret||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return Response.json({error:"Unauthorized"},{status:401});
 try{return Response.json(await deliverNotifications())}catch{return Response.json({error:"Notification processing failed; records retained for retry."},{status:503})}
}
