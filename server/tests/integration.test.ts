import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const schema = `verify_${Date.now()}`;
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.href;
process.env.JWT_SECRET = "test-only-signing-secret-which-is-long-enough";
process.env.ALLOW_TEST_LOGIN = "true";
process.env.NODE_ENV = "test";
process.env.ALLOWED_ORIGINS = "http://localhost:5173,http://127.0.0.1:5178";
process.env.EXTENSION_REDIRECT_PREFIXES = `https://${"a".repeat(32)}.chromiumapp.org/`;
let server:any, base:string, a:any, b:any, prisma:any;
const nativeFetch=globalThis.fetch;
async function request(path:string,token?:string,body?:unknown){
  const r=await nativeFetch(base+path,{method:body ? "POST":"GET",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,redirect:"manual"});
  return {status:r.status,json:await r.json().catch(()=>null),headers:r.headers};
}
const character=()=>({id:randomUUID(),name:"Mira",referenceAssetIds:[],identityFields:[]});
const op=(kind:string,data:any,baseVersion=0)=>({opId:randomUUID(),kind,id:data.id,type:"put",baseVersion,data});
async function apply(ops:any[],token=a.accessToken){return (await request("/api/sync/ops",token,{ops})).json.results;}

before(async()=>{
  execFileSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,stdio:"pipe"});
  ({prisma}=await import("../src/lib/prisma.js"));
  const {createApp}=await import("../src/index.js");
  server=createApp().listen(0,"127.0.0.1");
  await new Promise<void>(r=>server.once("listening",r));
  base=`http://127.0.0.1:${server.address().port}`;
  a=(await request("/api/auth/test-login",undefined,{email:"a@example.test"})).json;
  b=(await request("/api/auth/test-login",undefined,{email:"b@example.test"})).json;
  // Existing sync stress tests exercise the unlimited tier.
  await prisma.user.update({where:{id:a.user.id},data:{lifetimeAt:new Date()}});
}, {timeout:60000});
after(async()=>{
  globalThis.fetch=nativeFetch;
  if(server)await new Promise<void>(r=>server.close(r));
  if(prisma){await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await prisma.$disconnect();}
});

test("Google web and extension callbacks share one identity; PKCE and single use",async()=>{
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url==="https://oauth2.googleapis.com/token")return Response.json({access_token:"provider-test-token"});
    if(url==="https://openidconnect.googleapis.com/v1/userinfo")return Response.json({sub:"google-123",email:"google@example.test",email_verified:true,name:"Google User",picture:"https://example.test/avatar.png"});
    return nativeFetch(input,init);
  };
  async function login(redirect:string){
    const verifier="v".repeat(43);
    const challenge=createHash("sha256").update(verifier).digest("base64url");
    const start=await request(`/api/auth/google/start?redirect=${encodeURIComponent(redirect)}&challenge=${challenge}`);
    assert.equal(start.status,302);
    const state=new URL(start.headers.get("location")!).searchParams.get("state");
    const callback=await nativeFetch(`${base}/api/auth/google/callback?code=provider-code&state=${state}`,{redirect:"manual",headers:{cookie:start.headers.get("set-cookie")!.split(";")[0]}});
    assert.equal(callback.status,302);
    const code=new URL(callback.headers.get("location")!).searchParams.get("code");
    assert.ok(code);
    assert.equal((await request("/api/auth/token",undefined,{code,verifier:"x".repeat(43)})).status,401);
    const session=await request("/api/auth/token",undefined,{code,verifier});
    assert.equal(session.status,200);
    assert.equal((await request("/api/auth/token",undefined,{code,verifier})).status,401);
    return session.json;
  }
  const web=await login("http://localhost:5173/");
  const extension=await login(process.env.EXTENSION_REDIRECT_PREFIXES!);
  assert.equal(web.user.id,extension.user.id);
  assert.equal(web.user.name,"Google User");
  assert.equal((await request("/api/auth/google/start?redirect=https://evil.example/&challenge="+"a".repeat(43))).status,400);
  assert.equal((await request("/api/auth/google/start?redirect="+encodeURIComponent(process.env.EXTENSION_REDIRECT_PREFIXES!.replace(".org/",".org.evil/"))+"&challenge="+"a".repeat(43))).status,400);
  globalThis.fetch=nativeFetch;
});

test("repeat login restores the same internal account",async()=>{
  const again=(await request("/api/auth/test-login",undefined,{email:"a@example.test"})).json;
  assert.equal(a.user.id,again.user.id);
  assert.equal((await request("/api/auth/me",again.accessToken)).json.user.id,a.user.id);
});
test("direct API isolation, relationships, private image validation and history",async()=>{
  const c=character();assert.equal((await apply([op("character",c)]))[0].status,"applied");
  assert.ok(!(await request("/api/sync",b.accessToken)).json.records.some((r:any)=>r.id===c.id));
  const foreign={id:randomUUID(),characterId:c.id};
  assert.equal((await apply([op("episode",foreign)],b.accessToken))[0].status,"invalid");
  assert.equal((await request("/api/sync")).status,401);
  const png="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const asset={id:randomUUID(),dataUrl:png,label:"Reference"};
  assert.equal((await request("/api/assets",a.accessToken,op("asset",asset))).json.results[0].status,"applied");
  assert.equal((await request(`/api/assets/${asset.id}`,a.accessToken)).json.dataUrl,png);
  assert.equal((await request(`/api/assets/${asset.id}`,b.accessToken)).status,404);
  assert.equal((await request(`/api/assets/${asset.id}`)).status,401);
  assert.equal((await apply([op("asset",{...asset,id:randomUUID(),dataUrl:"data:image/svg+xml;base64,PHN2Zz4="})]))[0].status,"invalid");
  assert.equal((await apply([op("character",{...character(),referenceAssetIds:[asset.id]})],b.accessToken))[0].status,"invalid");
  assert.equal((await request(`/api/sync/history/character/${c.id}`,b.accessToken)).json.versions.length,0);
});
test("durable receipts, concurrent version checks, ordering and tombstones",async()=>{
  const c=character(),create=op("character",c);
  const first=(await apply([create]))[0];
  assert.deepEqual((await apply([create]))[0],first);
  const [x,y]=await Promise.all([apply([op("character",{...c,name:"Studio"},1)]),apply([op("character",{...c,name:"Extension"},1)])]);
  assert.deepEqual([x[0].status,y[0].status].sort(),["applied","conflict"]);
  assert.deepEqual((await apply([create]))[0],first); // replay after newer edit
  const ep={id:randomUUID(),characterId:c.id,title:"Episode"};
  await apply([op("episode",ep)]);
  const scenes=Array.from({length:30},(_,i)=>({id:randomUUID(),episodeId:ep.id,order:i,title:`Scene ${i}`,prompts:[{id:randomUUID(),text:"Preserved prompt",source:"manual"}]}));
  const batch=scenes.map(s=>op("scene",s));
  assert.ok((await apply(batch)).every((r:any)=>r.status==="applied"));
  await apply(batch);
  await apply(scenes.map((s,i)=>op("scene",{...s,order:29-i},1)));
  const pull=(await request("/api/sync",a.accessToken)).json.records;
  assert.equal(pull.filter((r:any)=>r.kind==="scene" && r.data.episodeId===ep.id).length,30);
  assert.deepEqual(pull.find((r:any)=>r.id===ep.id).data.sceneIds,scenes.map(s=>s.id).reverse());
  const del={opId:randomUUID(),kind:"scene",id:scenes[0].id,type:"delete",baseVersion:2};
  assert.equal((await apply([del]))[0].status,"applied");
  await apply([del]);
  assert.ok((await request("/api/sync?since=2999-01-01",a.accessToken)).json.records.find((r:any)=>r.id===del.id).deleted);
  assert.equal((await apply([op("scene",scenes[0],2)]))[0].status,"conflict");
});
test("refresh rotation is atomic and logout revokes refresh",async()=>{
  const session=(await request("/api/auth/test-login",undefined,{email:"refresh@example.test"})).json;
  const results=await Promise.all([request("/api/auth/refresh",undefined,{refreshToken:session.refreshToken}),request("/api/auth/refresh",undefined,{refreshToken:session.refreshToken})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,401]);
  const fresh=results.find(r=>r.status===200)!.json;
  await request("/api/auth/logout",undefined,{refreshToken:fresh.refreshToken});
  assert.equal((await request("/api/auth/refresh",undefined,{refreshToken:fresh.refreshToken})).status,401);
});

test("Free quotas, retries, concurrent saves, bulk imports and paid upgrades",async()=>{
  const session=(await request("/api/auth/test-login",undefined,{email:"free@example.test"})).json;
  const token=session.accessToken;
  const ent=async()=>(await request("/api/billing/entitlements",token)).json;
  assert.equal((await ent()).plan,"free");
  assert.deepEqual((await ent()).usage,{characters:0,episodes:0,prompts:0});
  const c=character(), create=op("character",c);
  const first=(await apply([create],token))[0];
  assert.equal(first.status,"applied");
  assert.deepEqual((await apply([create],token))[0],first);
  assert.equal((await apply([op("character",character())],token))[0].status,"limit_reached");
  const ep={id:randomUUID(),characterId:c.id};
  assert.equal((await apply([op("episode",ep)],token))[0].status,"applied");
  assert.equal((await apply([op("episode",{...ep,id:randomUUID()})],token))[0].status,"limit_reached");
  const scenes=Array.from({length:4},(_,order)=>({id:randomUUID(),episodeId:ep.id,order,bulkImportId:"first-import",prompts:[]}));
  assert.deepEqual((await apply(scenes.map(s=>op("scene",s)),token)).map((r:any)=>r.status),["applied","applied","applied","limit_reached"]);
  assert.equal((await apply([op("scene",scenes[3])],token))[0].status,"limit_reached");
  const prompts=Array.from({length:10},()=>({id:randomUUID(),text:"Saved",source:"manual"}));
  assert.equal((await apply([op("scene",{...scenes[0],prompts},1)],token))[0].status,"applied");
  assert.equal((await ent()).usage.prompts,10);
  assert.equal((await apply([op("scene",{...scenes[1],prompts:[prompts[0]]},1)],token))[0].status,"limit_reached");
  // Editing and reducing saved prompts remain available at the cap.
  assert.equal((await apply([op("scene",{...scenes[0],prompts:prompts.slice(0,9)},2)],token))[0].status,"applied");
  const concurrent=await Promise.all([1,2].map(i=>apply([op("scene",{...scenes[i],prompts:[prompts[0]]},1)],token)));
  assert.deepEqual(concurrent.map(r=>r[0].status).sort(),["applied","limit_reached"]);
  // Active monthly and lifetime buyers can exceed every Free quota.
  for(const plan of ["monthly","lifetime"]){
    await prisma.user.update({where:{id:session.user.id},data:plan==="monthly"?{subscriptionStatus:"active"}:{subscriptionStatus:"expired",lifetimeAt:new Date()}});
    assert.equal((await ent()).plan,plan);
    assert.equal((await ent()).limits.prompts,null);
    const paidChar=character(),paidEp={id:randomUUID(),characterId:paidChar.id};
    const paidScenes=Array.from({length:4},(_,order)=>({id:randomUUID(),episodeId:paidEp.id,order,prompts,bulkImportId:plan}));
    assert.ok((await apply([op("character",paidChar),op("episode",paidEp),...paidScenes.map(s=>op("scene",s))],token)).every((r:any)=>r.status==="applied"));
  }
  await prisma.user.update({where:{id:session.user.id},data:{lifetimeAt:null,subscriptionStatus:"expired"}});
  assert.equal((await ent()).plan,"free");
  assert.ok((await ent()).usage.prompts>10);
  assert.equal((await apply([op("character",{...c,name:"Still editable"},1)],token))[0].status,"applied");
  assert.equal((await apply([{opId:randomUUID(),kind:"character",id:c.id,type:"delete",baseVersion:2}],token))[0].status,"applied");
  assert.ok((await request("/api/sync",token)).json.records.some((r:any)=>r.id===c.id && r.deleted));
});

test("browser Studio and real extension sync, offline restart, conflict and migration",{timeout:180000},async()=>{
  const {chromium}=await import("playwright");
  const {config}=await import("../src/config.js");
  config.corsOrigins.push("http://127.0.0.1:5178");
  const root=path.resolve("..");
  const env={...process.env,VITE_API_URL:base};
  // Build the actual extension with this test API URL.
  execFileSync(process.execPath,["node_modules/vite/bin/vite.js","build"],{cwd:root,env,stdio:"pipe"});
  const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port","5178","--strictPort"],{cwd:root,env,stdio:"pipe",windowsHide:true});
  const studioProfile=fs.mkdtempSync(path.join(os.tmpdir(),"persona-studio-test-"));
  const extensionProfile=fs.mkdtempSync(path.join(os.tmpdir(),"persona-extension-test-"));
  const installed=path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright/chromium-1217/chrome-win64/chrome.exe");
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (fs.existsSync(installed)?installed:undefined);
  let studio:any,extension:any;
  try{
    for(let n=0;n<60;n++){try{if((await nativeFetch("http://127.0.0.1:5178")).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
    const session=(await request("/api/auth/test-login",undefined,{email:"browser@example.test"})).json;
    studio=await chromium.launchPersistentContext(studioProfile,{headless:true,executablePath});
    let page=await studio.newPage();
    await page.goto("http://127.0.0.1:5178/characters");
    await page.getByRole("button",{name:"Continue with Google"}).waitFor();
    await page.evaluate((s:any)=>localStorage.setItem("ps_auth_tokens",JSON.stringify(s)),session);
    await page.reload();
    await page.waitForFunction(async()=>{const {getSyncState}=await import("/src/lib/sync.ts");return getSyncState().status==="synced";});
    await page.getByRole("button",{name:"New Character",exact:true}).first().click();
    await page.getByLabel("Character name *").fill("Browser Mira");
    await page.getByRole("button",{name:"Create Character",exact:true}).click();
    await page.waitForFunction(async()=>{const {getSyncState}=await import("/src/lib/sync.ts");return getSyncState().status==="synced";});
    const c=await page.evaluate(async()=>{const {useStudio}=await import("/src/store/index.ts");return useStudio.getState().characters.find((c:any)=>c.name==="Browser Mira");});
    assert.ok(c);
    await page.waitForFunction(async()=>{const {getSyncState}=await import("/src/lib/sync.ts");const {getPending}=await import("/src/lib/queue.ts");const {currentAccount}=await import("/src/db/index.ts");return getSyncState().status==="synced" && (await getPending(currentAccount()!)).length===0;});
    let saved=false;
    for(let n=0;n<40;n++){saved=(await request("/api/sync",session.accessToken)).json.records.some((r:any)=>r.id===c.id);if(saved)break;await new Promise(r=>setTimeout(r,250));}
    assert.ok(saved,"Studio save must be confirmed on the server");
    assert.equal((await request("/api/billing/entitlements",session.accessToken)).json.plan,"free");
    await page.locator(".account-avatar-btn").click();
    await page.getByText("Free plan",{exact:true}).waitFor();
    await page.getByText("1 / 1 characters",{exact:true}).waitFor();
    assert.match(await page.getByRole("link",{name:"Upgrade for unlimited access"}).getAttribute("href"),/pricing=1/);
    await page.locator(".account-avatar-btn").click();
    // The new account used Studio without a purchase; continue the multi-record
    // extension/migration regression on the paid tier.
    await prisma.user.update({where:{id:session.user.id},data:{subscriptionStatus:"active"}});
    extension=await chromium.launchPersistentContext(extensionProfile,{headless:true,executablePath,args:[`--disable-extensions-except=${path.join(root,"dist")}`,`--load-extension=${path.join(root,"dist")}`]});
    const worker=extension.serviceWorkers()[0] ?? await extension.waitForEvent("serviceworker");
    const extensionId=new URL(worker.url()).host;
    config.extensionRedirectPrefixes.push(`https://${extensionId}.chromiumapp.org/`);
    await worker.evaluate((s:any)=>chrome.storage.local.set({ps_auth_tokens:JSON.stringify(s)}),session);
    const panel=await extension.newPage();
    panel.on("pageerror",(e:any)=>console.log("Panel error:",e.message));
    panel.on("console",(m:any)=>{if(m.type()==="error")console.log("Panel console:",m.text());});
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    try{await panel.getByText("Browser Mira",{exact:true}).first().waitFor({state:"attached",timeout:10000});}catch(e){console.log("Panel body:",await panel.locator("body").innerText());throw e;}

    await panel.getByLabel("Select character").waitFor();
    const extensionStudio=await extension.newPage();
    await extensionStudio.goto(`chrome-extension://${extensionId}/index.html`);
    await extensionStudio.getByRole("button",{name:"New Character",exact:true}).first().click();
    await extensionStudio.getByLabel("Character name *").fill("Created in extension");
    await extensionStudio.getByRole("button",{name:"Create Character",exact:true}).click();
    await extensionStudio.getByText("Synced",{exact:true}).first().waitFor();
    await page.reload();
    await page.getByText("Created in extension",{exact:true}).first().waitFor({state:"attached"});

    // Browser restart preserves queued data on disk, not just in memory.
    await studio.setOffline(true);
    await page.evaluate(async(id:string)=>{const {useStudio}=await import("/src/store/index.ts");await useStudio.getState().updateCharacter(id,{name:"Offline restart Mira"});},c.id);
    await studio.close();
    studio=await chromium.launchPersistentContext(studioProfile,{headless:true,executablePath});
    page=await studio.newPage();await page.goto("http://127.0.0.1:5178");
    await page.waitForFunction(async()=>{const {getSyncState}=await import("/src/lib/sync.ts");return getSyncState().status==="synced";});
    await panel.reload();await panel.getByText("Offline restart Mira",{exact:true}).first().waitFor({state:"attached"});

    // Panel shares server data; make a remote edit while Studio is offline.
    await studio.setOffline(true);
    await page.evaluate(async(id:string)=>{const {useStudio}=await import("/src/store/index.ts");await useStudio.getState().updateCharacter(id,{name:"Studio conflict"});},c.id);
    const remote=(await request("/api/sync",session.accessToken)).json.records.find((r:any)=>r.id===c.id);
    await apply([op("character",{...remote.data,name:"Other device conflict"},remote.version)],session.accessToken);
    await studio.setOffline(false);
    await page.getByRole("button",{name:"Keep mine"}).waitFor();
    await page.getByRole("button",{name:"Keep mine"}).click();
    await page.waitForFunction(async()=>{const {getSyncState}=await import("/src/lib/sync.ts");return getSyncState().status==="synced";});
    await panel.reload();await panel.getByText("Studio conflict",{exact:true}).first().waitFor({state:"attached"});

    // Account switching cannot expose the previous workspace or move its queue.
    await page.evaluate((s:any)=>localStorage.setItem("ps_auth_tokens",JSON.stringify(s)),b);
    await page.reload();
    await page.waitForFunction(async()=>{const {getSyncState}=await import("/src/lib/sync.ts");return getSyncState().status==="synced";});
    assert.equal(await page.getByText("Studio conflict",{exact:true}).count(),0);
    await page.evaluate((s:any)=>localStorage.setItem("ps_auth_tokens",JSON.stringify(s)),session);
    await page.reload();
    await page.waitForFunction(async()=>{const {getSyncState}=await import("/src/lib/sync.ts");return getSyncState().status==="synced";});

    // Seed a recoverable legacy snapshot and exercise the real migration service.
    await page.evaluate(async()=>{
      const {getDBForAccount}=await import("/src/db/index.ts");const db:any=await getDBForAccount(null);
      await db.put("meta",{key:"pre-account-backup",value:{savedAt:new Date().toISOString(),stores:{characters:[{id:"legacy-char",name:"Legacy imported",referenceAssetIds:["legacy-image"],identityFields:[]}],referenceAssets:[{id:"legacy-image",label:"reference",dataUrl:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="}],episodes:[{id:"legacy-ep",characterId:"legacy-char",title:"Legacy episode"}],scenes:[{id:"legacy-scene",episodeId:"legacy-ep",order:4,title:"Legacy scene",prompts:[{id:"prompt",text:"Preserved",source:"imported"}]}]}}});
    });
    let interrupted=false;
    await page.route("**/api/sync/ops",async(route:any)=>{
      const payload=route.request().postDataJSON();
      if(!interrupted && payload.ops[0]?.opId?.startsWith("migration:characters:")){interrupted=true;await route.abort();}else await route.continue();
    });
    const failed=await page.evaluate(async(id:string)=>{const {importLocalProjects}=await import("/src/lib/migration.ts");try{await importLocalProjects(id,()=>{});return false;}catch{return true;}},session.user.id);
    assert.ok(failed && interrupted,"Migration must retain its checkpoint after a network failure");
    await page.unroute("**/api/sync/ops");
    await page.evaluate(async(id:string)=>{const {importLocalProjects}=await import("/src/lib/migration.ts");await importLocalProjects(id,()=>{});await importLocalProjects(id,()=>{});},session.user.id);
    const imported=(await request("/api/sync",session.accessToken)).json.records;
    assert.equal(imported.filter((r:any)=>r.data?.name==="Legacy imported").length,1);
    assert.equal(imported.find((r:any)=>r.data?.title==="Legacy scene").data.prompts[0].text,"Preserved");
    assert.equal(imported.find((r:any)=>r.data?.title==="Legacy scene").data.order,4);
    await panel.reload();await panel.getByText("Legacy imported",{exact:true}).first().waitFor({state:"attached"});
  }finally{
    await studio?.close();await extension?.close();vite.kill();
    for(const profile of [studioProfile,extensionProfile]){
      const resolved=path.resolve(profile);
      if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep) || !path.basename(resolved).startsWith("persona-"))throw new Error("Unsafe test profile cleanup path");
      fs.rmSync(resolved,{recursive:true,force:true});
    }
  }
});
