'use strict';
const assert=require('assert');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');
const S=require('../js/price-sanity');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

function garage(pkg,style,sqft){
  const j=E.newJob();
  Object.assign(j,{customer:'Pat',projectType:'garage',garagePackage:pkg,garageStyle:style,garageTopcoat:'protective',garageCondition:'good',miles:0,minutes:0});
  if(sqft)j.areas[0].sqft=sqft;
  return j;
}

check('tier-aligned solid credits are subtracted from the flake-tier base',()=>{
  assert.deepStrictEqual(E.defaults.catalog.garage.materialAdj.solid,{oneCar:-750,twoCar:-1350,threeCar:-1950});
  const regular=E.calculate(garage('2car','solid'),E.defaults);
  assert.strictEqual(regular.lines.find(l=>l.kind==='starting').total,4500);
  assert.strictEqual(regular.lines.find(l=>/solid/.test(l.label)).total,-1350);
  assert.strictEqual(regular.total,3150);
  const opt1=garage('2car','solid');opt1.priceOption='opt1';
  const x=E.calculate(opt1,E.defaults);
  assert.strictEqual(x.lines.find(l=>l.kind==='starting').total,3600);
  assert.strictEqual(x.lines.find(l=>/solid/.test(l.label)).total,-1350);
  assert.strictEqual(x.total,2250);
  assert.strictEqual(x.minimum,0);
});

check('hybrid garage base is flake rate times 250/450/650 and overflow uses the system rate',()=>{
  const sq=E.defaults.catalog.garage.packageSqft;
  assert.deepStrictEqual(sq,{oneCar:250,twoCar:450,threeCar:650});
  const exact=E.calculate(garage('2car','flake',450),E.defaults);
  assert.strictEqual(exact.total,4500);
  assert.ok(!exact.lines.some(l=>l.kind==='overflow'));
  const opt1Base=garage('1car','flake');opt1Base.priceOption='opt1';
  const opt2Base=garage('3car','flake');opt2Base.priceOption='opt2';
  assert.strictEqual(E.calculate(opt1Base,E.defaults).total,2000);
  assert.strictEqual(E.calculate(opt2Base,E.defaults).total,5850);
  assert.strictEqual(E.calculate(garage('3car','flake'),E.defaults).total,6500);
  const over=E.calculate(garage('2car','flake',500),E.defaults);
  const line=over.lines.find(l=>l.kind==='overflow');
  assert.strictEqual(line.qty,50);
  assert.strictEqual(line.rate,10);
  assert.strictEqual(over.total,4500+500);
  const opt=garage('2car','solid',500);opt.priceOption='opt1';
  const optX=E.calculate(opt,E.defaults);
  assert.strictEqual(optX.lines.find(l=>l.kind==='starting').total,3600);
  assert.strictEqual(optX.lines.find(l=>l.kind==='overflow').rate,5);
  assert.strictEqual(optX.lines.find(l=>/solid/.test(l.label)).total,-1350);
  assert.strictEqual(optX.total,3600-1350+250);
  assert.deepStrictEqual(optX.selected.payments.map(p=>p.pct),[50,50]);
});

check('a credit larger than the start blocks the quote',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.catalog.garage.materialAdj.solid={oneCar:-3000,twoCar:-1350,threeCar:-1950};
  const j=garage('1car','solid');j.priceOption='opt1';
  const x=E.calculate(j,s);
  assert.strictEqual(x.quoteReady,false);
  assert.strictEqual(x.total,0);
  assert.ok(x.pendingReasons.some(r=>/exceed the starting price/.test(r)));
});

check('configured unknown condition prices and unconfigured stays pending',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.catalog.garage.conditionAdj.unknown=150;
  const j=garage('2car','flake');
  j.garageCondition='unknown';
  const ready=E.calculate(j,s);
  assert.strictEqual(ready.quoteReady,true);
  assert.strictEqual(ready.total,4500+150);
  const pending=E.calculate(j,E.defaults);
  assert.strictEqual(pending.quoteReady,false);
  assert.ok(pending.pendingReasons.some(r=>/Unknown/.test(r)));
});

check('flatwork above 32 sq ft is pending unless a custom start is set',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.catalog.flatwork.sizeBands[3].starting=1600;
  s.catalog.flatwork.materialAdj.solid=0;
  s.rates.minimumJob=0;
  const item=E.newFlatItem();item.condition='good';item.sqft=30;
  const j=E.newJob();j.customer='Pat';j.projectType='flatwork';j.catalogItems=[item];
  const small=E.calculate(j,s);
  assert.strictEqual(small.quoteReady,true);
  assert.strictEqual(small.total,1600);
  item.sqft=40;
  const big=E.calculate(j,s);
  assert.strictEqual(big.quoteReady,false);
  assert.strictEqual(big.total,0);
  item.customStarting=2400;
  const custom=E.calculate(j,s);
  assert.strictEqual(custom.total,2400);
  s.catalog.flatwork.maxItemSqft=null;
  item.customStarting='';
  const open=E.calculate(j,s);
  assert.strictEqual(open.total,1600);
});

check('garage start warning is owner-only',()=>{
  assert.strictEqual(S.garageStartWarnings(E.defaults).length,0);
  const stale=JSON.parse(JSON.stringify(E.defaults));
  stale.catalog.garage.twoCarStarting=3150;
  const hits=S.garageStartWarnings(stale);
  assert.ok(hits.some(h=>/2-car starting price/.test(h.message)&&/450/.test(h.message)));
  const x=E.calculate(garage('2car','flake'),E.defaults);
  const staff=Q.staffSnapshot(E,garage('2car','flake'),x,E.defaults);
  assert.ok(!staff.warnings.some(w=>/starting price/.test(w)));
  const redacted=JSON.stringify(Q.redactedStaffSettings(E,{}));
  assert.ok(!redacted.includes('below the approved Regular flake'));
});

check('the catalog 1-car package honors the minimum job charge',()=>{
  const j=garage('1car','solid');
  j.priceOption='opt1';
  const x=E.calculate(j,E.defaults);
  assert.strictEqual(x.lines.find(l=>l.kind==='starting').total,2000);
  assert.strictEqual(x.lines.find(l=>/solid/.test(l.label)).total,-750);
  assert.strictEqual(x.minimum,750);
  assert.strictEqual(x.total,2000);
});

if(failed){console.error(failed+' failed');process.exit(1)}
console.log('all catalog fix checks passed');
