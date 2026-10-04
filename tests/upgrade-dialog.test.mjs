import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

test("upgrade dialog preserves a blocked character draft and opens Pricing", async () => {
  const browser = await chromium.launch({headless:true,channel:process.env.TEST_BROWSER_CHANNEL ?? "chrome"});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror",error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem("ps_auth_tokens",JSON.stringify({accessToken:"test",refreshToken:"test",expiresAt:Date.now()+3600000,user:{id:"browser-test",name:"Test",email:"test@example.test"}})));
    const character = {id:"existing",name:"Existing character",referenceAssetIds:[],identityFields:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    await page.route("**/api/**",route => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path === "/api/sync") data = {records:[{id:character.id,kind:"character",data:character,version:1,deleted:false}]};
      if (path === "/api/sync/ops") data = {results:route.request().postDataJSON().ops.map(op => ({opId:op.opId,status:"limit_reached",error:"You've reached your Free plan limit: 1/1 characters. Upgrade to continue."}))};
      if (path === "/api/billing/entitlements") data = {plan:"free",usage:{characters:1,episodes:0,prompts:0},limits:{characters:1,episodes:1,prompts:10,bulkScenes:3}};
      return route.fulfill({json:data});
    });
    await page.goto(process.env.TEST_STUDIO_URL ?? "http://127.0.0.1:5179/characters");
    await page.getByRole("button",{name:"New Character",exact:true}).first().click();
    assert.equal(await page.locator("dialog[open]").count(),0);
    await page.getByLabel("Character name").fill("My unsaved draft");
    await page.getByRole("button",{name:"Create Character",exact:true}).click();
    const dialog = page.locator("dialog[open]");
    await dialog.waitFor();
    assert.match(await dialog.innerText(),/1\/1 characters/);
    assert.match(await dialog.getByRole("link",{name:"Upgrade plan"}).getAttribute("href"),/pricing=1#pricing/);
    assert.equal(await dialog.getByRole("link",{name:"Upgrade plan"}).getAttribute("target"),"_blank");
    await dialog.getByRole("button",{name:"Not now"}).click();
    assert.equal(await page.getByLabel("Character name").inputValue(),"My unsaved draft");
    assert.equal(await page.getByRole("button",{name:"Create Character",exact:true}).isEnabled(),true);
    const counts = await page.evaluate(async () => {
      const {getDB} = await import("/src/db/index.ts");
      const db = await getDB();
      return {characters:(await db.getAll("characters")).length,ops:(await db.getAll("ops")).length};
    });
    assert.deepEqual(counts,{characters:1,ops:0});
    await page.getByRole("button",{name:"Create Character",exact:true}).click();
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({state:"hidden"});
    assert.equal(await page.getByLabel("Character name").inputValue(),"My unsaved draft");
    await page.getByRole("button",{name:"Create Character",exact:true}).click();
    await dialog.waitFor();
    const popupReady = page.waitForEvent("popup");
    await dialog.getByRole("link",{name:"Upgrade plan"}).click();
    const pricing = await popupReady;
    await pricing.waitForLoadState("domcontentloaded");
    assert.equal(new URL(pricing.url()).searchParams.get("pricing"),"1");
    assert.equal(new URL(pricing.url()).hash,"#pricing");
    assert.equal(await page.getByLabel("Character name").inputValue(),"My unsaved draft");
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});
