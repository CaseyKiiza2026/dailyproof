export interface Reminder { id:string;user_id:string;task_id:string|null;habit_id:string|null;title:string;message:string;scheduled_at:string;channel:"push"|"email"|"sms";only_if_incomplete:boolean;status:string;sent_at:string|null; }
export type ReminderInput=Pick<Reminder,"task_id"|"habit_id"|"title"|"message"|"scheduled_at"|"only_if_incomplete">;
export interface Notification {id:string;type:string;title:string;body:string;read_at:string|null;created_at:string;push_status:string;error:string|null;}
export interface NotificationSettings {enabled:boolean;daily_time:string|null;friend_activity:boolean;nudges:boolean;}
export function validateReminder(input:ReminderInput, now=new Date()) {
 if(!input||typeof input.title!=="string"||!input.title.trim()||input.title.length>200||typeof input.message!=="string"||input.message.length>2000)throw new Error("Enter a title up to 200 characters and message up to 2,000.");
 if(!/(Z|[+-]\d{2}:\d{2})$/.test(input.scheduled_at)||!Number.isFinite(Date.parse(input.scheduled_at))||Date.parse(input.scheduled_at)<=now.getTime())throw new Error("Choose a future reminder time.");
 if(input.task_id&&input.habit_id)throw new Error("Choose a task or habit, not both.");
 if(typeof input.only_if_incomplete!=="boolean")throw new Error("Invalid reminder condition.");
 return {title:input.title.trim(),message:input.message.trim(),scheduled_at:input.scheduled_at,task_id:input.task_id||null,habit_id:input.habit_id||null,only_if_incomplete:input.only_if_incomplete};
}
