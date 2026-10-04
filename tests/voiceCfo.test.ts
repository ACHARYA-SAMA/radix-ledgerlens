import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { LedgerService } from '../server/service.ts';
import { Store } from '../server/store.ts';
import { NovaClient } from '../server/nova.ts';
import { Gemini } from '../server/gemini.ts';
import { buildDataset } from '../server/engine.ts';
import { getPlanning, addLiveTransaction } from '../server/personalFinance.ts';
import { spokenAmount } from '../server/voiceCfo.ts';
import { createApp } from '../server/app.ts';
function fixture() {
  const store=new Store(':memory:');store.setTeam('cfo');
  const s=new LedgerService(store,new NovaClient({key:'test'}),new Gemini({key:''}));
  s.sources={'bank-accounts':[{id:'bank',bank:'Test',account_last4:'0001'}],'bank-transactions':[
    {id:'salary',account_id:'bank',value_date:'2026-09-01',credit:60000,debit:0,raw_narration:'salary'},
    {id:'food',account_id:'bank',value_date:'2026-09-10',credit:0,debit:1000,raw_narration:'Swiggy lunch',counterparty_text:'Swiggy'},
  ]};
  s.snapshot={...buildDataset(s.sources),syncedAt:'2026-09-10',warnings:[]};s.ready=true;s.save();
  const p=getPlanning(s);p.budgets=[{category:'personal',limit:5000},{category:'software',limit:5000},{category:'travel',limit:5000},{category:'rent',limit:80000}];store.put('planning','current',p);return s;
}
test('CFO parses numerical and spoken INR amounts',()=>{
  for(const q of ['12,000','12000','12k','twelve thousand']) assert.equal(spokenAmount(q),12000);
  assert.equal(spokenAmount('Can I afford fifteen thousand rupees for flights?'),15000);
  assert.equal(spokenAmount('one lakh twenty five thousand'),125000);
  assert.equal(spokenAmount('show my spending'),null);
});
test('CFO multi-donor rebalance conserves budgets, protects goals/fixed bills, and deduplicates',async()=>{
 const s=fixture();try {
  const before=getPlanning(s), snapshot=JSON.stringify(s.snapshot);
  const q={query:'Cover urgent 12000 medical expense without touching my Emergency Fund',requestId:'once'};
  const r=await s.voiceCommand(q), after=getPlanning(s);
  assert.equal(r.shortfall,0);assert.equal(r.rebalanceActions.length,4);
  assert.equal(after.budgets.reduce((n,b)=>n+b.limit,0),before.budgets.reduce((n,b)=>n+b.limit,0));
  assert.deepEqual(after.goals,before.goals);assert.equal(after.budgets.find(b=>b.category==='rent')!.limit,80000);
  assert.equal(JSON.stringify(s.snapshot),snapshot);
  await s.voiceCommand(q);assert.equal(getPlanning(s).revision,after.revision);
  await assert.rejects(s.voiceCommand({...q,query:'Cover 500 medical'}),/already used/);
 }finally{s.store.close();}
});
test('CFO honors protected discretionary categories and refuses unaffordable coverage without partial writes',async()=>{
 const s=fixture();try{
  const before=getPlanning(s);
  const r=await s.voiceCommand({query:'Cover 12000 medical without touching travel or my emergency fund',requestId:'protected'});
  assert.ok(r.shortfall!>0);assert.deepEqual(getPlanning(s),before);assert.equal(r.rebalanceActions.length,0);
  await s.voiceCommand({query:"Do not rebalance 1000 medical",requestId:'negative'});assert.deepEqual(getPlanning(s),before);
 }finally{s.store.close();}
});
test('Affordability is non-mutating; audit matches actual merchant rows; trace uses saved stages',async()=>{
 const s=fixture();try{
  const before=getPlanning(s);
  const sim=await s.voiceCommand({query:'Can I afford fifteen thousand for flight tickets?',requestId:'sim'});
  assert.equal(sim.kind,'simulation');assert.equal(sim.amount,15000);assert.deepEqual(getPlanning(s),before);
  const audit=await s.voiceCommand({query:'Show food delivery burn rate and dining anomalies',requestId:'audit'});
  assert.deepEqual(audit.ledgerFilter?.ids,['food']);assert.equal(audit.ledgerFilter?.monthSpend,1000);assert.equal(audit.ledgerFilter?.anomaly,null);
  const tx=addLiveTransaction(s,{requestId:'live',merchant:'Cafe',amount:100,direction:'debit',category:'other_expense',date:'2026-09-10',accountId:'bank',rail:'UPI'},'phone');
  const trace=await s.voiceCommand({query:'Explain how the AI processed my last transaction',requestId:'trace'});
  assert.equal(trace.transactionId,tx.id);assert.equal(trace.stages?.length,6);
 }finally{s.store.close();}
});
test('Voice CFO route is public, validates bodies, and leaves other mutations protected',async()=>{
 const s=fixture(),server=createApp(s,undefined,async()=>false).listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+ (server.address() as {port:number}).port;
 try {
  const r=await fetch(url+'/api/voice-command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'Show food burn rate',requestId:'http'})});
  assert.equal(r.status,200);assert.equal((await r.json()).kind,'audit');
  assert.equal((await fetch(url+'/api/voice-command',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
  assert.equal((await fetch(url+'/api/planning',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));s.store.close();}
});
