/* eslint-disable @typescript-eslint/no-require-imports */
// Extend the existing isolated UI harness with Friends and server-rendered More.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),esbuild=require('esbuild');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const dir=path.join(process.cwd(),'out/mobile-check');
function load(file,deps){const loaded={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(name=>name in deps?deps[name]:require(name),loaded,loaded.exports);return loaded.exports;}
(async()=>{
 const clock={timeZone:'America/Toronto',shareDetailedActivity:false,setShareDetailedActivity:()=>{}};
 const privacy=load('components/profile/privacy-settings.tsx',{'@/lib/actions/proofs':{},'@/lib/actions/preferences':{},'@/components/layout/user-clock':{useUserClock:()=>clock}});
 const db={auth:{getUser:async()=>({data:{user:{id:'fixture'}}})},rpc:async()=>({data:{streak:7,completion:80}}),from:table=>{const q={then:resolve=>Promise.resolve(table==='profiles'?{data:{username:'casey'}}:{count:2}).then(resolve)};for(const method of ['select','eq','single','or'])q[method]=()=>q;return q;}};
 const profile=load('app/(app)/profile/page.tsx',{'@/lib/supabase/server':{createClient:async()=>db},'@/components/profile/privacy-settings':privacy,'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'next/navigation':{redirect:()=>{throw new Error('Unexpected fixture redirect')}}});
 fs.writeFileSync(path.join(dir,'profile-preview.js'),'export default '+JSON.stringify(renderToStaticMarkup(await profile.default())));
 const stub=path.join(dir,'figma-fixture.jsx');
 let fixture=fs.readFileSync(path.join(dir,'fixture.jsx'),'utf8');
 fixture=fixture.replace("usePathname=()=>'/dashboard'", "usePathname=()=>({dashboard:'/dashboard',todos:'/todos',calendar:'/calendar',assistant:'/assistant',friends:'/friends',profile:'/profile'})[new URLSearchParams(location.search).get('page')]||'/dashboard'");
 fixture=fixture.replace('from:()=>query}}','rpc:async()=>({data:{today_key:"2026-09-14",log_date:"2026-09-14",streak:7,completion:80,completed:4,total:5,statuses:[],share_detailed_activity:false},error:null}),from:()=>query}}');
 fixture+='\nexport const useFriendsData=()=>({ready:true,error:null,friendships:[],acceptedFriends:[{id:"friend1",otherUser:{id:"friend1",username:"amina"}},{id:"friend2",otherUser:{id:"friend2",username:"sam"}}],incomingPending:[],outgoingPending:[],reload:()=>{},nudge:async()=>({success:true}),addFriend:async()=>({success:true}),respond:async()=>{},removeFriend:async()=>{}});';
 fixture+='\nexport const searchProfilesByUsername=async()=>[];';
 fs.writeFileSync(stub,fixture);
 let entry=fs.readFileSync(path.join(dir,'entry.jsx'),'utf8');
 entry=entry.replace("from './fixture'", "from './figma-fixture'");
 entry='import Friends from "../../app/(app)/friends/page";import profileMarkup from "./profile-preview";const Profile=()=> <div dangerouslySetInnerHTML={{__html:profileMarkup}}/>;'+entry;
 entry=entry.replace('dashboard:Dashboard,todos:Todos','friends:Friends,profile:Profile,dashboard:Dashboard,todos:Todos');
 fs.writeFileSync(path.join(dir,'figma-entry.jsx'),entry);
 await esbuild.build({entryPoints:[path.join(dir,'figma-entry.jsx')],bundle:true,outfile:path.join(dir,'bundle.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'visual-fixtures',setup(b){b.onResolve({filter:/^(@\/lib\/hooks\/(use-dashboard-habits|use-habits-data|use-friends-data)|@\/components\/layout\/user-clock|@\/lib\/supabase\/client|@\/lib\/actions\/(habits|tasks|calendar|reminders|assistant|proofs|friends)|next\/navigation|next\/link)$/},()=>({path:stub}));b.onResolve({filter:/^@\//},args=>{const base=path.join(process.cwd(),args.path.slice(2));for(const ext of ['', '.ts','.tsx','.module.css'])if(fs.existsSync(base+ext))return{path:base+ext};});}}]});
 console.log('Friends and actual server-rendered More added to the isolated visual harness.');
})().catch(e=>{console.error(e);process.exitCode=1;});

