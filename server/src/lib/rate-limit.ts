import type { RequestHandler } from "express";
// Per-process limit; enforce a shared edge limit for multiple API replicas.
export function authRateLimit():RequestHandler {
  const buckets=new Map<string,{count:number;until:number}>();
  const timer=setInterval(()=>{for(const [key,b] of buckets)if(b.until<Date.now())buckets.delete(key);},60000);
  timer.unref();
  return (req,res,next)=>{
    const key=req.ip ?? "unknown",now=Date.now();
    let bucket=buckets.get(key);
    if(!bucket || bucket.until<now){bucket={count:0,until:now+60000};buckets.set(key,bucket);}
    if(++bucket.count>120){res.setHeader("Retry-After","60");res.status(429).json({error:"Too many sign-in attempts. Try again in a minute."});return;}
    next();
  };
}
