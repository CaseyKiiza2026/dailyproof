"use client";
import {useEffect,useState} from "react";
import {Task} from "@/lib/tasks";
import {getTasks,saveTask} from "@/lib/actions/tasks";
export function useTasks(){
 const [tasks,setTasks]=useState<Task[]>([]),[error,setError]=useState("");
 useEffect(()=>{let live=true;const refresh=()=>getTasks().then(data=>{if(live)setTasks(data)}).catch((e:Error)=>{if(live)setError(e.message)});void refresh();window.addEventListener("focus",refresh);const timer=setInterval(refresh,60000);return()=>{live=false;window.removeEventListener("focus",refresh);clearInterval(timer)}},[]);
 async function complete(task:Task){setError("");try{const saved=await saveTask(task.id,{...task,status:task.status==="completed"?"pending":"completed"});setTasks(current=>current.map(t=>t.id===saved.id?saved:t))}catch(e){setError((e as Error).message)}}
 return {tasks,error,complete};
}
