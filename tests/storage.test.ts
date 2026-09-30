import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDB } from "idb";
import { selectAccount, localMutation, getDBForAccount } from "../src/db/index.ts";
import { getPending, acknowledge } from "../src/lib/queue.ts";
import { getLocalBackup } from "../src/lib/accounts.ts";

test("atomic offline save persists across a new database connection",async()=>{
  selectAccount("account-a");
  await localMutation("characters","put",{id:"character-1",name:"Offline edit"});
  const reopened:any=await openDB("PersonaStudio_account_account-a",3);
  assert.equal((await reopened.get("characters","character-1")).name,"Offline edit");
  assert.equal((await reopened.getAll("ops")).length,1);
  reopened.close();
});
test("in-flight acknowledgment does not delete a newer edit",async()=>{
  selectAccount("account-a");
  const original=(await getPending("account-a"))[0];
  await localMutation("characters","put",{id:"character-1",name:"Newer edit"});
  await acknowledge(original,1);
  const pending=await getPending("account-a");
  assert.equal(pending.length,1);
  assert.equal(pending[0].baseVersion,1);
  assert.equal(pending[0].data?.name,"Newer edit");
  assert.notEqual(original.revision,pending[0].revision);
});
test("account switching leaves pending data with its original account",async()=>{
  selectAccount("account-b");
  assert.equal((await getPending("account-b")).length,0);
  const b:any=await getDBForAccount("account-b");
  assert.equal((await b.getAll("characters")).length,0);
  await localMutation("characters","put",{id:"character-1",name:"B's project"});
  assert.equal((await getPending("account-a"))[0].data?.name,"Newer edit");
  selectAccount("account-a");
  await localMutation("characters","delete","character-1");
  const queued=await getPending("account-a");
  assert.equal(queued.length,1);
  assert.equal(queued[0].type,"delete");
  assert.equal((await b.get("characters","character-1")).name,"B's project");
});
test("pre-account backup preserves images, references, prompts and ordering",async()=>{
  selectAccount(null);
  await localMutation("characters","put",{id:"legacy",referenceAssetIds:["image"]});
  await localMutation("referenceAssets","put",{id:"image",dataUrl:"data:image/png;base64,original"});
  await localMutation("scenes","put",{id:"scene",episodeId:"episode",order:7,prompts:[{text:"Original prompt"}]});
  const backup=await getLocalBackup();
  assert.equal(backup.stores.scenes?.[0].order,7);
  assert.equal(backup.stores.scenes?.[0].prompts[0].text,"Original prompt");
  assert.equal(backup.stores.referenceAssets?.[0].dataUrl,"data:image/png;base64,original");
  await localMutation("characters","delete","legacy");
  assert.equal((await getLocalBackup()).stores.characters?.[0].id,"legacy");
});
