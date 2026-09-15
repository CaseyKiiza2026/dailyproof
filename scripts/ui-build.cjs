/* eslint-disable @typescript-eslint/no-require-imports */
// Actual UI components with isolated, synthetic server-action fixtures.
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const ts = require("typescript");
const root = process.cwd();
const dir = path.join(root, "out/mobile-check");
fs.mkdirSync(dir, { recursive: true });
const stub = path.join(dir, "fixture.jsx");
fs.writeFileSync(
  stub,
  `import React, {createContext,useContext,useState} from 'react';
import {formatDateKey,isoDayOfWeek,dateKeyRange} from '../../lib/dates';
const makeHabits=()=>[
 {id:'1',name:'45 minutes of focused machine learning practice',category:'ML / Career',subtitle:'ML / Career',icon:'ML',isCore:true,orderIndex:0,scheduledDays:[1,2,3,4,5,6,7],logsByDate:{'2026-09-14':'complete','2026-09-13':'rest','2026-09-12':'missed'}},
 {id:'2',name:'Hit my daily protein and calorie targets',category:'Fitness / Bulk',subtitle:'Fitness / Bulk',icon:'HI',isCore:true,orderIndex:1,scheduledDays:[1,2,3,4,5,6,7],logsByDate:{'2026-09-14':'missed','2026-09-13':'vacation'}},
 {id:'3',name:'No social media before 5 PM',category:'Discipline',subtitle:'Discipline',icon:'NO',isCore:false,orderIndex:2,scheduledDays:[1,2,3,4,5,6,7],logsByDate:{}},
 {id:'4',name:'Read before bed and plan tomorrow',category:'Sleep / Recovery',subtitle:'Sleep / Recovery',icon:'RE',isCore:false,orderIndex:3,scheduledDays:[2,4],logsByDate:{}},
 {id:'5',name:'Gym or recovery',category:'Fitness / Bulk',subtitle:'Fitness / Bulk',icon:'GY',isCore:false,orderIndex:4,scheduledDays:[1,2,3,4,5,6,7],logsByDate:{'2026-09-14':'rest'}},
 {id:'6',name:'Water',category:'Sleep / Recovery',subtitle:'Sleep / Recovery',icon:'WA',isCore:false,orderIndex:5,scheduledDays:[1,2,3,4,5,6,7],logsByDate:{'2026-09-14':'vacation'}}
];
const Context=createContext(null);
export function Fixture({children}) {
 const [habits,setHabits]=useState(()=>location.search.includes('empty')?[]:makeHabits());
 const [selectedDay,setSelectedDay]=useState(14);const [viewMonth,setViewMonth]=useState(8);const [viewYear,setViewYear]=useState(2026);
 const daysInMonth=new Date(viewYear,viewMonth+1,0).getDate();
 const key=d=>formatDateKey(new Date(viewYear,viewMonth,d));
 const data={habits,loading:false,seeding:false,pendingCells:new Set(),selectedDay,setSelectedDay,viewYear,viewMonth,daysInMonth,realYear:2026,realMonth:8,realDay:14,realToday:'2026-09-14',isCurrentMonth:viewYear===2026&&viewMonth===8,effectiveToday:14,monthlyDateKeys:dateKeyRange(new Date(2026,8,1),new Date(2026,8,14)),streakDateKeys:dateKeyRange(new Date(2026,8,12),new Date(2026,8,14)),earliestLogDate:'2026-09-12',
 isEditableDate:d=>['2026-09-13','2026-09-14'].includes(key(d)),isScheduledDate:(id,d)=>habits.find(h=>h.id===id)?.scheduledDays.includes(isoDayOfWeek(key(d))),
 updateCell:async(id,d,status)=>setHabits(hs=>hs.map(h=>h.id===id?{...h,logsByDate:{...h.logsByDate,[key(d)]:status}}:h)),
 jumpToMonth:(y,m)=>{setViewYear(y);setViewMonth(m);setSelectedDay(1)},jumpToDate:value=>{const[y,m,d]=value.split('-').map(Number);setViewYear(y);setViewMonth(m-1);setSelectedDay(d)},goToToday:()=>{setViewYear(2026);setViewMonth(8);setSelectedDay(14)},
 handleHabitCreated:()=>{},handleHabitUpdated:()=>{},handleHabitDeleted:id=>setHabits(hs=>hs.filter(h=>h.id!==id)),handleSeedStarterHabits:()=>setHabits(makeHabits())};
 return <Context.Provider value={data}>{children}</Context.Provider>
}

const taskBase={user_id:'test',description:'Practice with a realistic, readable task description.',priority:'normal',status:'pending',due_at:'2026-09-14T20:00:00Z',scheduled_start:null,scheduled_end:null,created_at:'2026-09-14T12:00:00Z',updated_at:'2026-09-14T12:00:00Z'};
let tasks=[{...taskBase,id:'task1',title:'Finish the machine learning exercise and review my notes'}, {...taskBase,id:'task2',title:'Completed study session',status:'completed'}, {...taskBase,id:'task3',title:'Schedule practice for tomorrow',due_at:'2026-09-15T20:00:00Z',scheduled_start:'2026-09-15T17:00:00Z',scheduled_end:'2026-09-15T18:00:00Z'}];
let commitments=[{id:'commitment',user_id:'test',title:'Work meeting',description:'Fixed appointment',start_at:'2026-09-14T14:00:00Z',end_at:'2026-09-14T15:00:00Z'}];
const timedHabits=[{id:'habit1',name:'Morning reading and reflection',scheduled_days:[1,2,3,4,5],scheduled_time:'08:00:00',duration_minutes:30}];
let proofs=[];
export const getProofs=async()=>proofs;export const addProof=async(target,type,content,visibility)=>{const p={id:'proof',type,content,visibility};proofs=[...proofs,p];return p};export const deleteProof=async(id)=>{proofs=proofs.filter(p=>p.id!==id)};
export const proofImageUrl=async()=>"";export const assessProof=async()=>({verification:"likely",confidence:.7,reason:"Example"});export const askAssistant=async()=>({ok:true,reply:"Review this task",planId:"plan",actions:[{tool:"create_task",id:"task",values:{title:"Study",scheduled_start:"2026-09-15T13:00Z"}}]});export const approveAssistantPlan=async()=>{};export const getNotifications=async()=>[];export const getReminders=async()=>[];export const getNotificationSettings=async()=>({enabled:false,daily_time:null,friend_activity:false,nudges:true});export const saveReminder=async()=>{};export const cancelReminder=async()=>{};export const markNotificationRead=async()=>{};export const saveNotificationSettings=async()=>{};export const getPushIdentity=async()=>{throw new Error("Not configured")};export const getCalendar=async()=>({tasks,commitments,habits:timedHabits});export const saveCommitment=async(id,input)=>{commitments=[...commitments.filter(c=>c.id!==id),{id:id||'new',...input}]};export const deleteCommitment=async(id)=>{commitments=commitments.filter(c=>c.id!==id)};export const setHabitTime=async()=>{};export const getTasks=async()=>tasks;export const saveTask=async(id,data)=>{const t={...taskBase,...data,id:id||'new'};tasks=[...tasks.filter(t=>t.id!==id),t];return t};export const deleteTask=async(id)=>{tasks=tasks.filter(t=>t.id!==id)};export const useDashboardHabits=()=>useContext(Context);
export const useHabitsData=()=>useContext(Context);
export const useUserClock=()=>({todayDate:new Date(2026,8,14),now:new Date('2026-09-14T16:00:00Z'),today:'2026-09-14',yesterday:'2026-09-13',timeZone:'America/Toronto',tomorrow:'2026-09-15'});
export const usePathname=()=>'/dashboard';export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push:()=>{},refresh:()=>{}});
export function createClient(){const query={select:()=>query,eq:()=>query,single:async()=>({data:{username:'casey'}})};return{auth:{getUser:async()=>({data:{user:{id:'test'}}}),signOut:async()=>({})},from:()=>query}}
export const createHabit=async()=>({success:true,data:{id:'new',orderIndex:9}});export const updateHabit=async()=>({success:true});export const deleteHabit=async()=>({success:true});
export default function Link({children,...props}){return <a {...props}>{children}</a>}
`,
);
fs.writeFileSync(
  path.join(dir, "entry.jsx"),
  `import React from 'react';import {createRoot} from 'react-dom/client';import {Fixture} from './fixture';import Dashboard from '../../app/(app)/dashboard/page';import Todos from '../../app/(app)/todos/page';import Calendar from '../../app/(app)/calendar/page';import Notifications from '../../app/(app)/notifications/page';import Assistant from '../../app/(app)/assistant/page';const DashboardPage=({dashboard:Dashboard,todos:Todos,calendar:Calendar,notifications:Notifications,assistant:Assistant})[new URLSearchParams(location.search).get('page')]||Dashboard;import {AppShell} from '../../components/layout/app-shell';createRoot(document.getElementById('root')).render(<Fixture><AppShell><DashboardPage/></AppShell></Fixture>);`,
);
async function main() {
  await esbuild.build({
    entryPoints: [path.join(dir, "entry.jsx")],
    bundle: true,
    write: true,
    outfile: path.join(dir, "bundle.js"),
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "fixtures",
        setup(build) {
          build.onResolve(
            {
              filter:
                /^(@\/lib\/hooks\/(use-dashboard-habits|use-habits-data)|@\/components\/layout\/user-clock|@\/lib\/supabase\/client|@\/lib\/actions\/(habits|tasks|calendar|reminders|assistant|proofs)|next\/navigation|next\/link)$/,
            },
            () => ({ path: stub }),
          );
          build.onResolve({ filter: /^@\// }, (args) => {
            const base = path.join(root, args.path.slice(2));
            for (const ext of ["", ".ts", ".tsx", ".module.css"])
              if (fs.existsSync(base + ext)) return { path: base + ext };
          });
        },
      },
    ],
  });
  const configCode = ts.transpileModule(
    fs.readFileSync("tailwind.config.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const configModule = { exports: {} };
  new Function("module", "exports", "require", configCode)(
    configModule,
    configModule.exports,
    require,
  );
  const config = configModule.exports.default;
  const result = await require("postcss")([
    require("tailwindcss")(config),
    require("autoprefixer"),
  ]).process(fs.readFileSync("app/globals.css", "utf8"), {
    from: path.join(root, "app/globals.css"),
  });
  fs.writeFileSync(path.join(dir, "styles.css"), result.css);
  fs.writeFileSync(
    path.join(dir, "index.html"),
    '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="bundle.css"></head><body><div id="root"></div><script src="bundle.js"></script></body></html>',
  );
  console.log(
    "Built actual Dashboard components with local-only fixture data.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
