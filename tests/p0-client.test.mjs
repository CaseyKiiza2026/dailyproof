import test, { before, after } from "node:test";
import assert from "node:assert/strict";
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
export const useUserClock=()=>({now:new Date('2026-09-16T12:00Z'),today:'2026-09-16',tomorrow:'2026-09-17',timeZone:'UTC',shareDetailedActivity:true,setShareDetailedActivity:()=>{}});
export const removeFriendship=id=>call('removeFriend',id),respondToFriendRequest=(...args)=>call('respondFriend',...args),sendFriendRequest=name=>call('addFriend',name),sendNudge=()=>call('nudge');
export const upsertHabitLog=()=>call('log'),seedStarterHabits=()=>call('seed');
export const saveCommitment=()=>call('saveCommitment'),deleteCommitment=()=>call('deleteCommitment'),setHabitTime=()=>call('setHabitTime');
export const useRouter=()=>({push:url=>{calls.push(['navigate',[url]]);history.pushState({},'',url)}});
export default function Link({children,...props}){return createElement('a',props,children)}
export function createClient(){return {auth:{getUser:()=>call('auth')},from:table=>{const query={then:(resolve,reject)=>call(table).then(resolve,reject)};for(const method of ['select','eq','in','or','order','limit','maybeSingle'])query[method]=()=>query;return query},rpc:(name,args)=>call(name+':'+args.p_target_user_id+(args.p_target_date?':'+args.p_target_date:'')),channel:()=>{const channel={on:(_type,_filter,callback)=>{window.insertEvent=callback;return channel},subscribe:()=>channel};return channel},removeChannel:()=>{}}}
`;
const entry = `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{NotificationCenter}from'./components/notifications/notification-center';
import{PrivacySettings}from'./components/profile/privacy-settings';
import{CalendarBoard}from'./components/calendar/calendar-board';
import{useHabitsData}from'./lib/hooks/use-habits-data';
import{useFriendsData}from'./lib/hooks/use-friends-data';
import{useFeedData}from'./lib/hooks/use-feed-data';
import{useDailySummaries}from'./lib/hooks/use-daily-summaries';
import{useLeaderboard}from'./lib/hooks/use-leaderboard';
import{useRemoteData}from'./lib/hooks/use-remote-data';
import{getReminders}from'fixture';
function Probe(){const[version,setVersion]=useState(0);window.refresh=()=>setVersion(v=>v+1);
 const mode=new URLSearchParams(location.search).get('mode');
 const hooks={habits:useHabitsData,friends:useFriendsData,feed:useFeedData,
 summaries:()=>useDailySummaries(window.events||[],version),
 leaderboard:()=>useLeaderboard('self','you',2,window.friends||[],[{id:String(version),userId:'self'}]),
 resource:()=>useRemoteData(getReminders,'Read failed')};
 window.current=hooks[mode]();return <pre>{JSON.stringify(window.current)}</pre>}
const root=createRoot(document.getElementById('root'));window.unmount=()=>root.unmount();
const mode=new URLSearchParams(location.search).get('mode');root.render(mode==='notifications'?<NotificationCenter/>:mode==='privacy'?<PrivacySettings/>:mode==='calendar'?<CalendarBoard/>:<Probe/>);
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
  server = http.createServer((req, res) => {
    res.setHeader(
      "Content-Type",
      req.url === "/bundle.js" ? "application/javascript" : "text/html",
    );
    res.end(
      req.url === "/bundle.js"
        ? bundle.outputFiles[0].text
        : '<!doctype html><div id="root"></div><script src="/bundle.js"></script>',
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
const knownSettings = {
  enabled: true,
  nudges: false,
  friend_activity: true,
  daily_time: "18:30",
};

test("VS-08: real Calendar task/habit clicks call the router without replacing the document; commitments still edit", async t => {
  const page = await pageFor(t, "calendar", { initialValues: { calendar: {
    tasks: [{ id: "task", title: "Scheduled task", scheduled_start: "2026-09-16T09:00Z", scheduled_end: "2026-09-16T10:00Z", status: "pending" }],
    habits: [{ id: "habit", name: "Timed habit", scheduled_days: [3], scheduled_time: "11:00:00", duration_minutes: 30 }],
    commitments: [{ id: "commitment", title: "Appointment", start_at: "2026-09-16T12:00Z", end_at: "2026-09-16T13:00Z", description: "" }],
  } } });
  await page.evaluate(() => window.originalDocument = document);
  await page.locator('.proof-calendar a[href="/todos"]').click();
  assert.equal(await page.evaluate(() => window.originalDocument === document), true);
  await page.locator('.proof-calendar a[href="/dashboard"]').click();
  assert.equal(await page.evaluate(() => window.originalDocument === document), true);
  assert.deepEqual(await page.evaluate(() => window.transport.calls.filter(([key]) => key === "navigate").map(([,args]) => args[0])), ["/todos", "/dashboard"]);
  await page.locator(".proof-calendar").getByText("Fixed · Appointment", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit commitment" })).toBeVisible();
});

test("VS-22: a late initial habit read preserves newly created habits without duplicating them", async t => {
  const page = await pageFor(t, "habits", { initialHolds: ["habits"] });
  await page.waitForFunction(() => window.transport.calls.some(([key]) => key === "habits"));
  await page.evaluate(() => window.current.handleHabitCreated("new", 1, { name:"New habit",category:"Fitness",isCore:false,scheduledDays:[1] }));
  await page.evaluate(() => window.transport.release("habits", { data: [
    { id:"existing",name:"Existing habit",category:"Fitness",scheduled_days:[1] },
    { id:"new",name:"New habit",category:"Fitness",scheduled_days:[1] },
  ],error:null }));
  await page.waitForFunction(() => !window.current.loading);
  assert.deepEqual(await page.evaluate(() => window.current.habits.map(h => h.id).sort()), ["existing", "new"]);
});

test("VS-01: unresolved/failed notification preferences cannot save or enable push", async (t) => {
  const page = await pageFor(t, "notifications", {
    initialHolds: ["settings"],
  });
  await expect(
    page.getByRole("button", { name: "Save settings", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Enable push on this device" }),
  ).toBeDisabled();
  assert.equal(await page.locator('input[type="checkbox"]').count(), 0);
  await page.evaluate(() => window.transport.release("settings", null, true));
  await expect(page.getByRole("alert")).toContainText(
    "Unable to load notification settings",
  );
  await expect(
    page.getByRole("button", { name: "Save settings", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry settings" }).click();
  await page.evaluate(
    (value) => window.transport.release("settings", value),
    knownSettings,
  );
  await expect(page.getByLabel("Push notifications enabled")).toBeChecked();
  assert.equal(
    await page.evaluate(
      () =>
        window.transport.calls.filter(
          ([key]) => key === "saveSettings" || key === "push",
        ).length,
    ),
    0,
  );
});

test("VS-03: polling preserves dirty drafts; settings save and push do not reload unrelated data", async (t) => {
  const page = await pageFor(t, "notifications");
  await page.getByLabel("Friend activity", { exact: true }).uncheck();
  await page.clock.fastForward(60001);
  await expect(
    page.getByLabel("Friend activity", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Enable push on this device" })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable push on this device" }),
  ).toBeEnabled();
  const pushed = await page.evaluate(
    () => window.transport.calls.find(([key]) => key === "saveSettings")[1][0],
  );
  assert.equal(
    pushed.friend_activity,
    true,
    "device enable uses saved preferences, not unsaved edits",
  );
  await expect(
    page.getByLabel("Friend activity", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save settings", exact: true }),
  ).toBeEnabled();
  const calls = await page.evaluate(() => window.transport.calls);
  assert.equal(calls.filter(([key]) => key === "settings").length, 1);
  assert.equal(calls.filter(([key]) => key === "calendar").length, 0);
  assert.equal(calls.filter(([key]) => key === "notifications").length, 2);
  assert.equal(calls.filter(([key]) => key === "reminders").length, 2);
  assert.equal(
    calls.filter(([key]) => key === "saveSettings").at(-1)[1][0]
      .friend_activity,
    false,
  );
  await page.getByRole("button", { name: "Add reminder" }).click();
  await expect(
    page.getByRole("button", { name: "Save reminder", exact: true }),
  ).toBeEnabled();
  assert.equal(
    await page.evaluate(
      () => window.transport.calls.filter(([key]) => key === "calendar").length,
    ),
    1,
  );
});

test("VS-03: older reads cannot overwrite a newer read or a completed mutation; failures retain known data", async (t) => {
  const page = await pageFor(t, "resource", { initialHolds: ["reminders"] });
  await page.evaluate(() => {
    void window.current.refresh();
    void window.current.refresh();
  });
  await page.evaluate(() => window.transport.release("reminders", ["old"]));
  assert.equal(await page.evaluate(() => window.current.data), null);
  await page.evaluate(() => window.transport.release("reminders", ["known"]));
  await page.waitForFunction(() => window.current.data?.[0] === "known");
  await page.evaluate(() => {
    void window.current.refresh();
    window.transport.hold("write");
    void window.current.mutate(
      () => new Promise((resolve) => (window.finishWrite = resolve)),
    );
  });
  await page.evaluate(() => {
    void window.current.refresh();
    window.transport.release("reminders", ["stale"]);
  });
  assert.equal(await page.evaluate(() => window.current.data[0]), "known");
  await page.evaluate(() => window.finishWrite());
  await page.waitForFunction(
    () =>
      window.transport.calls.filter(([key]) => key === "reminders").length ===
      4,
  );
  await page.evaluate(() => window.transport.release("reminders", ["saved"]));
  await page.waitForFunction(() => window.current.data?.[0] === "saved");
  await page.evaluate(() => {
    void window.current.refresh();
    window.transport.release("reminders", null, true);
  });
  await page.waitForFunction(() => window.current.error);
  assert.equal(await page.evaluate(() => window.current.data[0]), "saved");
});

test("VS-04: proof sharing stays unknown until loaded, reports failure, and saves the known value safely", async (t) => {
  const page = await pageFor(t, "privacy", { initialHolds: ["proof"] });
  assert.equal(await page.getByLabel(/Allow accepted friends/).count(), 0);
  await page.evaluate(() => window.transport.release("proof", null, true));
  await expect(page.getByRole("alert")).toHaveText(
    "Unable to load proof privacy.",
  );
  await page.getByRole("button", { name: "Retry proof privacy" }).click();
  await page.evaluate(() => window.transport.release("proof", true));
  await expect(page.getByLabel(/Allow accepted friends/)).toBeChecked();
  await page.evaluate(() => window.transport.hold("saveProof"));
  await page.getByLabel(/Allow accepted friends/).click();
  await expect(page.getByLabel(/Allow accepted friends/)).toBeDisabled();
  await page.evaluate(() => window.transport.release("saveProof", {}));
  await expect(page.getByLabel(/Allow accepted friends/)).not.toBeChecked();
});

test("VS-01/03: failed settings save retains the draft and serializes repeated saves", async (t) => {
  const page = await pageFor(t, "notifications", {
    initialHolds: ["saveSettings"],
  });
  await page.getByLabel("Friend activity", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByLabel("Friend activity", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Enable push on this device" }),
  ).toBeDisabled();
  await page.evaluate(() =>
    window.transport.release("saveSettings", null, true),
  );
  await expect(page.getByRole("alert")).toContainText(
    "Unable to save notification settings",
  );
  await expect(
    page.getByLabel("Friend activity", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Friend activity", { exact: true }),
  ).toBeEnabled();
  assert.equal(
    await page.evaluate(
      () =>
        window.transport.calls.filter(([key]) => key === "saveSettings").length,
    ),
    1,
  );
});

test("VS-03: deferred reminder choices preserve an existing link and mark-read refreshes only history", async (t) => {
  const reminder = {
    id: "r",
    title: "Linked reminder",
    message: "",
    scheduled_at: "2026-09-17T12:00Z",
    status: "pending",
    task_id: "task",
    habit_id: null,
    only_if_incomplete: true,
  };
  const page = await pageFor(t, "notifications", {
    initialHolds: ["calendar"],
    initialValues: {
      reminders: [reminder],
      notifications: [
        {
          id: "n",
          title: "History",
          created_at: "2026-09-16T12:00Z",
          push_status: "sent",
        },
      ],
    },
  });
  await page.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark read", exact: true }),
  ).toBeEnabled();
  const counts = await page.evaluate(() =>
    Object.fromEntries(
      ["settings", "notifications", "reminders", "calendar"].map((key) => [
        key,
        window.transport.calls.filter(([name]) => key === name).length,
      ]),
    ),
  );
  assert.deepEqual(counts, {
    settings: 1,
    notifications: 2,
    reminders: 1,
    calendar: 0,
  });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save reminder", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() =>
    window.transport.release("calendar", {
      tasks: [
        { id: "task", title: "Completed linked task", status: "completed" },
      ],
      habits: [],
      commitments: [],
    }),
  );
  await expect(page.getByLabel("Task (optional)")).toHaveValue("task");
  await expect(
    page.getByRole("button", { name: "Save reminder", exact: true }),
  ).toBeEnabled();
});

test("VS-04: failed proof save retains its last confirmed value", async (t) => {
  const page = await pageFor(t, "privacy", {
    initialValues: { proof: false, saveProof: { throw: "synthetic" } },
  });
  await expect(page.getByLabel(/Allow accepted friends/)).not.toBeChecked();
  await page.getByLabel(/Allow accepted friends/).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Unable to save proof privacy.",
  );
  await expect(page.getByLabel(/Allow accepted friends/)).not.toBeChecked();
  await expect(page.getByLabel(/Allow accepted friends/)).toBeEnabled();
});

for (const [mode, table, initialValues] of [
  ["habits", "habits", {}],
  [
    "habits",
    "habit_logs",
    { habits: { data: [{ id: "h", name: "habit" }], error: null } },
  ],
  ["friends", "friendships", {}],
  [
    "friends",
    "profiles",
    {
      friendships: {
        data: [
          {
            id: "f",
            requester_id: "self",
            addressee_id: "friend",
            status: "accepted",
          },
        ],
        error: null,
      },
    },
  ],
  ["feed", "feed_events", {}],
  [
    "feed",
    "profiles",
    { feed_events: { data: [{ id: "e", user_id: "friend" }], error: null } },
  ],
])
  test(`VS-22: ${mode}/${table} read failures are explicit errors`, async (t) => {
    const page = await pageFor(t, mode, {
      initialValues: {
        ...initialValues,
        [table]: { data: null, error: { code: "503" } },
      },
    });
    await page.waitForFunction(
      () => window.current?.error && !window.current.loading,
    );
    assert.match(
      await page.evaluate(() => window.current.error),
      /Unable to load/,
    );
  });

const friendship = {
  id: "f",
  status: "accepted",
  otherUser: { id: "friend", username: "friend" },
};
const friendRows = [
  { id: "f", requester_id: "self", addressee_id: "friend", status: "accepted" },
];
test("VS-22: friend refresh errors preserve known friends; auth loss clears them", async (t) => {
  const page = await pageFor(t, "friends", {
    initialValues: {
      friendships: { data: friendRows, error: null },
      profiles: { data: [{ id: "friend", username: "friend" }], error: null },
    },
  });
  await page.waitForFunction(
    () => window.current?.acceptedFriends.length === 1,
  );
  await page.evaluate(() => {
    window.transport.set("friendships", { data: null, error: { code: "503" } });
    window.current.reload();
  });
  await page.waitForFunction(
    () => window.current.error && !window.current.loading,
  );
  assert.equal(
    await page.evaluate(() => window.current.acceptedFriends.length),
    1,
  );
  await page.evaluate(() => {
    window.transport.set("friendships", {
      data: null,
      error: { code: "42501" },
    });
    window.current.reload();
  });
  await page.waitForFunction(
    () =>
      !window.current.loading && window.current.acceptedFriends.length === 0,
  );
  assert.equal(await page.evaluate(() => window.current.userId), null);
});

test("VS-22: a slow friendship read cannot undo a successful removal even when revalidation fails", async (t) => {
  const page = await pageFor(t, "friends", {
    initialValues: {
      friendships: { data: friendRows, error: null },
      profiles: { data: [{ id: "friend", username: "friend" }], error: null },
      removeFriend: { success: true },
    },
  });
  await page.waitForFunction(
    () => window.current?.acceptedFriends.length === 1,
  );
  await page.evaluate(() => {
    window.transport.hold("friendships");
    window.current.reload();
  });
  await page.waitForFunction(
    () =>
      window.transport.calls.filter(([key]) => key === "friendships").length ===
      2,
  );
  await page.evaluate(() => {
    void window.current.remove("f");
  });
  await page.waitForFunction(
    () =>
      window.current.acceptedFriends.length === 0 &&
      window.transport.calls.filter(([key]) => key === "friendships").length ===
        3,
  );
  await page.evaluate(
    (rows) =>
      window.transport.release("friendships", { data: rows, error: null }),
    friendRows,
  );
  await page.evaluate(() =>
    window.transport.release("friendships", {
      data: null,
      error: { code: "503" },
    }),
  );
  await page.waitForFunction(
    () => window.current.error && !window.current.loading,
  );
  assert.equal(
    await page.evaluate(() => window.current.acceptedFriends.length),
    0,
  );
});

test("VS-22: successful empty reads remain empty without an error; failed initial streak is not zero", async (t) => {
  const empty = await pageFor(t, "habits");
  await empty.waitForFunction(() => window.current && !window.current.loading);
  assert.deepEqual(
    await empty.evaluate(() => ({
      habits: window.current.habits,
      error: window.current.error,
    })),
    { habits: [], error: null },
  );
  const failed = await pageFor(t, "leaderboard", {
    friends: [friendship],
    initialValues: {
      "get_friend_streak:friend": { data: null, error: { code: "503" } },
    },
  });
  await failed.waitForFunction(
    () => window.current?.error && !window.current.loading,
  );
  assert.equal(
    await failed.evaluate(() =>
      window.current.entries.some((entry) => entry.userId === "friend"),
    ),
    false,
  );
});
test("VS-22: leaderboard retains a known streak on failure, never invents zero, and removes revoked entries", async (t) => {
  const page = await pageFor(t, "leaderboard", {
    friends: [friendship],
    initialValues: { "get_friend_streak:friend": { data: 7, error: null } },
  });
  await page.waitForFunction(() =>
    window.current?.entries.some((entry) => entry.streak === 7),
  );
  await page.evaluate(() => {
    window.transport.set("get_friend_streak:friend", {
      data: null,
      error: { code: "503" },
    });
    window.refresh();
  });
  await page.waitForFunction(
    () => window.current.error && !window.current.loading,
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.current.entries.find((entry) => entry.userId === "friend")
          .streak,
    ),
    7,
  );
  await page.evaluate(() => {
    window.transport.set("get_friend_streak:friend", {
      data: null,
      error: { code: "42501" },
    });
    window.refresh();
  });
  await page.waitForFunction(
    () => !window.current.loading && window.current.entries.length === 1,
  );
});

const summary = {
  username: "friend",
  today_key: "2026-09-16",
  log_date: "2026-09-16",
  complete_count: 1,
  total_count: 2,
  completion: 50,
  streak: 7,
  details_visible: true,
  statuses: [{ habit_name: "private", status: "complete" }],
};
const events = [
  {
    id: "e",
    userId: "friend",
    eventType: "log",
    logDate: "2026-09-16",
    createdAt: "2026-09-16T12:00Z",
  },
];
test("VS-22: summaries retain known cards on transient failure and remove revoked data", async (t) => {
  const page = await pageFor(t, "summaries", {
    events,
    initialValues: {
      "get_friend_day_summary:friend": { data: summary, error: null },
    },
  });
  await page.waitForFunction(() => window.current?.summaries.length === 1);
  await page.evaluate(() => {
    window.transport.set("get_friend_day_summary:friend", {
      data: null,
      error: { code: "503" },
    });
    window.refresh();
  });
  await page.waitForFunction(() => window.current.error);
  assert.equal(
    await page.evaluate(() => window.current.summaries[0].completion),
    50,
  );
  await page.evaluate(() => {
    window.transport.set("get_friend_day_summary:friend", {
      data: null,
      error: { code: "42501" },
    });
    window.refresh();
  });
  await page.waitForFunction(() => window.current.summaries.length === 0);
});

test("VS-22: consent revocation strips retained details even when the historical read fails", async (t) => {
  const page = await pageFor(t, "summaries", {
    events: [...events, { ...events[0], id: "y", logDate: "2026-09-15" }],
    initialValues: {
      "get_friend_day_summary:friend": { data: summary, error: null },
      "get_friend_day_summary:friend:2026-09-15": {
        data: { ...summary, log_date: "2026-09-15" },
        error: null,
      },
    },
  });
  await page.waitForFunction(() => window.current?.summaries.length === 2);
  await page.evaluate((value) => {
    window.transport.set("get_friend_day_summary:friend", {
      data: { ...value, details_visible: false, statuses: [] },
      error: null,
    });
    window.transport.set("get_friend_day_summary:friend:2026-09-15", {
      data: null,
      error: { code: "503" },
    });
    window.refresh();
  }, summary);
  await page.waitForFunction(() => window.current.error);
  assert.equal(
    await page.evaluate(() =>
      window.current.summaries.some(
        (card) => card.detailsVisible || card.statuses.length,
      ),
    ),
    false,
  );
});

test("VS-22: a later historical privacy denial also strips details from today's earlier response", async (t) => {
  const page = await pageFor(t, "summaries", {
    events: [...events, { ...events[0], id: "y", logDate: "2026-09-15" }],
    initialValues: {
      "get_friend_day_summary:friend": { data: summary, error: null },
      "get_friend_day_summary:friend:2026-09-15": {
        data: {
          ...summary,
          log_date: "2026-09-15",
          details_visible: false,
          statuses: [],
        },
        error: null,
      },
    },
  });
  await page.waitForFunction(() => window.current?.summaries.length === 2);
  assert.equal(
    await page.evaluate(() =>
      window.current.summaries.some(
        (card) => card.detailsVisible || card.statuses.length,
      ),
    ),
    false,
  );
});

test("VS-22: an older summary response cannot overwrite a newer result, including after unmount", async (t) => {
  const page = await pageFor(t, "summaries", {
    events,
    initialHolds: ["get_friend_day_summary:friend"],
  });
  await page.waitForFunction(() => window.transport.calls.length === 1);
  await page.evaluate(() => window.refresh());
  await page.waitForFunction(() => window.transport.calls.length === 2);
  await page.evaluate(
    (value) =>
      window.transport.release("get_friend_day_summary:friend", {
        data: value,
        error: null,
      }),
    summary,
  );
  assert.equal(await page.evaluate(() => window.current.summaries.length), 0);
  await page.evaluate(
    (value) =>
      window.transport.release("get_friend_day_summary:friend", {
        data: { ...value, completion: 100 },
        error: null,
      }),
    summary,
  );
  await page.waitForFunction(
    () => window.current.summaries[0]?.completion === 100,
  );
  await page.evaluate(() => window.refresh());
  await page.waitForFunction(() => window.transport.calls.length === 3);
  await page.evaluate((value) => {
    window.unmount();
    window.transport.release("get_friend_day_summary:friend", {
      data: value,
      error: null,
    });
  }, summary);
  assert.equal(await page.locator("#root").textContent(), "");
});
