'use strict';
/* Exactly 25 estimator JOBS. Expected selling totals are handwritten.
 * Selling baseline is live staff v4: solid 8, flake 10, metallic 15, packages 1900/3150/4900.
 * Purchase costs and pack selling prices in this file are synthetic fixtures.
 * The private evidence file is counted only. Its dollar amounts are not written here.
 */
const fs=require('fs');
const path=require('path');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');
const PB=require('../js/pack-billing');

const DISCLAIMER='Garage package starting prices assume a perfect, new slab with no issues (sound concrete, no coating removal, no major cracks/spalling, no moisture mitigation, no adhesive/paint failures). They are not a simple poor-and-set price. Any condition, prep, or moisture issues will add cost and may move the job to measured pricing or a custom quote.';
const SYN_PACK=90; // synthetic customer price for one 3-gal pack. Not a vendor cost.

function settings(opts){
  opts=opts||{};
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.rates.solid=8; s.rates.flake=10; s.rates.metallic=15; s.rates.sealer=3;
  s.costs.waste=0; s.costs.purchaseTax=0; s.costs.minimum=0;
  s.catalog.garage.oneCarStarting=1900;
  s.catalog.garage.twoCarStarting=3150;
  s.catalog.garage.threeCarStarting=4900;
  s.catalog.garage.disclaimer=DISCLAIMER;
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
  s.catalog.seating.byType.stool=150;
  s.catalog.seating.materialAdj.solid=0;
  s.catalog.seating.topcoatAdj.protective=0;
  s.catalog.seating.conditionAdj.good=0;
  s.catalog.seating.conditionAdj.unknown=0;
  s.packBilling={enforceFullPackCoverage:opts.enforce!==false};
  for(const p of Object.values(s.products)){
    p.price=10; // synthetic purchase fixture
    p.customerPackPrice=opts.packPrice==null?1:opts.packPrice;
  }
  if(opts.primerPack!=null)s.products.primer.customerPackPrice=opts.primerPack;
  if(opts.dropPrimerPrice)s.products.primer.customerPackPrice=null;
  if(opts.dropPrimerCost)s.products.primer.price=null;
  if(opts.dropPrimerSize)s.products.primer.size=null;
  return s;
}
function baseJob(city){
  const j=E.newJob();
  j.customer='Synthetic'; j.tax=0; j.discount=0; j.miles=0; j.minutes=0;
  j.addOnIncluded=false; j.method='rates'; j.address=city; j.condition='sound';
  return j;
}
function floor(sqft,style,city){
  const j=baseJob(city);
  j.projectType='floor';
  j.areas[0].sqft=sqft; j.areas[0].style=style; j.areas[0].coats=1; j.areas[0].color='Gray';
  j.areas[0].moisture=false; j.areas[0].grip=false; j.areas[0].level=false;
  return j;
}
function garage(pkg,style,condition,city){
  const j=floor(0,style,city);
  j.projectType='garage'; j.garagePackage=pkg; j.garageStyle=style;
  j.garageTopcoat='protective'; j.garageCondition=condition;
  j.garagePrep={cracks:false,spalling:false,coatingRemoval:false,patching:false,leveling:false,moisture:false};
  return j;
}
function leaks(job,s,x){
  const staff=Q.staffSnapshotSafe(E,job,x,s);
  const customer=Q.customerSnapshotSafe(E,job,x,s);
  const internal=Q.internalSnapshot(x,job.markup,job);
  const bad=/"profit"|"margin"|"markupPct"|"verified_unit_cost"|"unitPrice"|"internal_material_total"/;
  return {
    employeeLeak:bad.test(JSON.stringify(staff)),
    customerLeak:bad.test(JSON.stringify(customer)),
    ownerCostField:internal&&Object.prototype.hasOwnProperty.call(internal,'cost')
  };
}
function disclaimerOn(job,s){
  const text=(s.catalog&&s.catalog.garage&&s.catalog.garage.disclaimer||'').trim();
  const applies=job.projectType==='garage'&&job.garagePackage!=='measured'&&!!text;
  const literal=/perfect,\s*new slab/i.test(text)&&/no issues/i.test(text)&&/add cost/i.test(text);
  return {applies,literal:applies?literal:true,textOk:literal};
}

const rows=[];
function run(spec){
  const s=spec.settings||settings();
  const x=E.calculate(spec.job,s);
  const role=leaks(spec.job,s,x);
  const disc=disclaimerOn(spec.job,s);
  const line=(x.packBilling&&x.packBilling.lines||[]).find(l=>l.key===(spec.focus||'primer'));
  const arithmetic=spec.expect.total==null?true:x.total===spec.expect.total;
  const ready=!!x.quoteReady===!!spec.expect.ready;
  const finalized=!!x.quoteReady&&!x.finalizedBlocked;
  const finalizedOk=finalized===!!spec.expect.finalized;
  const packOk=spec.expect.packs==null?true:(line&&line.packs===spec.expect.packs&&line.billedQty===spec.expect.billed&&line.fullCharge===spec.expect.fullCharge);
  const coveredOk=spec.expect.covered==null?true:!!(x.packBilling&&x.packBilling.covered)===spec.expect.covered;
  const scopeOk=spec.expect.scope==null?true:x.catalog&&x.catalog.scopeTotal===spec.expect.scope;
  const zeroClass=x.total===0?(finalized?'finalized-zero':'blocked-or-incomplete-zero'):'nonzero';
  const passArithmetic=arithmetic&&ready&&finalizedOk&&scopeOk&&!(finalized&&x.total<=0);
  const passCoverage=packOk&&coveredOk;
  const passRoles=!role.employeeLeak&&!role.customerLeak&&role.ownerCostField;
  const passDisclaimer=spec.expect.disclaimer==null?true:(disc.applies===spec.expect.disclaimer&&(spec.expect.disclaimer?disc.literal:true));
  rows.push({
    id:spec.id,name:spec.name,jobType:spec.job.projectType,footprint:spec.footprint,locale:spec.job.address,
    layer:'engine-plus-quote-core-snapshots',priceSource:spec.source,
    expectedSell:spec.expect.total,actualSell:x.total,finalized,quoteReady:!!x.quoteReady,
    expectedPacks:spec.expect.packs==null?'':spec.expect.packs,actualPacks:line?line.packs:'',
    required:line&&line.required!=null?line.required+' '+(line.unit||''):'',
    billed:line&&line.billedQty!=null?line.billedQty+' '+(line.unit||''):'',
    expectedFullPackCharge:spec.expect.fullCharge==null?'':spec.expect.fullCharge,
    actualFullPackCharge:line&&line.fullCharge!=null?line.fullCharge:'',
    proratedWouldHaveBeen:line&&line.proratedWouldHaveBeen!=null?line.proratedWouldHaveBeen:'',
    packChargeCovered:x.packBilling?x.packBilling.covered:'',
    packBlocked:!!(x.packBilling&&x.packBilling.blocked),
    costBlocked:!!x.costBlocked,
    addedOnTop:!!(x.packBilling&&x.packBilling.addToInstalledTotal),
    scope:x.catalog?x.catalog.scopeTotal:'',
    disclaimerApplies:disc.applies,disclaimerLiteral:disc.literal,
    employeeLeak:role.employeeLeak,customerLeak:role.customerLeak,ownerCostField:role.ownerCostField,
    zeroClass,passArithmetic,passCoverage,passRoles,passDisclaimer,
    pass:passArithmetic&&passCoverage&&passRoles&&passDisclaimer,
    usablePricedQuote:finalized&&x.total>0,
    reason:spec.note||'',
    liveBrowser:'UNTESTED',liveToken:'UNTESTED',liveDeposit:'UNTESTED'
  });
}

run({id:'S01',name:'chicago-floor-100-solid',footprint:'100 sq ft solid',source:'live staff selling 8/sq ft; synthetic pack price $1',job:floor(100,'solid','Chicago, IL'),expect:{total:800,ready:true,finalized:true,covered:true,disclaimer:false}});
run({id:'S02',name:'phoenix-floor-100-solid',footprint:'100 sq ft solid',source:'same rate as S01; city does not create a local rate',job:floor(100,'solid','Phoenix, AZ'),expect:{total:800,ready:true,finalized:true,covered:true,disclaimer:false},note:'Same 800 as Chicago. No invented Phoenix rate.'});
run({id:'S03',name:'chicago-floor-250-flake',footprint:'250 sq ft flake',source:'live staff selling 10/sq ft',job:floor(250,'flake','Chicago, IL'),expect:{total:2500,ready:true,finalized:true,covered:true,disclaimer:false}});
run({id:'S04',name:'dallas-floor-40-metallic',footprint:'40 sq ft metallic',source:'live staff selling 15/sq ft; miles not routed',job:floor(40,'metallic','Dallas, TX'),expect:{total:600,ready:true,finalized:true,covered:true,disclaimer:false}});
run({id:'S05',name:'chicago-floor-zero-sqft',footprint:'0 sq ft',source:'live staff selling 8/sq ft',job:floor(0,'solid','Chicago, IL'),expect:{total:0,ready:false,finalized:false,disclaimer:false},note:'Incomplete zero. Not a finalized free quote.'});

run({id:'S06',name:'chicago-1car-flake',footprint:'1-car package',source:'live staff package start 1900',job:garage('1car','flake','good','Chicago, IL'),expect:{total:1900,ready:true,finalized:true,disclaimer:true,scope:1900}});
run({id:'S07',name:'milwaukee-2car-flake',footprint:'2-car package',source:'live staff package start 3150; city does not change it',job:garage('2car','flake','good','Milwaukee, WI'),expect:{total:3150,ready:true,finalized:true,disclaimer:true,scope:3150}});
run({id:'S08',name:'chicago-3car-flake',footprint:'3-car package',source:'live staff package start 4900',job:garage('3car','flake','good','Chicago, IL'),expect:{total:4900,ready:true,finalized:true,disclaimer:true,scope:4900}});
run({id:'S09',name:'chicago-1car-sealer-rejected',footprint:'1-car sealer preset',source:'live start 1900; sealer flat not applied',job:garage('1car','sealer','good','Chicago, IL'),settings:settings(),expect:{total:0,ready:false,finalized:false,disclaimer:true,scope:1900},note:'Sealer package preset blocked. Measured $3/sq ft is the supported path.'});
(function(){
  const s=settings(); s.catalog.garage.materialAdj.sealer=-3150;
  run({id:'S10',name:'chicago-2car-flat-would-zero',footprint:'2-car with a flat that would zero 3150',source:'synthetic unsafe flat -3150, not applied',job:garage('2car','sealer','good','Chicago, IL'),settings:s,expect:{total:0,ready:false,finalized:false,disclaimer:true,scope:3150},note:'Flat that would make the 2-car package 0 is not applied.'});
})();
run({id:'S11',name:'chicago-1car-unknown',footprint:'1-car unknown condition',source:'live start 1900; unknown stays unfinalized',job:garage('1car','flake','unknown','Chicago, IL'),expect:{total:0,ready:false,finalized:false,disclaimer:true},note:'Unknown may be compared with fair later. It is not finalized.'});
(function(){
  const j=garage('measured','flake','good','Naperville, IL'); j.areas[0].sqft=200;
  run({id:'S12',name:'naperville-measured-garage-200',footprint:'200 sq ft measured garage',source:'live flake 10/sq ft; package start does not apply',job:j,expect:{total:2000,ready:true,finalized:true,covered:true,disclaimer:false}});
})();
(function(){
  const j=baseJob('Chicago, IL'); j.projectType='flatwork';
  j.catalogItems=[{name:'Top',length:2,width:2,sizeBand:'small',style:'solid',topcoat:'protective',condition:'good',customStarting:''}];
  run({id:'S13',name:'chicago-flatwork-small',footprint:'small band countertop',source:'synthetic band 400 on top of preserved staff book',job:j,expect:{total:400,ready:true,finalized:true,disclaimer:false},note:'Garage package and disclaimer are not applicable.'});
})();
(function(){
  const j=baseJob('Austin, TX'); j.projectType='flatwork';
  j.catalogItems=[{name:'Odd',length:2,width:2,sizeBand:'nope',style:'solid',topcoat:'protective',condition:'good'}];
  run({id:'S14',name:'austin-flatwork-blank-override',footprint:'no size band',source:'optional override left blank',job:j,expect:{total:0,ready:false,finalized:false,disclaimer:false},note:'Blank override is not a missing package price. Quote stays blocked.'});
})();
(function(){
  const j=baseJob('Chicago, IL'); j.projectType='seating';
  j.catalogItems=[{name:'Chair',seatType:'chair',qty:2,style:'solid',topcoat:'protective',condition:'good'}];
  run({id:'S15',name:'chicago-two-chairs',footprint:'2 chairs',source:'synthetic 180 per chair',job:j,expect:{total:360,ready:true,finalized:true,disclaimer:false}});
})();
(function(){
  const j=baseJob('Denver, CO'); j.projectType='seating';
  j.catalogItems=[{name:'Stool',seatType:'stool',qty:1,style:'solid',topcoat:'protective',condition:'unknown'}];
  run({id:'S16',name:'denver-stool-unknown',footprint:'1 stool',source:'synthetic stool 150; unknown blocks finalization',job:j,expect:{total:0,ready:false,finalized:false,disclaimer:false}});
})();

function needJob(city,required){
  const j=floor(100,'solid',city);
  j.materialNeeds=[{key:'primer',required:required,unit:'gal'}];
  return j;
}
run({id:'S17',name:'chicago-floor-2gal-of-3',footprint:'100 sq ft plus 2 gal primer need',source:'synthetic full-pack selling price $90 for a 3 gal pack',job:needJob('Chicago, IL',2),settings:settings({primerPack:SYN_PACK}),focus:'primer',expect:{total:800,ready:true,finalized:true,covered:true,packs:1,billed:3,fullCharge:90,disclaimer:false},note:'Full pack charge is $90, not the prorated $60. It is covered by the $800 installed price and not added again.'});
run({id:'S18',name:'chicago-floor-exact-3gal',footprint:'100 sq ft plus exact 3 gal',source:'synthetic $90 per 3 gal pack',job:needJob('Chicago, IL',3),settings:settings({primerPack:SYN_PACK}),focus:'primer',expect:{total:800,ready:true,finalized:true,covered:true,packs:1,billed:3,fullCharge:90,disclaimer:false}});
run({id:'S19',name:'chicago-floor-just-over-3gal',footprint:'100 sq ft plus 3.01 gal',source:'synthetic $90 per 3 gal pack',job:needJob('Chicago, IL',3.01),settings:settings({primerPack:SYN_PACK}),focus:'primer',expect:{total:800,ready:true,finalized:true,covered:true,packs:2,billed:6,fullCharge:180,disclaimer:false},note:'3.01 gal bills 2 packs, $180, not a prorated remainder.'});
run({id:'S20',name:'chicago-floor-6gal',footprint:'100 sq ft plus 6 gal',source:'synthetic $90 per 3 gal pack',job:needJob('Chicago, IL',6),settings:settings({primerPack:SYN_PACK}),focus:'primer',expect:{total:800,ready:true,finalized:true,covered:true,packs:2,billed:6,fullCharge:180,disclaimer:false}});
run({id:'S21',name:'chicago-floor-zero-primer-need',footprint:'100 sq ft and 0 gal primer override',source:'synthetic pack price; zero use bills zero packs',job:needJob('Chicago, IL',0),settings:settings({primerPack:SYN_PACK}),focus:'primer',expect:{total:800,ready:true,finalized:true,covered:true,disclaimer:false},note:'Zero requirement does not bill a pack. Other demanded products still reconcile.'});
run({id:'S22',name:'chicago-floor-missing-pack-size',footprint:'100 sq ft, primer pack size missing',source:'missing metadata',job:floor(100,'solid','Chicago, IL'),settings:settings({dropPrimerSize:true}),expect:{total:800,ready:false,finalized:false,covered:false,disclaimer:false},note:'Missing pack size blocks finalization. It is not invented and the calculated sell is not a usable quote.'});
run({id:'S23',name:'chicago-floor-missing-pack-price',footprint:'100 sq ft, primer pack selling price missing',source:'missing pack selling price',job:floor(100,'solid','Chicago, IL'),settings:settings({dropPrimerPrice:true}),expect:{total:800,ready:false,finalized:false,covered:false,disclaimer:false},note:'Missing pack selling price is not treated as $0 covered.'});
(function(){
  const j=floor(0,'solid','Chicago, IL');
  j.areas=[{id:'a',name:'A',sqft:250,style:'solid',coats:1,color:'Gray',moisture:false,grip:false,level:false,depth:0.25},{id:'b',name:'B',sqft:250,style:'solid',coats:1,color:'Gray',moisture:false,grip:false,level:false,depth:0.25}];
  run({id:'S24',name:'chicago-two-areas-one-primer-pack',footprint:'two 250 sq ft solid areas',source:'live 8/sq ft; primer demand aggregates before packing',job:j,focus:'primer',expect:{total:4000,ready:true,finalized:true,covered:true,packs:1,billed:3,fullCharge:1,disclaimer:false},note:'Two areas share one primer pack. The $1 synthetic pack charge is covered and not billed twice.'});
})();
run({id:'S25',name:'chicago-floor-missing-purchase-cost',footprint:'100 sq ft, primer purchase cost missing',source:'missing purchase cost must not make profit or a deposit look free',job:floor(100,'solid','Chicago, IL'),settings:settings({dropPrimerCost:true}),expect:{total:800,ready:false,finalized:false,covered:false,disclaimer:false},note:'Calculated sell remains 800 and unfinalized. Live deposit, browser, and customer-token checks were not run.'});

if(rows.length!==25){console.error('expected 25 jobs, got',rows.length);process.exit(1)}
const counts={
  jobs:rows.length,
  arithmeticPass:rows.filter(r=>r.passArithmetic).length,
  coveragePass:rows.filter(r=>r.passCoverage).length,
  rolePass:rows.filter(r=>r.passRoles).length,
  scenarioPass:rows.filter(r=>r.pass).length,
  scenarioFail:rows.filter(r=>!r.pass).length,
  usablePricedQuotes:rows.filter(r=>r.usablePricedQuote).length,
  blockedOrIncompleteZero:rows.filter(r=>r.zeroClass==='blocked-or-incomplete-zero').length,
  finalizedZero:rows.filter(r=>r.zeroClass==='finalized-zero').length
};
const privatePath='/home/ubuntu/.cursor/projects/workspace/uploads/final-field-dispositions_111e.csv';
let privateNote={loaded:false};
if(fs.existsSync(privatePath)){
  const text=fs.readFileSync(privatePath,'utf8');
  const lines=text.split(/\n/).slice(1).filter(Boolean);
  const classes={};
  for(const line of lines){
    const parts=[];
    let cur='',q=false;
    for(const ch of line){
      if(ch==='"'){q=!q;continue}
      if(ch===','&&!q){parts.push(cur);cur='';continue}
      cur+=ch;
    }
    parts.push(cur);
    const cls=parts[4]||'unknown';
    classes[cls]=(classes[cls]||0)+1;
  }
  privateNote={loaded:true,rowCount:lines.length,classCounts:classes,dollars:'redacted — not written to this public file'};
  fs.writeFileSync('/tmp/exotic-owner-review-private.json',JSON.stringify({note:'Private review copy. Do not commit.',source:privatePath,classCounts:classes,raw:text},null,2));
}
const out={
  headNote:'Public 25-job matrix. Private vendor costs are not included. Not a release.',
  layer:'Local engine calculate plus quote-core snapshots. Live browser, customer token, and live deposit were not run.',
  counts,privateDispositionCounts:privateNote,rows
};
const dir=path.join(__dirname,'..','docs');
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'scenario-25-results.json'),JSON.stringify(out,null,2)+'\n');
const headers=['id','name','jobType','footprint','locale','layer','priceSource','expectedSell','actualSell','finalized','quoteReady','required','billed','expectedFullPackCharge','actualFullPackCharge','proratedWouldHaveBeen','packChargeCovered','zeroClass','disclaimerApplies','employeeLeak','customerLeak','usablePricedQuote','pass','reason'];
const csv=[headers.join(',')].concat(rows.map(r=>headers.map(h=>{const v=r[h]==null?'':String(r[h]);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(',')));
fs.writeFileSync(path.join(dir,'scenario-25-results.csv'),csv.join('\n')+'\n');
const md=['# 25 job scenarios','','Each row is one estimator job. Pack microtests remain in tools/visibility-audit.test.js.','','Arithmetic pass and full-scenario pass are separate. A blocked incomplete zero is not a usable priced quote.','',
  'Arithmetic pass: '+counts.arithmeticPass+'. Coverage pass: '+counts.coveragePass+'. Role pass: '+counts.rolePass+'. Full scenario pass: '+counts.scenarioPass+'. Fail: '+counts.scenarioFail+'.','',
  'Usable priced quotes: '+counts.usablePricedQuotes+'. Blocked or incomplete zero totals: '+counts.blockedOrIncompleteZero+'. Finalized zeros: '+counts.finalizedZero+'.','',
  'Live browser employee login, customer token, and live deposit acceptance: UNTESTED.','',
  '| ID | Job | Locale | Footprint | Sell expected | Sell actual | Finalized | Full pack charge | Covered | Zero class | Pass |','| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
for(const r of rows)md.push('| '+[r.id,r.name,r.locale,r.footprint,r.expectedSell,r.actualSell,r.finalized,r.actualFullPackCharge,r.packChargeCovered,r.zeroClass,r.pass?'pass':'FAIL'].join(' | ')+' |');
md.push('','Inclusive installed prices are not increased by the pack charge. If the full pack selling charge is greater than the installed total, or the pack price is missing, the quote stays unfinalized.','','Command: `node tools/scenario-25.js`');
fs.writeFileSync(path.join(dir,'scenario-25-report.md'),md.join('\n')+'\n');
console.log(JSON.stringify(counts));
if(counts.scenarioFail||counts.finalizedZero)process.exit(1);
