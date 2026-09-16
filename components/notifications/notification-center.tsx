"use client";
import {useEffect,useRef,useState} from "react";
import {useUserClock} from "@/components/layout/user-clock";
import {Reminder} from "@/lib/notifications";
import {getNotifications,getReminders,saveReminder,cancelReminder,markNotificationRead} from "@/lib/actions/reminders";
import {getCalendar} from "@/lib/actions/calendar";
import {useRemoteData} from "@/lib/hooks/use-remote-data";
import {useNotificationSettings} from "@/lib/hooks/use-notification-settings";
import {localDateTime,localDateTimeToUtc} from "@/lib/timezone";

export function NotificationCenter(){
 const {timeZone,tomorrow}=useUserClock();
 const history=useRemoteData(getNotifications,"Unable to load notifications.");
 const upcoming=useRemoteData(getReminders,"Unable to load reminders.");
 const choices=useRemoteData(getCalendar,"Unable to load reminder choices.");
 const preferences=useNotificationSettings();const settings=preferences.draft;
 const notifications=history.data??[],reminders=upcoming.data??[],calendar=choices.data;
 const [editing,setEditing]=useState<Reminder|"new"|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [taskChoice,setTaskChoice]=useState(""),[habitChoice,setHabitChoice]=useState("");
 function openEditor(value:Reminder|"new"){setTaskChoice(value==="new"?"":value.task_id??"");setHabitChoice(value==="new"?"":value.habit_id??"");setEditing(value)}
 const running=useRef(false);
 const {refresh:refreshHistory}=history,{refresh:refreshReminders}=upcoming,{refresh:refreshChoices}=choices;
 useEffect(()=>{void refreshHistory();void refreshReminders();const timer=setInterval(()=>{void refreshHistory();void refreshReminders()},60000);return()=>clearInterval(timer)},[refreshHistory,refreshReminders]);
 const editorOpen=editing!==null;
 useEffect(()=>{if(editorOpen)void refreshChoices()},[editorOpen,refreshChoices]);
 async function run(action:()=>Promise<unknown>,target:"reminders"|"history",close=false){if(running.current)return;running.current=true;setBusy(true);setError("");try{await (target==="reminders"?upcoming:history).mutate(action);if(close)setEditing(null)}catch{setError("Unable to save changes. Please try again.")}finally{running.current=false;setBusy(false)}}
 return <div className="space-y-6"><header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Notifications</h1><button disabled={busy} className="proof-action" onClick={()=>openEditor("new")}>Add reminder</button></header>
 {[error,history.error,upcoming.error,choices.error,preferences.error].filter(Boolean).map((message,i)=><p key={i} role="alert" className="text-proof-red">{message}</p>)}
 <section className="proof-panel space-y-4 p-4"><h2 className="text-lg font-bold">Notification settings</h2><p className="text-sm text-white/55">Times use {timeZone}. Push previews stay generic; open DailyProof to read the details.</p>
 <button disabled={!settings||preferences.busy} className="proof-action" onClick={()=>void preferences.save(true)}>Enable push on this device</button>
 <form className="space-y-3" onSubmit={e=>{e.preventDefault();void preferences.save()}}>
 {(["enabled","friend_activity","nudges"] as const).map((field,i)=><label key={field} className="flex min-h-11 items-center gap-3 text-sm">{settings?<input name={field} type="checkbox" checked={settings[field]} disabled={preferences.busy} onChange={e=>preferences.edit({...settings,[field]:e.target.checked})} className="h-5 w-5"/>:<span aria-label="Setting unavailable" className="inline-block h-5 w-5 rounded border border-white/20"/>}{["Push notifications enabled","Friend activity","Friend nudges"][i]}</label>)}
 <label className="proof-field">DailyProof reminder time (optional)<input type="time" name="daily_time" disabled={!settings||preferences.busy} value={settings?.daily_time?.slice(0,5)??""} onChange={e=>{if(settings)preferences.edit({...settings,daily_time:e.target.value||null})}}/></label>
 <p role="status" className="min-h-5 text-sm">{!settings?(preferences.error?"Settings unavailable.":"Loading settings..."):preferences.busy?"Saving settings...":""}</p>
 {!settings&&preferences.error&&<button type="button" className="proof-action" onClick={()=>void preferences.load()}>Retry settings</button>}
 <button disabled={!settings||preferences.busy} className="proof-action">Save settings</button></form></section>
 {editing&&<form key={editing==="new"?"new":editing.id} className="proof-panel space-y-4 p-4" onSubmit={e=>{e.preventDefault();if(!calendar)return;const f=new FormData(e.currentTarget);void run(()=>saveReminder(editing==="new"?null:editing.id,{title:String(f.get("title")),message:String(f.get("message")),scheduled_at:localDateTimeToUtc(String(f.get("time")),timeZone)!,task_id:String(f.get("task"))||null,habit_id:String(f.get("habit"))||null,only_if_incomplete:f.get("conditional")==="on"}),"reminders",true)}}>
 <fieldset disabled={busy} className="contents"><h2 className="font-bold">{editing==="new"?"New reminder":"Edit reminder"}</h2><label className="proof-field">Title<input required maxLength={200} name="title" defaultValue={editing==="new"?"":editing.title}/></label><label className="proof-field">Message<textarea name="message" maxLength={2000} defaultValue={editing==="new"?"":editing.message}/></label>
 <label className="proof-field">Remind at<input name="time" type="datetime-local" required defaultValue={editing==="new"?`${tomorrow}T09:00`:localDateTime(editing.scheduled_at,timeZone)}/></label>
 <label className="proof-field">Task (optional)<select name="task" disabled={!calendar} value={taskChoice} onChange={e=>setTaskChoice(e.target.value)}><option value="">{calendar?"No task":"Loading choices..."}</option>{calendar?.tasks.filter(t=>t.status==="pending"||t.id===taskChoice).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
 <label className="proof-field">Habit (optional)<select name="habit" disabled={!calendar} value={habitChoice} onChange={e=>setHabitChoice(e.target.value)}><option value="">{calendar?"No habit":"Loading choices..."}</option>{calendar?.habits.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
 <label className="flex min-h-11 items-center gap-3 text-sm"><input name="conditional" type="checkbox" defaultChecked={editing==="new"?false:editing.only_if_incomplete} className="h-5 w-5"/>Only if the linked activity is incomplete</label>
 <div className="flex gap-2"><button disabled={busy||!calendar} className="proof-action">Save reminder</button><button type="button" className="proof-action" onClick={()=>setEditing(null)}>Cancel</button></div></fieldset></form>}
 <section className="space-y-3"><h2 className="text-lg font-bold">Reminders</h2>{reminders.map(r=><article key={r.id} className="proof-panel space-y-2 p-4"><h3 className="break-words font-bold">{r.title}</h3><p className="text-sm text-white/55">{localDateTime(r.scheduled_at,timeZone).replace("T"," ")} · {r.status}</p>{r.status==="pending"&&<div className="flex gap-2"><button disabled={busy} className="proof-action" onClick={()=>openEditor(r)}>Edit</button><button disabled={busy} className="proof-action" onClick={()=>void run(()=>cancelReminder(r.id),"reminders")}>Cancel reminder</button></div>}</article>)}</section>
 <section className="space-y-3"><h2 className="text-lg font-bold">History</h2>{notifications.map(n=><article key={n.id} className="proof-panel space-y-2 p-4"><h3 className="break-words font-bold">{n.title}</h3><p className="whitespace-pre-wrap break-words text-sm text-white/70">{n.body}</p><p className="text-xs text-white/45">{localDateTime(n.created_at,timeZone).replace("T"," ")} · Push {n.push_status}</p>{n.error&&<p className="text-sm text-proof-amber">{n.error}</p>}{!n.read_at&&<button disabled={busy} className="proof-action" onClick={()=>void run(()=>markNotificationRead(n.id),"history")}>Mark read</button>}</article>)}{history.data!==null&&!history.error&&notifications.length===0&&<p className="text-sm text-white/45">No notifications yet.</p>}</section>
 </div>;
}
