import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
if (fs.existsSync('.env')) process.loadEnvFile('.env');
const schema = `dodo_test_${Date.now()}`;
const db = new URL(process.env.DATABASE_URL!); db.searchParams.set('schema',schema);
process.env.DATABASE_URL=db.href;
Object.assign(process.env,{JWT_SECRET:'test-signing-secret-at-least-32-characters',ALLOW_TEST_LOGIN:'true',NODE_ENV:'test',ALLOWED_ORIGINS:'http://localhost:5173',DODO_PAYMENTS_ENVIRONMENT:'test_mode',DODO_PAYMENTS_API_KEY:'test-api-key',DODO_LIFETIME_PRODUCT_ID:'pdt_lifetime',DODO_MONTHLY_PRODUCT_ID:'pdt_monthly',PUBLIC_BASE_URL:'https://studio.example',DODO_RETURN_BASE_URL:'https://studio.example',LIFETIME_DEAL_LIMIT:'2'});
const secret=Buffer.from('test-secret-with-at-least-32-bytes');
process.env.DODO_PAYMENTS_WEBHOOK_KEY='whsec_'+secret.toString('base64');
let prisma:any, server:any, base:string;
const nativeFetch=globalThis.fetch;
let checkoutCalls=0, catalogAmount=3900, failCreate=false;
const request=async(path:string,token?:string,body?:unknown)=> {
  const r=await nativeFetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
  return {status:r.status,json:await r.json() as any};
};
async function buyer(){return (await request('/api/auth/test-login',undefined,{email:`${randomUUID()}@example.test`})).json;}
async function checkout(b:any,plan='lifetime'){return request('/api/billing/checkout',b.accessToken,{plan});}
async function attempt(b:any,plan='lifetime'){return prisma.billingCheckout.findFirstOrThrow({where:{userId:b.user.id,plan},orderBy:{createdAt:'desc'}});}
function event(type:string,data:any,time=new Date().toISOString()){return {type,timestamp:time,data};}
async function post(payload:any,id=randomUUID(),bad=false){
  const raw=JSON.stringify(payload), ts=String(Math.floor(Date.now()/1000));
  const sig=createHmac('sha256',secret).update(`${id}.${ts}.${raw}`).digest('base64');
  return nativeFetch(base+'/api/billing/webhook',{method:'POST',headers:{'Content-Type':'application/json','webhook-id':id,'webhook-timestamp':ts,'webhook-signature':`v1,${bad?'invalid':sig}`},body:raw});
}
async function payment(b:any,id=randomUUID(),plan='lifetime',subscriptionId?:string){
  const a=await attempt(b,plan);
  return event('payment.succeeded',{payment_id:id,status:'succeeded',metadata:{user_id:b.user.id,checkout_id:a.id,plan},product_cart:[{product_id:a.productId,quantity:1}],total_amount:plan==='lifetime'?3900:900,currency:'USD',created_at:new Date().toISOString(),customer:{email:b.user.email},subscription_id:subscriptionId??null});
}
async function sub(b:any,id:string,status:string,time=new Date().toISOString(),product='pdt_monthly'){
 const a=await attempt(b,'monthly');
 return event('subscription.updated',{subscription_id:id,product_id:product,status,metadata:{user_id:b.user.id,checkout_id:a.id,plan:'monthly'},previous_billing_date:new Date(Date.now()-1000).toISOString(),next_billing_date:new Date(Date.now()+86400000).toISOString(),customer:{email:b.user.email}},time);
}
const refund=(id:string,amount=3900,partial=false,rid=randomUUID())=>event('refund.succeeded',{refund_id:rid,payment_id:id,status:'succeeded',amount,is_partial:partial});
const user=(b:any)=>prisma.user.findUniqueOrThrow({where:{id:b.user.id}});
before(async()=>{
  execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:process.env,stdio:'pipe'});
  ({prisma}=await import('../src/lib/prisma.js'));
  const {createApp}=await import('../src/index.js'); server=createApp().listen(0,'127.0.0.1'); await new Promise<void>(r=>server.once('listening',r)); base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=async(input,init)=>{
    const req=new Request(input,init), url=new URL(req.url);
    if(url.hostname!=='test.dodopayments.com') throw new Error('Unexpected external request');
    assert.equal(req.headers.get('authorization'),'Bearer test-api-key');
    if(url.pathname.startsWith('/products/')) return Response.json({price:url.pathname.endsWith('pdt_lifetime')?{type:'one_time_price',price:catalogAmount,currency:'USD'}:{type:'recurring_price',price:900,currency:'USD',payment_frequency_count:1,payment_frequency_interval:'Month'}});
    assert.equal(url.pathname,'/checkouts'); assert.equal(req.method,'POST');
    const body=await req.json() as any;
    assert.equal(body.product_cart[0].quantity,1); assert.equal(body.return_url,'https://studio.example/?checkout=success');
    assert.ok(body.metadata.checkout_id); assert.ok(body.customer.email); assert.equal(body.feature_flags.allow_discount_code,false);
    checkoutCalls++;
    if(failCreate) throw new Error('Network failure with secret request details');
    return Response.json({session_id:`cks_${checkoutCalls}`,checkout_url:`https://test.checkout.dodopayments.com/session/cks_${checkoutCalls}`});
  };
},{timeout:60000});
after(async()=>{globalThis.fetch=nativeFetch;if(server)await new Promise<void>(r=>server.close(r));if(prisma){await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await prisma.$disconnect();}});

test('checkout requires authentication, validates plan and never grants access',async()=>{
 assert.equal((await request('/api/billing/checkout',undefined,{plan:'lifetime'})).status,401);
 const b=await buyer(); assert.equal((await checkout(b,'invalid')).status,400);
 const r=await checkout(b,'monthly'); assert.equal(r.status,200); assert.match(r.json.url,/dodopayments/); assert.equal((await user(b)).subscriptionStatus,null);
 assert.equal((await checkout(b,'monthly')).json.url,r.json.url);
});
test('catalog price mismatch fails closed without reserving a slot',async()=>{
 const b=await buyer();catalogAmount=4000;try{assert.equal((await checkout(b)).status,503);assert.equal(await prisma.billingCheckout.count({where:{userId:b.user.id}}),0);}finally{catalogAmount=3900;}
});
test('atomic reservations permit only the remaining lifetime slots, including concurrent requests',async()=>{
 const buyers=await Promise.all(Array.from({length:8},()=>buyer()));
 const responses=await Promise.all(buyers.map(b=>checkout(b)));
 assert.equal(responses.filter(r=>r.status===200).length,2);assert.equal(responses.filter(r=>r.status===409).length,6);
 const b=buyers[responses.findIndex(r=>r.status===200)];
 const p=await payment(b);const id=randomUUID();
 assert.equal((await post(p,id,true)).status,401);assert.equal((await user(b)).lifetimeAt,null);
 const replies=await Promise.all(Array.from({length:5},()=>post(p,id)));assert.ok(replies.every(r=>r.status===200));
 assert.ok((await user(b)).lifetimeAt);assert.equal(await prisma.purchase.count({where:{providerOrderId:p.data.payment_id}}),1);
 assert.equal((await post(p)).status,200);assert.equal(await prisma.purchase.count({where:{providerOrderId:p.data.payment_id}}),1);
 assert.equal((await request('/api/billing/config')).json.lifetime.remaining,0);
 assert.equal((await post(refund(p.data.payment_id,1000,true))).status,200);assert.ok((await user(b)).lifetimeAt);
 assert.equal((await post(refund(p.data.payment_id,2900,true))).status,200);assert.equal((await user(b)).lifetimeAt,null);
 assert.equal((await post(p)).status,200);assert.equal((await user(b)).lifetimeAt,null);
 assert.equal((await request('/api/billing/config')).json.lifetime.remaining,0);
});
test('refund before payment cannot grant lifetime access',async()=>{
 const a=await prisma.billingCheckout.findFirstOrThrow({where:{plan:'lifetime',status:'reserved'}});
 const u=await prisma.user.findUniqueOrThrow({where:{id:a.userId}});const b={user:u};const p=await payment(b);
 assert.equal((await post(refund(p.data.payment_id))).status,200);assert.equal((await post(p)).status,200);assert.equal((await user(b)).lifetimeAt,null);
});
test('monthly lifecycle orders events, preserves paid cancellation and revokes hold/expired/unknown plan',async()=>{
 const b=await buyer();await checkout(b,'monthly');const id='sub_'+randomUUID();
 let n=Date.now();const send=async(status:string,product?:string)=>post(await sub(b,id,status,new Date(n+=1000).toISOString(),product));
 assert.equal((await send('active')).status,200);assert.equal((await request('/api/billing/entitlements',b.accessToken)).json.plan,'monthly');
 await send('cancelled');assert.equal((await user(b)).subscriptionStatus,'canceled');assert.equal((await request('/api/billing/entitlements',b.accessToken)).json.plan,'monthly');
 await send('on_hold');assert.equal((await request('/api/billing/entitlements',b.accessToken)).json.plan,'free');
 await post(await sub(b,id,'active',new Date(n-10000).toISOString()));assert.equal((await user(b)).subscriptionStatus,'on_hold');
 await send('active');await send('active','pdt_other');assert.equal((await request('/api/billing/entitlements',b.accessToken)).json.plan,'free');
 await send('active');await send('expired');assert.equal((await request('/api/billing/entitlements',b.accessToken)).json.plan,'free');
 assert.equal((await checkout(b,'monthly')).status,200);
});
test('monthly full refund revokes access; delayed subscription event cannot restore it; new paid renewal can',async()=>{
 const b=await buyer();await checkout(b,'monthly');const id='sub_'+randomUUID();
 await post(await sub(b,id,'active'));const p=await payment(b,randomUUID(),'monthly',id);await post(p);
 await post(refund(p.data.payment_id,900));assert.equal((await request('/api/billing/entitlements',b.accessToken)).json.plan,'free');
 await post(await sub(b,id,'active',new Date(Date.now()+1000).toISOString()));assert.equal((await request('/api/billing/entitlements',b.accessToken)).json.plan,'free');
 const renewal=await payment(b,randomUUID(),'monthly',id);renewal.data.created_at=new Date(Date.now()+2000).toISOString();await post(renewal);
 assert.equal((await request('/api/billing/entitlements',b.accessToken)).json.plan,'monthly');
});
test('failed transaction does not consume webhook receipt and retry succeeds',async()=>{
 const b=await buyer();await checkout(b,'monthly');const p=await payment(b,randomUUID(),'monthly');const id=randomUUID();
 // Fail the LAST write, after payment and purchase writes, to test real rollback.
 await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test receipt failure'; END $$`);
 await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_receipt BEFORE INSERT ON "BillingEvent" FOR EACH ROW EXECUTE FUNCTION fail_receipt()`);
 try{assert.equal((await post(p,id)).status,500);}finally{await prisma.$executeRawUnsafe('DROP TRIGGER fail_receipt ON "BillingEvent"');await prisma.$executeRawUnsafe('DROP FUNCTION fail_receipt()');}
 assert.equal(await prisma.billingEvent.count({where:{id:`dodo:test_mode:${id}`}}),0);
 assert.equal(await prisma.dodoPayment.count({where:{id:p.data.payment_id}}),0);
 assert.equal(await prisma.purchase.count({where:{providerOrderId:p.data.payment_id}}),0);
 assert.equal((await post(p,id)).status,200);
});
test('wrong account metadata cannot grant; forged success return has no effect; legacy access stays intact',async()=>{
 const b=await buyer();await checkout(b,'monthly');const p=await payment(b,randomUUID(),'monthly');p.data.metadata.user_id=randomUUID();await post(p);assert.equal((await user(b)).subscriptionStatus,null);
 await prisma.user.update({where:{id:b.user.id},data:{lifetimeAt:new Date()}});await post(event('payment.failed',{}));assert.ok((await user(b)).lifetimeAt);
 assert.equal((await checkout(b,'monthly')).status,409);
});
test('ambiguous remote create failure keeps reservation and retry cannot duplicate a charge',async()=>{
 const b=await buyer();failCreate=true;const before=checkoutCalls;try{const r=await checkout(b,'monthly');assert.equal(r.status,502);assert.doesNotMatch(JSON.stringify(r.json),/secret|test-api-key/);}finally{failCreate=false;}
 assert.equal((await checkout(b,'monthly')).status,409);assert.equal(checkoutCalls,before+1);
});


test('missing configuration returns names only and cannot create checkout', async () => {
 const { config } = await import('../src/config.js');
 const saved = { ...config.dodo };
 const b = await buyer();
 try {
   config.dodo.apiKey = ''; config.dodo.webhookSecret = '';
   const info = await request('/api/billing/config');
   assert.equal(info.json.provider, 'dodo'); assert.equal(info.json.configured, false);
   assert.deepEqual(info.json.missingVariables, ['DODO_PAYMENTS_API_KEY', 'DODO_PAYMENTS_WEBHOOK_KEY']);
   const result = await checkout(b, 'monthly');
   assert.equal(result.status, 503); assert.deepEqual(result.json.missingVariables, info.json.missingVariables);
   assert.doesNotMatch(JSON.stringify([info.json, result.json]), /test-api-key|whsec_/);
   assert.equal(await prisma.billingCheckout.count({ where: { userId: b.user.id } }), 0);
 } finally { Object.assign(config.dodo, saved); }
});

test('untrusted return origin fails before contacting the provider', async () => {
 const { config } = await import('../src/config.js'); const saved = config.dodo.redirectUrl;
 const b = await buyer(), before = checkoutCalls;
 try {
   config.dodo.redirectUrl = 'https://evil.example';
   assert.equal((await checkout(b, 'monthly')).status, 503);
   assert.equal(checkoutCalls, before);
 } finally { config.dodo.redirectUrl = saved; }
});

test('monthly disputes revoke, reject stale updates, restore won disputes, and preserve refunds', async () => {
 const b = await buyer(); await checkout(b, 'monthly'); const sid = 'sub_' + randomUUID();
 await post(await sub(b, sid, 'active'));
 const p = await payment(b, randomUUID(), 'monthly', sid); await post(p);
 const did = randomUUID(); let time = Date.now();
 const change = (status: string, at = time += 1000) => event('dispute.' + status, { dispute_id: did, payment_id: p.data.payment_id, dispute_status: 'dispute_' + status }, new Date(at).toISOString());
 const opened = change('opened'), delivery = randomUUID();
 assert.equal((await post(opened, delivery)).status, 200);
 assert.equal((await post(opened, delivery)).status, 200);
 assert.equal((await request('/api/billing/entitlements', b.accessToken)).json.plan, 'free');
 await post(change('won'));
 assert.equal((await request('/api/billing/entitlements', b.accessToken)).json.plan, 'monthly');
 await post(opened);
 assert.equal((await request('/api/billing/entitlements', b.accessToken)).json.plan, 'monthly');
 await post(change('lost'));
 assert.equal((await request('/api/billing/entitlements', b.accessToken)).json.plan, 'free');
 const renewal = await payment(b, randomUUID(), 'monthly', sid);
 renewal.data.created_at = new Date(Date.now() + 10000).toISOString(); await post(renewal);
 assert.equal((await request('/api/billing/entitlements', b.accessToken)).json.plan, 'monthly');
 await post(refund(renewal.data.payment_id, 900)); await post(change('cancelled'));
 assert.equal((await request('/api/billing/entitlements', b.accessToken)).json.plan, 'free');
});

test('lifetime dispute before payment blocks access; winning restores only an eligible non-refunded purchase', async () => {
 const b = await buyer();
 // Seed an attributable reservation independently of the exhausted promotional slots.
 await prisma.billingCheckout.create({ data: { userId: b.user.id, plan: 'lifetime', productId: 'pdt_lifetime', environment: 'test_mode' } });
 const p = await payment(b), did = randomUUID(); let time = Date.now();
 const change = (status: string) => event('dispute.' + status, { dispute_id: did, payment_id: p.data.payment_id, dispute_status: 'dispute_' + status }, new Date(time += 1000).toISOString());
 await post(change('accepted')); await post(p);
 assert.equal((await user(b)).lifetimeAt, null);
 assert.equal((await prisma.purchase.findUnique({ where: { providerOrderId: p.data.payment_id } })).status, 'disputed');
 await post(change('won')); assert.ok((await user(b)).lifetimeAt);
 await post(change('opened')); assert.equal((await user(b)).lifetimeAt, null);
 await post(refund(p.data.payment_id)); await post(change('cancelled'));
 assert.equal((await user(b)).lifetimeAt, null);
});
