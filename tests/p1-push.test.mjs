import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function fixture({
  alias = "private-alias",
  permission = "default",
  marker = false,
  identity,
  init,
  login,
  optOut,
  requestPermission,
} = {}) {
  const calls = [],
    scripts = [],
    timers = new Map(),
    storage = new Map(marker ? [["dailyproof.pushUsed", "true"]] : []);
  let timer = 0;
  const sdk = {
    init: async (options) => {
      calls.push(["init", options]);
      await init?.();
    },
    login: async (alias) => {
      calls.push(["login", alias]);
      await login?.();
    },
    logout: async () => {
      calls.push(["logout"]);
    },
    Notifications: {
      permission: true,
      requestPermission: async () => {
        calls.push(["permission"]);
        await requestPermission?.();
      },
    },
    User: {
      PushSubscription: {
        optIn: async () => {
          calls.push(["optIn"]);
        },
        optOut: async () => {
          calls.push(["optOut"]);
          await optOut?.();
        },
      },
    },
  };
  const window = {};
  const loaded = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync("lib/push-browser.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      module: loaded,
      exports: loaded.exports,
      require: (name) => {
        assert.equal(name, "@/lib/actions/reminders");
        return {
          getPushIdentity: async () => {
            calls.push(["identity"]);
            if (identity) await identity();
            return {
              appId: "app",
              alias: typeof alias === "function" ? alias() : alias,
            };
          },
        };
      },
      window,
      Notification: { permission },
      localStorage: {
        getItem: (k) => storage.get(k),
        setItem: (k, v) => storage.set(k, v),
        removeItem: (k) => storage.delete(k),
      },
      document: {
        createElement: () => ({
          remove() {
            scripts.splice(scripts.indexOf(this), 1);
          },
        }),
        head: { appendChild: (script) => scripts.push(script) },
      },
      setTimeout: (fn) => {
        timers.set(++timer, fn);
        return timer;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  );
  return {
    ...loaded.exports,
    calls,
    scripts,
    window,
    storage,
    async load() {
      const callback = window.OneSignalDeferred.shift();
      assert.ok(callback);
      await callback(sdk);
    },
    expire() {
      const current = [...timers.values()];
      timers.clear();
      current.forEach((fn) => fn());
    },
  };
}
test("VS-14: unused push does not initialize or fetch identity on logout", async () => {
  const f = fixture();
  await f.logoutBrowserPush();
  assert.deepEqual(f.calls, []);
  assert.equal(f.scripts.length, 0);
});
test("VS-14: concurrent enable shares one script, callback, init and login", async () => {
  const f = fixture();
  const a = f.enableBrowserPush(),
    b = f.enableBrowserPush();
  await tick();
  assert.equal(f.scripts.length, 1);
  assert.equal(f.window.OneSignalDeferred.length, 1);
  await f.load();
  await Promise.all([a, b]);
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    ["identity", "init", "login", "permission", "optIn"],
  );
  await f.logoutBrowserPush();
  assert.deepEqual(
    f.calls.slice(-2).map((c) => c[0]),
    ["optOut", "logout"],
  );
  assert.equal(f.storage.size, 0);
});
test("VS-14: load timeout then retry reuses resources and accepts late SDK completion", async () => {
  const f = fixture();
  const first = assert.rejects(f.enableBrowserPush(), /did not respond/);
  await tick();
  f.expire();
  await first;
  const retry = f.enableBrowserPush();
  await tick();
  assert.equal(f.scripts.length, 1);
  assert.equal(f.window.OneSignalDeferred.length, 1);
  await f.load();
  await retry;
  assert.equal(f.calls.filter((c) => c[0] === "init").length, 1);
});
test("VS-14: script error cleans script and callback before retry", async () => {
  const f = fixture();
  const failed = assert.rejects(f.enableBrowserPush(), /Unable to load/);
  await tick();
  f.scripts[0].onerror();
  await failed;
  await tick();
  assert.equal(f.scripts.length, 0);
  assert.equal(f.window.OneSignalDeferred.length, 0);
  const retry = f.enableBrowserPush();
  await tick();
  assert.equal(f.scripts.length, 1);
  await f.load();
  await retry;
});
test("VS-14: init timeout shares the same in-progress init on retry", async () => {
  const init = deferred(),
    f = fixture({ init: () => init.promise });
  const first = assert.rejects(f.enableBrowserPush(), /did not respond/);
  await tick();
  const loaded = f.load();
  await tick();
  f.expire();
  await first;
  const retry = f.enableBrowserPush();
  init.resolve();
  await loaded;
  await retry;
  assert.equal(f.calls.filter((c) => c[0] === "init").length, 1);
  assert.equal(f.scripts.length, 1);
});
test("VS-14: rejected init is not initialized twice on the same page", async () => {
  const f = fixture({ init: () => Promise.reject(new Error("Unsupported")) });
  const failed = assert.rejects(f.enableBrowserPush(), /Reload to retry/);
  await tick();
  await f.load();
  await failed;
  await assert.rejects(f.enableBrowserPush(), /Reload to retry/);
  assert.equal(f.calls.filter((c) => c[0] === "init").length, 1);
  assert.equal(f.scripts.length, 1);
});
for (const options of [{ permission: "granted" }, { marker: true }])
  test(
    "VS-14: prior device use is cleaned even after page reload " +
      JSON.stringify(options),
    async () => {
      const f = fixture(options);
      const done = f.logoutBrowserPush();
      await tick();
      await f.load();
      await done;
      assert.deepEqual(
        f.calls.map((c) => c[0]),
        ["identity", "init", "optOut", "logout"],
      );
    },
  );
test("VS-14: logout during login cancels remaining enable steps then clears identity", async () => {
  const login = deferred(),
    f = fixture({ login: () => login.promise });
  const enable = assert.rejects(f.enableBrowserPush(), /cancelled/);
  await tick();
  await f.load();
  await tick();
  const logout = f.logoutBrowserPush();
  login.resolve();
  await enable;
  await logout;
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    ["identity", "init", "login", "optOut", "logout"],
  );
  assert.equal(f.storage.size, 0);
});
test("VS-14: logout still attempts identity unlink when opt-out fails, and reports retry", async () => {
  const f = fixture({
    marker: true,
    optOut: () => Promise.reject(new Error("Offline")),
  });
  const failed = assert.rejects(f.logoutBrowserPush(), /retry logout/);
  await tick();
  await f.load();
  await failed;
  assert.deepEqual(
    f.calls.slice(-2).map((c) => c[0]),
    ["optOut", "logout"],
  );
  assert.equal(f.storage.get("dailyproof.pushUsed"), "true");
});

test("VS-14: unanswered permission prompt does not delay logout or opt in after cleanup", async () => {
  const permission = deferred(),
    f = fixture({ requestPermission: () => permission.promise });
  const enabled = assert.rejects(f.enableBrowserPush(), /cancelled/);
  await tick();
  await f.load();
  await tick();
  await f.logoutBrowserPush();
  assert.deepEqual(
    f.calls.slice(-2).map((c) => c[0]),
    ["optOut", "logout"],
  );
  permission.resolve();
  await enabled;
  assert.equal(f.calls.filter((c) => c[0] === "optIn").length, 0);
});

test("VS-14: logout during first identity fetch cancels setup without loading unused SDK", async () => {
  const identity = deferred(),
    f = fixture({ identity: () => identity.promise });
  const enabled = assert.rejects(f.enableBrowserPush(), /cancelled/);
  await tick();
  await f.logoutBrowserPush();
  identity.resolve();
  await enabled;
  assert.equal(f.scripts.length, 0);
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    ["identity"],
  );
});

test("VS-14: account switch cleans old identity and reuses SDK for the new alias", async () => {
  let alias = "account-a";
  const f = fixture({ alias: () => alias });
  const first = f.enableBrowserPush();
  await tick();
  await f.load();
  await first;
  await f.logoutBrowserPush();
  alias = "account-b";
  await f.enableBrowserPush();
  assert.deepEqual(
    f.calls.filter((c) => c[0] === "login").map((c) => c[1]),
    ["account-a", "account-b"],
  );
  assert.equal(f.calls.filter((c) => c[0] === "init").length, 1);
  assert.deepEqual(f.calls.map((c) => c[0]).slice(5, 9), [
    "optOut",
    "logout",
    "identity",
    "login",
  ]);
});
