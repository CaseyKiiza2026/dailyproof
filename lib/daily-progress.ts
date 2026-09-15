import {Habit} from "@/lib/types";
import {Task} from "@/lib/tasks";
import {dateKeyInTimeZone} from "@/lib/timezone";
export function isTaskOnDay(task:Task,day:string,timeZone:string){return task.status!=="cancelled"&&[task.due_at,task.scheduled_start].some(value=>value&&dateKeyInTimeZone(new Date(value),timeZone)===day);}
export function dailyProgress(habits:Habit[],tasks:Task[],day:string,timeZone:string){
 const weekday=new Date(`${day}T12:00Z`).getUTCDay()||7;
 const statuses=habits.filter(h=>h.scheduledDays.includes(weekday)).map(h=>h.logsByDate[day]??"empty");
 for(const task of tasks.filter(t=>isTaskOnDay(t,day,timeZone)))statuses.push(task.status==="completed"?"complete":"empty");
 const total=statuses.length,eligible=statuses.filter(s=>s!=="rest"&&s!=="vacation").length,completed=statuses.filter(s=>s==="complete").length,missed=statuses.filter(s=>s==="missed").length;
 return {total,completed,missed,completion:eligible?Math.round(completed/eligible*100):0};
}
