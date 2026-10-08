import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

// Exercise the real list, date selector, recurrence hook and row actions.
// Only the data/clock boundaries are fixtures; no database writes occur.
const fixture = `
import {useState} from 'react';
import {calendarDays} from './lib/timezone';
import {parseDateKey} from './lib/dates';
export const useSearchParams=()=>new URLSearchParams();
export function useUserClock(){const days=calendarDays(new Date('2026-10-06T02:00:00Z'),'America/Toronto');return {...days,todayDate:parseDateKey(days.today)}}
export function useHabitsData(){const [habits,setHabits]=useState(window.habits);return {habits,loading:false,pendingCells:new Set(),earliestLogDate:null,seeding:false,
updateCell:async(id,date,status)=>{window.calls.push(['status',id,date,status]);setHabits(rows=>rows.map(h=>h.id===id?{...h,logsByDate:{...h.logsByDate,[date]:status}}:h))},handleSeedStarterHabits:()=>{}}}
`;
const entry = `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{MobileHabitList}from'./components/dashboard/mobile-habit-list';
import{useDashboardHabits}from'./lib/hooks/use-dashboard-habits';
function App(){const dashboard=useDashboardHabits();const[view,setView]=useState('list');window.dashboard=dashboard;
return <><button onClick={()=>setView(v=>v==='list'?'grid':'list')}>Switch view</button><MobileHabitList presentation={view} dashboard={dashboard} habits={dashboard.habits} onEdit={h=>window.calls.push(['edit',h.id])} onDelete={h=>window.calls.push(['delete',h.id])} onCreate={()=>window.calls.push(['create'])}/></>}
createRoot(document.getElementById('root')).render(<App/>);
`;
let browser, server, origin;
before(async () => {
  const bundle = await build({
    stdin: { contents: entry, loader: "jsx", resolveDir: process.cwd() },
    bundle: true, write: false, jsx: "automatic",
    plugins: [{name:"fixtures",setup(b){
      b.onResolve({filter:/^(next\/navigation|@\/lib\/hooks\/use-habits-data|@\/components\/layout\/user-clock)$/},()=>({path:"fixture",namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:fixture,loader:"js",resolveDir:process.cwd()}));
    }}],
  });
  server = http.createServer((req,res)=>{
    res.setHeader("Content-Type",req.url==="/bundle.js"?"application/javascript":"text/html");
    res.end(req.url==="/bundle.js"?bundle.outputFiles[0].text:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/bundle.js"></script>');
  });
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch();
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
const habit=(id,days,status)=>({id,name:id,category:"Discipline",isCore:false,orderIndex:0,icon:"",scheduledDays:days,logsByDate:status?{"2026-10-05":status}:{}});
async function pageFor(t,habits){
  // Browser's civil day differs from the user's saved timezone at this instant.
  const page=await browser.newPage({viewport:{width:375,height:900},timezoneId:"Asia/Tokyo"});
  t.after(()=>page.close());const errors=[];page.on("pageerror",e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
  await page.addInitScript(habits=>{window.habits=habits;window.calls=[]},habits);
  await page.goto(origin);return page;
}
test("List renders scheduled cards only, including Empty and every supported logged status",async t=>{
  const page=await pageFor(t,[habit("Empty habit",[1]),...['complete','missed','rest','vacation'].map(s=>habit(s,[1],s)),habit("Tuesday only",[2],"complete")]);
  await expect(page.locator('article')).toHaveCount(5);
  for(const name of ['Empty habit','complete','missed','rest','vacation'])await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Tuesday only'})).toHaveCount(0);
  await expect(page.getByText('Not scheduled',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('combobox',{name:/Status for Empty habit/})).toHaveValue('empty');
  assert.equal(await page.evaluate(()=>window.dashboard.realToday),'2026-10-05');
});
test("date selection filters recurrence immediately and shows a scheduled-day empty state",async t=>{
  const page=await pageFor(t,[habit('MWF',[1,3,5]),habit('Tuesday',[2])]);
  await expect(page.getByRole('heading',{name:'MWF',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Tuesday, October 6, 2026',exact:true}).click();
  await expect(page.getByRole('heading',{name:'MWF',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Tuesday',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Wednesday, October 7, 2026',exact:true}).click();
  await expect(page.getByRole('heading',{name:'MWF',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Tuesday',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Thursday, October 8, 2026',exact:true}).click();
  await expect(page.locator('article')).toHaveCount(0);
  await expect(page.getByText('No habits scheduled for this day.',{exact:true})).toBeVisible();
});
test("month navigation reuses schedule matching for the newly selected civil date",async t=>{
  const page=await pageFor(t,[habit('Monday',[1]),habit('Sunday',[7])]);
  await page.evaluate(()=>window.dashboard.jumpToDate('2026-11-01'));
  await expect(page.getByRole('heading',{name:'Sunday',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Monday',exact:true})).toHaveCount(0);
});
test("Grid retains unscheduled rows and cells when switching from filtered List",async t=>{
  const page=await pageFor(t,[habit('Monday',[1]),habit('Tuesday',[2])]);
  await expect(page.getByRole('heading',{name:'Tuesday',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Switch view'}).click();
  await expect(page.getByRole('button',{name:'Edit Tuesday',exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:'Tuesday, 2026-10-05: Not scheduled',exact:true})).toHaveCount(1);
  await expect(page.getByRole('combobox',{name:'Monday, 2026-10-05: Empty',exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'Switch view'}).click();
  await expect(page.getByRole('heading',{name:'Tuesday',exact:true})).toHaveCount(0);
});
test("scheduled habit status, edit and delete actions remain connected",async t=>{
  const page=await pageFor(t,[habit('Monday',[1])]);
  const select=page.getByRole('combobox',{name:/Status for Monday/});
  await select.selectOption('complete');await expect(select).toHaveValue('complete');
  await expect(page.locator('article')).toHaveCount(1);
  await page.getByRole('button',{name:'Habit options'}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('button',{name:'Habit options'}).click();await page.getByRole('button',{name:'Delete',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.calls),[['status','Monday','2026-10-05','complete'],['edit','Monday'],['delete','Monday']]);
});
test("existing no-habits onboarding remains available",async t=>{
  const page=await pageFor(t,[]);await expect(page.getByText('No habits yet',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Add habit',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.calls),[['create']]);
});
