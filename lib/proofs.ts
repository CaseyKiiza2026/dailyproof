export type ProofTarget = { taskId: string; habitId?: never; logDate?: never } | { taskId?: never; habitId: string; logDate: string };
export interface Proof { id:string; user_id:string; type:"image"|"note"|"link"; content:string|null; storage_path:string|null; visibility:"private"|"friends"; created_at:string; }
export function validateProof(type: string, content: string) {
 if (!["note","link","image"].includes(type)) throw new Error("Unsupported proof type.");
 if(type!=="image" && (typeof content!=="string"||!content.trim()||content.length>10000))throw new Error("Enter proof of at most 10,000 characters.");
 if(type==="link") { const url=new URL(content);if(!["https:","http:"].includes(url.protocol)||url.username||url.password)throw new Error("Use an HTTP or HTTPS link without embedded credentials."); }
}
