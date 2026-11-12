'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');
const S=require('../js/price-sanity');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}
async function checkAsync(name,fn){try{await fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

function floorJob(sqft,style,extra){
  const j=E.newJob();
  Object.assign(j,{customer:'Synthetic',company:'',method:'rates',priceOption:'regular',condition:'sound',patchKits:0,addOnIncluded:false,miles:0,minutes:0,tax:0,discount:0});
  Object.assign(j.areas[0],{name:'Floor area',sqft:sqft,style:style||'solid',flake:'light',coats:1,level:false,moisture:false,grip:false,rate:null,depth:0.25});
  if(extra)Object.assign(j,extra);
  if(extra&&extra.area)Object.assign(j.areas[0],extra.area);
  return j;
}
function repro(rate){
  const j=E.newJob();
  Object.assign(j,{customer:'a',company:'splash',method:'rates',priceOption:'regular',condition:'sound',patchKits:2,addOnIncluded:false,miles:0,minutes:0});
  j.areas=[Object.assign(E.newArea(),{name:'Floor area',sqft:1000,style:'flake',flake:'full',level:true,depth:0.25,moisture:true,rate:rate})];
  return j;
}
function reproSettings(){
  return Q.buildSettings(E,{rates:{flake:10,level:6,patch:150,solid:7,sealer:3,removal:2,metallic:15,moisture:4,extraCoat:1.5,fullFlakeExtra:1,mediumFlakeExtra:0.5}},{});
}
function msgs(x){return (x.blockingIssues||[]).map(b=>b.message).join(' | ')}
function warns(x){return ((x.sanity&&x.sanity.warnings)||[]).map(w=>w.message).join(' | ')}
const JOB='00000000-0000-4000-8000-0000000000aa';
function server(job,role,staff){
  let recorded=0;
  const jobs={[JOB]:{id:JOB,version:1,job_data:job}};
  const deps={
    getProfile:async()=>({id:role==='owner'?'own-1':'emp-1',role:role,active:true}),
    getJob:async()=>jobs[JOB],
    getPriceBook:async()=>({version:1,staff_settings:staff||{},owner_settings:{}}),
    getJobMarkup:async()=>null,
    recordQuote:async()=>{recorded+=1;return 'quote-synthetic'},
    discountStore:null
  };
  return {deps,recorded:()=>recorded};
}

check('shared engine, quote core, and price guard stay byte-identical',()=>{
  for(const name of ['epoxy-engine.js','quote-core.js','price-sanity.js']){
    const a=fs.readFileSync(path.join('js',name),'utf8');
    const b=fs.readFileSync(path.join('supabase/functions/_shared',name),'utf8');
    assert.strictEqual(a,b,name);
  }
});

check('repro rate 1000 is blocked and is not priced',()=>{
  const x=E.calculate(repro(1000),reproSettings());
  assert.notStrictEqual(x.total,1010300);
  assert.strictEqual(x.total,21300);
  assert.strictEqual(x.quoteReady,false);
  assert.ok(x.finalizedBlocked);
  assert.ok(msgs(x).includes('Floor area'));
  assert.ok(msgs(x).includes('This looks like square footage, not a price per sq ft.'),msgs(x));
  assert.ok(!x.lines.some(l=>l.rate===1000));
  assert.notStrictEqual(x.choices.opt1.total,1010300);
  assert.notStrictEqual(x.choices.opt2.total,1010300);
});

check('blank custom rate still prices the repro at $21,300',()=>{
  const x=E.calculate(repro(null),reproSettings());
  assert.strictEqual(x.total,21300);
  assert.strictEqual(x.perSqft,21.3);
  assert.strictEqual(x.quoteReady,true);
  assert.strictEqual((x.blockingIssues||[]).length,0);
  assert.strictEqual(x.choices.opt1.total,19300);
  assert.strictEqual(x.choices.opt2.total,20300);
});

check('approved tier totals are unchanged',()=>{
  const rows=[
    [100,'solid','regular',700],
    [100,'flake','regular',1000],
    [100,'metallic','regular',1500],
    [100,'solid','opt1',500],
    [100,'flake','opt1',800],
    [100,'metallic','opt1',1100],
    [100,'solid','opt2',600],
    [100,'flake','opt2',900],
    [100,'metallic','opt2',1300]
  ];
  for(const [sqft,style,tier,total] of rows){
    const j=floorJob(sqft,style,{priceOption:tier});
    const x=E.calculate(j,E.defaults);
    assert.strictEqual(x.selected.breakdown.finishRate,total/sqft,tier+' '+style);
    assert.strictEqual(x.total,Math.max(total,style==='solid'?2750:2000),tier+' '+style);
    assert.strictEqual((x.blockingIssues||[]).length,0);
    assert.strictEqual((x.sanity.warnings||[]).length,0,warns(x));
  }
  const painted=floorJob(100,'solid',{priceOption:'opt1',condition:'paint'});
  assert.strictEqual(E.calculate(painted,E.defaults).total,2750);
  const wide=floorJob(1200,'metallic',{priceOption:'opt1',addOnIncluded:true});
  const settings=JSON.parse(JSON.stringify(E.defaults));
  settings.addOn.low=9;
  const x=E.calculate(wide,settings);
  assert.strictEqual(x.choices.regular.total,18000);
  assert.strictEqual(x.choices.opt1.total,13200);
  assert.strictEqual(x.choices.opt2.total,15600);
  assert.strictEqual((x.blockingIssues||[]).length,0);
});

check('custom rate boundaries and the square-footage message',()=>{
  const at=rate=>{const j=floorJob(100,'solid',{area:{rate}});return E.calculate(j,E.defaults)};
  assert.strictEqual(at(3).total,2750);
  assert.strictEqual(at(3).quoteReady,true);
  assert.ok(warns(at(3)).includes('outside the usual $5–$15'),warns(at(3)));
  assert.strictEqual(at(20).total,2750);
  assert.strictEqual(at(20).blockingIssues.length,0);
  assert.ok(warns(at(20)).includes('outside the usual $5–$15'));
  assert.strictEqual(at(5).total,2750);
  assert.strictEqual(at(5).sanity.warnings.length,0);
  assert.strictEqual(at(15).total,2750);
  assert.strictEqual(at(15).sanity.warnings.length,0);
  const low=at(2.99);
  assert.strictEqual(low.quoteReady,false);
  assert.strictEqual(low.total,2750);
  assert.ok(msgs(low).includes('Floor area'));
  assert.ok(msgs(low).includes('outside $3–$20'));
  assert.ok(!msgs(low).includes('square footage'));
  const high=at(20.01);
  assert.strictEqual(high.quoteReady,false);
  assert.strictEqual(high.total,2750);
  assert.ok(msgs(high).includes('outside $3–$20'));
  const hundred=at(100);
  assert.ok(msgs(hundred).includes('This looks like square footage, not a price per sq ft.'));
  const same=E.calculate(floorJob(12,'solid',{area:{rate:12,sqft:12}}),E.defaults);
  assert.ok(msgs(same).includes('This looks like square footage, not a price per sq ft.'));
  assert.notStrictEqual(same.total,144);
  assert.strictEqual(same.total,2750);
  assert.strictEqual(same.choices.opt1.total,2750);
});

check('a valid custom rate is still kept on every tier',()=>{
  const j=floorJob(250,'flake',{area:{rate:12},priceOption:'opt1'});
  const x=E.calculate(j,E.defaults);
  assert.strictEqual(x.total,3000);
  assert.strictEqual(x.choices.regular.total,3000);
  assert.strictEqual(x.choices.opt1.total,3000);
  assert.strictEqual(x.choices.opt2.total,3000);
  assert.strictEqual(x.lines.find(l=>l.kind==='finish').customRate,true);
});

check('add-in of $2,250 on 450 sq ft does not block the quote and is not multiplied',()=>{
  const settings=JSON.parse(JSON.stringify(E.defaults));
  settings.addOn.low=2250;
  const j=floorJob(450,'flake',{addOnIncluded:true});
  const x=E.calculate(j,settings);
  assert.notStrictEqual(x.total,1017000);
  assert.strictEqual(x.total,4500);
  assert.ok(S.bookIssues(settings).blocks.some(b=>/Standard add-in/.test(b.message)));
  assert.strictEqual(x.quoteReady,true);
  assert.ok(!msgs(x).includes('Standard add-in / sq ft'));
});

check('option tier rate of $2,250 on 450 sq ft is blocked and not multiplied',()=>{
  const settings=JSON.parse(JSON.stringify(E.defaults));
  settings.pricingOptions.opt1.rates.flake=2250;
  const j=floorJob(450,'flake',{priceOption:'opt1'});
  const x=E.calculate(j,settings);
  assert.notStrictEqual(x.choices.opt1.total,1012500);
  assert.strictEqual(x.choices.opt1.total,4500);
  assert.strictEqual(x.total,4500);
  assert.ok(msgs(x).includes('outside $0–$40'),msgs(x));
  assert.strictEqual(x.quoteReady,false);
});

check('removal at $900 per sq ft is blocked and not multiplied',()=>{
  const settings=JSON.parse(JSON.stringify(E.defaults));
  settings.rates.removal=900;
  const j=floorJob(450,'flake',{condition:'paint'});
  const x=E.calculate(j,settings);
  assert.notStrictEqual(x.total,409500);
  assert.strictEqual(x.total,4500);
  assert.ok(msgs(x).includes('Extra removal / sq ft'),msgs(x));
  assert.strictEqual(x.quoteReady,false);
});

check('per-sqft book boundaries warn above $20 and block above $40',()=>{
  const run=v=>{const s=JSON.parse(JSON.stringify(E.defaults));s.rates.removal=v;return E.calculate(floorJob(100,'solid',{condition:'paint'}),s)};
  assert.strictEqual(run(20).blockingIssues.length,0);
  assert.strictEqual(run(20).sanity.warnings.length,0);
  assert.strictEqual(run(20).lines.find(l=>/removal/i.test(l.label)).total,2000);
  assert.strictEqual(run(20).total,2750);
  const warn=run(20.01);
  assert.strictEqual(warn.blockingIssues.length,0);
  assert.ok(warns(warn).includes('above the usual $20'),warns(warn));
  assert.ok(Math.abs(warn.lines.find(l=>/removal/i.test(l.label)).total-2001)<0.01);
  assert.strictEqual(warn.total,2750);
  const edge=run(40);
  assert.strictEqual(edge.blockingIssues.length,0);
  assert.ok(warns(edge).includes('above the usual $20'));
  const blocked=run(40.01);
  assert.ok(msgs(blocked).includes('outside $0–$40'));
  assert.strictEqual(blocked.total,2750);
});

check('leveling depth above 2 inches is capped and blocked',()=>{
  const j=floorJob(450,'flake',{area:{level:true,depth:25}});
  const x=E.calculate(j,E.defaults);
  assert.notStrictEqual(x.total,274500);
  const level=x.lines.find(l=>/Self-leveling/.test(l.label));
  assert.strictEqual(level.rate,48);
  assert.strictEqual(level.total,21600);
  assert.ok(msgs(x).includes('leveling depth 25 in is above the 2 in cap'),msgs(x));
  assert.strictEqual(x.quoteReady,false);
  const ok=E.calculate(floorJob(450,'flake',{area:{level:true,depth:2}}),E.defaults);
  assert.strictEqual(ok.lines.find(l=>/Self-leveling/.test(l.label)).rate,48);
  assert.ok(!msgs(ok).includes('leveling depth'));
});

check('square footage over 20,000 warns and over 100,000 blocks, with the square-inch hint',()=>{
  const at=sf=>E.calculate(floorJob(sf,'solid'),E.defaults);
  assert.ok(!warns(at(20000)).includes('square inches'),warns(at(20000)));
  assert.ok(!msgs(at(20000)).includes('square inches'));
  const warn=at(20001);
  assert.ok(warns(warn).includes('square inches? divide by 144'),warns(warn));
  assert.ok(warns(warn).includes('Floor area'));
  assert.ok(!msgs(warn).includes('over 100,000'));
  const inches=E.calculate(floorJob(64800,'flake'),E.defaults);
  assert.strictEqual(inches.total,648000);
  assert.ok(warns(inches).includes('square inches? divide by 144'),warns(inches));
  assert.ok(msgs(inches).includes('over $250,000'),msgs(inches));
  assert.strictEqual(inches.quoteReady,false);
  const block=at(100001);
  assert.ok(msgs(block).includes('over 100,000'));
  assert.ok(msgs(block).includes('square inches? divide by 144'));
});

check('catalog garage adjustment stays a flat dollar amount',()=>{
  const settings=JSON.parse(JSON.stringify(E.defaults));
  settings.catalog.garage.twoCarStarting=4000;
  settings.catalog.garage.materialAdj.flake=2250;
  const j=E.newJob();
  Object.assign(j,{customer:'Pat',projectType:'garage',garagePackage:'2car',garageStyle:'flake',garageTopcoat:'protective',garageCondition:'good',miles:0,minutes:0});
  j.areas[0].sqft=450;
  const x=E.calculate(j,settings);
  assert.strictEqual(x.quoteReady,true);
  assert.strictEqual(x.total,5500+2250);
  assert.notStrictEqual(x.total,4000+2250*450);
  assert.notStrictEqual(x.total,4500+2250*450);
  const adj=x.lines.find(l=>l.kind==='adjustment');
  assert.strictEqual(adj.qty,1);
  assert.strictEqual(adj.total,2250);
  assert.strictEqual((x.blockingIssues||[]).length,0);
  const fake=S.review(j,{sqft:0,total:2250*450,lines:[{kind:'adjustment',label:'Material / system (flake)',qty:450,unit:'sq ft',rate:2250,total:2250*450}]});
  assert.ok(fake.blocks.some(b=>/multiplied by sq ft/.test(b.message)));
});

check('a negative catalog adjustment is subtracted from the starting price',()=>{
  const settings=JSON.parse(JSON.stringify(E.defaults));
  settings.catalog.garage.twoCarStarting=4000;
  settings.catalog.garage.materialAdj.flake=-500;
  const j=E.newJob();
  Object.assign(j,{customer:'Pat',projectType:'garage',garagePackage:'2car',garageStyle:'flake',garageTopcoat:'protective',garageCondition:'good',miles:0,minutes:0});
  const x=E.calculate(j,settings);
  assert.strictEqual(x.total,5500-500);
  assert.notStrictEqual(x.total,5500);
});

function garageWithAdj(adj){
  const settings=JSON.parse(JSON.stringify(E.defaults));
  settings.catalog.garage.twoCarStarting=4000;
  settings.catalog.garage.materialAdj.flake=adj;
  const j=E.newJob();
  Object.assign(j,{customer:'Pat',projectType:'garage',garagePackage:'2car',garageStyle:'flake',garageTopcoat:'protective',garageCondition:'good',miles:0,minutes:0});
  return E.calculate(j,settings);
}
check('one catalog add-on: $5,000 passes, over $5,000 warns',()=>{
  const ok=garageWithAdj(5000);
  assert.strictEqual(ok.blockingIssues.length,0);
  assert.ok(!warns(ok).includes('for one catalog add-on'),warns(ok));
  const w=garageWithAdj(5000.01);
  assert.strictEqual(w.blockingIssues.length,0);
  assert.ok(warns(w).includes('over $5,000 for one catalog add-on'),warns(w));
});
check('one catalog add-on: $25,000 warns, over $25,000 blocks',()=>{
  const edge=garageWithAdj(25000);
  assert.strictEqual(edge.blockingIssues.length,0);
  assert.ok(warns(edge).includes('over $5,000 for one catalog add-on'));
  const big=garageWithAdj(90000);
  assert.strictEqual(big.quoteReady,false);
  assert.ok(big.finalizedBlocked);
  assert.ok(msgs(big).includes('over the $25,000 limit for one catalog add-on'),msgs(big));
});
check('catalog add-on cap uses the absolute value, so big credits are caught',()=>{
  const r=S.review({projectType:'garage'},{sqft:0,total:1000,lines:[{kind:'adjustment',label:'Garage credit',qty:1,unit:'ea',rate:-30000,total:-30000}]});
  assert.ok(r.blocks.some(b=>/Garage credit is -\$30,000\.00, over the \$25,000 limit/.test(b.message)),JSON.stringify(r.blocks));
  const r2=S.review({projectType:'garage'},{sqft:0,total:1000,lines:[{kind:'adjustment',label:'Garage credit',qty:1,unit:'ea',rate:-6000,total:-6000}]});
  assert.strictEqual(r2.blocks.length,0);
  assert.ok(r2.warnings.some(w=>/over \$5,000 for one catalog add-on/.test(w.message)));
});
check('price book save flags catalog add-on amounts over the caps',()=>{
  const settings=JSON.parse(JSON.stringify(E.defaults));
  assert.strictEqual(S.bookIssues(settings).blocks.length,0);
  settings.catalog.garage.prepAdj={cracks:6000,coatingRemoval:650};
  settings.catalog.flatwork.materialAdj={metallic:-26000};
  const found=S.bookIssues(settings);
  assert.ok(found.warnings.some(w=>/garage prepAdj cracks.*over \$5,000/.test(w.message)),JSON.stringify(found.warnings));
  assert.ok(found.blocks.some(b=>/flatwork materialAdj metallic.*over the \$25,000 limit/.test(b.message)),JSON.stringify(found.blocks));
  assert.ok(!found.warnings.concat(found.blocks).some(i=>/coatingRemoval/.test(i.message)));
});
check('property / trip add-in is removed: $0 default, an old job with the box checked is not charged',()=>{
  assert.strictEqual(E.defaults.addOn.low,0);
  assert.strictEqual(E.defaults.addOn.high,0);
  const live=Q.buildSettings(E,{rates:{flake:10,solid:7,metallic:15,extraCoat:1.5,fullFlakeExtra:1,mediumFlakeExtra:0.5},addOn:{label:'Standard property / trip add-in',low:0,high:0}},{});
  for(const tier of ['low','high']){
    const on=E.calculate(floorJob(450,'flake',{addOnIncluded:true,addOnTier:tier}),live);
    const off=E.calculate(floorJob(450,'flake',{addOnIncluded:false}),live);
    assert.strictEqual(on.total,off.total);
    assert.strictEqual(on.addOn.included,false);
    assert.ok(!on.lines.some(l=>l.kind==='addon'));
  }
});

check('a normal 2-car garage passes',()=>{
  const settings=JSON.parse(JSON.stringify(E.defaults));
  settings.catalog.garage.twoCarStarting=4500;
  settings.catalog.garage.materialAdj.flake=0;
  const j=E.newJob();
  Object.assign(j,{customer:'Pat',projectType:'garage',garagePackage:'2car',garageStyle:'flake',garageTopcoat:'protective',garageCondition:'good',miles:0,minutes:0});
  const x=E.calculate(j,settings);
  assert.strictEqual(x.quoteReady,true);
  assert.strictEqual(x.total,5500);
  assert.strictEqual(x.blockingIssues.length,0);
  assert.strictEqual(x.sanity.warnings.length,0);
});

check('garage, flatwork, and seating sanity boundaries',()=>{
  const pkg=amt=>({projectType:'garage',garagePackage:'2car'},{sqft:0,total:amt,lines:[{kind:'starting',label:'2-car garage package',unit:'package',rate:amt,total:amt}]});
  assert.strictEqual(S.review({projectType:'garage'},pkg(8000)).warnings.length,0);
  assert.ok(S.review({projectType:'garage'},pkg(8000.01)).warnings.some(w=>/over \$8,000/.test(w.message)));
  assert.strictEqual(S.review({projectType:'garage'},pkg(15000)).blocks.length,0);
  assert.ok(S.review({projectType:'garage'},pkg(15000.01)).blocks.some(b=>/over \$15,000/.test(b.message)));
  function flat(start){
    const settings=JSON.parse(JSON.stringify(E.defaults));
    settings.catalog.flatwork.sizeBands[0].starting=start;
    settings.catalog.flatwork.materialAdj.solid=0;
    const j=E.newJob();
    j.customer='Pat';j.projectType='flatwork';j.miles=0;j.minutes=0;
    const it=E.newFlatItem();it.condition='good';it.length=2;it.width=2;
    j.catalogItems=[it];
    return E.calculate(j,settings);
  }
  assert.ok(!warns(flat(3000)).includes('over $3,000'));
  assert.ok(warns(flat(3000.01)).includes('over $3,000'));
  function seat(start){
    const settings=JSON.parse(JSON.stringify(E.defaults));
    settings.catalog.seating.byType.chair=start;
    settings.catalog.seating.materialAdj.solid=0;
    const j=E.newJob();
    j.customer='Pat';j.projectType='seating';j.miles=0;j.minutes=0;
    const it=E.newSeatItem();it.condition='good';it.qty=1;
    j.catalogItems=[it];
    return E.calculate(j,settings);
  }
  assert.ok(!warns(seat(500)).includes('over $500'));
  assert.ok(warns(seat(500.01)).includes('over $500'));
});

check('blended and measured-total boundaries',()=>{
  const settings=JSON.parse(JSON.stringify(E.defaults));
  settings.rates.removal=25;
  const warn=E.calculate(floorJob(100,'solid',{condition:'paint'}),settings);
  assert.strictEqual(warn.total,3200);
  assert.strictEqual(warn.perSqft,32);
  assert.ok(warns(warn).includes('over $30'));
  assert.strictEqual(warn.blockingIssues.length,0);
  const underSettings=JSON.parse(JSON.stringify(E.defaults));
  underSettings.rates.minimumJob=0;
  const under=E.calculate(floorJob(100,'sealer'),underSettings);
  assert.strictEqual(under.total,300);
  assert.ok(warns(under).includes('under $4'));
  const high=JSON.parse(JSON.stringify(E.defaults));
  high.rates.removal=40;
  const block=E.calculate(floorJob(100,'metallic',{condition:'paint'}),high);
  assert.strictEqual(block.total,1500+4000);
  assert.ok(msgs(block).includes('over $50'),msgs(block));
  const big=E.calculate(floorJob(11000,'solid'),E.defaults);
  assert.strictEqual(big.total,77000);
  assert.ok(warns(big).includes('over $75,000'));
  assert.strictEqual(big.blockingIssues.filter(b=>b.code==='job_total').length,0);
  const huge=E.calculate(floorJob(40000,'solid'),E.defaults);
  assert.ok(msgs(huge).includes('over $250,000'));
});

(async()=>{
  async function record(job,role,staff,extra){
    const ctx=server(job,role,staff);
    const res=await Q.handleQuoteRequest(Object.assign({mode:'record',job_id:JOB},extra||{}),ctx.deps,E);
    return {res,recorded:ctx.recorded()};
  }
  async function preview(job,role,staff){
    const ctx=server(job,role,staff);
    const res=await Q.handleQuoteRequest({mode:'preview',job_id:JOB,job_data:job},ctx.deps,E);
    return res;
  }

  await checkAsync('server rejects the $1,000 override for an owner and keeps the blank rate',async()=>{
    const staff={rates:{flake:10,level:6,patch:150,solid:7,sealer:3,removal:2,metallic:15,moisture:4,extraCoat:1.5,fullFlakeExtra:1,mediumFlakeExtra:0.5}};
    const blocked=await record(repro(1000),'owner',staff);
    assert.strictEqual(blocked.res.status,422);
    assert.strictEqual(blocked.res.body.code,'price_blocked');
    assert.strictEqual(blocked.recorded,0);
    assert.ok(blocked.res.body.error.includes('This looks like square footage, not a price per sq ft.'));
    const employee=await record(repro(1000),'employee',staff,{sanityContinue:true});
    assert.strictEqual(employee.res.status,422);
    assert.strictEqual(employee.recorded,0);
    const open=await record(repro(null),'owner',staff);
    assert.strictEqual(open.res.status,200);
    assert.strictEqual(open.res.body.customer.totals.total,21300);
    assert.strictEqual(open.recorded,1);
    const seen=await preview(repro(1000),'owner',staff);
    assert.strictEqual(seen.status,200);
    assert.ok((seen.body.staff.pendingReasons||[]).join(' ').includes('This looks like square footage, not a price per sq ft.'));
  });

  await checkAsync('server does not block a quote for an unused out-of-range add-in',async()=>{
    const job=floorJob(450,'flake',{addOnIncluded:true});
    const staff={addOn:{low:2250,high:2}};
    const out=await record(job,'owner',staff);
    assert.strictEqual(out.res.status,200);
    assert.strictEqual(out.recorded,1);
    assert.strictEqual(out.res.body.customer.totals.total,4500);
    const seen=await preview(job,'owner',staff);
    assert.notStrictEqual(seen.body.staff.total,1017000);
    assert.strictEqual(seen.body.staff.total,4500);
    assert.ok(S.bookIssues(Q.buildSettings(E,staff,{})).blocks.some(b=>/Standard add-in/.test(b.message)));
  });

  await checkAsync('server blocks an option tier rate of $2,250',async()=>{
    const job=floorJob(450,'flake',{priceOption:'opt1'});
    const staff={pricingOptions:{opt1:{rates:{flake:2250}}}};
    const out=await record(job,'owner',staff);
    assert.strictEqual(out.res.status,422);
    assert.strictEqual(out.recorded,0);
    assert.ok(/outside \$0–\$40/.test(out.res.body.error),out.res.body.error);
    const seen=await preview(job,'owner',staff);
    assert.notStrictEqual(seen.body.staff.total,1012500);
    assert.strictEqual(seen.body.staff.total,4500);
  });

  await checkAsync('server records a catalog adjustment once, not times sq ft',async()=>{
    const job=E.newJob();
    Object.assign(job,{customer:'Pat',projectType:'garage',garagePackage:'2car',garageStyle:'flake',garageTopcoat:'protective',garageCondition:'good',miles:0,minutes:0});
    job.areas[0].sqft=450;
    const staff={catalog:{garage:{twoCarStarting:4000,materialAdj:{flake:2250}}}};
    const out=await record(job,'owner',staff);
    assert.strictEqual(out.res.status,200,JSON.stringify(out.res.body));
    assert.strictEqual(out.recorded,1);
    assert.strictEqual(out.res.body.customer.totals.total,5500+2250);
    assert.notStrictEqual(out.res.body.customer.totals.total,5500+2250*450);
    const adj=out.res.body.customer.catalogAdjustments.find(l=>/flake/i.test(l.label));
    assert.strictEqual(adj.qty,1);
    assert.strictEqual(adj.total,2250);
  });

  await checkAsync('server blocks one catalog add-on over $25,000 and records nothing',async()=>{
    const job=E.newJob();
    Object.assign(job,{customer:'Pat',projectType:'garage',garagePackage:'2car',garageStyle:'flake',garageTopcoat:'protective',garageCondition:'good',miles:0,minutes:0});
    const staff={catalog:{garage:{twoCarStarting:4000,materialAdj:{flake:90000}}}};
    const owner=await record(job,'owner',staff,{sanityContinue:true});
    assert.strictEqual(owner.res.status,422);
    assert.strictEqual(owner.res.body.code,'price_blocked');
    assert.strictEqual(owner.recorded,0);
    assert.ok(owner.res.body.error.includes('over the $25,000 limit for one catalog add-on'),owner.res.body.error);
    const warnStaff={catalog:{garage:{twoCarStarting:4000,materialAdj:{flake:6000}}}};
    const emp=await record(job,'employee',warnStaff,{sanityContinue:true});
    assert.strictEqual(emp.res.status,422);
    assert.strictEqual(emp.res.body.code,'price_warning');
    assert.strictEqual(emp.recorded,0);
  });

  await checkAsync('server blocks 64,800 sq ft entered as square inches',async()=>{
    const job=floorJob(64800,'flake');
    const out=await record(job,'owner',{});
    assert.strictEqual(out.res.status,422);
    assert.strictEqual(out.recorded,0);
    assert.ok(out.res.body.blockingIssues.join(' ').includes('square inches? divide by 144')||out.res.body.error.includes('over $250,000'),JSON.stringify(out.res.body));
    const seen=await preview(job,'employee',{});
    const text=[...(seen.body.staff.pendingReasons||[]),...(seen.body.staff.warnings||[])].join(' ');
    assert.ok(text.includes('square inches? divide by 144'),text);
    assert.ok(text.includes('over $250,000')||text.includes('over 100,000'),text);
  });

  await checkAsync('server blocks a 25 inch leveling depth and a $900 removal rate',async()=>{
    const deep=await record(floorJob(450,'flake',{area:{level:true,depth:25}}),'owner',{});
    assert.strictEqual(deep.res.status,422);
    assert.strictEqual(deep.recorded,0);
    assert.ok(deep.res.body.error.includes('leveling depth 25 in is above the 2 in cap'),deep.res.body.error);
    const peel=await record(floorJob(450,'flake',{condition:'paint'}),'owner',{rates:{removal:900}});
    assert.strictEqual(peel.res.status,422);
    assert.strictEqual(peel.recorded,0);
    assert.ok(peel.res.body.error.includes('Extra removal / sq ft'),peel.res.body.error);
  });

  await checkAsync('a price warning needs the owner, and an employee cannot override it',async()=>{
    const job=floorJob(100,'solid',{area:{rate:4}});
    const employee=await record(job,'employee',{},{sanityContinue:true});
    assert.strictEqual(employee.res.status,422);
    assert.strictEqual(employee.res.body.code,'price_warning');
    assert.strictEqual(employee.recorded,0);
    assert.ok(employee.res.body.error.includes('Employees cannot override'));
    const owner=await record(job,'owner',{});
    assert.strictEqual(owner.res.status,422);
    assert.strictEqual(owner.recorded,0);
    const confirmed=await record(job,'owner',{},{sanityContinue:true});
    assert.strictEqual(confirmed.res.status,200);
    assert.strictEqual(confirmed.res.body.customer.totals.total,2750);
    assert.strictEqual(confirmed.recorded,1);
  });

  if(failed){console.error(failed+' failed');process.exit(1)}
  console.log('all price sanity checks passed');
})().catch(err=>{console.error(err);process.exit(1)});
