'use strict';
const assert=require('assert');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');
const DA=require('../js/discount-approval');

const JOB='00000000-0000-4000-8000-0000000000aa';
let n=0;
function nextId(){n+=1;return '00000000-0000-4000-8000-'+String(n).padStart(12,'0')}
function floor(tier){
  const j=E.newJob();
  j.id=JOB;j.customer='Synthetic';j.tax=0;j.discount=0;j.miles=0;j.minutes=0;j.addOnIncluded=false;
  j.priceOption=tier;j.areas[0].sqft=1000;j.areas[0].style='solid';j.areas[0].coats=1;
  j.areas[0].moisture=false;j.areas[0].level=false;j.areas[0].grip=false;
  return j;
}
const saved=[];
function deps(store,profile,jobs){
  return {
    discountStore:store,
    getProfile:async()=>profile,
    getJob:async(id)=>jobs[id]||null,
    getPriceBook:async()=>({version:6,staff_settings:{},owner_settings:{}}),
    getJobMarkup:async()=>null,
    recordQuote:async(args)=>{saved.push(args);return 'quote-synthetic'}
  };
}

(async()=>{
  const store=DA.createStore({idFactory:nextId});
  const employee={id:'emp-1',role:'employee',active:true};
  const owner={id:'own-1',role:'owner',active:true};
  const jobs={};jobs[JOB]={id:JOB,version:14,job_data:floor('regular')};

  const plain=await Q.handleQuoteRequest({mode:'record',job_id:JOB},deps(store,owner,jobs),E);
  assert.strictEqual(plain.status,200);
  assert.strictEqual(Q.recordedDiscountAmount(plain.body.customer),0);
  assert.strictEqual(plain.body.customer.totals.total,7000);
  assert.strictEqual(saved[0].p_customer_snapshot.totals.discount,0);

  saved.length=0;
  const asked=await Q.handleQuoteRequest({mode:'discount-request',job_id:JOB,amount:100,reason:'TEST'},deps(store,employee,jobs),E);
  assert.strictEqual(asked.body.customerTotal,7000);
  const id=asked.body.request.id;
  jobs[JOB].job_data.discountApprovalId=id;
  const pending=await Q.handleQuoteRequest({mode:'record',job_id:JOB},deps(store,owner,jobs),E);
  assert.strictEqual(pending.status,422);
  assert.strictEqual(saved.length,0);

  await Q.handleQuoteRequest({mode:'discount-decide',id,decision:'reject'},deps(store,owner,jobs),E);
  const rejected=await Q.handleQuoteRequest({mode:'preview',job_id:JOB,job_data:jobs[JOB].job_data},deps(store,owner,jobs),E);
  assert.strictEqual(rejected.body.staff.discount,0);
  assert.strictEqual(rejected.body.staff.total,7000);

  jobs[JOB].job_data=floor('regular');
  const asked2=await Q.handleQuoteRequest({mode:'discount-request',job_id:JOB,amount:100,reason:'TEST'},deps(store,employee,jobs),E);
  const id2=asked2.body.request.id;
  await Q.handleQuoteRequest({mode:'discount-decide',id:id2,decision:'approve'},deps(store,owner,jobs),E);
  jobs[JOB].job_data.discountApprovalId=id2;
  const recorded=await Q.handleQuoteRequest({mode:'record',job_id:JOB},deps(store,owner,jobs),E);
  assert.strictEqual(recorded.status,200);
  assert.strictEqual(recorded.body.customer.totals.total,6900);
  assert.strictEqual(recorded.body.customer.totals.discount,100);
  assert.strictEqual(Q.recordedDiscountAmount(recorded.body.customer),100);
  assert.strictEqual(recorded.body.staff.discount,100);
  assert.strictEqual(recorded.body.staff.choices.regular.total,6900);
  assert.strictEqual(recorded.body.staff.choices.opt1.total,5000);
  assert.strictEqual(recorded.body.staff.choices.opt2.total,6000);
  assert.strictEqual(saved.length,1);
  assert.strictEqual(saved[0].p_total,6900);
  assert.strictEqual(saved[0].p_customer_snapshot.totals.discount,100);
  assert.strictEqual(saved[0].p_customer_snapshot.totals.total,6900);
  console.log('quote discount column checks passed');
})().catch(err=>{console.error(err);process.exit(1)});
