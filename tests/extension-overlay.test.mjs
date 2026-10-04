import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "@playwright/test";

const dist = path.resolve("dist");
const manifest = JSON.parse(fs.readFileSync(path.join(dist,"manifest.json"),"utf8"));

test("extension manifest uses on-demand injection without side panel or tab-reading permissions", () => {
  assert.equal(manifest.side_panel,undefined);
  assert.ok(!manifest.permissions.includes("sidePanel"));
  assert.ok(!manifest.permissions.includes("tabs"));
  assert.ok(manifest.permissions.includes("activeTab"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(!manifest.host_permissions.includes("<all_urls>"));
  assert.deepEqual(manifest.web_accessible_resources[0].resources,["floating-panel.html"]);
});

test("floating extension works on plain, hostile-CSS, and strict-CSP SPA webpages", {timeout:180000}, async t => {
  const servers = [];
  let context;
  const run = path.resolve("test-results",`overlay-${Date.now()}`);
  fs.mkdirSync(run,{recursive:true});
  const extension = path.join(run,"extension");
  fs.cpSync(dist,extension,{recursive:true,filter:source => !source.includes(path.join("dist","download"))});
  try {
    for (const name of ["plain","hostile","strict"]) {
      const server = http.createServer((_req,res) => {
        if (name === "strict") {
          res.setHeader("Content-Security-Policy","default-src 'none'; script-src 'none'; style-src 'none'; frame-src 'none'; img-src 'none'");
          res.setHeader("Permissions-Policy","clipboard-write=()");
        }
        res.setHeader("Content-Type","text/html");
        res.end(`<!doctype html><html><head><title>${name} webpage</title>${name === "hostile" ? "<style>*{font:40px monospace!important;color:rgb(255,0,0)!important} div,iframe,button,section{border:15px solid red!important} html{transform:translate(5px,5px);overflow:hidden} body{background:#121212} #persona-studio-overlay{position:absolute!important;width:10px!important;display:none!important;opacity:.01!important}</style>" : ""}</head><body><h1>${name} webpage</h1><button id="host-button">Host button</button><div style="height:2400px">Long page</div></body></html>`);
      });
      await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
      servers.push(server);
    }
    const origins = servers.map(server => `http://127.0.0.1:${server.address().port}`);
    // Test-only host grants let automation invoke the real content script from
    // the service worker; production obtains its grant from the toolbar click.
    const publicPages = process.env.TEST_PUBLIC_PAGES ? ["https://example.com/","https://www.wikipedia.org/","https://developer.chrome.com/docs/extensions/"] : [];
    const testManifest = {...manifest,host_permissions:[...manifest.host_permissions,...origins.map(origin=>origin+"/*"),...publicPages.map(url=>new URL(url).origin+"/*")]};
    fs.writeFileSync(path.join(extension,"manifest.json"),JSON.stringify(testManifest));
    context = await chromium.launchPersistentContext(path.join(run,"profile"),{
      channel:"chromium",headless:true,viewport:{width:1280,height:900},
      args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const timestamp = new Date().toISOString();
    const character = {id:"character",name:"Luna Kai",identityFields:[],referenceAssetIds:[],createdAt:timestamp,updatedAt:timestamp};
    const episode = {id:"episode",characterId:"character",title:"Morning episode",sceneIds:["scene"],continuityGroupIds:[],createdAt:timestamp,updatedAt:timestamp};
    const scene = {id:"scene",episodeId:"episode",title:"Garden walk",status:"draft",order:0,action:"Walking in a sunny garden",sceneDescription:"Walking in a sunny garden",prompts:[],referenceImages:[],createdAt:timestamp,updatedAt:timestamp};
    const records = [["character",character],["episode",episode],["scene",scene]].map(([kind,data])=>({id:data.id,kind,data,version:1,deleted:false}));
    await context.route("**/api/**",route => {
      const pathname = new URL(route.request().url()).pathname;
      const data = pathname === "/api/sync" ? {records} : pathname === "/api/billing/entitlements"
        ? {plan:"free",usage:{characters:1,episodes:1,prompts:0},limits:{characters:1,episodes:1,prompts:10,bulkScenes:3}}
        : {results:[]};
      return route.fulfill({json:data});
    });
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ps_auth_tokens:JSON.stringify({accessToken:"test",refreshToken:"test",expiresAt:Date.now()+3600000,user:{id:"overlay-test",name:"Test",email:"test@example.test"}})});
    });
    async function inject(page) {
      await worker.evaluate(async url => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(tab=>tab.url === url);
        if (!tab?.id) throw new Error("Test tab not found");
        await chrome.scripting.executeScript({target:{tabId:tab.id},files:["overlay.js"]});
      },page.url());
    }
    for (let index=0;index<origins.length;index++) {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror",error=>errors.push(error.message));
      await page.goto(origins[index]+"/article");
      const before = await page.locator("#host-button").evaluate(el=>({color:getComputedStyle(el).color,font:getComputedStyle(el).fontSize}));
      await inject(page);
      const host = page.locator("#persona-studio-overlay");
      await host.waitFor();
      assert.equal(await host.evaluate(el=>!!el.shadowRoot),true);
      assert.equal(await host.evaluate(el=>el.matches(":popover-open")),true);
      const frame = page.frameLocator('iframe[title="Persona Studio workspace"]');
      await frame.getByRole("combobox",{name:"Select character"}).waitFor();
      await frame.getByRole("combobox",{name:"Select character"}).selectOption("character");
      await frame.getByRole("combobox",{name:"Select episode"}).selectOption("episode");
      await frame.getByRole("button",{name:/Garden walk/}).click();
      await frame.getByRole("button",{name:"Copy prompt",exact:true}).click();
      await frame.getByRole("button",{name:"Prompt copied!",exact:true}).waitFor();
      const selectedFrame = page.frames().find(frame=>frame.url().includes("floating-panel.html"));
      assert.equal(await selectedFrame.evaluate(()=>typeof chrome.identity.launchWebAuthFlow),"function");
      assert.equal(await selectedFrame.evaluate(()=>location.origin),`chrome-extension://${extensionId}`);
      assert.deepEqual(await page.locator("#host-button").evaluate(el=>({color:getComputedStyle(el).color,font:getComputedStyle(el).fontSize})),before);
      assert.equal(await host.locator(".toolbar").evaluate(el=>getComputedStyle(el).fontSize),"13px");
      await host.getByRole("button",{name:"Minimize panel",exact:true}).click();
      await page.locator("#host-button").click();
      await host.getByRole("button",{name:"Restore panel",exact:true}).click();
      const beforeScroll = await host.boundingBox();
      await page.evaluate(()=>window.scrollTo(0,300));
      assert.deepEqual(await host.boundingBox(),beforeScroll,"The panel is anchored while the page scrolls");
      const box = await host.boundingBox();
      const toolbar = host.locator(".toolbar");
      const dragBox = await toolbar.boundingBox();
      await page.mouse.move(dragBox.x+100,dragBox.y+20);
      await page.mouse.down();
      const dx = box.x < 200 ? 180 : -180;
      await page.mouse.move(dragBox.x+100+dx,dragBox.y+100,{steps:8});
      await page.mouse.up();
      const moved = await host.boundingBox();
      assert.ok(Math.abs(moved.x-box.x)>100 && moved.y > box.y+40,"Dragging moves the overlay");
      const resize = host.getByRole("button",{name:"Resize panel. Drag or use arrow keys.",exact:true});
      const resizeBox = await resize.boundingBox();
      await page.mouse.move(resizeBox.x+12,resizeBox.y+12);
      await page.mouse.down();
      await page.mouse.move(resizeBox.x+92,resizeBox.y+42,{steps:8});
      await page.mouse.up();
      const resized = await host.boundingBox();
      assert.ok(resized.width > moved.width+40,"Corner handle resizes the overlay");
      await toolbar.focus();
      await page.keyboard.press("ArrowRight");
      assert.ok((await host.boundingBox()).x > resized.x,"Arrow keys move the focused toolbar");
      await resize.focus();
      const beforeKeyboardResize = await host.boundingBox();
      await page.keyboard.press("ArrowRight");
      assert.ok((await host.boundingBox()).width > beforeKeyboardResize.width,"Arrow keys resize the focused handle");
      await host.getByRole("button",{name:"Minimize panel",exact:true}).click();
      assert.ok((await host.boundingBox()).height <= 48);
      await inject(page);
      assert.equal(await page.locator("#persona-studio-overlay").count(),1,"Repeated action restores the same panel");
      assert.equal(await frame.getByRole("combobox",{name:"Select episode"}).inputValue(),"episode","Minimize retains the UI state");
      assert.ok((await host.boundingBox()).height > 300);
      await page.evaluate(()=>{history.pushState({},"","/next-page");document.body.innerHTML="<h1>SPA replacement</h1>";});
      assert.equal(await host.count(),1,"Replacing a SPA body does not remove the overlay");
      await page.setViewportSize({width:375,height:600});
      const small = await host.boundingBox();
      assert.ok(small.x>=0 && small.y>=0 && small.x+small.width<=376 && small.y+small.height<=601,"Panel stays inside a small viewport");
      await page.screenshot({path:path.join(run,`page-${index}.png`)});
      await host.getByRole("button",{name:"Close panel",exact:true}).click();
      assert.equal(await host.count(),0);
      await inject(page);
      await frame.getByRole("combobox",{name:"Select character"}).waitFor();
      assert.equal(await host.count(),1);
      assert.deepEqual(await host.boundingBox(),small,"Closing and reopening restores size and position");
      assert.deepEqual(errors,[]);
      await page.close();
      t.diagnostic(`Passed on ${["plain article","hostile CSS page","strict CSP and SPA page"][index]}`);
    }
    for (const url of publicPages) {
      const page = await context.newPage();
      await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});
      await inject(page);
      const frame = page.frameLocator('iframe[title="Persona Studio workspace"]');
      await frame.getByRole("combobox",{name:"Select character"}).waitFor();
      await page.getByRole("button",{name:"Minimize panel",exact:true}).click();
      await page.getByRole("button",{name:"Restore panel",exact:true}).click();
      await page.screenshot({path:path.join(run,new URL(url).hostname+".png")});
      await page.getByRole("button",{name:"Close panel",exact:true}).click();
      assert.equal(await page.locator("#persona-studio-overlay").count(),0);
      await page.close();
      t.diagnostic("Passed on live webpage: "+url);
    }
    const launcher = await context.newPage();
    await launcher.goto(origins[0]);
    await inject(launcher);
    const studioReady = context.waitForEvent("page");
    await launcher.frameLocator('iframe[title="Persona Studio workspace"]').getByRole("button",{name:"Open full Studio",exact:true}).click();
    const studio = await studioReady;
    await studio.waitForURL(`chrome-extension://${extensionId}/index.html*`);
    await studio.getByRole("button",{name:"Open Luna Kai",exact:true}).waitFor();
    await studio.close();
    await launcher.close();
    t.diagnostic("Shared extension storage and full Studio verified; screenshots in "+run);
  } finally {
    await context?.close();
    await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
  }
});
