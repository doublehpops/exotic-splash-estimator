'use strict';
const assert=require('assert');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');
const DA=require('../js/discount-approval');

const JOB='00000000-0000-4000-8000-000000000010';
const OTHER='00000000-0000-4000-8000-000000000011';
let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}
async function checkAsync(name,fn){try{await fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

function floor(sqft,style,tier){
  const j=E.newJob();
  j.id=JOB;j.customer='Synthetic';j.tax=0;j.discount=0;j.miles=0;j.minutes=0;j.addOnIncluded=false;
  j.priceOption=tier||'regular';j.areas[0].sqft=sqft;j.areas[0].style=style;j.areas[0].coats=1;j.areas[0].flake='light';
  j.areas[0].moisture=false;j.areas[0].level=false;j.areas[0].grip=false;
  return j;
}
function quote(job,settings){return E.calculate(job,settings||E.defaults)}

const tiers={regular:{solid:7,flake:10,metallic:15},opt1:{solid:5,flake:8,metallic:11},opt2:{solid:6,flake:9,metallic:13}};
for(const [tier,rates] of Object.entries(tiers)){
  for(const style of ['solid','flake','metallic']){
    check(tier+' '+style+' is '+rates[style],()=>{
      const x=quote(floor(100,style,tier));
      assert.strictEqual(x.total,100*rates[style]);
      assert.strictEqual(x.selected.key,tier);
    });
  }
}

check('option 1 is bank transfer 50/50 and option 2 is 50/25/25',()=>{
  const opt1=quote(floor(100,'solid','opt1'));
  const opt2=quote(floor(100,'flake','opt2'));
  assert.strictEqual(opt1.selected.payMethod,'bank transfer');
  assert.deepStrictEqual(opt1.selected.payments.map(p=>p.pct),[50,50]);
  assert.deepStrictEqual(opt1.selected.payments.map(p=>p.label),['Booking','Final walkthrough']);
  assert.deepStrictEqual(opt1.selected.payments.map(p=>p.amount),[250,250]);
  assert.deepStrictEqual(opt2.selected.payments.map(p=>p.pct),[50,25,25]);
  assert.strictEqual(opt2.selected.payments[2].label,'Within 14 days');
  assert.strictEqual(opt2.selected.payments.reduce((s,p)=>s+p.amount,0),900);
});

check('regular keeps job terms and does not add a 40 percent discount',()=>{
  const x=quote(floor(100,'solid','regular'));
  assert.strictEqual(x.selected.payments.length,0);
  assert.strictEqual(x.total,700);
  assert.notStrictEqual(x.total,420);
});

check('removal stays priced and no material surcharge is added',()=>{
  const j=floor(100,'solid','opt1');
  j.condition='paint';
  const x=quote(j);
  assert.strictEqual(x.total,500+200);
  assert.strictEqual(x.lines.some(l=>/surcharge|upcharge/i.test(l.label)),false);
});

check('typed discount does not change the total without approval',()=>{
  const j=floor(100,'flake','opt2');
  j.discount=300;
  j.discountApproval={ok:true,amount:300};
  const forged=quote(Object.assign({},j,{discountApproval:{ok:true,amount:300}}));
  const bare=quote(floor(100,'flake','opt2'));
  assert.strictEqual(bare.total,900);
  assert.strictEqual(forged.total,600);
});

function deps(store,profile,jobs){
  return {
    discountStore:store,
    getProfile:async()=>profile,
    getJob:async(id)=>jobs[id]||null,
    getPriceBook:async()=>({version:1,staff_settings:{},owner_settings:{}}),
    getJobMarkup:async()=>null,
    recordQuote:async()=>'quote-synthetic'
  };
}

(async()=>{
  const store=DA.createStore();
  const employee={id:'emp-1',role:'employee',active:true};
  const owner={id:'own-1',role:'owner',active:true};
  const jobs={};
  jobs[JOB]={id:JOB,version:1,job_data:floor(100,'solid','regular')};
  const ed=deps(store,employee,jobs);
  const od=deps(store,owner,jobs);

  await checkAsync('employee request leaves the customer total unchanged',async()=>{
    const res=await Q.handleQuoteRequest({mode:'discount-request',job_id:JOB,amount:100,reason:'Synthetic courtesy',role:'owner'},ed,E);
    assert.strictEqual(res.status,200);
    assert.strictEqual(res.body.customerTotal,700);
    assert.strictEqual(res.body.request.status,'pending');
    assert.strictEqual(res.body.request.amount,100);
    jobs[JOB].job_data.discountApprovalId=res.body.request.id;
    jobs[JOB].job_data.discount=100;
    const preview=await Q.handleQuoteRequest({mode:'preview',job_id:JOB,job_data:jobs[JOB].job_data,role:'owner'},ed,E);
    assert.strictEqual(preview.body.staff.total,700);
    assert.strictEqual(preview.body.discountStatus,'pending');
  });

  await checkAsync('employee cannot self-approve or forge a role',async()=>{
    const id=jobs[JOB].job_data.discountApprovalId;
    const denied=await Q.handleQuoteRequest({mode:'discount-decide',id,decision:'approve',role:'owner'},ed,E);
    assert.strictEqual(denied.status,403);
    assert.strictEqual(store.get(id).status,'pending');
  });

  await checkAsync('owner cannot change the amount while approving',async()=>{
    const id=jobs[JOB].job_data.discountApprovalId;
    const tamper=await Q.handleQuoteRequest({mode:'discount-decide',id,decision:'approve',amount:1},od,E);
    assert.strictEqual(tamper.status,409);
    assert.strictEqual(tamper.body.code,'tamper');
    assert.strictEqual(store.get(id).status,'pending');
    const ok=await Q.handleQuoteRequest({mode:'discount-decide',id,decision:'approve',ownerNote:'owner only'},od,E);
    assert.strictEqual(ok.status,200);
    assert.strictEqual(ok.body.request.ownerNote,undefined);
    assert.strictEqual(store.ownerGet(id).ownerNote,'owner only');
  });

  await checkAsync('approved reduction is the customer total and a second record is rejected',async()=>{
    const first=await Q.handleQuoteRequest({mode:'record',job_id:JOB},ed,E);
    assert.strictEqual(first.status,200);
    assert.strictEqual(first.body.customer.totals.total,600);
    const customerText=JSON.stringify(first.body.customer);
    assert.strictEqual(customerText.includes('ownerNote'),false);
    assert.strictEqual(customerText.includes('markup'),false);
    assert.strictEqual(customerText.includes('"profit"'),false);
    assert.strictEqual(first.body.internal,undefined);
    const replay=await Q.handleQuoteRequest({mode:'record',job_id:JOB},ed,E);
    assert.strictEqual(replay.status,422);
    assert.strictEqual(replay.body.code,'replay');
    const again=await Q.handleQuoteRequest({mode:'preview',job_id:JOB,job_data:jobs[JOB].job_data},ed,E);
    assert.strictEqual(again.body.staff.total,700);
  });

  await checkAsync('a rejected request and a cross-estimate approval do not reduce price',async()=>{
    const fresh=DA.createStore();
    const local=deps(fresh,employee,jobs);
    const asked=await Q.handleQuoteRequest({mode:'discount-request',job_id:JOB,percent:10,reason:'Ten percent'},local,E);
    const id=asked.body.request.id;
    await Q.handleQuoteRequest({mode:'discount-decide',id,decision:'reject'},deps(fresh,owner,jobs),E);
    jobs[JOB].job_data.discountApprovalId=id;
    const rejected=await Q.handleQuoteRequest({mode:'preview',job_id:JOB,job_data:jobs[JOB].job_data},local,E);
    assert.strictEqual(rejected.body.staff.total,700);
    const otherJob=floor(100,'metallic','opt1');
    otherJob.id=OTHER;
    jobs[OTHER]={id:OTHER,version:1,job_data:otherJob};
    const cross=await Q.handleQuoteRequest({mode:'preview',job_id:OTHER,job_data:Object.assign({},otherJob,{discountApprovalId:id,discount:150})},deps(fresh,employee,jobs),E);
    assert.strictEqual(cross.body.staff.total,1100);
  });

  await checkAsync('an edited estimate makes the approval stale',async()=>{
    const fresh=DA.createStore();
    const asked=await Q.handleQuoteRequest({mode:'discount-request',job_id:JOB,amount:50,reason:'Small courtesy'},deps(fresh,employee,jobs),E);
    const id=asked.body.request.id;
    await Q.handleQuoteRequest({mode:'discount-decide',id,decision:'approve'},deps(fresh,owner,jobs),E);
    jobs[JOB].job_data=floor(80,'solid','regular');
    jobs[JOB].job_data.discountApprovalId=id;
    jobs[JOB].job_data.discount=50;
    const stale=await Q.handleQuoteRequest({mode:'record',job_id:JOB},deps(fresh,owner,jobs),E);
    assert.strictEqual(stale.status,422);
    assert.strictEqual(stale.body.code,'stale_approval');
    assert.strictEqual(fresh.get(id).status,'stale');
  });

  await checkAsync('negative, zero, full, and empty requests are refused',async()=>{
    const fresh=DA.createStore();
    const local=deps(fresh,employee,jobs);
    jobs[JOB].job_data=floor(100,'solid','regular');
    for(const body of [{amount:-5,reason:'no'},{amount:0,reason:'no'},{amount:700,reason:'wipe'},{percent:100,reason:'wipe'},{amount:10,reason:''},{amount:10,percent:10,reason:'both'}]){
      const res=await Q.handleQuoteRequest(Object.assign({mode:'discount-request',job_id:JOB},body),local,E);
      assert.notStrictEqual(res.status,200,JSON.stringify(body));
    }
  });

  await checkAsync('share record without approval does not drop the price',async()=>{
    const fresh=DA.createStore();
    jobs[JOB].job_data=floor(100,'metallic','regular');
    jobs[JOB].job_data.discount=500;
    jobs[JOB].job_data.paid=1;
    const res=await Q.handleQuoteRequest({mode:'record',job_id:JOB,deposit:1},deps(fresh,employee,jobs),E);
    assert.strictEqual(res.status,422);
    assert.strictEqual(res.body.code,'discount_not_approved');
  });

  const shapes=[
    ['chicago solid 100',100,'solid','Chicago, IL',700],
    ['phoenix solid 100',100,'solid','Phoenix, AZ',700],
    ['chicago flake 250',250,'flake','Chicago, IL',2500],
    ['dallas metallic 40',40,'metallic','Dallas, TX',600]
  ];
  check('adopted regular tier across cities does not invent a local rate',()=>{
    for(const [name,sqft,style,city,total] of shapes){
      const j=floor(sqft,style,'regular');j.address=city;
      assert.strictEqual(quote(j).total,total,name);
    }
  });

  check('a 1200 sq ft metallic quote reconciles headline, finish, extras, and payments',()=>{
    const j=floor(1200,'metallic','opt1');
    j.addOnIncluded=true;
    const s=JSON.parse(JSON.stringify(E.defaults));
    s.addOn.low=9;
    const x=E.calculate(j,s);
    const regular=x.choices.regular, opt1=x.choices.opt1, opt2=x.choices.opt2;
    assert.strictEqual(regular.breakdown.finishAmount,18000);
    assert.strictEqual(opt1.breakdown.finishAmount,13200);
    assert.strictEqual(opt2.breakdown.finishAmount,15600);
    assert.strictEqual(regular.breakdown.extrasAmount,10800);
    for(const c of [regular,opt1,opt2]){
      assert.strictEqual(c.breakdown.reconciles,true);
      assert.strictEqual(c.paymentsReconcile,true);
      assert.strictEqual(c.total,c.breakdown.finishAmount+c.breakdown.extrasAmount);
      if(c.payments.length)assert.strictEqual(c.payments.reduce((sum,p)=>sum+p.amount,0),c.total);
    }
    assert.strictEqual(regular.total,28800);
    assert.strictEqual(opt1.total,24000);
    assert.strictEqual(opt2.total,26400);
    assert.strictEqual(opt1.payments.length,2);
    assert.strictEqual(opt2.payments.length,3);
    const oldFinishOnlyPct=(18000-(6*1200))/18000*100;
    assert.strictEqual(oldFinishOnlyPct,60);
    assert.ok(Math.abs(opt1.savingsPct-oldFinishOnlyPct)>1);
    assert.strictEqual(Math.round(opt1.savingsPct*100)/100,Math.round((4800/28800)*100*100)/100);
    assert.notStrictEqual(Math.round(opt2.savingsPct),67);
  });

  await checkAsync('server preview uses the same reconciled total as the calculator',async()=>{
    const fresh=DA.createStore();
    const j=floor(1200,'metallic','opt2');
    j.addOnIncluded=true;
    const staff={addOn:{label:'Standard property / trip add-in',low:9,high:2}};
    const res=await Q.handleQuoteRequest({mode:'preview',job_data:j},{
      discountStore:fresh,
      getProfile:async()=>({id:'emp-1',role:'employee',active:true}),
      getJob:async()=>null,
      getPriceBook:async()=>({version:1,staff_settings:staff,owner_settings:{}}),
      getJobMarkup:async()=>null,
      recordQuote:async()=>'quote-synthetic'
    },E);
    assert.strictEqual(res.status,200);
    const selected=res.body.staff.selected;
    assert.strictEqual(selected.total,26400);
    assert.strictEqual(selected.breakdown.reconciles,true);
    assert.strictEqual(selected.paymentsReconcile,true);
    assert.strictEqual(selected.payments.length,3);
    const customer=Q.customerSnapshot(E,j,E.calculate(j,Q.buildSettings(E,staff,{})),Q.buildSettings(E,staff,{}));
    const chosen=customer.options.find(o=>o.key==='opt2');
    assert.strictEqual(chosen.total,selected.total);
    assert.strictEqual(chosen.reconciles,true);
  });

  if(failed){console.error(failed+' failed');process.exit(1)}
  console.log('all payment tier checks passed');
})();
