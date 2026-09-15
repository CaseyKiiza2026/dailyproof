"use server";
import { requireUser } from "@/lib/server-user";
import { Proof, ProofTarget, validateProof } from "@/lib/proofs";
async function resolveTarget(target:ProofTarget) {
 const {db,user}=await requireUser();
 if(target.taskId) { const {data}=await db.from("tasks").select("id").eq("id",target.taskId).eq("user_id",user.id).eq("status","completed").single();if(!data)throw new Error("Completed task not found.");return {db,user,task_id:data.id,habit_log_id:null}; }
 const {data}=await db.from("habit_logs").select("id").eq("habit_id",target.habitId).eq("log_date",target.logDate).eq("user_id",user.id).eq("status","complete").single();
 if(!data)throw new Error("Completed habit log not found.");return {db,user,task_id:null,habit_log_id:data.id};
}
export async function getProofs(target:ProofTarget):Promise<Proof[]> {
 const {db,user,task_id,habit_log_id}=await resolveTarget(target);
 const {data,error}=await db.from("proofs").select("*").eq("user_id",user.id).eq(task_id?"task_id":"habit_log_id",task_id??habit_log_id).order("created_at");if(error)throw new Error("Unable to load proofs.");return data;
}
export async function addProof(target:ProofTarget,type:Proof["type"],content:string,visibility:Proof["visibility"]) {
 validateProof(type,content);if(!["private","friends"].includes(visibility))throw new Error("Invalid visibility.");
 const {db,user,task_id,habit_log_id}=await resolveTarget(target);const id=crypto.randomUUID();const path=`${user.id}/${id}`;
 const {error}=await db.from("proofs").insert({id,user_id:user.id,task_id,habit_log_id,type,content:type==="image"?null:content.trim(),storage_path:type==="image"?path:null,visibility});if(error)throw new Error("Unable to save proof.");
 if(type!=="image")return {id,path:null,token:null};
 const {data,error:uploadError}=await db.storage.from("proofs").createSignedUploadUrl(path);
 if(uploadError){await db.from("proofs").delete().eq("id",id).eq("user_id",user.id);throw new Error("Unable to prepare image upload.");}
 return {id,path,token:data.token};
}
export async function proofImageUrl(id:string) {
 const {db}=await requireUser();const {data}=await db.from("proofs").select("storage_path").eq("id",id).single();if(!data?.storage_path)throw new Error("Proof unavailable.");
 const {data:link,error}=await db.storage.from("proofs").createSignedUrl(data.storage_path,60);if(error)throw new Error("Unable to open proof image.");return link.signedUrl;
}
export async function deleteProof(id:string) {
 const {db,user}=await requireUser();const {data}=await db.from("proofs").select("storage_path").eq("id",id).eq("user_id",user.id).single();if(!data)throw new Error("Proof unavailable.");
 if(data.storage_path){const {error}=await db.storage.from("proofs").remove([data.storage_path]);if(error)throw new Error("Unable to remove image. Try again.");}
 const {error}=await db.from("proofs").delete().eq("id",id).eq("user_id",user.id);if(error)throw new Error("Unable to remove proof.");
}
export async function getProofSharing(){const {db,user}=await requireUser();const {data,error}=await db.from("user_preferences").select("share_proofs").eq("user_id",user.id).single();if(error)throw new Error("Unable to load proof privacy.");return Boolean(data.share_proofs);}
export async function setProofSharing(enabled:boolean){if(typeof enabled!=="boolean")throw new Error("Invalid setting.");const {db,user}=await requireUser();const {error}=await db.from("user_preferences").update({share_proofs:enabled}).eq("user_id",user.id);if(error)throw new Error("Unable to save proof privacy.");}
