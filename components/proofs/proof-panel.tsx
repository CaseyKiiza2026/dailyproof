"use client";
import { useState } from "react";
import { Proof, ProofTarget } from "@/lib/proofs";
import { addProof, deleteProof, getProofs, proofImageUrl } from "@/lib/actions/proofs";
import { createClient } from "@/lib/supabase/client";
import { assessProof } from "@/lib/actions/assistant";
export function ProofPanel({target}:{target:ProofTarget}) {
 const [assessment,setAssessment]=useState("");
 const [open,setOpen]=useState(false),[proofs,setProofs]=useState<Proof[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[type,setType]=useState<Proof["type"]>("note");
 async function run(action:()=>Promise<unknown>){setBusy(true);setError("");try{await action();setProofs(await getProofs(target))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="space-y-3"><button className="proof-action" onClick={()=>{setOpen(!open);if(!open)void run(async()=>{})}}> {open?"Hide proof":"Attach / view proof"}</button>
 {error&&<p role="alert" className="text-sm text-proof-red">{error}</p>}
 {assessment&&<p role="status" className="text-sm text-white/70">{assessment} This assessment is not fraud-proof.</p>}
 {open&&proofs.map(p=><button key={p.id} disabled={busy} className="proof-action" onClick={()=>void run(async()=>{const result=await assessProof(p.id);setAssessment(`${result.verification} (${Math.round(result.confidence*100)}% confidence): ${result.reason}`)})}>Assess {p.type} proof with Gemini</button>)}
 {open&&<><form className="space-y-3" onSubmit={e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);void run(async()=>{
   const file=f.get("image") as File|null;
   if(type==="image"&&(!file||!file.size||file.size>5242880||!["image/png","image/jpeg","image/webp"].includes(file.type)))throw new Error("Choose a PNG, JPEG or WebP image up to 5 MB.");
   const result=await addProof(target,type,String(f.get("content")??""),f.get("visibility") as Proof["visibility"]);
   if(result.path&&result.token&&file){const {error}=await createClient().storage.from("proofs").uploadToSignedUrl(result.path,result.token,file,{contentType:file.type});if(error){await deleteProof(result.id);throw new Error("Image upload failed. Please retry.");}}
   form.reset();
 })}}>
 <label className="proof-field">Proof type<select value={type} onChange={e=>setType(e.target.value as Proof["type"])}><option value="note">Text note</option><option value="link">URL / link</option><option value="image">Image / screenshot</option></select></label>
 {type==="image"?<label className="proof-field">Image (up to 5 MB)<input name="image" type="file" accept="image/png,image/jpeg,image/webp" required/></label>:<label className="proof-field">{type==="note"?"Note":"Link"}<textarea name="content" required maxLength={10000}/></label>}
 <label className="proof-field">Visibility<select name="visibility"><option value="private">Private</option><option value="friends">Friends (requires profile sharing enabled)</option></select></label>
 <button disabled={busy} className="proof-action">Save proof</button></form>
 {proofs.map(p=><article key={p.id} className="space-y-2 rounded-xl border border-white/10 p-3"><p className="text-xs text-white/50">{p.type} · {p.visibility}</p>{p.type==="note"?<p className="whitespace-pre-wrap break-words text-sm">{p.content}</p>:p.type==="link"?<a className="proof-action break-all" href={p.content!} target="_blank" rel="noopener noreferrer">Open link</a>:<button className="proof-action" onClick={()=>void run(async()=>{const url=await proofImageUrl(p.id);window.open(url,"_blank","noopener,noreferrer")})}>Open image</button>}<button disabled={busy} className="proof-action" onClick={()=>void run(()=>deleteProof(p.id))}>Remove proof</button></article>)}</>}
 </div>;
}
