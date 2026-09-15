"use client";
import { getPushIdentity } from "@/lib/actions/reminders";
interface OneSignalSdk { init(options:{appId:string;serviceWorkerPath:string}):Promise<void>;login(id:string):Promise<void>;logout():Promise<void>;Notifications:{requestPermission():Promise<void>;permission:boolean};User:{PushSubscription:{optIn():Promise<void>;optOut():Promise<void>}}; }
declare global { interface Window { OneSignalDeferred?: ((sdk:OneSignalSdk)=>void)[]; } }
let sdkPromise:Promise<OneSignalSdk>|null=null;
async function prepareBrowserPush(){
 const identity=await getPushIdentity();
 if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{sdkPromise=null;reject(new Error("Push SDK did not load. Please retry."))},15000);
  window.OneSignalDeferred=window.OneSignalDeferred||[];
  window.OneSignalDeferred.push(async sdk=>{try{await sdk.init({appId:identity.appId,serviceWorkerPath:"OneSignalSDKWorker.js"});clearTimeout(timer);resolve(sdk)}catch{clearTimeout(timer);sdkPromise=null;reject(new Error("Push is unavailable on this browser. On iPhone, install DailyProof on your Home Screen first."))}});
  const script=document.createElement("script");script.src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";script.async=true;script.onerror=()=>{clearTimeout(timer);sdkPromise=null;reject(new Error("Unable to load push service."))};document.head.appendChild(script);
 });
 const sdk=await sdkPromise;return {sdk,identity};
}
export async function enableBrowserPush(){
 const {sdk,identity}=await prepareBrowserPush();await sdk.login(identity.alias);await sdk.Notifications.requestPermission();
 if(!sdk.Notifications.permission)throw new Error("Notification permission was not granted. You can enable it in browser settings.");
 await sdk.User.PushSubscription.optIn();
}
export async function logoutBrowserPush(){try{const {sdk}=await prepareBrowserPush();await sdk.User.PushSubscription.optOut();await sdk.logout()}catch{/* Auth logout must remain available. */}}
