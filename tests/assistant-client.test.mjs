import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { chromium, expect } from "@playwright/test";
import { loadTypeScript } from "./load-typescript.mjs";
const fixture = `
export const state={tasks:[],calendar:{tasks:[],commitments:[],habits:[]},calls:[],fail:true,oldRead:null};window.fixture=state;
export const getTasks=()=>{state.calls.push('tasks');if(window.holdFirstTasks){window.holdFirstTasks=false;return new Promise(r=>state.oldRead=r)}return Promise.resolve([...state.tasks])};
export const getCalendar=()=>{state.calls.push('calendar');return Promise.resolve({...state.calendar})};
export const saveTask=()=>{},deleteTask=()=>{};
export const useUserClock=()=>({timeZone:'America/Toronto'});
export const useRouter=()=>({refresh:()=>state.calls.push('router')});
export const askAssistant=async()=>({ok:true,reply:'Review the requested changes.',planId:'plan',actions:[
{tool:'create_task',id:'task',values:{title:'Buy groceries',description:'',due_at:null,scheduled_start:null,scheduled_end:null,status:'pending',priority:'normal'}},
{tool:'create_commitment',id:'event',values:{title:'Work',description:'',start_at:'2099-01-05T14:00:00Z',end_at:'2099-01-05T22:00:00Z'}}]});
export const approveAssistantPlan=async()=>{state.calls.push('apply');await new Promise(r=>setTimeout(r,80));if(state.fail)return {ok:false,error:'Synthetic conflict; choose another time or retry.'};state.tasks=[{id:'task',title:'Buy groceries'}];state.calendar={...state.calendar,tasks:[...state.tasks],commitments:[{id:'event',title:'Work'}]};return {applied:true}};
`;
const entry = `
import React from 'react';import{createRoot}from'react-dom/client';
import{AssistantPanel}from'./components/assistant/assistant-panel';
import{TasksProvider,useTasks}from'./lib/hooks/use-tasks';
import{CalendarProvider,useCalendarData}from'./lib/hooks/use-calendar-data';
function Probe(){const tasks=useTasks(),calendar=useCalendarData();return <><output data-testid="tasks">{JSON.stringify(tasks.tasks)}</output><output data-testid="calendar">{JSON.stringify(calendar.data)}</output></>}
window.reminderRefreshes=0;window.addEventListener('dailyproof:work-applied',()=>window.reminderRefreshes++);
createRoot(document.getElementById('root')).render(<TasksProvider><CalendarProvider><AssistantPanel/><Probe/></CalendarProvider></TasksProvider>);
`;
let browser, server, origin;
before(async () => {
  const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "jsx" },
    bundle: true,
    write: false,
    jsx: "automatic",
    plugins: [
      {
        name: "transport",
        setup(b) {
          b.onResolve(
            {
              filter:
                /^(next\/navigation|@\/lib\/actions\/(assistant|tasks|calendar)|@\/components\/layout\/user-clock)$/,
            },
            () => ({ path: "fixture", namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: fixture,
            loader: "js",
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
      req.url === "/bundle.js"
        ? "application/javascript"
        : req.url === "/style.css"
          ? "text/css"
          : "text/html",
    );
    res.end(
      req.url === "/bundle.js"
        ? bundle.outputFiles[0].text
        : req.url === "/style.css"
          ? css.css
          : '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>',
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
});
for (const width of [375, 1440])
  test(`Assistant Apply failure, retry, refresh and discard at ${width}px`, async (t) => {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    t.after(() => page.close());
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page
      .getByLabel("Your request")
      .fill("Add groceries and work tomorrow");
    await page
      .getByRole("button", { name: "Ask assistant", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "create commitment" }),
    ).toBeVisible();
    const apply = page.getByRole("button", { name: "Apply reviewed changes" });
    await apply.click();
    await expect(page.getByRole("alert")).toContainText("Synthetic conflict");
    await expect(apply).toBeEnabled();
    await expect(page.getByTestId("tasks")).toHaveText("[]");
    await page.evaluate(() => {
      window.fixture.fail = false;
    });
    await apply.dblclick();
    await expect(
      page.getByText("Changes applied.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("tasks")).toContainText("Buy groceries");
    await expect(page.getByTestId("calendar")).toContainText("Work");
    const calls = await page.evaluate(() => ({
      calls: window.fixture.calls,
      reminders: window.reminderRefreshes,
    }));
    assert.equal(calls.calls.filter((x) => x === "apply").length, 2);
    assert.ok(calls.calls.includes("router"));
    assert.equal(calls.reminders, 1);
    await page
      .getByRole("button", { name: "Ask assistant", exact: true })
      .click();
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(apply).toHaveCount(0);
    assert.deepEqual(errors, []);
  });
test("Assistant refresh invalidates an older task read", async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.addInitScript(() => {
    window.holdFirstTasks = true;
  });
  await page.goto(origin);
  await page.getByLabel("Your request").fill("Add groceries");
  await page
    .getByRole("button", { name: "Ask assistant", exact: true })
    .click();
  await page.evaluate(() => {
    window.fixture.fail = false;
  });
  await page.getByRole("button", { name: "Apply reviewed changes" }).click();
  await expect(page.getByTestId("tasks")).toContainText("Buy groceries");
  await page.evaluate(() => window.fixture.oldRead([]));
  await expect(page.getByTestId("tasks")).toContainText("Buy groceries");
});
