"use client";

import { useEffect, useState } from "react";
import { getProofSharing, setProofSharing } from "@/lib/actions/proofs";
import { useUserClock } from "@/components/layout/user-clock";
import { setDetailedActivity } from "@/lib/actions/preferences";

export function PrivacySettings() {
  const [shareProofs,setShareProofs]=useState(false);
  useEffect(()=>{getProofSharing().then(setShareProofs).catch(()=>{});},[]);
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
    <label className="mt-4 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={shareProofs} disabled={saving} className="h-5 w-5" onChange={async e=>{const enabled=e.target.checked;setSaving(true);try{await setProofSharing(enabled);setShareProofs(enabled)}catch{setError("Unable to save proof privacy.")}finally{setSaving(false)}}}/>Allow accepted friends to see proofs marked Friends (also requires detailed activity)</label>
    {error && <p role="alert" className="mt-2 text-xs text-proof-red">{error}</p>}
    <p className="mt-4 text-xs text-white/40">Timezone: {timeZone}</p>
  </section>;
}
