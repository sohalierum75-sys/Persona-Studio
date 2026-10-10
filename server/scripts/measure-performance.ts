// Local-only synthetic benchmark; never seed an external database.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
if (fs.existsSync('.env')) process.loadEnvFile('.env');
const url = new URL(process.env.DATABASE_URL!);
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Benchmark requires a local database');
const schema = `perf_${Date.now()}`;
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_LOGIN = 'true';
process.env.JWT_SECRET = 'synthetic-performance-test-secret-long-enough';
const label = process.argv[2] ?? 'before';
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'pipe', env: process.env });
const queries: {duration:number; query:string}[] = [];
const db = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
db.$on('query', e => queries.push({ duration: e.duration, query: e.query }));
const { getUsage } = await import('../src/lib/plans.js');
const { createApp } = await import('../src/index.js');
const { prisma } = await import('../src/lib/prisma.js');
const server = createApp().listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
try {
  const login = await fetch(base + '/api/auth/test-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'synthetic-perf@example.test' }) }).then(r => r.json());
  const userId = login.user.id;
  const data: any[] = [{ userId, id: 'character', kind: 'character', data: { id: 'character' } }];
  for (let i=0;i<1000;i++) {
    data.push({userId,id:`episode-${i}`,kind:'episode',data:{id:`episode-${i}`,characterId:'character'}});
    data.push({userId,id:`group-${i}`,kind:'continuityGroup',data:{id:`group-${i}`,episodeId:`episode-${i}`}});
    for (let j=0;j<5;j++) data.push({userId,id:`scene-${i}-${j}`,kind:'scene',data:{id:`scene-${i}-${j}`,episodeId:`episode-${i}`,continuityGroupId:`group-${i}`,order:4-j,prompts:['one','two'],promptSnapshot:{referenceImages:[{dataUrl:'x'.repeat(4096)}]}}});
  }
  for (let i=0;i<data.length;i+=100) await db.entity.createMany({ data: data.slice(i,i+100) });
  queries.length = 0;
  const usageMs:number[] = [], api:any[] = [];
  for (let i=0;i<7;i++) {
    const start = performance.now();
    const usage = await getUsage(db, userId);
    usageMs.push(performance.now()-start);
    if (usage.prompts !== 10000) throw new Error('Unexpected usage');
  }
  for (const endpoint of ['/api/sync','/api/billing/entitlements']) {
    const samples=[];
    for (let i=0;i<7;i++) {
      const start=performance.now();
      const response=await fetch(base+endpoint,{headers:{Authorization:`Bearer ${login.accessToken}`}});
      const body=await response.arrayBuffer();
      samples.push({ms:performance.now()-start,bytes:body.byteLength,status:response.status,cacheControl:response.headers.get('cache-control')});
    }
    api.push({endpoint,samples});
  }
  const plan = await db.$queryRaw`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM "Entity" WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND kind IN ('character','episode','scene')`;
  fs.mkdirSync('../performance',{recursive:true});
  const result={label,fixture:{episodes:1000,groups:1000,scenes:5000,privateSnapshotBytes:4096,totalRows:data.length},usageMs,queries:queries.slice(0,7),api,plan};
  fs.writeFileSync(`../performance/database-${label}.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({usageMs,api},null,2));
} finally {
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  // schema is generated above, never provided by an external caller.
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect(); await prisma.$disconnect();
}
