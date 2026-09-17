import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { loadTypeScript } from "./load-typescript.mjs";
import http from "node:http";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

// Real React components/hooks, with deferred transport boundaries only.
// No credentials, provider calls, or production data are used.
const fixture = `
import {createElement} from 'react';
export const calls=[];
const held=new Set(),pending=new Map();
const values={settings:{enabled:true,nudges:false,friend_activity:true,daily_time:'18:30'},proof:true,
 notifications:[],reminders:[],calendar:{tasks:[],habits:[],commitments:[]},
 auth:{data:{user:{id:'self'}},error:null}};
Object.assign(values,window.initialValues||{});
for(const key of window.initialHolds||[])held.add(key);
export function call(key,...args){calls.push([key,args]);if(held.has(key))return new Promise((resolve,reject)=>{const queue=pending.get(key)||[];queue.push({resolve,reject});pending.set(key,queue)});const value=values[key];return value?.throw?Promise.reject(new Error(value.throw)):Promise.resolve(value??{data:[],error:null})}
window.transport={calls,set:(key,value)=>values[key]=value,hold:key=>held.add(key),release:(key,value,fail=false)=>{const item=pending.get(key)?.shift();if(!item)throw new Error('No pending '+key);fail?item.reject(new Error('Synthetic failure')):item.resolve(value)},unhold:key=>held.delete(key)};
export const getNotificationSettings=()=>call('settings'),saveNotificationSettings=value=>call('saveSettings',value),enableBrowserPush=()=>call('push');
export const getNotifications=()=>call('notifications'),getReminders=()=>call('reminders'),getCalendar=()=>call('calendar');
export const saveReminder=(...args)=>call('saveReminder',...args),cancelReminder=id=>call('cancelReminder',id),markNotificationRead=id=>call('markRead',id);
export const getProofSharing=()=>call('proof'),setProofSharing=value=>call('saveProof',value),setDetailedActivity=value=>call('saveDetailed',value);
export const useUserClock=()=>({userId:'self',todayDate:new Date(2026,8,16),now:new Date(window.clockNow||'2026-09-16T12:00Z'),today:'2026-09-16',tomorrow:'2026-09-17',timeZone:'UTC',shareDetailedActivity:true,setShareDetailedActivity:()=>{}});
export const removeFriendship=id=>call('removeFriend',id),respondToFriendRequest=(...args)=>call('respondFriend',...args),sendFriendRequest=name=>call('addFriend',name),sendNudge=()=>call('nudge');
export const proofImageUrl=()=>call('image');
export const initializePreferences=()=>call('preferences');
export const searchProfilesByUsername=q=>call('search:'+q);
export const createHabit=()=>call('createHabit'),updateHabit=()=>call('updateHabit'),deleteHabit=()=>call('deleteHabit');
export const upsertHabitLog=()=>call('log'),seedStarterHabits=()=>call('seed');
export const saveCommitment=()=>call('saveCommitment'),deleteCommitment=()=>call('deleteCommitment'),setHabitTime=()=>call('setHabitTime');
export const useRouter=()=>({push:url=>{calls.push(['navigate',[url]]);history.pushState({},'',url)}});
export default function Link({children,...props}){return createElement('a',props,children)}
export function createClient(){return {auth:{getUser:()=>call('auth'),onAuthStateChange:callback=>{window.authChange=id=>callback('SIGNED_IN',id?{user:{id}}:null);return {data:{subscription:{unsubscribe:()=>{}}}}}},from:table=>{let key=table;const query={then:(resolve,reject)=>call(key).then(resolve,reject)};for(const method of ['select','in','or','order','limit','maybeSingle','single'])query[method]=()=>query;query.eq=(field,value)=>{if(field==='username')key='username:'+value;return query};return query},rpc:(name,args)=>call(name+':'+args.p_target_user_id+(args.p_target_date?':'+args.p_target_date:'')),channel:()=>{const channel={on:(_type,_filter,callback)=>{window.insertEvent=callback;return channel},subscribe:()=>channel};return channel},removeChannel:()=>{}}}
`;
const entry = `
import React,{useState} from 'react';import{createRoot,hydrateRoot}from'react-dom/client';import{renderToString}from'react-dom/server';
import{NotificationCenter}from'./components/notifications/notification-center';
import{PrivacySettings}from'./components/profile/privacy-settings';
import{CalendarBoard}from'./components/calendar/calendar-board';
import{HabitsProvider,useHabitsData}from'./lib/hooks/use-habits-data';
import{useFriendsData}from'./lib/hooks/use-friends-data';
import{useFeedData}from'./lib/hooks/use-feed-data';
import{useDailySummaries}from'./lib/hooks/use-daily-summaries';
import{useLeaderboard}from'./lib/hooks/use-leaderboard';
import{useRemoteData}from'./lib/hooks/use-remote-data';
import{getReminders}from'fixture';
import FeedPage from './app/(app)/feed/page';
import YearPage from './app/(app)/year/page';
import HomePage from './app/page';
import FriendsPage from './app/(app)/friends/page';
import AuthPage from './app/auth/page';
import {AddFriendModal} from './components/friends/add-friend-modal';
import {DailySummaryCard} from './components/feed/daily-summary-card';
import {UserClockProvider,useUserClock as actualClock} from './components/layout/user-clock';
function ClockProbe(){const clock=actualClock();window.currentClock=clock;return <div>{clock.userId}:{clock.timeZone}:{clock.today}</div>}
function Shared(){const[shown,show]=useState(true),[owner,setOwner]=useState('self');window.show=show;window.setOwner=setOwner;return <HabitsProvider key={owner}><HabitProbe label="shell"/>{shown&&<HabitProbe label="page"/>}</HabitsProvider>}
function HabitProbe({label}){const data=useHabitsData();window[label]=data;return <div data-testid={label}>{data.ready?JSON.stringify(data.habits):'Unknown'}</div>}
function Probe(){const[version,setVersion]=useState(0);window.refresh=()=>setVersion(v=>v+1);
 const mode=new URLSearchParams(location.search).get('mode');
 const hooks={habits:useHabitsData,friends:useFriendsData,feed:useFeedData,
 summaries:()=>useDailySummaries(window.events||[],version,window.eventsReady??true),
 leaderboard:()=>useLeaderboard('self','you',window.selfStreak??2,window.friends||[],window.events||[]),
 resource:()=>useRemoteData(getReminders,'Read failed')};
 window.current=hooks[mode]();return <pre>{JSON.stringify(window.current)}</pre>}
if(new URLSearchParams(location.search).get('mode')==='hydrate'){const tree=<UserClockProvider seed={window.seed}><ClockProbe/></UserClockProvider>;const container=document.getElementById('root');container.innerHTML=renderToString(tree);window.hydrationErrors=[];hydrateRoot(container,tree,{onRecoverableError:e=>window.hydrationErrors.push(e.message)});}else {
const root=createRoot(document.getElementById('root'));window.unmount=()=>root.unmount();
const mode=new URLSearchParams(location.search).get('mode');root.render(mode==='clock'?<UserClockProvider seed={window.seed}><ClockProbe/></UserClockProvider>:mode==='shared'?<Shared/>:mode==='feed-page'?<FeedPage/>:mode==='year'?<YearPage/>:mode==='home'?<HomePage/>:mode==='friends-page'?<FriendsPage/>:mode==='auth-page'?<AuthPage/>:mode==='search'?<AddFriendModal friendships={[]} onClose={()=>{}} onAdd={async()=>({success:true})}/>:mode==='activity'?<DailySummaryCard summary={window.summary} now={new Date('2026-09-16T12:00Z')}/>:mode==='notifications'?<NotificationCenter/>:mode==='privacy'?<PrivacySettings/>:mode==='calendar'?<CalendarBoard/>:<Probe/>);}
`;
let browser, server, origin;
before(async () => {
  const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "jsx" },
    bundle: true,
    write: false,
    jsx: "automatic",
    loader: { ".css": "empty" },
    plugins: [
      {
        name: "transport-fixtures",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(fixture|next\/link|next\/navigation|@\/lib\/actions\/|@\/lib\/supabase\/client|@\/lib\/push-browser|@\/components\/layout\/user-clock)/,
            },
            () => ({ path: "fixture", namespace: "fixture" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: fixture,
            loader: "js",
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
  server = http.createServer((req, res) => {
    res.setHeader(
      "Content-Type",
      req.url === "/bundle.js" ? "application/javascript" : "text/html",
    );
    res.end(
      req.url === "/bundle.js"
        ? bundle.outputFiles[0].text
        : '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>' +
            css.css +
            '</style><div id="root"></div><script src="/bundle.js"></script>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});
async function pageFor(t, mode, initial = {}) {
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
  t.after(() => page.close());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.addInitScript((value) => Object.assign(window, value), initial);
  await page.clock.install();
  await page.goto(`${origin}/?mode=${mode}`);
  await page.waitForFunction(() => window.transport);
  return page;
}
const habit = {
  id: "h",
  name: "Known habit",
  category: "Health",
  order_index: 0,
  is_core: true,
  scheduled_days: [1, 2, 3, 4, 5, 6, 7],
};
const day = {
  today_key: "2026-09-16",
  log_date: "2026-09-16",
  username: "friend",
  completion: 100,
  complete_count: 1,
  total_count: 1,
  streak: 7,
  details_visible: true,
  statuses: [{ habit_name: "Private habit", status: "complete" }],
};
const event = {
  id: "e",
  userId: "friend",
  eventType: "log",
  logDate: "2026-09-16",
  createdAt: "2026-09-16T12:00Z",
};
async function called(p, key, n = 1) {
  await p.waitForFunction(
    ({ key, n }) =>
      window.transport.calls.filter(([k]) => k === key).length >= n,
    { key, n },
  );
}
async function calls(p, key) {
  return p.evaluate(
    (key) => window.transport.calls.filter(([k]) => k === key).length,
    key,
  );
}

test("VS-18: shared habit read, remount, optimistic mutation and rollback stay consistent", async (t) => {
  const p = await pageFor(t, "shared", {
    initialValues: { habits: { data: [habit], error: null } },
    initialHolds: ["habit_logs", "log"],
  });
  await called(p, "habit_logs");
  assert.equal(await calls(p, "habits"), 1);
  await p.evaluate(() =>
    window.transport.release("habit_logs", { data: [], error: null }),
  );
  await p.waitForFunction(() => window.shell.ready && window.page.ready);
  await p.evaluate(() => window.show(false));
  await p.evaluate(() => window.show(true));
  await expect(p.getByTestId("page")).toContainText("Known habit");
  assert.equal(await calls(p, "habits"), 1);
  await p.evaluate(() => {
    void window.page.updateCell("h", "2026-09-16", "complete");
  });
  await expect(p.getByTestId("shell")).toContainText("complete");
  await p.evaluate(() =>
    window.transport.release("log", { success: false, error: "Failed" }),
  );
  await p.waitForFunction(() => window.shell.pendingCells.size === 0);
  assert.equal(
    await p.evaluate(() => window.shell.habits[0].logsByDate["2026-09-16"]),
    undefined,
  );
  await p.evaluate(() => {
    void window.page.updateCell("h", "2026-09-16", "complete");
  });
  await p.evaluate(() => window.transport.release("log", { success: true }));
  await p.waitForFunction(() => window.shell.pendingCells.size === 0);
  await expect(p.getByTestId("shell")).toContainText("complete");
  await p.evaluate(() => {
    window.transport.hold("habits");
    window.shell.reload();
  });
  await called(p, "habits", 2);
  await expect(p.getByTestId("page")).toContainText("complete");
  await p.evaluate(() => window.transport.release("habits", null, true));
  await p.waitForFunction(() => window.shell.error);
  await expect(p.getByTestId("shell")).toContainText("complete");
  await p.evaluate(() => window.setOwner("second"));
  await expect(p.getByTestId("shell")).toHaveText("Unknown");
});

test("VS-18: focus reads deduplicate and a stale read cannot overwrite a local mutation", async (t) => {
  const p = await pageFor(t, "shared", {
    initialValues: {
      habits: { data: [habit], error: null },
      log: { success: true },
    },
  });
  await p.waitForFunction(() => window.shell.ready);
  await p.evaluate(() => {
    window.transport.hold("habits");
    window.dispatchEvent(new Event("focus"));
  });
  await called(p, "habits", 2);
  await p.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    void window.page.updateCell("h", "2026-09-16", "complete");
  });
  await p.waitForFunction(() => window.shell.pendingCells.size === 0);
  await p.evaluate(
    (h) => window.transport.release("habits", { data: [h], error: null }),
    habit,
  );
  await expect(p.getByTestId("shell")).toContainText("complete");
  assert.equal(await calls(p, "habits"), 2);
});

for (const mode of ["year", "home", "feed-page"])
  test(
    "VS-17: " +
      mode +
      " distinguishes unknown stats, known values, failed refresh and true zero",
    async (t) => {
      const p = await pageFor(t, mode, { initialHolds: ["habits"], initialValues: {habit_logs: {data: [{habit_id:"h",log_date:"2026-09-16",status:"complete"}],error:null}} });
      await called(p, "habits");
      if (mode === "year") {
        await expect(p.getByLabel("Loading heatmap")).toBeVisible();
        assert.ok(
          (await p.getByLabel("Loading heatmap").boundingBox()).height >= 260,
        );
      } else await expect(p.getByText(/Loading/).first()).toBeVisible();
      await p.evaluate(
        (h) => window.transport.release("habits", { data: [h], error: null }),
        habit,
      );
      await called(p, "habit_logs");
      const value = mode === "year" ? p.getByText("1 day current streak") : mode === "home" ? p.getByText("Streak", {exact:true}).locator("..").locator("p").first() : p.getByText("Your streak", {exact:true}).locator("..").locator("p").nth(1);
      await expect(value).toHaveText(mode === "year" ? "1 day current streak" : "1");
      await p.evaluate(() => window.dispatchEvent(new Event("focus")));
      await called(p, "habits", 2);
      await p.evaluate(() => window.transport.release("habits", null, true));
      await expect(p.getByRole("alert").first()).toContainText(
        "Unable to load habits",
      );
      await expect(value).toHaveText(mode === "year" ? "1 day current streak" : "1");
      if (mode === "year")
        await expect(p.getByLabel("Loading heatmap")).toHaveCount(0);
      await p.evaluate(() => window.dispatchEvent(new Event("focus")));
      await called(p, "habits", 3);
      await p.evaluate(() =>
        window.transport.release("habits", { data: [], error: null }),
      );
      await expect(p.getByRole("alert")).toHaveCount(0);
      if (mode === "feed-page")
        await expect(p.getByText("0", { exact: true }).first()).toBeVisible();
    },
  );

test("VS-19: unresolved friendship and profile reads never claim an empty circle", async (t) => {
  const p = await pageFor(t, "friends-page", {
    initialHolds: ["friendships", "profiles"],
  });
  await called(p, "friendships");
  await expect(
    p.getByText(/No friends here yet|Your circle is empty/),
  ).toHaveCount(0);
  assert.ok(
    (await p.getByLabel("Loading friendships and requests").boundingBox())
      .height >= 280,
  );
  await p.evaluate(() =>
    window.transport.release("friendships", {
      data: [
        {
          id: "f",
          requester_id: "friend",
          addressee_id: "self",
          status: "pending",
        },
      ],
      error: null,
    }),
  );
  await called(p, "profiles");
  await expect(
    p.getByText(/No friends here yet|Your circle is empty/),
  ).toHaveCount(0);
  await p.evaluate(() =>
    window.transport.release("profiles", {
      data: [{ id: "friend", username: "friend" }],
      error: null,
    }),
  );
  await expect(p.getByRole("heading", { name: "Requests" })).toBeVisible();
});

test("VS-20: summaries await events, retain known cards on refresh, and resolve true empty", async (t) => {
  const p = await pageFor(t, "summaries", {
    events: [],
    eventsReady: false,
    initialHolds: ["get_friend_day_summary:friend"],
  });
  await p.waitForFunction(() => window.current);
  assert.equal(await p.evaluate(() => window.current.loading), true);
  await p.evaluate((e) => {
    window.events = [e];
    window.eventsReady = true;
    window.refresh();
  }, event);
  await called(p, "get_friend_day_summary:friend");
  assert.equal(await p.evaluate(() => window.current.loading), true);
  await p.evaluate(
    (d) =>
      window.transport.release("get_friend_day_summary:friend", {
        data: d,
        error: null,
      }),
    day,
  );
  await p.waitForFunction(() => window.current.summaries.length === 1);
  await p.evaluate(() => window.refresh());
  await called(p, "get_friend_day_summary:friend", 2);
  assert.equal(await p.evaluate(() => window.current.summaries.length), 1);
  await p.evaluate(() =>
    window.transport.release("get_friend_day_summary:friend", null, true),
  );
  await p.waitForFunction(() => window.current.error);
  assert.equal(await p.evaluate(() => window.current.summaries.length), 1);
  await p.evaluate(() => {
    window.events = [];
    window.refresh();
  });
  await p.waitForFunction(
    () => !window.current.loading && window.current.summaries.length === 0,
  );
});

test("VS-21: self changes do not refetch friends; minute refresh retains known ranking", async (t) => {
  const p = await pageFor(t, "leaderboard", {
    friends: [{ otherUser: { id: "friend", username: "friend" } }],
    initialValues: { "get_friend_streak:friend": { data: 7, error: null } },
  });
  await p.waitForFunction(() => !window.current.loading);
  assert.equal(await calls(p, "get_friend_streak:friend"), 1);
  await p.evaluate(() => {
    window.selfStreak = 9;
    window.refresh();
  });
  await p.waitForFunction(() => window.current.entries[0].streak === 9);
  assert.equal(await calls(p, "get_friend_streak:friend"), 1);
  await p.evaluate(() => {
    window.transport.hold("get_friend_streak:friend");
    window.clockNow = "2026-09-16T12:01Z";
    window.refresh();
  });
  await called(p, "get_friend_streak:friend", 2);
  assert.equal(
    await p.evaluate(
      () => window.current.entries.find((e) => !e.isSelf).streak,
    ),
    7,
  );
  await p.evaluate(() =>
    window.transport.release("get_friend_streak:friend", {
      data: 10,
      error: null,
    }),
  );
  await p.waitForFunction(() => window.current.entries[0].streak === 10);
});

test("VS-25: friend search hides stale matches, reports failures and ignores obsolete responses", async (t) => {
  const p = await pageFor(t, "search", {
    initialHolds: ["search:alice", "search:bob"],
  });
  const input = p.getByPlaceholder("Search by username");
  await input.fill("alice");
  await p.clock.fastForward(400);
  await called(p, "search:alice");
  await p.evaluate(() =>
    window.transport.release("search:alice", {
      success: true,
      data: [{ id: "a", username: "alice" }],
    }),
  );
  await expect(p.getByText("@alice")).toBeVisible();
  await input.fill("bob");
  await expect(p.getByText("@alice")).toHaveCount(0);
  await p.clock.fastForward(400);
  await called(p, "search:bob");
  await p.evaluate(() =>
    window.transport.release("search:bob", {
      success: false,
      error: "Failure",
    }),
  );
  await expect(p.getByRole("alert")).toContainText("Unable to search");
  await expect(p.getByText(/No one found/)).toHaveCount(0);
  await input.fill("alice");
  await p.clock.fastForward(400);
  await called(p, "search:alice", 2);
  await input.fill("");
  await p.evaluate(() =>
    window.transport.release("search:alice", {
      success: true,
      data: [{ id: "a", username: "alice" }],
    }),
  );
  await expect(p.getByText("@alice")).toHaveCount(0);
});

test("VS-25: failed username lookup is never available and stale lookup cannot enable signup", async (t) => {
  const p = await pageFor(t, "auth-page", {
    initialHolds: ["username:alice", "username:bobby"],
  });
  await p.getByRole("button", { name: "Sign up", exact: true }).click();
  await p.getByPlaceholder("jethro").fill("alice");
  await p.clock.fastForward(501);
  await called(p, "username:alice");
  await p.evaluate(() =>
    window.transport.release("username:alice", {
      data: null,
      error: { message: "Failure" },
    }),
  );
  await expect(p.getByRole("alert")).toContainText("Unable to verify");
  await expect(
    p.getByRole("button", { name: "Create account" }),
  ).toBeDisabled();
  await p.getByPlaceholder("jethro").fill("bobby");
  await p.clock.fastForward(501);
  await called(p, "username:bobby");
  await p.getByPlaceholder("jethro").fill("a");
  await p.evaluate(() =>
    window.transport.release("username:bobby", { data: null, error: null }),
  );
  await expect(p.getByText("? Available", { exact: true })).toHaveCount(0);
  await expect(
    p.getByRole("button", { name: "Create account" }),
  ).toBeDisabled();
  await p.getByPlaceholder("jethro").fill("alice");
  await p.clock.fastForward(501);
  await called(p, "username:alice", 2);
  await p.evaluate(() =>
    window.transport.release("username:alice", { data: null, error: null }),
  );
  await expect(p.getByRole("button", { name: "Create account" })).toBeEnabled();
});

test("VS-16: server-known timezone skips startup; account change gates and error retries in place", async (t) => {
  const p = await pageFor(t, "clock", {
    seed: {
      preferences: {
        userId: "self",
        timeZone: "America/Toronto",
        shareDetailedActivity: true,
      },
      now: "2026-09-16T02:00Z",
    },
    initialHolds: ["preferences"],
  });
  await p.waitForFunction(() => window.authChange);
  await expect(p.getByText("self:America/Toronto:2026-09-15")).toBeVisible();
  await p.evaluate(() => window.authChange("self"));
  assert.equal(await calls(p, "preferences"), 0);
  await p.evaluate(() => window.authChange("other"));
  await called(p, "preferences");
  await expect(p.getByText(/self:America/)).toHaveCount(0);
  await p.evaluate(() => window.transport.release("preferences", null, true));
  await expect(p.getByText("Unable to load your preferences.")).toBeVisible();
  await p.getByRole("button", { name: "Retry" }).click();
  await p.evaluate(() => window.authChange("other"));
  await called(p, "preferences", 2);
  await p.evaluate(() =>
    window.transport.release("preferences", {
      userId: "other",
      timeZone: "Asia/Tokyo",
      shareDetailedActivity: false,
    }),
  );
  await p.waitForFunction(() => window.currentClock.userId === "other");
  await p.evaluate(() => window.authChange(null));
  await p.waitForFunction(() => window.currentClock.userId === null);
});

test("VS-24: seven-day expansion reserves rows and reauthorizes after closing", async (t) => {
  const summary = {
    userId: "friend",
    username: "friend",
    todayKey: "2026-09-16",
    logDate: "2026-09-16",
    lastActivityAt: "2026-09-16T12:00Z",
    totalCount: 1,
    completeCount: 1,
    completion: 100,
    streak: 7,
    detailsVisible: true,
    statuses: [],
    missedCount: 0,
    restCount: 0,
    vacationCount: 0,
    emptyCount: 0,
  };
  const keys = Array.from(
    { length: 7 },
    (_, i) => "get_friend_day_summary:friend:2026-09-" + (16 - i),
  );
  const p = await pageFor(t, "activity", { summary, initialHolds: keys });
  await p.getByRole("button", { name: "View activity" }).click();
  await called(p, keys[6]);
  assert.ok((await p.getByRole("status").boundingBox()).height >= 590);
  await p.getByRole("button", { name: "Hide" }).click();
  await p.getByRole("button", { name: "View activity" }).click();
  await called(p, keys[6], 2);
  for (const key of keys)
    await p.evaluate(
      ({ key, day }) =>
        window.transport.release(key, { data: day, error: null }),
      { key, day },
    );
  await expect(p.getByRole("status")).toBeVisible();
  for (const key of keys)
    await p.evaluate(
      ({ key, day }) =>
        window.transport.release(key, {
          data: {
            ...day,
            log_date: key.split(":")[2],
            details_visible: false,
            statuses: [],
          },
          error: null,
        }),
      { key, day },
    );
  await expect(p.getByText("Summary-only activity.")).toHaveCount(7);
  await expect(p.getByText("Private habit")).toHaveCount(0);
});

for (const width of [375, 390, 430, 1280])
  test(
    "P2 responsive: pending and settled Feed/Year/Friends at " + width,
    async (t) => {
      for (const mode of ["feed-page", "year", "friends-page"]) {
        const p = await pageFor(t, mode, {
          initialHolds: ["habits", "friendships"],
        });
        await p.setViewportSize({ width, height: 900 });
        await p.waitForFunction(() =>
          window.transport.calls.some(
            ([k]) => k === "habits" || k === "friendships",
          ),
        );
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          mode + " pending overflow",
        );
        if (mode !== "friends-page")
          await p.evaluate(() =>
            window.transport.release("habits", { data: [], error: null }),
          );
        if (mode !== "year")
          await p.evaluate(() =>
            window.transport.release("friendships", { data: [], error: null }),
          );
        if (mode === "friends-page")
          await expect(p.getByText("Your circle is empty")).toBeVisible();
        if (mode === "year")
          await expect(p.getByLabel("Loading heatmap")).toHaveCount(0);
        if (mode === "feed-page")
          await expect(p.getByText(/Nothing here yet/)).toBeVisible();
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          mode + " settled overflow",
        );
      }
    },
  );

test("VS-20: actual Feed never exposes an empty timeline between event and summary reads", async (t) => {
  const p = await pageFor(t, "feed-page", {
    initialHolds: ["feed_events", "get_friend_day_summary:friend"],
    initialValues: {
      profiles: { data: [{ id: "friend", username: "friend" }], error: null },
    },
  });
  await called(p, "feed_events");
  await expect(p.getByText(/Nothing here yet/)).toHaveCount(0);
  await p.evaluate(() =>
    window.transport.release("feed_events", {
      data: [
        {
          id: "e",
          user_id: "friend",
          event_type: "log",
          log_date: "2026-09-16",
          created_at: "2026-09-16T12:00Z",
        },
      ],
      error: null,
    }),
  );
  await called(p, "get_friend_day_summary:friend");
  await expect(p.getByText(/Nothing here yet/)).toHaveCount(0);
  await p.evaluate(
    (d) =>
      window.transport.release("get_friend_day_summary:friend", {
        data: d,
        error: null,
      }),
    day,
  );
  await expect(p.getByText(/100% completion/)).toBeVisible();
});

test("VS-19: failed initial friends read is not successful empty; retry resolves genuine empty", async (t) => {
  const p = await pageFor(t, "friends-page", { initialHolds: ["friendships"] });
  await called(p, "friendships");
  await p.evaluate(() => window.transport.release("friendships", null, true));
  await expect(p.getByRole("alert")).toContainText(
    "Unable to load friendships",
  );
  await expect(
    p.getByText(/No friends here yet|Your circle is empty/),
  ).toHaveCount(0);
  await p.getByRole("button", { name: "Retry" }).click();
  await called(p, "friendships", 2);
  await p.evaluate(() =>
    window.transport.release("friendships", { data: [], error: null }),
  );
  await expect(p.getByText("Your circle is empty")).toBeVisible();
});

test("VS-25: successful no-match and taken username remain distinct from lookup errors", async (t) => {
  const p = await pageFor(t, "search", {
    initialValues: { "search:nobody": { success: true, data: [] } },
  });
  await p.getByPlaceholder("Search by username").fill("nobody");
  await p.clock.fastForward(400);
  await expect(p.getByText("No one found with that username.")).toBeVisible();
  const a = await pageFor(t, "auth-page", {
    initialValues: { "username:alice": { data: { id: "taken" }, error: null } },
  });
  await a.getByRole("button", { name: "Sign up", exact: true }).click();
  await a.getByPlaceholder("jethro").fill("alice");
  await a.clock.fastForward(501);
  await expect(a.getByText(/Already taken/)).toBeVisible();
  await expect(
    a.getByRole("button", { name: "Create account" }),
  ).toBeDisabled();
});


test("VS-18: a refresh queued alongside a write cannot publish pre-write data",async t=>{
 const p=await pageFor(t,"shared",{initialValues:{habits:{data:[habit],error:null}},initialHolds:["log"]});await p.waitForFunction(()=>window.shell.ready);
 await p.evaluate(()=>{window.shell.reload();void window.page.updateCell("h","2026-09-16","complete")});await called(p,"log");
 await expect(p.getByTestId("shell")).toContainText("complete");assert.equal(await calls(p,"habits"),1);
 await p.evaluate(()=>window.transport.release("log",{success:true}));await p.waitForFunction(()=>window.shell.pendingCells.size===0);await expect(p.getByTestId("page")).toContainText("complete");
});

test("VS-18: authorization loss clears the shared snapshot and readiness",async t=>{
 const p=await pageFor(t,"shared",{initialValues:{habits:{data:[habit],error:null}}});await p.waitForFunction(()=>window.shell.ready);
 await p.evaluate(()=>{window.transport.set("habits",{data:null,error:{code:"42501"}});window.shell.reload()});await p.waitForFunction(()=>window.shell.error);
 await expect(p.getByTestId("shell")).toHaveText("Unknown");await expect(p.getByTestId("page")).toHaveText("Unknown");assert.equal(await p.evaluate(()=>window.shell.habits.length),0);
});


test("VS-16: seeded clock hydrates without changing the saved-zone day",async t=>{
 const p=await pageFor(t,"hydrate",{seed:{preferences:{userId:"self",timeZone:"America/Toronto",shareDetailedActivity:true},now:"2026-09-16T02:00Z"}});
 await p.waitForFunction(()=>window.authChange);await expect(p.getByText("self:America/Toronto:2026-09-15")).toBeVisible();assert.deepEqual(await p.evaluate(()=>window.hydrationErrors),[]);
});

test("VS-16: unresolved first entry stays gated and ignores an old account preference response",async t=>{
 const p=await pageFor(t,"clock",{initialHolds:["preferences"]});await p.waitForFunction(()=>window.authChange);assert.ok((await p.getByRole("status").boundingBox()).height>=600);
 await p.evaluate(()=>window.authChange("first"));await called(p,"preferences");await p.evaluate(()=>window.authChange("second"));await called(p,"preferences",2);
 await p.evaluate(()=>window.transport.release("preferences",{userId:"first",timeZone:"America/Toronto",shareDetailedActivity:true}));await expect(p.getByRole("status")).toBeVisible();
 await p.evaluate(()=>window.transport.release("preferences",{userId:"second",timeZone:"Asia/Tokyo",shareDetailedActivity:false}));await p.waitForFunction(()=>window.currentClock?.userId==="second");await expect(p.getByRole("status")).toHaveCount(0);
});
