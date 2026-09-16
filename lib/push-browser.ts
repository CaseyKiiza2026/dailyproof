"use client";
import { getPushIdentity } from "@/lib/actions/reminders";
interface OneSignalSdk {
  init(options: { appId: string; serviceWorkerPath: string }): Promise<void>;
  login(id: string): Promise<void>;
  logout(): Promise<void>;
  Notifications: { requestPermission(): Promise<void>; permission: boolean };
  User: {
    PushSubscription: { optIn(): Promise<void>; optOut(): Promise<void> };
  };
}
declare global {
  interface Window {
    OneSignalDeferred?: ((sdk: OneSignalSdk) => void)[];
  }
}
const usedKey = "dailyproof.pushUsed";
let sdkPromise: Promise<OneSignalSdk> | null = null;
let enablePromise: Promise<void> | null = null;
let logoutPromise: Promise<void> | null = null;
let identityOperation: Promise<void> | null = null;
let generation = 0;
let used = false;

// A deadline bounds the caller, not the underlying SDK initialization. A late
// script/init completion is reused on retry instead of injecting a second copy.
function deadline<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Push service did not respond. Please retry.")),
      15000,
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
function loadSdk(appId: string) {
  if (sdkPromise) return sdkPromise;
  let rejectLoad: (error: Error) => void;
  const script = document.createElement("script");
  script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
  script.async = true;
  const promise = new Promise<OneSignalSdk>((resolve, reject) => {
    rejectLoad = reject;
    const callback = async (sdk: OneSignalSdk) => {
      script.onerror = null;
      try {
        await sdk.init({ appId, serviceWorkerPath: "OneSignalSDKWorker.js" });
        resolve(sdk);
      } catch {
        reject(
          new Error(
            "Push is unavailable on this browser. Reload to retry initialization; on iPhone, use the Home Screen app.",
          ),
        );
      }
    };
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(callback);
    script.onerror = () => {
      const queue = window.OneSignalDeferred;
      if (Array.isArray(queue)) {
        const index = queue.indexOf(callback);
        if (index >= 0) queue.splice(index, 1);
      }
      script.remove();
      sdkPromise = null;
      rejectLoad(new Error("Unable to load push service. Please retry."));
    };
    document.head.appendChild(script);
  });
  sdkPromise = promise;
  return promise;
}
function rememberUsed(value: boolean) {
  used = value;
  try {
    if (value) localStorage.setItem(usedKey, "true");
    else localStorage.removeItem(usedKey);
  } catch {
    /* In-memory state still protects this session. */
  }
}
function mayHaveIdentity() {
  if (used || identityOperation) return true;
  try {
    if (localStorage.getItem(usedKey)) return true;
  } catch {
    return true;
  }
  // Includes subscriptions created before the marker was introduced.
  return (
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );
}
async function changeIdentity(action: () => Promise<void>) {
  const operation = action();
  identityOperation = operation;
  try {
    await operation;
  } finally {
    if (identityOperation === operation) identityOperation = null;
  }
}
export function enableBrowserPush(): Promise<void> {
  if (logoutPromise) return Promise.reject(new Error("Logout is in progress."));
  if (enablePromise) return deadline(enablePromise);
  const request = generation;
  const check = () => {
    if (request !== generation)
      throw new Error("Push setup cancelled by logout.");
  };
  const promise = (async () => {
    const identity = await getPushIdentity();
    check();
    const sdk = await loadSdk(identity.appId);
    check();
    rememberUsed(true);
    await changeIdentity(() => sdk.login(identity.alias));
    check();
    await sdk.Notifications.requestPermission();
    check();
    if (!sdk.Notifications.permission)
      throw new Error(
        "Notification permission was not granted. You can enable it in browser settings.",
      );
    await changeIdentity(() => sdk.User.PushSubscription.optIn());
  })();
  enablePromise = promise;
  void promise
    .finally(() => {
      if (enablePromise === promise) enablePromise = null;
    })
    .catch(() => {});
  return deadline(promise);
}
export function logoutBrowserPush(): Promise<void> {
  if (logoutPromise) return logoutPromise;
  generation++;
  enablePromise = null;
  if (!mayHaveIdentity()) return Promise.resolve();
  const promise = (async () => {
    // Wait only for identity writes, never an unanswered permission prompt.
    // Late setup checks the generation before any subsequent identity write.
    if (identityOperation) await deadline(identityOperation.catch(() => {}));
    const sdk = await deadline(
      sdkPromise ??
        getPushIdentity().then((identity) => loadSdk(identity.appId)),
    );
    const outcomes = await deadline(
      Promise.allSettled([sdk.User.PushSubscription.optOut(), sdk.logout()]),
    );
    if (outcomes.some((result) => result.status === "rejected"))
      throw new Error("Unable to clear push identity. Please retry logout.");
    rememberUsed(false);
  })();
  logoutPromise = promise;
  void promise
    .finally(() => {
      if (logoutPromise === promise) logoutPromise = null;
    })
    .catch(() => {});
  return promise;
}
