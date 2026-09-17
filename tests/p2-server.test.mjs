import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
function load(file, dependencies) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, {
    filename: file,
  })(
    (name) => (name in dependencies ? dependencies[name] : require(name)),
    loadedModule,
    loadedModule.exports,
  );
  return loadedModule.exports;
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function dbFixture() {
  const auth = deferred(),
    profile = deferred(),
    summary = deferred(),
    friends = deferred();
  const calls = [];
  const db = {
    auth: { getUser: () => auth.promise },
    rpc: (name, args) => {
      calls.push([name, args]);
      return summary.promise;
    },
    from: (table) => {
      const query = {
        then: (resolve, reject) => {
          calls.push([table]);
          return (table === "profiles" ? profile : friends).promise.then(
            resolve,
            reject,
          );
        },
      };
      for (const method of ["select", "eq", "single", "or"])
        query[method] = () => query;
      return query;
    },
  };
  return { db, auth, profile, summary, friends, calls };
}
const profileDeps = (db) => ({
  "@/lib/supabase/server": { createClient: async () => db },
  "@/components/profile/privacy-settings": { PrivacySettings: () => null },
  "next/navigation": {
    redirect: (path) => {
      throw new Error("redirect:" + path);
    },
  },
});
test("VS-23: Profile starts independent reads together only after authentication and keeps server values", async () => {
  const f = dbFixture();
  const Page = load("app/(app)/profile/page.tsx", profileDeps(f.db)).default;
  const pending = Page();
  await Promise.resolve();
  assert.equal(f.calls.length, 0);
  f.auth.resolve({ data: { user: { id: "self" } } });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(f.calls.map(([name]) => name).sort(), [
    "friendships",
    "get_friend_day_summary",
    "profiles",
  ]);
  f.profile.resolve({ data: { username: "casey" } });
  f.summary.resolve({ data: { streak: 7, completion: 80 } });
  f.friends.resolve({ count: 3 });
  const html = renderToStaticMarkup(await pending);
  assert.match(html, /casey/);
  assert.match(html, />7</);
  assert.match(html, /80%/);
  assert.match(html, />3</);
});
test("VS-23: unauthenticated Profile redirects before private reads; failed reads render unavailable markers", async () => {
  const f = dbFixture();
  const Page = load("app/(app)/profile/page.tsx", profileDeps(f.db)).default;
  f.auth.resolve({ data: { user: null } });
  await assert.rejects(Page(), /redirect:\/auth/);
  assert.equal(f.calls.length, 0);
  const g = dbFixture();
  g.auth.resolve({ data: { user: { id: "self" } } });
  g.profile.resolve({ data: null, error: { message: "Failure" } });
  g.summary.resolve({ data: null, error: { message: "Failure" } });
  g.friends.resolve({ count: null, error: { message: "Failure" } });
  const html = renderToStaticMarkup(
    await load("app/(app)/profile/page.tsx", profileDeps(g.db)).default(),
  );
  assert.equal((html.match(/—/g) || []).length, 3);
  const Loading = load("app/(app)/profile/loading.tsx", {}).default;
  assert.match(renderToStaticMarkup(Loading()), /Loading profile/);
});
test("VS-16: request-scoped preference seed preserves saved timezone and never fabricates missing preferences", async () => {
  let result = {
    data: { timezone: "America/Toronto", share_detailed_activity: true },
    error: null,
  };
  let user = { id: "self" };
  const db = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => result,
      };
      return q;
    },
  };
  const { readPreferencesSeed } = load("lib/preferences-seed.ts", {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/timezone": {
      isValidTimeZone: (zone) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      },
    },
  });
  assert.deepEqual((await readPreferencesSeed()).preferences, {
    userId: "self",
    timeZone: "America/Toronto",
    shareDetailedActivity: true,
  });
  result = { data: null, error: null };
  assert.equal(await readPreferencesSeed(), undefined);
  result = { data: { timezone: "invalid" }, error: null };
  assert.equal(await readPreferencesSeed(), undefined);
  result = { data: null, error: { message: "Failed" } };
  assert.equal(await readPreferencesSeed(), undefined);
  user = null;
  assert.equal((await readPreferencesSeed()).preferences, null);
});
