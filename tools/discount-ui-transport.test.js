'use strict';
/* Loads the built guided app and sends discount actions through a recorded transport.
 * The transport stands in for quote-job. It is not the offline da_/local- store. */
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');
const DA=require('../js/discount-approval');
const DC=require('../js/discount-client');

const calls=[];
let seq=0;
function uuid(){seq+=1;return '10000000-0000-4000-8000-'+String(seq).padStart(12,'0')}
const store=DA.createStore({idFactory:uuid});
const JOB='20000000-0000-4000-8000-000000000001';
const profiles={owner:{id:'own-1',role:'owner',active:true},employee:{id:'emp-1',role:'employee',active:true}};
let actor='owner';
const jobs={};
jobs[JOB]={id:JOB,version:14,job_data:null};

async function transport(body){
  calls.push({mode:body.mode,job_id:body.job_id,id:body.id,amount:body.amount,reason:body.reason,decision:body.decision});
  const res=await Q.handleQuoteRequest(body,{
    discountStore:store,
    getProfile:async()=>profiles[actor],
    getJob:async(id)=>jobs[id]||null,
    getPriceBook:async()=>({version:6,staff_settings:{},owner_settings:{}}),
    getJobMarkup:async()=>null,
    recordQuote:async()=>'quote-synthetic'
  },E);
  if(!res.body||res.body.ok!==true){
    const err=new Error(res.body&&res.body.error||'failed');
    err.code=res.body&&res.body.code;
    throw err;
  }
  return res.body;
}

const els={};
function el(id){
  if(!els[id])els[id]={id,innerHTML:'',textContent:'',hidden:false,className:'',style:{},value:'',addEventListener(){},focus(){},contains(){return false},querySelector(){return null},querySelectorAll(){return []},appendChild(){},setAttribute(){},removeAttribute(){},classList:{add(){},remove(){},toggle(){},contains(){return false}}};
  return els[id];
}
const document={
  getElementById:el,
  addEventListener(){},
  createElement(){return el('node')},
  querySelector(){return null},
  querySelectorAll(){return []}
};
const window={
  EpoxyEngine:E,EsQuoteCore:Q,EsDiscountApproval:DA,EsDiscountClient:DC,
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},
  location:{hash:'',href:'http://127.0.0.1/'},
  addEventListener(){},
  setTimeout,clearTimeout,alert(){}
};
window.window=window;window.document=document;
const context=vm.createContext(window);
for(const file of ['js/guided-app.js']){
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
}
const G=window.GuidedApp;
G.boot({mode:'auth',profile:{role:'owner',active:true,id:'own-1'},settings:E.defaults,jobs:[],discountCall:transport,requestPreview(){}});
const j=G.activeJob();
j._serverId=JOB;
j.customer='Synthetic';j.tax=0;j.discount=0;j.miles=0;j.minutes=0;j.addOnIncluded=false;
j.priceOption='regular';
j.areas[0].sqft=1000;j.areas[0].style='solid';j.areas[0].coats=1;j.areas[0].moisture=false;j.areas[0].level=false;
j.discountRequestAmount=100;j.discountRequestReason='TEST';
jobs[JOB].job_data=G.quoteInput(j);

(async()=>{
  const before=G.calc();
  assert.strictEqual(before.choices.regular.total,7000);
  assert.strictEqual(before.choices.opt1.total,5000);
  assert.strictEqual(before.choices.opt2.total,6000);
  await G.requestExtraDiscount();
  assert.strictEqual(calls[0].mode,'discount-request');
  assert.strictEqual(calls[0].job_id,JOB);
  assert.strictEqual(calls[0].amount,100);
  assert.strictEqual(calls[0].reason,'TEST');
  assert.ok(DC.isServerApprovalId(j.discountApprovalId));
  assert.notStrictEqual(String(j.discountApprovalId).slice(0,3),'da_');
  assert.strictEqual(j.discountServerStatus,'pending');
  const pending=G.calc();
  assert.strictEqual(pending.choices.regular.total,7000);
  assert.strictEqual(pending.choices.opt1.total,5000);
  actor='employee';
  await G.decideExtraDiscount('approve');
  assert.strictEqual(j.discountServerStatus,'pending','employee self-approval must not change the status');
  actor='owner';
  await G.decideExtraDiscount('approve');
  assert.strictEqual(calls.at(-1).mode,'discount-decide');
  assert.strictEqual(calls.at(-1).id,j.discountApprovalId);
  assert.strictEqual(j.discountServerStatus,'approved');
  jobs[JOB].job_data=G.quoteInput(j);
  const priced=await Q.handleQuoteRequest({mode:'preview',job_id:JOB,job_data:jobs[JOB].job_data},{
    discountStore:store,getProfile:async()=>profiles.owner,getJob:async()=>jobs[JOB],
    getPriceBook:async()=>({version:6,staff_settings:{},owner_settings:{}}),getJobMarkup:async()=>null,recordQuote:async()=>'x'
  },E);
  assert.strictEqual(priced.body.staff.choices.regular.total,6900);
  assert.strictEqual(priced.body.staff.choices.opt1.total,5000);
  assert.strictEqual(priced.body.staff.choices.opt2.total,6000);
  const forged=await DC.requestDiscount(async()=>({ok:true,request:{id:'da_1',status:'pending'}}),{serverId:JOB,amount:100,reason:'TEST'});
  assert.strictEqual(forged.ok,false);
  assert.strictEqual(forged.code,'invalid_approval_id');

  // Same-day job numbers must not collide. The first job came from boot(); add two more.
  const first=G.activeJob();
  const prefix='ES-'+first.date.replaceAll('-','')+'-';
  assert.strictEqual(first.number,prefix+'01');
  const second=G.guidedJob();G.state.jobs.push(second);
  const third=G.guidedJob();G.state.jobs.push(third);
  assert.strictEqual(second.number,prefix+'02');
  assert.strictEqual(third.number,prefix+'03');
  assert.strictEqual(new Set(G.state.jobs.map(x=>x.number)).size,G.state.jobs.length);
  assert.strictEqual(G.guidedJob({number:'ES-20200101-07'}).number,'ES-20200101-07','loaded jobs keep their number');
  console.log('ui transport checks passed');
})().catch(err=>{console.error(err);process.exit(1)});
