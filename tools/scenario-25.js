'use strict';
/* 25 named scenarios. Expected selling math is written out here, not copied from the function under test.
 * Prices are synthetic fixtures. City names do not change rates. Not a live login or live database proof.
 */
const fs=require('fs');
const path=require('path');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');
const P=require('../js/pack-billing');
const CB=require('../js/es-costbook');

const SELL={solid:8,flake:10,metallic:15,sealer:3};

function settings(){
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.rates.solid=SELL.solid; s.rates.flake=SELL.flake; s.rates.metallic=SELL.metallic; s.rates.sealer=SELL.sealer;
  s.costs.waste=0; s.costs.purchaseTax=0; s.costs.minimum=0;
  s.products.primer.size=3; s.products.primer.price=30; s.products.primer.coverage=250; s.products.primer.unit='gal';
  s.catalog.garage.oneCarStarting=1000;
  s.catalog.garage.twoCarStarting=2000;
  s.catalog.garage.threeCarStarting=3000;
  s.catalog.garage.disclaimer='SYNTHETIC: perfect new slab, no issues. Extra cost if the slab is not that simple.';
  const z={solid:0,flake:0,metallic:0,sealer:0,custom:0};
  s.catalog.garage.materialAdj=Object.assign({},z);
  s.catalog.garage.topcoatAdj={protective:0,none:0,premium:0};
  s.catalog.garage.conditionAdj={unknown:0,good:0,fair:0,poor:0,critical:0,sound:0,paint:0,adhesive:0};
  s.catalog.garage.prepAdj={cracks:0,spalling:0,coatingRemoval:0,patching:0,leveling:0,moisture:0};
  s.catalog.flatwork.sizeBands[0].starting=400;
  s.catalog.flatwork.materialAdj.solid=0;
  s.catalog.flatwork.topcoatAdj.protective=0;
  s.catalog.flatwork.conditionAdj.good=0;
  s.catalog.flatwork.conditionAdj.unknown=0;
  s.catalog.seating.byType.chair=180;
  s.catalog.seating.materialAdj.solid=0;
  s.catalog.seating.topcoatAdj.protective=0;
  s.catalog.seating.conditionAdj.good=0;
  s.catalog.seating.conditionAdj.unknown=0;
  return s;
}
function floorJob(sqft,style,city){
  const j=E.newJob();
  j.customer='Synthetic'; j.tax=0; j.discount=0; j.miles=0; j.minutes=0; j.addOnIncluded=false; j.method='rates';
  j.projectType='floor'; j.address=city; j.condition='sound';
  j.areas[0].sqft=sqft; j.areas[0].style=style; j.areas[0].coats=1; j.areas[0].color='Gray'; j.areas[0].moisture=false; j.areas[0].grip=false; j.areas[0].level=false;
  return j;
}
function garageJob(pkg,style,condition,city){
  const j=floorJob(0,style,city);
  j.projectType='garage'; j.garagePackage=pkg; j.garageStyle=style; j.garageTopcoat='protective'; j.garageCondition=condition; j.garagePrep={cracks:false,spalling:false,coatingRemoval:false,patching:false,leveling:false,moisture:false};
  return j;
}

const rows=[];
function add(row){rows.push(row)}
function packExpect(required,packSize){
  if(!(required>0))return {packs:0,billed:0,status:'zero'};
  if(!(packSize>0))return {packs:null,billed:null,status:'unresolved'};
  const packs=Math.ceil(required/packSize-1e-10);
  return {packs,billed:Math.round(packs*packSize*1000)/1000,status:'ok'};
}

function sellingCase(id,name,city,job,expected,extra){
  const x=E.calculate(job,settings());
  const pass=x.total===expected.total && !!x.quoteReady===!!expected.ready && x.packBilling.addToInstalledTotal===false;
  add(Object.assign({
    id,name,layer:'engine-local',locale:city,priceSource:'synthetic fixture; floor 8/10/15/3 are the approved selling rates, not a city average',
    expectedTotal:expected.total,actualTotal:x.total,quoteReady:x.quoteReady,finalizedBlocked:x.finalizedBlocked,
    packAddedToCustomer:x.packBilling.addToInstalledTotal,scope:x.catalog?x.catalog.scopeTotal:null,
    disclaimerApplies:job.projectType==='garage'&&job.garagePackage!=='measured',
    garageFeature:job.projectType==='garage'?job.garagePackage:'not-applicable',
    zeroClass:x.total===0?(x.quoteReady?'finalized-zero-FAIL':'blocked-or-incomplete-zero'):'nonzero',
    pass:pass&&!(x.total===0&&x.quoteReady),
    reason:pass?'':'selling total or readiness differed',
    visibility:'engine only — not a live role test'
  },extra||{}));
}

sellingCase('S01','floor-chicago-100-solid','Chicago, IL',floorJob(100,'solid','Chicago, IL'),{total:800,ready:true});
sellingCase('S02','floor-phoenix-100-solid','Phoenix, AZ',floorJob(100,'solid','Phoenix, AZ'),{total:800,ready:true},{note:'Same footage and rate as S01. City label did not change the Chicago baseline rate.'});
sellingCase('S03','floor-chicago-250-flake','Chicago, IL',floorJob(250,'flake','Chicago, IL'),{total:2500,ready:true});
sellingCase('S04','floor-dallas-40-metallic','Dallas, TX',floorJob(40,'metallic','Dallas, TX'),{total:600,ready:true},{travel:'miles left 0; not a verified route'});

const z=floorJob(0,'solid','Chicago, IL');
sellingCase('S05','floor-chicago-zero-sqft','Chicago, IL',z,{total:0,ready:false},{zeroClass:'blocked-or-incomplete-zero'});

sellingCase('S06','garage-1car-chicago-flake','Chicago, IL',garageJob('1car','flake','good','Chicago, IL'),{total:1000,ready:true});
sellingCase('S07','garage-2car-milwaukee-flake','Milwaukee, WI',garageJob('2car','flake','good','Milwaukee, WI'),{total:2000,ready:true},{note:'City did not change the package start.'});
sellingCase('S08','garage-3car-chicago-flake','Chicago, IL',garageJob('3car','flake','good','Chicago, IL'),{total:3000,ready:true});

(function(){
  const s=settings(); s.catalog.garage.materialAdj.sealer=-1500;
  const j=garageJob('1car','sealer','good','Chicago, IL');
  const x=E.calculate(j,s);
  const scope=1000+(-1500);
  add({id:'S09',name:'garage-1car-unsafe-negative-delta',layer:'engine-local',locale:'Chicago, IL',priceSource:'synthetic start 1000 and synthetic flat -1500; not a sourced average',
    expectedScope:scope,actualScope:x.catalog.scopeTotal,expectedTotal:0,actualTotal:x.total,quoteReady:x.quoteReady,finalizedBlocked:x.finalizedBlocked,
    disclaimerApplies:true,garageFeature:'1car',zeroClass:'blocked-or-incomplete-zero',
    pass:x.catalog.scopeTotal===scope&&x.quoteReady===false&&x.finalizedBlocked===true&&x.total===0&&x.catalog.scopeTotal<0,
    reason:x.catalog.scopeTotal===scope?'blocked non-positive scope, not rewritten to a free quote':'scope was clamped or mis-added',
    visibility:'engine only'});
})();
(function(){
  const s=settings(); s.catalog.garage.materialAdj.sealer=-2000;
  const j=garageJob('2car','sealer','good','Chicago, IL');
  const x=E.calculate(j,s);
  add({id:'S10',name:'garage-2car-unsafe-zero-scope',layer:'engine-local',locale:'Chicago, IL',priceSource:'synthetic start 2000 and flat -2000',
    expectedScope:0,actualScope:x.catalog.scopeTotal,actualTotal:x.total,quoteReady:x.quoteReady,
    disclaimerApplies:true,garageFeature:'2car',zeroClass:'blocked-or-incomplete-zero',
    pass:x.catalog.scopeTotal===0&&x.quoteReady===false&&x.total===0,
    reason:'zero scope stays blocked, not a finalized free quote',visibility:'engine only'});
})();
sellingCase('S11','garage-1car-unknown-condition','Chicago, IL',garageJob('1car','flake','unknown','Chicago, IL'),{total:0,ready:false},{disclaimerApplies:true,zeroClass:'blocked-or-incomplete-zero'});

const measured=garageJob('measured','flake','good','Naperville, IL'); measured.areas[0].sqft=200;
sellingCase('S12','garage-measured-200-flake','Naperville, IL',measured,{total:2000,ready:true},{disclaimerApplies:false,garageFeature:'measured',note:'Package disclaimer does not apply. Floor flake rate does.'});

(function(){
  const s=settings();
  const j=E.newJob(); j.customer='Synthetic'; j.tax=0; j.discount=0; j.addOnIncluded=false; j.projectType='flatwork'; j.address='Chicago, IL';
  j.catalogItems=[{name:'Top',length:2,width:2,sizeBand:'small',style:'solid',topcoat:'protective',condition:'good',customStarting:''}];
  const x=E.calculate(j,s);
  add({id:'S13',name:'flatwork-small-chicago',layer:'engine-local',locale:'Chicago, IL',priceSource:'synthetic band 400',expectedTotal:400,actualTotal:x.total,quoteReady:x.quoteReady,
    garageFeature:'not-applicable',disclaimerApplies:false,zeroClass:x.total===0?'blocked-or-incomplete-zero':'nonzero',
    pass:x.total===400&&x.quoteReady===true,reason:'size-band start, blank override ignored',visibility:'engine only'});
})();
(function(){
  const s=settings();
  const j=E.newJob(); j.customer='Synthetic'; j.tax=0; j.addOnIncluded=false; j.projectType='flatwork'; j.address='Austin, TX';
  j.catalogItems=[{name:'Odd',length:2,width:2,sizeBand:'nope',style:'solid',topcoat:'protective',condition:'good'}];
  const x=E.calculate(j,s);
  const msg=(x.pendingReasons||[]).join(' ');
  add({id:'S14',name:'flatwork-blank-override-austin',layer:'engine-local',locale:'Austin, TX',priceSource:'no band; optional override blank',expectedTotal:0,actualTotal:x.total,quoteReady:x.quoteReady,
    garageFeature:'not-applicable',disclaimerApplies:false,zeroClass:'blocked-or-incomplete-zero',
    pass:x.quoteReady===false&&/not a missing package price/.test(msg),reason:msg.slice(0,180),visibility:'engine only'});
})();
(function(){
  const s=settings();
  const j=E.newJob(); j.customer='Synthetic'; j.tax=0; j.addOnIncluded=false; j.projectType='seating'; j.address='Chicago, IL';
  j.catalogItems=[{name:'Chair',seatType:'chair',qty:2,style:'solid',topcoat:'protective',condition:'good'}];
  const x=E.calculate(j,s);
  add({id:'S15',name:'seating-two-chairs-chicago',layer:'engine-local',locale:'Chicago, IL',priceSource:'synthetic 180 per chair',expectedTotal:360,actualTotal:x.total,quoteReady:x.quoteReady,
    garageFeature:'not-applicable',disclaimerApplies:false,zeroClass:'nonzero',pass:x.total===360&&x.quoteReady===true,reason:'2 × 180',visibility:'engine only'});
})();
(function(){
  const s=settings();
  const j=E.newJob(); j.customer='Synthetic'; j.tax=0; j.addOnIncluded=false; j.projectType='seating'; j.address='Denver, CO';
  j.catalogItems=[{name:'Stool',seatType:'stool',qty:1,style:'solid',topcoat:'protective',condition:'unknown'}];
  s.catalog.seating.byType.stool=150;
  const x=E.calculate(j,s);
  add({id:'S16',name:'seating-unknown-denver',layer:'engine-local',locale:'Denver, CO',priceSource:'synthetic stool 150; unknown condition blocks',expectedTotal:0,actualTotal:x.total,quoteReady:x.quoteReady,
    garageFeature:'not-applicable',disclaimerApplies:false,zeroClass:'blocked-or-incomplete-zero',pass:x.quoteReady===false&&x.total===0,reason:(x.pendingReasons||[]).join(' ').slice(0,160),visibility:'engine only'});
})();

function packCase(id,name,required,packSize,extra){
  const exp=extra&&extra.expect?extra.expect:packExpect(required,packSize);
  const actual=P.wholePack(Object.assign({required,packSize},extra&&extra.opts||{}));
  const pass=actual.status===exp.status&&actual.packs===exp.packs&&actual.billedQty===exp.billed;
  add({id,name,layer:'pack-billing-local',locale:'not a priced city',priceSource:'synthetic pack fixture',
    expectedPacks:exp.packs,actualPacks:actual.packs,expectedBilled:exp.billed,actualBilled:actual.billedQty,packStatus:actual.status,
    quoteReady:false,zeroClass:exp.status==='zero'?'zero-packs-not-a-quote':'n/a',
    garageFeature:'not-applicable',disclaimerApplies:false,pass,reason:actual.reason,visibility:'not a role test'});
}
packCase('S17','pack-zero-usage',0,3);
packCase('S18','pack-two-of-three',2,3);
packCase('S19','pack-exact-three',3,3);
packCase('S20','pack-just-over-three',3.01,3,{expect:{packs:2,billed:6,status:'ok'}});
packCase('S21','pack-two-exact-packs',6,3);
packCase('S22','pack-missing-size',2,0,{expect:{packs:null,billed:null,status:'unresolved'}});
packCase('S23','pack-unit-mismatch',2,3,{opts:{requiredUnit:'gal',packUnit:'lb'},expect:{packs:null,billed:null,status:'unresolved'}});

(function(){
  const s=settings();
  const j=floorJob(0,'solid','Chicago, IL');
  j.areas=[{id:'a',name:'A',sqft:250,style:'solid',coats:1,color:'Gray',moisture:false,grip:false,level:false,depth:0.25},{id:'b',name:'B',sqft:250,style:'solid',coats:1,color:'Gray',moisture:false,grip:false,level:false,depth:0.25}];
  const x=E.calculate(j,s);
  const primer=(x.material||[]).find(m=>m.key==='primer');
  add({id:'S24',name:'floor-two-areas-aggregated-primer',layer:'engine-local',locale:'Chicago, IL',priceSource:'synthetic primer pack 3 gal, coverage 250, waste 0',
    expectedTotal:4000,actualTotal:x.total,expectedPacks:1,actualPacks:primer&&primer.packs,expectedBilled:3,actualBilled:primer&&primer.billedQty,
    quoteReady:x.quoteReady,packAddedToCustomer:x.packBilling.addToInstalledTotal,garageFeature:'not-applicable',disclaimerApplies:false,zeroClass:'nonzero',
    pass:x.total===4000&&primer&&primer.packs===1&&primer.billedQty===3&&x.packBilling.addToInstalledTotal===false,
    reason:'Two 1-gal needs share one 3-gal pack. Pack dollars are not added to the 4000 installed total.',visibility:'engine only'});
})();

(async function(){
  const cat={items:[{id:'syn',product:'SYNTHETIC RESIN',consumable_type:'CONSUMABLE',verified_unit_cost:10,customer_material_price:25,unit_size:'1 gal'}]};
  Q.setCostbookCatalog(cat);
  const job={projectType:'floor',customer:'Synthetic',address:'Chicago, IL',areas:[{id:'a',name:'Floor',sqft:10,style:'solid'}],costbook:{selections:[{id:'syn',qty:2}],depositOrPayment:5,includeCustomerMaterialCharge:false,overrides:{}}};
  const stored={id:'00000000-0000-4000-8000-000000000001',version:1,job_data:job};
  const deps=profile=>({getProfile:async()=>profile,getJob:async()=>stored,getPriceBook:async()=>({version:4,staff_settings:{},owner_settings:{}}),getJobMarkup:async()=>null,recordQuote:async()=>'q'});
  const employee=await Q.handleQuoteRequest({mode:'record',job_id:stored.id},deps({active:true,role:'employee',id:'e'}),E);
  const owner=await Q.handleQuoteRequest({mode:'preview',job_id:stored.id,job_data:job},deps({active:true,role:'owner',id:'o'}),E);
  const staffBlob=JSON.stringify(employee.body.staff||{});
  const custBlob=JSON.stringify(employee.body.customer||{});
  const leak=/"profit"|"margin"|"verified_unit_cost"|"internal_material_total"/.test(staffBlob)||/"profit"|"verified_unit_cost"/.test(custBlob);
  Q.setCostbookCatalog(null);
  add({id:'S25',name:'deposit-block-and-role-snapshots',layer:'quote-core-local-mock',locale:'Chicago, IL',priceSource:'synthetic resin cost 10 and customer material price 25 — not a live vendor cost',
    payment:5,expectedInternalHold:20,actualInternalHold:owner.body.internal&&owner.body.internal.internal_material_total,
    employeeStatus:employee.status,employeeCode:employee.body.code,ownerBlocked:owner.body.acceptanceBlocked,
    leak,disclaimerApplies:false,garageFeature:'not-applicable',quoteReady:false,zeroClass:'acceptance-blocked',
    pass:employee.status===422&&employee.body.code==='ACCEPTANCE_BLOCK'&&owner.body.internal.internal_material_total===20&&!leak,
    reason:leak?'sensitive key leaked to employee or customer snapshot':'local mock only — not live RLS or a browser session',
    visibility:'local mock of handleQuoteRequest. Live employee/customer browser and token tests were not run.'});

  if(rows.length!==25){console.error('expected 25 scenarios, got',rows.length);process.exit(1)}
  const counts={pass:0,fail:0,blocked:0};
  for(const r of rows){if(r.pass)counts.pass++;else counts.fail++;if(r.zeroClass&&r.zeroClass!=='nonzero'&&r.zeroClass!=='n/a')counts.blocked++}
  const out={generatedBy:'tools/scenario-25.js',layerNote:'engine, pack-billing, and quote-core local mock. No live Supabase, no browser login, no geocoding.',counts,rows};
  const dir=path.join(__dirname,'..','docs');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'scenario-25-results.json'),JSON.stringify(out,null,2)+'\n');
  const headers=['id','name','layer','locale','pass','quoteReady','expectedTotal','actualTotal','expectedPacks','actualPacks','expectedBilled','actualBilled','zeroClass','garageFeature','disclaimerApplies','reason'];
  const csv=[headers.join(',')].concat(rows.map(r=>headers.map(h=>{const v=r[h]==null?'':String(r[h]);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(',')));
  fs.writeFileSync(path.join(dir,'scenario-25-results.csv'),csv.join('\n')+'\n');
  const md=['# 25-scenario review','','Local engine and quote-core mock only. Not live access control and not a routed drive.','',
    'Pass '+counts.pass+' / fail '+counts.fail+' / rows with a blocked or incomplete zero '+counts.blocked+'.','',
    '| ID | Name | Locale | Result | Actual total | Note |','| --- | --- | --- | --- | --- | --- |'];
  for(const r of rows)md.push('| '+r.id+' | '+r.name+' | '+r.locale+' | '+(r.pass?'pass':'FAIL')+' | '+(r.actualTotal==null?'—':r.actualTotal)+' | '+String(r.reason||'').replace(/\|/g,'/')+' |');
  md.push('','City labels do not change selling rates. S01 and S02 are the pair that shows that.','','Command: `node tools/scenario-25.js`');
  fs.writeFileSync(path.join(dir,'scenario-25-report.md'),md.join('\n')+'\n');
  console.log(JSON.stringify(counts));
  if(counts.fail)process.exit(1);
})().catch(err=>{console.error(err);process.exit(1)});
