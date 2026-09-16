"use client";

import { useEffect, useRef, useState } from "react";
import { getProofSharing, setProofSharing } from "@/lib/actions/proofs";
import { useUserClock } from "@/components/layout/user-clock";
import { setDetailedActivity } from "@/lib/actions/preferences";

export function PrivacySettings() {
  const [shareProofs,setShareProofs]=useState<boolean | null>(null);
  const [proofError,setProofError]=useState<string | null>(null);
  const [retry,setRetry]=useState(0);
  const writing=useRef(false);
  useEffect(()=>{let live=true;getProofSharing().then(value=>{if(live){setShareProofs(value);setProofError(null)}}).catch(()=>{if(live)setProofError("Unable to load proof privacy.")});return()=>{live=false}},[retry]);
  const { timeZone, shareDetailedActivity, setShareDetailedActivity } = useUserClock();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      const result = await setDetailedActivity(enabled);
      if (result.success) setShareDetailedActivity(enabled);
      else setError(result.error ?? "Unable to save.");
    } catch { setError("Unable to save privacy settings."); }
    finally { setSaving(false); }
  }

  return <section className="proof-panel p-5">
    <h2 className="text-sm font-bold">Privacy</h2>
    <p className="mt-2 text-xs leading-5 text-white/50">Friends see your username, completion percentage, completed/total count, and streak. Enable detailed activity to also share habit names and statuses, including history.</p>
    <label className="mt-4 flex items-center gap-3 text-sm">
      <input type="checkbox" checked={shareDetailedActivity} disabled={saving} onChange={(e) => void change(e.target.checked)} className="h-5 w-5 accent-proof-green" />
      Share detailed activity with accepted friends
    </label>
    <label className="mt-4 flex min-h-11 items-center gap-3 text-sm">{shareProofs===null?<span aria-label="Proof sharing unavailable" className="inline-block h-5 w-5 shrink-0 rounded border border-white/20"/>:<input type="checkbox" checked={shareProofs} disabled={saving} className="h-5 w-5" onChange={async e=>{if(writing.current)return;writing.current=true;const enabled=e.target.checked;setSaving(true);setProofError(null);try{await setProofSharing(enabled);setShareProofs(enabled)}catch{setProofError("Unable to save proof privacy.")}finally{writing.current=false;setSaving(false)}}}/>}Allow accepted friends to see proofs marked Friends (also requires detailed activity)</label>
    <p role="status" className="min-h-4 text-xs text-white/50">{shareProofs===null&&!proofError?"Loading proof privacy...":""}</p>
    {proofError&&<p role="alert" className="mt-2 text-xs text-proof-red">{proofError}</p>}
    {shareProofs===null&&proofError&&<button className="proof-action" onClick={()=>{setProofError(null);setRetry(value=>value+1)}}>Retry proof privacy</button>}
    {error && <p role="alert" className="mt-2 text-xs text-proof-red">{error}</p>}
    <p className="mt-4 text-xs text-white/40">Timezone: {timeZone}</p>
  </section>;
}
