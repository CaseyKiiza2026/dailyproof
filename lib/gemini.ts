import "server-only";
export async function geminiJson(prompt:string,schema:Record<string,unknown>,image?:{mimeType:string;data:string}):Promise<unknown>{
 const key=process.env.GEMINI_API_KEY,model=process.env.GEMINI_MODEL;
 if(!key||!model||!/^[a-zA-Z0-9.-]+$/.test(model))throw new Error("The assistant is not configured yet. Manual DailyProof controls remain available.");
 const parts:({text:string}|{inlineData:{mimeType:string;data:string}})[]=[{text:prompt}];if(image)parts.push({inlineData:image});
 const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({contents:[{role:"user",parts}],generationConfig:{responseMimeType:"application/json",responseJsonSchema:schema,maxOutputTokens:8192}}),signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error("The assistant is temporarily unavailable. Please try again later.");
 const body=await response.json();const text=body.candidates?.[0]?.content?.parts?.map((p:{text?:string})=>p.text??"").join("");
 if(typeof text!=="string"||text.length>100000)throw new Error("The assistant returned an invalid response.");
 try{return JSON.parse(text)}catch{throw new Error("The assistant response was incomplete. Try a smaller request.");}
}
