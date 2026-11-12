'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');
const P=require('../js/price-proposals');
const View=require('../js/es-estimate-view');

const JOB_ID='00000000-0000-4000-8000-000000000001';
let failed=0;
function check(name,fn){
  try{fn();console.log('ok',name);}
  catch(err){failed++;console.error('FAIL',name,err&&err.stack||err);}
}
async function checkAsync(name,fn){
  try{await fn();console.log('ok',name);}
  catch(err){failed++;console.error('FAIL',name,err&&err.stack||err);}
}

const rows=P.inventory(E.defaults);
const byPath=Object.fromEntries(rows.map(r=>[r.path,r]));

check('null stays unconfigured and is not zero',()=>{
  assert.strictEqual(byPath['catalog.garage.materialAdj.metallic'].valueState,'unconfigured');
  assert.strictEqual(byPath['catalog.garage.topcoatAdj.protective'].valueState,'configured_zero');
  assert.strictEqual(byPath['rates.solid'].valueState,'configured_amount');
  assert.notStrictEqual(byPath['catalog.garage.materialAdj.metallic'].valueState,byPath['catalog.garage.topcoatAdj.protective'].valueState);
  assert.strictEqual(byPath['catalog.garage.materialAdj.solid.twoCar'].valueState,'configured_amount');
});

check('missing key is not treated as a stored zero',()=>{
  const odd=P.inventory({catalog:{garage:{}}});
  const row=odd.find(r=>r.path==='catalog.garage.oneCarStarting');
  assert.strictEqual(row.presence,'missing');
  assert.strictEqual(row.valueState,'unconfigured');
  assert.strictEqual(row.proposed,null);
});

check('owner-confirmed floor rates stay inactive',()=>{
  assert.strictEqual(P.activationChangesQuotes(undefined),false);
  assert.strictEqual(P.SOURCED_ESTIMATES.length,0);
  const same=P.applyActivation(E.defaults,{});
  assert.strictEqual(same.rates.solid,E.defaults.rates.solid);
  assert.strictEqual(same.rates.flake,E.defaults.rates.flake);
  assert.strictEqual(same.rates.metallic,E.defaults.rates.metallic);
  assert.strictEqual(same.costs.labor,E.defaults.costs.labor);
  assert.strictEqual(same.products.primer.price,E.defaults.products.primer.price);
  const job=E.newJob();
  job.areas[0].sqft=100;job.areas[0].style='solid';
  assert.strictEqual(E.calculate(job,same).total,E.calculate(job,E.defaults).total);
});

check('activation never overwrites a configured rate or seeds a flat',()=>{
  const next=P.applyActivation(E.defaults,{applyOwnerConfirmedFloorSelling:true,applySourcedEstimates:true});
  assert.strictEqual(next.rates.solid,E.defaults.rates.solid);
  assert.strictEqual(next.rates.flake,E.defaults.rates.flake);
  assert.strictEqual(next.catalog.garage.materialAdj.sealer,null);
  assert.deepStrictEqual(next.catalog.garage.materialAdj.solid,E.defaults.catalog.garage.materialAdj.solid);
  assert.strictEqual(next.costs.markup,E.defaults.costs.markup);
  const job=E.newJob();
  job.areas[0].sqft=100;job.areas[0].style='solid';
  assert.strictEqual(E.calculate(job,next).total,E.calculate(job,E.defaults).total);
});

check('sourced flag with an empty dataset changes nothing',()=>{
  const next=P.applyActivation(E.defaults,{applySourcedEstimates:true});
  assert.deepStrictEqual(next.rates,E.defaults.rates);
  assert.deepStrictEqual(next.costs,E.defaults.costs);
});

check('public inventory omits product and cost amounts',()=>{
  const pub=P.publicInventory(E.defaults);
  const primer=pub.find(r=>r.path==='products.primer.price');
  const labor=pub.find(r=>r.path==='costs.labor');
  const solid=pub.find(r=>r.path==='rates.solid');
  assert.strictEqual(primer.proposed,null);
  assert.strictEqual(labor.proposed,null);
  assert.strictEqual(solid.proposed,null);
  assert.strictEqual(solid.confirmedLive,7);
  assert.strictEqual(solid.estimateFlag,false);
  assert.strictEqual(solid.reviewStatus,'preserved_live_selling');
  const text=JSON.stringify(pub.filter(r=>r.audience!=='selling'));
  assert.strictEqual(text.includes(String(E.defaults.costs.labor)),false);
  assert.strictEqual(text.includes(String(E.defaults.products.primer.price)),false);
  assert.strictEqual(text.includes(String(E.defaults.products.flake.price)),false);
});

check('redacted employee book must not be used as the audit source',()=>{
  const redacted=Q.redactedStaffSettings(E,{});
  const labor=P.inventory(redacted).find(r=>r.path==='costs.labor');
  assert.strictEqual(labor.valueState,'configured_zero');
  assert.notStrictEqual(E.defaults.costs.labor,0);
});

check('committed inventory matches the generator and has no cost amounts',()=>{
  const disk=fs.readFileSync(path.join(__dirname,'..','docs/field-inventory.md'),'utf8');
  assert.strictEqual(disk,P.inventoryMarkdown(E.defaults));
  assert.strictEqual(disk.includes(String(E.defaults.costs.labor)),false);
  assert.strictEqual(disk.includes(String(E.defaults.products.primer.price)),false);
  assert.strictEqual(disk.includes(String(E.defaults.costs.markup)),false);
  assert.strictEqual(disk.includes(String(E.defaults.products.flake.price)),false);
});

check('review html is owner-only and does not invent averages',()=>{
  assert.strictEqual(P.proposalReviewHTML(E.defaults,false),'');
  const html=P.proposalReviewHTML(E.defaults,true);
  assert.ok(html.includes('Not on customer quotes'));
  assert.ok(html.includes('Activation stays off'));
  assert.ok(html.includes('>7<'));
  assert.ok(html.includes('>10<'));
  assert.ok(html.includes('>15<'));
  assert.strictEqual(html.includes('Vendor costs are not loaded'),true);
  assert.strictEqual(html.includes(String(E.defaults.costs.labor)),false);
  assert.strictEqual(P.reviewModel(E.defaults).costbookV8,'not_in_this_pull_request');
  assert.strictEqual(P.reviewModel(E.defaults).wholePackBilling,'not_in_this_pull_request');
});

function floorJob(){
  const job=E.newJob();
  job.customer='Synthetic Customer';
  job.areas[0].sqft=100;
  job.areas[0].style='solid';
  job.projectType='floor';
  return job;
}

check('customer and staff snapshots drop sensitive keys',()=>{
  const job=floorJob();
  const settings=JSON.parse(JSON.stringify(E.defaults));
  settings.proposal={solid:8,provenance:'should not travel'};
  settings.notes='Approved customer wording only.';
  const x=E.calculate(job,settings);
  const customer=Q.customerSnapshotSafe(E,job,x,settings);
  const staff=Q.staffSnapshotSafe(E,job,x,settings);
  const blob=JSON.stringify({customer,staff});
  for(const key of ['"profit"','"margin"','"markup"','"provenance"','"proposal"','"products"','"internal"','"grossMargin"','"operatingMargin"']){
    assert.strictEqual(blob.includes(key),false,key);
  }
  assert.ok(customer.totals.total>0);
  assert.strictEqual(customer.priceNotes,'Approved customer wording only.');
  const poisoned=Q.scrubSensitive({totals:{total:10},profit:5,internal:{cost:9},allocation:{labor:3},products:{primer:{price:210}}});
  assert.strictEqual(poisoned.profit,undefined);
  assert.strictEqual(poisoned.internal,undefined);
  assert.strictEqual(poisoned.products,undefined);
  assert.strictEqual(poisoned.allocation.labor,3);
});

function garageJob(pkg,style,prep){
  const job=E.newJob();
  job.projectType='garage';
  job.garagePackage=pkg;
  job.garageStyle=style;
  job.garageTopcoat='protective';
  job.garageCondition='good';
  job.garagePrep=Object.assign({cracks:false,spalling:false,coatingRemoval:false,patching:false,leveling:false,moisture:false},prep||{});
  job.customer='Synthetic';
  job.miles=0;job.minutes=0;
  return job;
}
check('garage packages keep flake-tier pricing and block sealer, custom, critical, and flat leveling',()=>{
  const safe=JSON.parse(JSON.stringify(E.defaults));
  safe.catalog.garage.materialAdj.sealer=-3150;
  safe.catalog.garage.materialAdj.custom=-3150;
  safe.catalog.garage.conditionAdj.critical=-3150;
  safe.catalog.garage.prepAdj.leveling=-3150;
  const flake=E.calculate(garageJob('2car','flake'),safe);
  assert.strictEqual(flake.quoteReady,true);
  assert.strictEqual(flake.catalog.scopeTotal,4500);
  assert.strictEqual(flake.total,4500);
  const solid=E.calculate(garageJob('2car','solid'),safe);
  assert.strictEqual(solid.quoteReady,true);
  assert.strictEqual(solid.catalog.scopeTotal,4500-1350);
  assert.strictEqual(solid.total,3150);
  const one=E.calculate(garageJob('1car','sealer'),safe);
  assert.strictEqual(one.quoteReady,false);
  assert.strictEqual(one.catalog.scopeTotal,2500);
  assert.strictEqual(one.finalizedBlocked,true);
  assert.strictEqual(one.total,0);
  assert.ok(one.pendingReasons.some(r=>/not a supported garage-package preset/.test(r)));
  assert.ok(!one.lines.some(l=>l.total===-3150));
  const custom=E.calculate(garageJob('2car','custom'),safe);
  assert.strictEqual(custom.quoteReady,false);
  assert.strictEqual(custom.catalog.scopeTotal,4500);
  assert.ok(custom.pendingReasons.some(r=>/Custom garage scope/.test(r)));
  const criticalJob=garageJob('2car','flake');
  criticalJob.garageCondition='critical';
  const critical=E.calculate(criticalJob,safe);
  assert.strictEqual(critical.quoteReady,false);
  assert.strictEqual(critical.catalog.scopeTotal,4500);
  assert.ok(critical.pendingReasons.some(r=>/Critical slab/.test(r)));
  const leveled=E.calculate(garageJob('3car','flake',{leveling:true}),safe);
  assert.strictEqual(leveled.quoteReady,false);
  assert.strictEqual(leveled.catalog.scopeTotal,6500);
  assert.ok(leveled.pendingReasons.some(r=>/Leveling on a garage package/.test(r)));
  assert.strictEqual(P.SOURCED_ESTIMATES.length,0);
  assert.strictEqual(E.defaults.catalog.garage.materialAdj.sealer,null);
});

check('a credit larger than the flake-tier start still blocks without a free quote',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.catalog.garage.materialAdj.solid={oneCar:-3000,twoCar:-1350,threeCar:-1950};
  const j=garageJob('1car','solid');
  j.priceOption='opt1';
  const x=E.calculate(j,s);
  assert.strictEqual(x.quoteReady,false);
  assert.strictEqual(x.total,0);
  assert.ok(x.catalog.scopeTotal<=0);
  assert.ok(x.pendingReasons.some(r=>/exceed the starting price/.test(r)));
  assert.ok(x.pendingReasons.some(r=>/not rewritten to a free/.test(r)));
});

check('price-sanity caps still block an unbounded floor rate',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.rates.solid=1000;
  const j=floorJob();
  const x=E.calculate(j,s);
  assert.strictEqual(x.quoteReady,false);
  assert.notStrictEqual(x.total,100000);
});

check('configured unknown condition still prices',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.catalog.garage.conditionAdj.unknown=150;
  const j=garageJob('2car','flake');
  j.garageCondition='unknown';
  const ready=E.calculate(j,s);
  assert.strictEqual(ready.quoteReady,true);
  assert.strictEqual(ready.total,4500+150);
});

check('flake yield factors stay at the current flagged values',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.costs.waste=0; s.products.flake.size=1; s.products.flake.price=1; s.products.flake.unit='lb';
  function demand(flake){
    const j=E.newJob(); j.customer='Synthetic'; j.tax=0; j.addOnIncluded=false; j.miles=0; j.projectType='floor'; j.condition='sound';
    j.areas[0].sqft=flake==='full'?7:flake==='medium'?125:250; j.areas[0].style='flake'; j.areas[0].flake=flake; j.areas[0].color='Gray';
    const row=E.calculate(j,s).material.find(m=>m.key==='flake');
    return row&&row.demand;
  }
  assert.strictEqual(demand('full'),1);
  assert.strictEqual(demand('medium'),1);
  assert.strictEqual(demand('light'),1);
});

check('optional flatwork override blank is not called a missing package price',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.catalog.flatwork.sizeBands[0].starting=400;
  s.catalog.flatwork.materialAdj.solid=0;
  s.catalog.flatwork.topcoatAdj.protective=0;
  s.catalog.flatwork.conditionAdj.good=0;
  const job=E.newJob();
  job.projectType='flatwork';
  job.catalogItems=[{name:'Top',kind:'countertop',length:2,width:2,sqft:'',sizeBand:'nope',style:'solid',topcoat:'protective',condition:'good'}];
  const x=E.calculate(job,s);
  assert.strictEqual(x.quoteReady,false);
  assert.ok(x.pendingReasons.some(r=>/blank override is not a missing package price/.test(r)));
});

check('customer page allowlist ignores sibling internal payload',()=>{
  const html=View.render({
    estimate:{quoteReady:true,business:{name:'Exotic Splash'},customer:{name:'Synthetic Customer'},document:{type:'estimate',number:'ES-TEST'},totals:{subtotal:100,total:100},lines:[{label:'Solid floor',qty:10,unit:'sq ft',total:100}],terms:'Synthetic terms'},
    internal:{cost:123456,profit:99},
    issued_at:'2026-11-09',
    expires_at:'2026-12-09'
  });
  assert.strictEqual(html.includes('123456'),false);
  assert.strictEqual(html.includes('profit'),false);
  assert.ok(html.includes('Synthetic Customer'));
  assert.ok(html.includes('Read-only'));
});

function deps(profile,stored){
  return {
    getProfile:async()=>profile,
    getJob:async()=>stored||null,
    getPriceBook:async()=>({version:1,staff_settings:{},owner_settings:{}}),
    getJobMarkup:async()=>null,
    recordQuote:async()=>'quote-test'
  };
}

(async()=>{
  await checkAsync('anonymous and inactive staff are rejected',async()=>{
    const anon=await Q.handleQuoteRequest({mode:'preview',job_data:{areas:[{sqft:10}]}},deps(null),E);
    assert.strictEqual(anon.status,403);
    const inactive=await Q.handleQuoteRequest({mode:'preview',job_data:{areas:[{sqft:10}]}},deps({active:false,role:'employee',id:'e'}),E);
    assert.strictEqual(inactive.status,403);
    const unknown=await Q.handleQuoteRequest({mode:'preview',job_data:{areas:[{sqft:10}]}},deps({active:true,role:'worker',id:'w'}),E);
    assert.strictEqual(unknown.status,403);
  });

  await checkAsync('employee quote response has no internal snapshot',async()=>{
    const job={projectType:'floor',areas:[{id:'a',name:'Floor',sqft:100,style:'solid'}],profit:999,markup:80,cost:999};
    const res=await Q.handleQuoteRequest({mode:'preview',job_data:job},deps({active:true,role:'employee',id:'e'}),E);
    assert.strictEqual(res.status,200);
    assert.strictEqual(res.body.internal,undefined);
    const blob=JSON.stringify(res.body);
    assert.strictEqual(blob.includes('"profit"'),false);
    assert.strictEqual(blob.includes('"markup"'),false);
    assert.strictEqual(blob.includes('999'),false);
    assert.ok(res.body.staff.total>0);
  });

  await checkAsync('owner preview receives internal figures and employee record does not',async()=>{
    const stored={id:JOB_ID,version:3,job_data:{projectType:'floor',customer:'Synthetic',areas:[{id:'a',name:'Floor',sqft:250,style:'flake'}]}};
    const owner=await Q.handleQuoteRequest({mode:'preview',job_id:JOB_ID,job_data:stored.job_data},deps({active:true,role:'owner',id:'o'},stored),E);
    assert.strictEqual(owner.status,200);
    assert.strictEqual(typeof owner.body.internal.profit,'number');
    assert.strictEqual(typeof owner.body.internal.cost,'number');
    const employee=await Q.handleQuoteRequest({mode:'record',job_id:JOB_ID},deps({active:true,role:'employee',id:'e'},stored),E);
    assert.strictEqual(employee.status,200);
    assert.strictEqual(employee.body.internal,undefined);
    assert.ok(employee.body.customer);
    const blob=JSON.stringify(employee.body.customer);
    assert.strictEqual(blob.includes('"profit"'),false);
    assert.strictEqual(blob.includes('"cost"'),false);
    assert.strictEqual(employee.body.customer.customer.name!==undefined,true);
  });

  if(failed){
    console.error(failed+' failed');
    process.exit(1);
  }
  console.log('all visibility checks passed');
})();
