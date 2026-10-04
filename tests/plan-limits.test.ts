import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAccount, getDBForAccount, localMutation, localMutations } from "../src/db/index.ts";
import { PlanLimitError, useUpgradeDialog } from "../src/lib/plan-guard.ts";
import { setTokens } from "../src/lib/api.ts";
import { fetchEntitlements } from "../src/lib/billing.ts";

const storage = new Map<string,string>();
Object.defineProperty(globalThis,"localStorage",{value:{getItem:(key:string)=>storage.get(key) ?? null,setItem:(key:string,value:string)=>storage.set(key,value)}});
Object.defineProperty(navigator,"locks",{value:{request:async (_name:string,fn:()=>Promise<unknown>)=>fn()}});
let requests: any[] = [];
let reject = false;
async function setup() {
  const id = crypto.randomUUID();
  selectAccount(id);
  await setTokens({accessToken:"test",refreshToken:"test",expiresAt:Date.now()+600000,user:{id,email:"test@example.test",name:"Test",avatarUrl:null}});
  requests = [];
  reject = false;
  useUpgradeDialog.getState().dismiss();
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    requests.push(body);
    return Response.json({results:body.ops.map((op:any)=>({opId:op.opId,status:reject ? "limit_reached":"applied",version:1,error:reject ? "You've reached your Free plan limit: 1/1 characters. Upgrade to continue.":undefined}))});
  };
  return await getDBForAccount(id) as any;
}

test("rejected create shows upgrade dialog before any cache or queue write", async () => {
  const db = await setup();
  await db.put("characters",{id:"existing",name:"Keep me"});
  reject = true;
  await assert.rejects(localMutation("characters","put",{id:"new",name:"Draft"}),PlanLimitError);
  assert.equal((await db.getAll("characters")).length,1);
  assert.equal((await db.get("characters","existing")).name,"Keep me");
  assert.equal((await db.getAll("ops")).length,0);
  assert.match(useUpgradeDialog.getState().message!,/1\/1 characters/);
});

test("accepted create records server version without a duplicate queued save or upgrade", async () => {
  const db = await setup();
  await localMutation("characters","put",{id:"new",name:"Accepted"});
  assert.equal((await db.getAll("characters")).length,1);
  assert.equal((await db.getAll("ops")).length,0);
  assert.equal((await db.getAll("meta"))[0].value,1);
  assert.equal(useUpgradeDialog.getState().message,null);
  await localMutation("characters","put",{id:"new",name:"Edited"});
  assert.equal(requests.length,1,"Existing edits do not require quota checks");
  assert.equal((await db.getAll("ops"))[0].baseVersion,1);
});

test("bulk scenes and prompts are submitted atomically and rejected without partial saves", async () => {
  const db = await setup();
  reject = true;
  await assert.rejects(localMutations([0,1,2,3].map(i=>({store:"scenes",type:"put",value:{id:String(i),bulkImportId:"batch",prompts:[{text:"Draft"}]}}))),PlanLimitError);
  assert.equal(requests.length,1);
  assert.equal(requests[0].atomic,true);
  assert.equal(requests[0].ops.length,4);
  assert.equal((await db.getAll("scenes")).length,0);
  assert.equal((await db.getAll("ops")).length,0);
});

test("rejected prompt increase preserves saved prompts and pending edits", async () => {
  const db = await setup();
  await db.put("scenes",{id:"scene",prompts:[{text:"Original"}]});
  await localMutation("scenes","put",{id:"scene",title:"Pending title",prompts:[{text:"Original"}]});
  const before = await db.getAll("ops");
  reject = true;
  await assert.rejects(localMutation("scenes","put",{id:"scene",prompts:[{text:"Original"},{text:"New"}]}),PlanLimitError);
  assert.deepEqual(await db.getAll("ops"),before);
  assert.equal((await db.get("scenes","scene")).title,"Pending title");
  assert.equal((await db.get("scenes","scene")).prompts.length,1);
});

test("usage reflects pending parent deletion and its episodes and prompts", async () => {
  await setup();
  await localMutation("characters","delete","character");
  globalThis.fetch = async url => Response.json(String(url).endsWith("entitlements")
    ? {plan:"free",usage:{characters:1,episodes:1,prompts:10}}
    : {records:[{id:"character",kind:"character",data:{id:"character"}}, {id:"episode",kind:"episode",data:{id:"episode",characterId:"character"}}, {id:"scene",kind:"scene",data:{id:"scene",episodeId:"episode",prompts:Array(10).fill({text:"Saved"})}}]});
  assert.deepEqual((await fetchEntitlements()).usage,{characters:0,episodes:0,prompts:0});
});
