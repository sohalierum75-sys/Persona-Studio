import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

test("delete confirmation defaults to Cancel, preserves work on dismissal, and deletes only on confirmation", async () => {
  const browser = await chromium.launch({headless:true,channel:process.env.TEST_BROWSER_CHANNEL ?? "chrome"});
  try {
    const page = await browser.newPage();
    const errors = [];
    const nativeDialogs = [];
    page.on("pageerror",error => errors.push(error.message));
    page.on("dialog",async dialog => { nativeDialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.addInitScript(() => localStorage.setItem("ps_auth_tokens",JSON.stringify({accessToken:"test",refreshToken:"test",expiresAt:Date.now()+3600000,user:{id:"delete-browser-test",name:"Test",email:"test@example.test"}})));
    const character = {id:"existing",name:"Luna Kai",referenceAssetIds:[],identityFields:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    let deleted = false;
    let deletes = 0;
    await page.route("**/api/**",route => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path === "/api/sync") data = {records:[{id:character.id,kind:"character",data:deleted ? null : character,version:deleted ? 2 : 1,deleted}]};
      if (path === "/api/sync/ops") data = {results:route.request().postDataJSON().ops.map(op => {
        if (op.type === "delete" && op.id === character.id) { deleted = true; deletes++; }
        return {opId:op.opId,status:"applied",version:2};
      })};
      return route.fulfill({json:data});
    });
    const base = process.env.TEST_STUDIO_URL ?? "http://127.0.0.1:5179";
    await page.goto(new URL("/characters/existing",base).href);
    const trigger = page.getByTitle("Delete character",{exact:true});
    const dialog = page.getByRole("dialog",{name:"Delete this item?"});
    const countCharacters = () => page.evaluate(async () => {
      const {getDB} = await import("/src/db/index.ts");
      return (await (await getDB()).getAll("characters")).length;
    });
    await trigger.click();
    await dialog.waitFor();
    assert.match(await dialog.innerText(),/Luna Kai/);
    assert.match(await dialog.innerText(),/This cannot be undone/);
    assert.equal(await dialog.getByRole("button",{name:"Cancel",exact:true}).evaluate(el => el === document.activeElement),true);
    // Enter on the initially focused button must cancel, never delete.
    await page.keyboard.press("Enter");
    await dialog.waitFor({state:"hidden"});
    assert.equal(await countCharacters(),1);
    assert.equal(await trigger.evaluate(el => el === document.activeElement),true);
    await trigger.click();
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({state:"hidden"});
    assert.equal(await countCharacters(),1);
    await trigger.click();
    await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
    assert.equal(await countCharacters(),1);
    assert.equal(deletes,0);
    await trigger.click();
    const deleteResponse = page.waitForResponse(response => response.url().endsWith("/api/sync/ops") && response.request().postDataJSON()?.ops.some(op => op.type === "delete"));
    await dialog.getByRole("button",{name:"Delete",exact:true}).click();
    await page.waitForURL("**/characters");
    assert.equal(await countCharacters(),0);
    await page.waitForFunction(async () => {
      const {getSyncState} = await import("/src/lib/sync.ts");
      return getSyncState().status === "synced";
    });
    await deleteResponse;
    assert.equal(deletes,1);
    assert.deepEqual(nativeDialogs,[]);
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});
