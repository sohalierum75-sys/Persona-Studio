import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function workerHarness(failInjection=false) {
  const calls = {injections:[],badges:[],titles:[],tabs:[]};
  let click, message;
  const chrome = {
    action:{onClicked:{addListener:fn=>click=fn},setBadgeText:async value=>calls.badges.push(value),setTitle:async value=>calls.titles.push(value),setBadgeBackgroundColor:async()=>{}},
    scripting:{executeScript:async value=>{ calls.injections.push(value); if (failInjection) throw new Error("Chrome blocked injection"); }},
    runtime:{id:"test-extension",getURL:path=>`chrome-extension://test-extension/${path}`,onMessage:{addListener:fn=>message=fn}},
    tabs:{create:async value=>calls.tabs.push(value)},
  };
  vm.runInNewContext(fs.readFileSync("dist/background.js","utf8"),{chrome});
  return {calls,click,message};
}
test("toolbar action injects only into the current main frame and clears previous errors",async()=>{
  const {calls,click}=workerHarness();
  await click({id:42,url:"https://example.com/article"});
  assert.equal(calls.injections.length,1);
  assert.equal(calls.injections[0].target.tabId,42);
  assert.equal(calls.injections[0].target.allFrames,undefined);
  assert.equal(calls.injections[0].files[0],"overlay.js");
  assert.equal(calls.badges.at(-1).text,"");
  assert.equal(calls.tabs.length,0);
});
test("restricted pages are handled without opening a side panel or an extra tab",async()=>{
  const {calls,click}=workerHarness();
  await click({id:42,url:"chrome://extensions"});
  assert.equal(calls.injections.length,0);
  assert.equal(calls.badges.at(-1).text,"!");
  assert.match(calls.titles.at(-1).title,/regular webpage/);
  assert.equal(calls.tabs.length,0);
});
test("failed injection has a recoverable toolbar message",async()=>{
  const {calls,click}=workerHarness(true);
  await click({id:42,url:"https://chromewebstore.google.com/"});
  assert.equal(calls.badges.at(-1).text,"!");
  assert.match(calls.titles.at(-1).title,/cannot float/);
});
test("only messages from this extension can open the full Studio fallback",()=>{
  const {calls,message}=workerHarness();
  message({type:"persona:open-studio"},{id:"untrusted"});
  assert.equal(calls.tabs.length,0);
  message({type:"persona:open-studio"},{id:"test-extension"});
  assert.equal(calls.tabs[0].url,"chrome-extension://test-extension/index.html");
});
