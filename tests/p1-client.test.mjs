import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { loadTypeScript } from "./load-typescript.mjs";

const fixture = `
import React,{useState} from 'react';
export const calls=[];
const held=new Set(window.initialHolds||[]),pending=new Map();
const values={tasks:[],proofs:[],notifications:[],reminders:[],calendar:{tasks:[],habits:[],commitments:[]},settings:{enabled:true,nudges:true,friend_activity:true,daily_time:null},ask:{ok:true,reply:'Previous response. '.repeat(60),planId:'plan',actions:[]},assess:{verification:'likely',confidence:.8,reason:'Assessment'},image:'https://example.test/image',addProof:{id:'new'},...window.initialValues};
export function call(key,...args){calls.push([key,args]);if(held.has(key))return new Promise((resolve,reject)=>{const queue=pending.get(key)||[];queue.push({resolve,reject});pending.set(key,queue)});const v=values[key];return v?.throw?Promise.reject(new Error(v.throw)):Promise.resolve(v??{data:[],error:null})}
window.transport={calls,set:(key,value)=>values[key]=value,hold:key=>held.add(key),unhold:key=>held.delete(key),release:(key,value,error)=>{const item=pending.get(key)?.shift();if(!item)throw new Error('No pending '+key);error?item.reject(Object.assign(new Error(error),value)):item.resolve(value)}};
window.open=url=>{calls.push(['openImage',[url]])};
export const getTasks=()=>call('tasks'),saveTask=(...args)=>call('saveTask',...args),deleteTask=(...args)=>call('deleteTask',...args);
export const getProofs=(...args)=>call('proofs',...args),addProof=(...args)=>call('addProof',...args),deleteProof=(...args)=>call('deleteProof',...args),proofImageUrl=id=>call('image',id),assessProof=id=>call('assess',id);
export const askAssistant=q=>call('ask',q),approveAssistantPlan=id=>call('approve',id);
export const getNotifications=()=>call('notifications'),getReminders=()=>call('reminders'),getCalendar=()=>call('calendar');
export const getNotificationSettings=()=>call('settings'),saveNotificationSettings=()=>call('saveSettings'),enableBrowserPush=()=>call('push');
export const saveReminder=()=>call('saveReminder'),cancelReminder=()=>call('cancelReminder'),markNotificationRead=()=>call('markRead');
export const saveCommitment=()=>call('saveCommitment'),deleteCommitment=()=>call('deleteCommitment'),setHabitTime=()=>call('setHabitTime');
export const useUserClock=()=>({userId:'self',todayDate:new Date(2026,8,16),now:new Date('2026-09-16T12:00Z'),today:'2026-09-16',tomorrow:'2026-09-17',timeZone:'UTC'});
export const usePathname=()=>'/dashboard';export const logoutBrowserPush=()=>call('logoutPush');export const useHabitsData=()=>({habits:[],earliestLogDate:null,loading:false,error:null});export const useRouter=()=>({push:url=>calls.push(['navigate',[url]]),refresh:()=>calls.push(['routerRefresh'])});
export const createHabit=()=>call('createHabit'),updateHabit=()=>call('updateHabit'),deleteHabit=()=>call('deleteHabit');
export function useDashboardHabits(){const[data,setData]=useState(window.habitData||{habits:[],loading:true});window.setHabitData=setData;return {seeding:false,pendingCells:new Set(),selectedDay:16,setSelectedDay:()=>{},viewYear:2026,viewMonth:8,daysInMonth:30,realYear:2026,realMonth:8,monthlyDateKeys:['2026-09-16'],streakDateKeys:['2026-09-16'],isEditableDate:()=>true,isScheduledDate:()=>true,jumpToMonth:()=>{},jumpToDate:()=>{},goToToday:()=>{},handleSeedStarterHabits:()=>{},...data}}
export default function Link({children,...props}){return <a {...props}>{children}</a>}
export function createClient(){return {auth:{getUser:async()=>({data:{user:{id:'self'}}}),signOut:()=>call('signOut')},rpc:(name,args)=>call('summary:'+args.p_target_user_id+(args.p_target_date?':'+args.p_target_date:'')),from:()=>{const query={then:(resolve,reject)=>call('sharedProofs').then(resolve,reject)};for(const method of ['select','eq','order','limit','single'])query[method]=()=>query;return query},storage:{from:()=>({uploadToSignedUrl:()=>call('upload')})}}}
`;
const entry = `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{AppShell}from'./components/layout/app-shell';
import{NotificationCenter}from'./components/notifications/notification-center';
import{CalendarBoard}from'./components/calendar/calendar-board';
import{TaskBoard}from'./components/tasks/task-board';
import{ProofPanel}from'./components/proofs/proof-panel';
import{FriendHistory}from'./components/friends/friend-history';
import{AssistantPanel}from'./components/assistant/assistant-panel';
import Dashboard from './app/(app)/dashboard/page';
import{useTasks,TasksProvider}from'./lib/hooks/use-tasks';
function Probe(){const data=useTasks();window.current=data;return <pre>{JSON.stringify(data)}</pre>}
function Tasks(){const[board,setBoard]=useState(false);return <><button onClick={()=>setBoard(v=>!v)}>Switch task view</button>{board?<TaskBoard/>:<Probe/>}</>}
function App(){const[owner,setOwner]=useState('one');window.changeOwner=setOwner;const mode=new URLSearchParams(location.search).get('mode');return mode==='shell'?<AppShell><p>Page content</p></AppShell>:mode==='notifications'?<NotificationCenter/>:mode==='calendar'?<CalendarBoard/>:mode==='proof'?<ProofPanel target={{taskId:owner}}/>:mode==='friends'?<><FriendHistory userId={owner}/>{window.secondFriend&&<FriendHistory userId="two"/>}</>:mode==='assistant'?<AssistantPanel/>:<TasksProvider key={owner}>{mode==='dashboard'?<Dashboard/>:mode==='board'?<TaskBoard/>:<Tasks/>}</TasksProvider>}
const root=createRoot(document.getElementById('root'));window.unmount=()=>root.unmount();root.render(<App/>);
`;
let browser, server, origin;
before(async () => {
  fs.mkdirSync("out/p1-check", { recursive: true });
  const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "jsx" },
    outfile: "bundle.js",
    bundle: true,
    write: false,
    jsx: "automatic",
    plugins: [
      {
        name: "p1-transport",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(next\/link|next\/navigation|@\/lib\/actions\/|@\/lib\/supabase\/client|@\/lib\/push-browser|@\/components\/layout\/user-clock|@\/lib\/hooks\/(use-dashboard-habits|use-habits-data))/,
            },
            () => ({ path: "fixture", namespace: "fixture" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: fixture,
            loader: "jsx",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  const css = await postcss([
    tailwindcss(loadTypeScript("tailwind.config.ts").default),
  ]).process(fs.readFileSync("app/globals.css", "utf8"), {
    from: "app/globals.css",
  });
  const js = bundle.outputFiles.find((file) => file.path.endsWith(".js")).text;
  const bundledCss =
    bundle.outputFiles.find((file) => file.path.endsWith(".css"))?.text || "";
  server = http.createServer((req, res) => {
    res.setHeader(
      "Content-Type",
      req.url === "/bundle.js"
        ? "application/javascript"
        : req.url === "/style.css"
          ? "text/css"
          : "text/html",
    );
    res.end(
      req.url === "/bundle.js"
        ? js
        : req.url === "/style.css"
          ? css.css + bundledCss
          : '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});
async function pageFor(t, mode, initial = {}, width = 375) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  t.after(() => page.close());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.addInitScript((value) => Object.assign(window, value), initial);
  await page.clock.install();
  await page.goto(origin + "/?mode=" + mode);
  await page.waitForFunction(() => window.transport);
  return page;
}
async function count(page, key) {
  return page.evaluate(
    (key) => window.transport.calls.filter(([name]) => name === key).length,
    key,
  );
}
const task = {
  id: "task",
  user_id: "self",
  title: "Study",
  description: "",
  status: "pending",
  priority: "normal",
  due_at: "2026-09-16T18:00Z",
  scheduled_start: null,
  scheduled_end: null,
  created_at: "2026-09-16T12:00Z",
  updated_at: "2026-09-16T12:00Z",
};
const note = {
  id: "note",
  user_id: "self",
  type: "note",
  content: "Known proof",
  visibility: "private",
};
const day = {
  today_key: "2026-09-16",
  log_date: "2026-09-16",
  completion: 80,
  complete_count: 4,
  total_count: 5,
  streak: 3,
  details_visible: true,
  statuses: [{ habit_name: "Private shared habit", status: "complete" }],
};

test("VS-02: unknown notification lists reserve space and choices distinguish failure from empty", async (t) => {
  const p = await pageFor(t, "notifications", {
    initialHolds: ["notifications", "reminders", "calendar"],
  });
  await expect(p.getByText("No notifications yet.")).toHaveCount(0);
  assert.ok(
    (await p.getByLabel("History not yet available").boundingBox()).height >=
      160,
  );
  await p.getByRole("button", { name: "Add reminder", exact: true }).click();
  await expect(p.locator("select[name=task]")).toBeDisabled();
  await p.evaluate(() =>
    window.transport.release("calendar", null, "Synthetic failure"),
  );
  await expect(p.locator("select[name=task]")).toHaveText(
    "Choices unavailable",
  );
  await p.getByRole("button", { name: "Retry choices" }).click();
  await p.evaluate(() =>
    window.transport.release("calendar", {
      tasks: [],
      habits: [],
      commitments: [],
    }),
  );
  await expect(p.locator("select[name=task]")).toBeEnabled();
  await p.evaluate(() => window.transport.release("notifications", []));
  await expect(p.getByText("No notifications yet.")).toBeVisible();
  await p.evaluate(() => window.transport.release("reminders", []));
});

test("VS-15: focus/poll deduplicate, stale reads cannot undo completion, and navigation reuses tasks", async (t) => {
  const p = await pageFor(t, "tasks", { initialValues: { tasks: [task] } });
  await p.waitForFunction(() => window.current?.ready);
  await p.evaluate(() => {
    window.transport.hold("tasks");
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
  });
  await p.clock.fastForward(60000);
  assert.equal(await count(p, "tasks"), 2);
  await p.evaluate(
    (saved) => {
      window.transport.set("saveTask", saved);
      void window.current.complete(window.current.tasks[0]);
    },
    { ...task, status: "completed" },
  );
  await p.waitForFunction(() => window.current.tasks[0].status === "completed");
  await p.evaluate((rows) => window.transport.release("tasks", rows), [task]);
  assert.equal(
    await p.evaluate(() => window.current.tasks[0].status),
    "completed",
  );
  await p.evaluate(
    (rows) => window.transport.release("tasks", rows),
    [{ ...task, status: "completed" }],
  );
  await p.getByRole("button", { name: "Switch task view" }).click();
  await expect(
    p.getByRole("button", { name: "Reopen", exact: true }),
  ).toBeVisible();
  assert.equal(await count(p, "tasks"), 3);
  await p.getByRole("button", { name: "Switch task view" }).click();
  await p.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.transport.release("tasks", null, "Offline");
  });
  await p.waitForFunction(() => window.current.error);
  assert.equal(
    await p.evaluate(() => window.current.tasks[0].status),
    "completed",
  );
  await p.evaluate(() => window.changeOwner("two"));
  await p.waitForFunction(() => window.current.ready === false);
  assert.deepEqual(await p.evaluate(() => window.current.tasks), []);
  await p.evaluate(() => window.unmount());
  await p.evaluate(() => window.transport.release("tasks", []));
});

test("VS-06: task buckets reserve card footprints until a real empty response", async (t) => {
  const p = await pageFor(t, "board", { initialHolds: ["tasks"] });
  assert.ok((await p.getByLabel("Tasks not yet available").count()) >= 4);
  for (const box of await p.getByLabel("Tasks not yet available").all())
    assert.ok((await box.boundingBox()).height >= 160);
  await expect(p.getByText("No tasks.", { exact: true })).toHaveCount(0);
  await p.evaluate(() => window.transport.release("tasks", null, "Offline"));
  await expect(p.getByRole("alert")).toContainText("Unable to load tasks");
  await expect(p.getByText("No tasks.", { exact: true })).toHaveCount(0);
  await p.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.transport.release("tasks", []);
  });
  await expect(p.getByText("No tasks.", { exact: true })).toHaveCount(8);
});

for (const tasksFirst of [true, false])
  test(
    "VS-05: integrated totals wait for both sources, tasks first=" + tasksFirst,
    async (t) => {
      const p = await pageFor(t, "dashboard", { initialHolds: ["tasks"] });
      const habits = Array.from({ length: 3 }, (_, i) => ({
        id: "h" + i,
        name: "Habit " + i,
        category: "Fitness",
        scheduledDays: [1, 2, 3, 4, 5, 6, 7],
        logsByDate: { "2026-09-16": "complete" },
      }));
      const rows = [
        { ...task, status: "completed" },
        { ...task, id: "second" },
      ];
      if (tasksFirst)
        await p.evaluate(
          (rows) => window.transport.release("tasks", rows),
          rows,
        );
      else
        await p.evaluate(
          (habits) => window.setHabitData({ habits, loading: false }),
          habits,
        );
      await expect(
        p.getByText("Today: 4/5 activities complete.", { exact: false }),
      ).toHaveCount(0);
      await expect(p.getByText("80%", { exact: true })).toHaveCount(0);
      if (tasksFirst)
        await p.evaluate(
          (habits) => window.setHabitData({ habits, loading: false }),
          habits,
        );
      else
        await p.evaluate(
          (rows) => window.transport.release("tasks", rows),
          rows,
        );
      await expect(
        p.getByText("Today: 4/5 activities complete.", { exact: false }),
      ).toBeVisible();
      await p.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(
        p.getByText("Today: 4/5 activities complete.", { exact: false }),
      ).toBeVisible();
      await p.evaluate(() =>
        window.transport.release("tasks", null, "Offline"),
      );
      await expect(
        p.getByText("Today: 4/5 activities complete.", { exact: false }),
      ).toBeVisible();
    },
  );

test("VS-07: calendar keeps its frame and known events during mutation revalidation", async (t) => {
  const p = await pageFor(t, "calendar", { initialHolds: ["calendar"] });
  assert.ok((await p.locator(".proof-calendar").boundingBox()).height >= 600);
  await expect(p.getByLabel("Habit times not yet available")).toBeVisible();
  await p.evaluate(
    (task) =>
      window.transport.release("calendar", {
        tasks: [
          {
            ...task,
            scheduled_start: "2026-09-16T09:00Z",
            scheduled_end: "2026-09-16T10:00Z",
          },
        ],
        habits: [],
        commitments: [],
      }),
    task,
  );
  await expect(
    p.locator(".proof-calendar").getByText("Study", { exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Add commitment" }).click();
  await p.getByLabel("Title", { exact: true }).fill("Meeting");
  await p.getByRole("button", { name: "Save commitment" }).click();
  await p.waitForFunction(
    () => window.transport.calls.filter(([k]) => k === "calendar").length === 2,
  );
  await expect(
    p.locator(".proof-calendar").getByText("Study", { exact: true }),
  ).toBeVisible();
  await p.evaluate(() => window.transport.release("calendar", null, "Offline"));
  await expect(
    p.locator(".proof-calendar").getByText("Study", { exact: true }),
  ).toBeVisible();
});

test("VS-09/10: proof form stays fixed, images/assessments/reopening reuse the owner list", async (t) => {
  const p = await pageFor(t, "proof", { initialHolds: ["proofs"] });
  await p.getByRole("button", { name: "Attach / view proof" }).click();
  const y = (await p.locator("form").boundingBox()).y;
  await p.screenshot({
    path: "out/p1-check/proof-pending-375.png",
    fullPage: true,
  });
  await p.getByRole("button", { name: "Hide proof" }).click();
  await p.getByRole("button", { name: "Attach / view proof" }).click();
  assert.equal(await count(p, "proofs"), 1);
  await p.evaluate(
    (note) =>
      window.transport.release("proofs", [
        note,
        { ...note, id: "image", type: "image", content: null },
      ]),
    note,
  );
  await expect(p.getByText("Known proof", { exact: true })).toBeVisible();
  assert.equal((await p.locator("form").boundingBox()).y, y);
  await p
    .getByRole("button", { name: "Assess note proof with Gemini" })
    .click();
  await expect(p.getByText(/80% confidence/)).toBeVisible();
  assert.equal(await count(p, "proofs"), 1);
  assert.equal((await p.locator("form").boundingBox()).y, y);
  await p.getByRole("button", { name: "Open image", exact: true }).click();
  assert.equal(await count(p, "image"), 1);
  assert.equal(await count(p, "proofs"), 1);
  await p.getByRole("button", { name: "Hide proof" }).click();
  await p.getByRole("button", { name: "Attach / view proof" }).click();
  assert.equal(await count(p, "proofs"), 1);
  await p.evaluate(() =>
    window.transport.set("image", { throw: "Proof unavailable." }),
  );
  await p.getByRole("button", { name: "Open image", exact: true }).click();
  await expect(p.getByText("Known proof", { exact: true })).toHaveCount(0);
});

test("VS-10: stale initial proof response cannot overwrite add or another target", async (t) => {
  const p = await pageFor(t, "proof", { initialHolds: ["proofs"] });
  await p.getByRole("button", { name: "Attach / view proof" }).click();
  await p.getByLabel("Note", { exact: true }).fill("New proof");
  await p.getByRole("button", { name: "Save proof", exact: true }).click();
  await p.waitForFunction(
    () => window.transport.calls.filter(([k]) => k === "proofs").length === 2,
  );
  await p.evaluate((note) => window.transport.release("proofs", [note]), note);
  await expect(p.getByText("Known proof", { exact: true })).toHaveCount(0);
  await p.evaluate(
    (note) =>
      window.transport.release("proofs", [{ ...note, content: "Saved proof" }]),
    note,
  );
  await expect(p.getByText("Saved proof", { exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Refresh proofs" }).click();
  await p.evaluate(() => window.changeOwner("two"));
  await p.getByRole("button", { name: "Attach / view proof" }).click();
  await p.evaluate((note) => window.transport.release("proofs", [note]), note);
  await expect(p.getByText("Known proof", { exact: true })).toHaveCount(0);
  await p.evaluate(() => window.transport.release("proofs", []));
  await expect(p.getByText("No proofs attached.")).toBeVisible();
});

test("VS-11: another assistant request and failure retain prior region but invalidate old plan", async (t) => {
  const p = await pageFor(t, "assistant");
  await p.getByLabel("Your request").fill("First");
  await p.getByRole("button", { name: "Ask assistant", exact: true }).click();
  const section = p.locator("section");
  await expect(section).toContainText("Previous response.");
  const height = (await section.boundingBox()).height;
  await p.evaluate(() => window.transport.hold("ask"));
  await p.getByLabel("Your request").fill("Second");
  await p.getByRole("button", { name: "Ask assistant", exact: true }).click();
  await expect(
    p.getByRole("button", { name: "Apply reviewed changes" }),
  ).toBeDisabled();
  assert.ok((await section.boundingBox()).height >= height);
  await p.evaluate(() => window.transport.release("ask", null, "Timeout"));
  await expect(p.getByRole("alert")).toContainText("Timeout");
  await expect(
    p.getByRole("button", { name: "Apply reviewed changes" }),
  ).toBeDisabled();
  await expect(section).toContainText("Previous response.");
  assert.equal(await count(p, "approve"), 0);
});

for (const width of [375, 390, 430])
  test("VS-12: mobile Grid has rows on first entry at " + width, async (t) => {
    const p = await pageFor(t, "dashboard", { initialHolds: ["tasks"] }, width);
    const grid = p.getByLabel("Mobile habit grid", { exact: true });
    assert.ok(
      (await grid.getByRole("status", { name: "Loading habits" }).boundingBox())
        .height >= 440,
    );
    assert.equal(
      await grid.locator('[style*="grid-template-columns"]').count(),
      6,
    );
    await p.screenshot({
      path: `out/p1-check/grid-pending-${width}.png`,
      fullPage: true,
    });
    await p.getByRole("button", { name: "List", exact: true }).click();
    await expect(p.getByLabel("Loading habits")).toBeVisible();
    await p.getByRole("button", { name: "Grid", exact: true }).click();
    await p.evaluate(() => window.setHabitData({ habits: [], loading: false }));
    await expect(
      p.getByText("No habits yet", { exact: true }).first(),
    ).toBeVisible();
    assert.equal(
      await p.evaluate(() =>
        localStorage.getItem("dailyproof.mobileHabitView"),
      ),
      "grid",
    );
  });

test("VS-13: expansion reuses in-flight today, fetches six prior days, and reauthorizes after close", async (t) => {
  const p = await pageFor(t, "friends", {
    initialHolds: ["summary:one"],
    initialValues: { sharedProofs: { data: [note], error: null } },
  });
  await p.getByRole("button", { name: "View recent days" }).click();
  await expect(
    p.getByRole("button", { name: "Hide recent days" }),
  ).toBeDisabled();
  assert.equal(await count(p, "summary:one"), 1);
  await p.evaluate((day) => {
    for (let i = 1; i <= 6; i++) {
      const date = "2026-09-" + String(16 - i).padStart(2, "0");
      window.transport.set("summary:one:" + date, {
        data: { ...day, log_date: date },
        error: null,
      });
    }
    window.transport.release("summary:one", { data: day, error: null });
  }, day);
  await expect(p.getByText("Known proof", { exact: true })).toBeVisible();
  assert.equal(
    await p.evaluate(
      () =>
        window.transport.calls.filter(([k]) => k.startsWith("summary:")).length,
    ),
    7,
  );
  await p.getByRole("button", { name: "Hide recent days" }).click();
  await expect(p.getByText("Known proof", { exact: true })).toHaveCount(0);
  await p.getByRole("button", { name: "View recent days" }).click();
  assert.equal(await count(p, "summary:one"), 2);
  await p.evaluate(() =>
    window.transport.release("summary:one", {
      data: null,
      error: { code: "42501" },
    }),
  );
  await expect(p.getByRole("alert")).toContainText("Summary unavailable");
  await expect(p.getByText("Known proof", { exact: true })).toHaveCount(0);
  await expect(p.getByText(/Private shared habit/)).toHaveCount(0);
});

test("VS-05: failed inputs never become zero or empty, but successful empty inputs do", async (t) => {
  const p = await pageFor(t, "dashboard", { initialHolds: ["tasks"] });
  await p.evaluate(() => {
    window.setHabitData({
      habits: [],
      loading: false,
      error: "Habits unavailable",
    });
    window.transport.release("tasks", null, "Offline");
  });
  await expect(p.getByText("No habits yet", { exact: true })).toHaveCount(0);
  await expect(
    p.getByText("Today: 0/0 activities complete.", { exact: false }),
  ).toHaveCount(0);
  await p.evaluate(() => {
    window.setHabitData({ habits: [], loading: false });
    window.dispatchEvent(new Event("focus"));
    window.transport.release("tasks", []);
  });
  await expect(
    p.getByText("Today: 0/0 activities complete.", { exact: false }),
  ).toBeVisible();
});

test("VS-14: shell reports logout progress and waits for identity cleanup before signing out", async (t) => {
  const p = await pageFor(t, "shell", {
    initialHolds: ["logoutPush"],
    initialValues: { signOut: { error: null } },
  });
  await p.getByRole("button", { name: "Log out", exact: true }).last().click();
  await expect(
    p.getByRole("button", { name: "Logging out...", exact: false }).last(),
  ).toBeDisabled();
  assert.equal(await count(p, "signOut"), 0);
  await p.evaluate(() =>
    window.transport.release("logoutPush", null, "Cleanup failed"),
  );
  await expect(p.getByRole("alert")).toContainText("Please retry");
  assert.equal(await count(p, "signOut"), 0);
  await p.getByRole("button", { name: "Log out", exact: true }).last().click();
  await p.evaluate(() => window.transport.release("logoutPush", undefined));
  await p.waitForFunction(() =>
    window.transport.calls.some(([key]) => key === "signOut"),
  );
  assert.equal(await count(p, "signOut"), 1);
});

test("VS-15: reopen wins over older refresh and failed writes preserve known rows", async (t) => {
  const p = await pageFor(t, "tasks", {
    initialValues: { tasks: [{ ...task, status: "completed" }] },
  });
  await p.waitForFunction(() => window.current?.ready);
  await p.evaluate(() => {
    window.transport.hold("tasks");
    window.dispatchEvent(new Event("focus"));
    window.transport.set("saveTask", { throw: "Write failed" });
    void window.current.complete(window.current.tasks[0]);
  });
  await p.waitForFunction(() => window.current.error === "Write failed");
  assert.equal(
    await p.evaluate(() => window.current.tasks[0].status),
    "completed",
  );
  await p.evaluate(
    (rows) => {
      window.transport.release("tasks", rows);
      window.transport.release("tasks", rows);
    },
    [{ ...task, status: "completed" }],
  );
  await p.evaluate((task) => {
    window.dispatchEvent(new Event("focus"));
    window.transport.set("saveTask", task);
    void window.current.complete(window.current.tasks[0]);
  }, task);
  await p.waitForFunction(() => window.current.tasks[0].status === "pending");
  await p.evaluate(
    (rows) => window.transport.release("tasks", rows),
    [{ ...task, status: "completed" }],
  );
  assert.equal(
    await p.evaluate(() => window.current.tasks[0].status),
    "pending",
  );
  await p.evaluate((task) => window.transport.release("tasks", [task]), task);
});

test("VS-13: friend summaries resolve out of order without changing another row", async (t) => {
  const p = await pageFor(t, "friends", {
    secondFriend: true,
    initialHolds: ["summary:one", "summary:two"],
  });
  await p.evaluate(
    (day) =>
      window.transport.release("summary:two", {
        data: { ...day, completion: 20 },
        error: null,
      }),
    day,
  );
  await expect(p.getByText(/20%/)).toBeVisible();
  assert.equal(await p.getByLabel("Summary not yet available").count(), 1);
  await p.evaluate(
    (day) =>
      window.transport.release("summary:one", { data: day, error: null }),
    day,
  );
  await expect(p.getByText(/80%/)).toBeVisible();
  await expect(p.getByText(/20%/)).toBeVisible();
});

test("VS-09/10: failed first proof read keeps form geometry and retry can resolve empty", async (t) => {
  const p = await pageFor(t, "proof", { initialHolds: ["proofs"] });
  await p.getByRole("button", { name: "Attach / view proof" }).click();
  const y = (await p.locator("form").boundingBox()).y;
  await p.evaluate(() =>
    window.transport.release("proofs", null, "Unable to load proofs."),
  );
  await expect(p.getByRole("alert")).toContainText("Unable to load proofs");
  assert.equal((await p.locator("form").boundingBox()).y, y);
  await expect(p.getByText("No proofs attached.")).toHaveCount(0);
  await p.getByRole("button", { name: "Refresh proofs" }).click();
  await p.evaluate(() => window.transport.release("proofs", []));
  await expect(p.getByText("No proofs attached.")).toBeVisible();
  assert.equal((await p.locator("form").boundingBox()).y, y);
});

test("VS-10: deleting proof invalidates older list reads without another full refetch", async (t) => {
  const p = await pageFor(t, "proof", { initialValues: { proofs: [note] } });
  await p.getByRole("button", { name: "Attach / view proof" }).click();
  await expect(p.getByText("Known proof", { exact: true })).toBeVisible();
  await p.evaluate(() => window.transport.hold("proofs"));
  await p.getByRole("button", { name: "Refresh proofs" }).click();
  await p.getByRole("button", { name: "Remove proof" }).click();
  await expect(p.getByText("No proofs attached.")).toBeVisible();
  await p.evaluate((note) => window.transport.release("proofs", [note]), note);
  await expect(p.getByText("Known proof", { exact: true })).toHaveCount(0);
  assert.equal(await count(p, "proofs"), 2);
});

test("VS-07: failed initial calendar is unavailable rather than empty; retry and views work", async (t) => {
  const p = await pageFor(t, "calendar", { initialHolds: ["calendar"] });
  await p.evaluate(() => window.transport.release("calendar", null, "Offline"));
  await expect(
    p.getByText("Calendar unavailable", { exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Retry calendar" }).click();
  await p.evaluate(() =>
    window.transport.release("calendar", {
      tasks: [],
      habits: [],
      commitments: [],
    }),
  );
  await expect(
    p.getByText("Calendar unavailable", { exact: true }),
  ).toHaveCount(0);
  for (const name of ["Month", "Week", "Day"]) {
    await p.getByRole("button", { name, exact: true }).click();
    await expect(p.getByRole("button", { name, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    assert.ok((await p.locator(".proof-calendar").boundingBox()).height >= 600);
  }
});

test("VS-13: reopened history rechecks detail and proof consent", async (t) => {
  const initialValues = {
    "summary:one": { data: day, error: null },
    sharedProofs: { data: [note], error: null },
  };
  for (let i = 1; i <= 6; i++) {
    const date = "2026-09-" + String(16 - i).padStart(2, "0");
    initialValues["summary:one:" + date] = {
      data: { ...day, log_date: date },
      error: null,
    };
  }
  const p = await pageFor(t, "friends", { initialValues });
  await p.getByRole("button", { name: "View recent days" }).click();
  await expect(p.getByText("Known proof", { exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Hide recent days" }).click();
  await p.evaluate((day) => {
    window.transport.set("summary:one", {
      data: { ...day, details_visible: false, statuses: [] },
      error: null,
    });
    window.transport.set("sharedProofs", { data: [], error: null });
    for (let i = 1; i <= 6; i++) {
      const date = "2026-09-" + String(16 - i).padStart(2, "0");
      window.transport.set("summary:one:" + date, {
        data: { ...day, log_date: date, details_visible: false, statuses: [] },
        error: null,
      });
    }
  }, day);
  await p.getByRole("button", { name: "View recent days" }).click();
  await expect(
    p.getByRole("button", { name: "Hide recent days" }),
  ).toBeEnabled();
  await expect(p.getByText("Known proof", { exact: true })).toHaveCount(0);
  await expect(p.getByText(/Private shared habit/)).toHaveCount(0);
});

test("VS-15: authorization failure clears cached tasks and readiness", async (t) => {
  const p = await pageFor(t, "tasks", { initialValues: { tasks: [task] } });
  await p.waitForFunction(() => window.current?.ready);
  await p.evaluate(() => {
    window.transport.hold("tasks");
    window.dispatchEvent(new Event("focus"));
    window.transport.release("tasks", { code: "42501" }, "Forbidden");
  });
  await p.waitForFunction(() => window.current.error);
  assert.equal(await p.evaluate(() => window.current.ready), false);
  assert.deepEqual(await p.evaluate(() => window.current.tasks), []);
});

test("VS-06/15: successful edits keep existing task order while revalidating", async (t) => {
  const p = await pageFor(t, "tasks", {
    initialValues: { tasks: [{ ...task, id: "first" }, task] },
  });
  await p.waitForFunction(() => window.current?.ready);
  await p.evaluate((task) => {
    window.transport.hold("tasks");
    window.transport.set("saveTask", { ...task, title: "Edited" });
    void window.current.save(task.id, { ...task, title: "Edited" });
  }, task);
  await p.waitForFunction(() =>
    window.current.tasks.some((t) => t.title === "Edited"),
  );
  assert.deepEqual(
    await p.evaluate(() => window.current.tasks.map((t) => t.id)),
    ["first", "task"],
  );
});
