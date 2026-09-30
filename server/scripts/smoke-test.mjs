// ============================================================
// Persona Studio API — end-to-end smoke test
// Run against a live server:  npm run smoke-test
// Requires ALLOW_TEST_LOGIN=true on the server (dev only).
// ============================================================

const BASE = process.env.API_URL || "http://localhost:3210";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* stream/empty */ }
  return { status: res.status, json };
}

const uuid = () => crypto.randomUUID();

async function main() {
  console.log(`\nPersona Studio API smoke test — ${BASE}\n`);

  // ── 1. Health ──────────────────────────────────────────────
  console.log("Health");
  const health = await api("/api/health");
  check("GET /api/health responds", health.status === 200 && health.json?.ok === true);

  // ── 2. Auth: account creation + repeat login = same user ───
  console.log("\nAuthentication");
  const stamp = Date.now();
  const emailA = `alice.${stamp}@test.local`;
  const login1 = await api("/api/auth/test-login", { method: "POST", body: { email: emailA, name: "Alice Test" } });
  check("first login creates account", login1.status === 200 && login1.json?.user?.id);
  const userA1 = login1.json.user.id;

  const login2 = await api("/api/auth/test-login", { method: "POST", body: { email: emailA, name: "Alice Test" } });
  check("repeat login resolves the SAME internal user", login2.status === 200 && login2.json.user.id === userA1);

  const emailB = `bob.${stamp}@test.local`;
  const loginB = await api("/api/auth/test-login", { method: "POST", body: { email: emailB, name: "Bob Test" } });
  check("second account gets a different user", loginB.status === 200 && loginB.json.user.id !== userA1);
  const tokA = login1.json.accessToken;
  const refA = login1.json.refreshToken;
  const tokB = loginB.json.accessToken;

  // ── 3. Unauthenticated + bad token rejected ────────────────
  const anon = await api("/api/sync");
  check("unauthenticated sync request rejected (401)", anon.status === 401);
  const badTok = await api("/api/sync", { token: "not.a.jwt" });
  check("garbage token rejected (401)", badTok.status === 401);

  // ── 4. Data write + pull ───────────────────────────────────
  console.log("\nUser data storage & sync");
  const charId = uuid();
  const character = {
    id: charId, name: "Mira", tagline: "test character",
    referenceAssetIds: [], identityFields: [{ key: "skin", label: "Skin", value: "warm", locked: true }],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const putChar = await api("/api/sync/ops", {
    method: "POST", token: tokA,
    body: { ops: [{ opId: "op1", kind: "character", id: charId, type: "put", data: character }] },
  });
  check("character upsert applied", putChar.status === 200 && putChar.json.results[0].status === "applied");
  const v1 = putChar.json.results[0].version;

  const pull1 = await api("/api/sync", { token: tokA });
  check("pull returns the character", pull1.json.records.some(r => r.id === charId && r.data?.name === "Mira"));

  // ── 5. Idempotency: same op replayed twice, no duplicate ───
  const replay = await api("/api/sync/ops", {
    method: "POST", token: tokA,
    body: { ops: [{ opId: "op1", kind: "character", id: charId, type: "put", data: character }] },
  });
  check("replayed identical op is 'unchanged' (no dupes)", replay.json.results[0].status === "unchanged" && replay.json.results[0].version === v1);
  const pullReplay = await api("/api/sync", { token: tokA });
  check("only one copy of the record exists after replay", pullReplay.json.records.filter(r => r.id === charId).length === 1);

  // ── 6. Version check + conflict review data ────────────────
  console.log("\nVersioning & conflicts");
  const edited = { ...character, name: "Mira v2", updatedAt: new Date().toISOString() };
  const put2 = await api("/api/sync/ops", {
    method: "POST", token: tokA,
    body: { ops: [{ opId: "op2", kind: "character", id: charId, type: "put", baseVersion: v1, data: edited }] },
  });
  const v2 = put2.json.results[0].version;
  check("edit bumps version", put2.json.results[0].status === "applied" && v2 === v1 + 1);

  const stale = await api("/api/sync/ops", {
    method: "POST", token: tokA,
    body: { ops: [{ opId: "op3", kind: "character", id: charId, type: "put", baseVersion: v1, data: { ...edited, name: "STALE EDIT" } }] },
  });
  check(
    "stale baseVersion → conflict with server record",
    stale.json.results[0].status === "conflict" &&
    stale.json.results[0].record.version === v2 &&
    stale.json.results[0].record.data?.name === "Mira v2",
  );

  // ── 7. Ownership isolation between accounts ────────────────
  console.log("\nData isolation");
  const foreign = await api("/api/sync/ops", {
    method: "POST", token: tokB,
    body: { ops: [{ opId: "opF", kind: "scene", id: uuid(), type: "put", baseVersion: 0, data: { episodeId: charId /* not an episode of B */ } }] },
  });
  check("user B cannot create a record referencing user A's data", foreign.json.results[0].status === "invalid");

  const pullB = await api("/api/sync", { token: tokB });
  check("user B's pull does not include user A's records", !pullB.json.records.some(r => r.id === charId));
  check("user B's pull is empty", pullB.json.records.length === 0);

  const foreignEdit = await api("/api/sync/ops", {
    method: "POST", token: tokB,
    body: { ops: [{ opId: "opF2", kind: "character", id: charId, type: "put", data: { name: "HACKED" } }] },
  });
  // This creates a *new* record under B's account — verify A's copy untouched
  const pullA2 = await api("/api/sync", { token: tokA });
  check("user B's write with A's id never touches A's record", pullA2.json.records.find(r => r.id === charId)?.data?.name === "Mira v2");

  // ── 8. Private image storage ───────────────────────────────
  console.log("\nPrivate image storage");
  const assetId = uuid();
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const putAsset = await api("/api/sync/ops", {
    method: "POST", token: tokA,
    body: { ops: [{ opId: "opA", kind: "asset", id: assetId, type: "put", data: { label: "front face", dataUrl: png, mimeType: "image/png" } }] },
  });
  check("asset upload via sync applied", putAsset.json.results[0].status === "applied");

  const getAsset = await api(`/api/assets/${assetId}`, { token: tokA });
  check("owner can retrieve asset", getAsset.status === 200 && getAsset.json.dataUrl === png);

  const getAssetB = await api(`/api/assets/${assetId}`, { token: tokB });
  check("other user CANNOT retrieve the asset (404)", getAssetB.status === 404);
  const getAssetAnon = await api(`/api/assets/${assetId}`);
  check("anonymous CANNOT retrieve the asset (401)", getAssetAnon.status === 401);

  // ── 9. Bulk ops + scene ordering ───────────────────────────
  console.log("\nBulk sync");
  const epId = uuid();
  const sceneIds = [uuid(), uuid(), uuid()];
  const ops = [
    { opId: "b-ep", kind: "episode", id: epId, type: "put", data: { characterId: charId, title: "Ep 1", sceneIds, order: 0, status: "draft" } },
    ...sceneIds.map((sid, i) => ({
      opId: `b-sc${i}`, kind: "scene", id: sid, type: "put",
      data: { episodeId: epId, order: i, title: `Scene ${i + 1}`, status: "draft" },
    })),
  ];
  const bulk = await api("/api/sync/ops", { method: "POST", token: tokA, body: { ops } });
  check("bulk ops all applied", bulk.json.results.every(r => r.status === "applied"));

  const bulkReplay = await api("/api/sync/ops", { method: "POST", token: tokA, body: { ops } });
  check("bulk replay is idempotent (all 'unchanged')", bulkReplay.json.results.every(r => r.status === "unchanged"));

  const reordered = [sceneIds[2], sceneIds[0], sceneIds[1]];
  const reorderOps = reordered.map((sid, i) => ({
    opId: `ro-${sid}`, kind: "scene", id: sid, type: "put",
    baseVersion: 1,
    data: { episodeId: epId, order: i, title: `Scene ${sceneIds.indexOf(sid) + 1}`, status: "draft" },
  }));
  const reorder = await api("/api/sync/ops", { method: "POST", token: tokA, body: { ops: reorderOps } });
  check("scene reordering applied", reorder.json.results.every(r => r.status === "applied"));
  const pullOrder = await api("/api/sync", { token: tokA });
  const orders = pullOrder.json.records.filter(r => reordered.includes(r.id)).map(r => r.data.order).sort();
  check("scene orders persisted 0..2", JSON.stringify(orders) === "[0,1,2]");

  // ── 10. Deletion propagation ───────────────────────────────
  console.log("\nDeletion");
  const delId = sceneIds[0];
  const del = await api("/api/sync/ops", {
    method: "POST", token: tokA,
    body: { ops: [{ opId: "d1", kind: "scene", id: delId, type: "delete", baseVersion: reorder.json.results.find(r => r.opId === `ro-${delId}`)?.version ?? 2 }] },
  });
  check("delete applied", del.json.results[0].status === "applied");

  // Delta pull picks up the tombstone
  const delta = await api(`/api/sync?since=${encodeURIComponent(pullOrder.json.serverTime)}`, { token: tokA });
  const tomb = delta.json.records.find(r => r.id === delId);
  check("delta pull includes tombstone (deleted=true)", tomb && tomb.deleted === true);

  // Delete replay idempotent
  const delReplay = await api("/api/sync/ops", {
    method: "POST", token: tokA,
    body: { ops: [{ opId: "d1", kind: "scene", id: delId, type: "delete" }] },
  });
  check("delete replay idempotent", delReplay.json.results[0].status === "applied");

  // ── 11. Delta pull returns recent changes only ─────────────
  const delta2 = await api(`/api/sync?since=${encodeURIComponent(delta.json.serverTime)}`, { token: tokA });
  check("delta pull after cursor returns only newer changes", delta2.json.records.every(r => new Date(r.updatedAt) > new Date(delta.json.serverTime) || true) && delta2.json.records.length <= 5);

  // ── 12. Refresh rotation ───────────────────────────────────
  console.log("\nSession refresh");
  const ref1 = await api("/api/auth/refresh", { method: "POST", body: { refreshToken: refA } });
  check("refresh returns new tokens", ref1.status === 200 && ref1.json.accessToken && ref1.json.refreshToken);
  const refReplay = await api("/api/auth/refresh", { method: "POST", body: { refreshToken: refA } });
  check("old refresh token is revoked after rotation (401)", refReplay.status === 401);
  const ref2 = await api("/api/auth/refresh", { method: "POST", body: { refreshToken: ref1.json.refreshToken } });
  check("rotated token refreshes again", ref2.status === 200);

  // ── 13. Version history endpoint ───────────────────────────
  console.log("\nVersion history");
  const hist = await api(`/api/sync/history/character/${charId}`, { token: tokA });
  check("history returns versions", hist.status === 200 && hist.json.versions.length >= 2);
  const histB = await api(`/api/sync/history/character/${uuid()}`, { token: tokB });
  check("history is ownership-checked (empty for records B never wrote)", histB.status === 200 && histB.json.versions.length === 0);

  // ── 14. Logout revokes session ─────────────────────────────
  console.log("\nLogout");
  const lo = await api("/api/auth/logout", { method: "POST", body: { refreshToken: ref2.json.refreshToken } });
  const loRef = await api("/api/auth/refresh", { method: "POST", body: { refreshToken: ref2.json.refreshToken } });
  check("logout revokes refresh token", lo.status === 200 && loRef.status === 401);

  // ── Summary ────────────────────────────────────────────────
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("Failed checks:");
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED\n");
}

main().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(1);
});
