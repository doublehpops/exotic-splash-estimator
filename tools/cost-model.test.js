'use strict';
const assert=require('assert');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');
const S=require('../js/price-sanity');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

function job(sf,style,extra){
  const j=E.newJob();
  j.customer='Synthetic';j.tax=0;j.miles=0;j.minutes=0;j.areas[0].sqft=sf;j.areas[0].style=style;
  j.areas[0].coats=1;j.areas[0].flake='light';j.areas[0].level=false;j.areas[0].moisture=false;
  if(extra)Object.assign(j.areas[0],extra);
  return j;
}

check('cost defaults match the locked owner figures',()=>{
  const c=E.defaults.costs;
  assert.strictEqual(c.labor,42.5);
  assert.strictEqual(c.setupHours,13);
  assert.strictEqual(c.waste,10);
  assert.strictEqual(c.purchaseTax,10.5);
  assert.strictEqual(c.overhead,0);
  assert.strictEqual(c.billableHoursPerMonth,448);
  assert.strictEqual(c.allowancesInOverhead,true);
  assert.strictEqual(c.overheadLines.length,1);
  assert.strictEqual(c.overheadLines[0].monthly,15000);
  assert.strictEqual(c.overheadLines[0].status,'OWNER-PROVIDED');
  assert.strictEqual(c.materialPerSqft.solid,1.26);
  assert.strictEqual(c.materialPerSqft.flake,2.25);
  assert.strictEqual(c.materialPerSqft.metallic,2.72);
  assert.ok(Math.abs(E.overheadPerHourRate(c)-15000/448)<1e-9);
  assert.strictEqual(E.defaults.products.flake.size,40);
  assert.strictEqual(E.defaults.products.flake.price,108);
  assert.strictEqual(E.defaults.rates.minimumJob,2000);
  assert.strictEqual(E.defaults.addOn.low,0);
  assert.strictEqual(E.defaults.addOn.high,0);
  assert.strictEqual(E.defaults.addOn.enabled,false);
});

check('a 450 sf flake job uses the derived overhead and material tax',()=>{
  const x=E.calculate(job(450,'flake'),E.defaults);
  assert.ok(Math.abs(x.personHours-25.3)<0.01,x.personHours);
  assert.ok(Math.abs(x.overheadBase-25.3*(15000/448))<0.05,x.overheadBase);
  assert.ok(Math.abs(x.tax-x.mat*0.105)<0.02,x.tax);
  const setup=x.hours.find(h=>/Setup/.test(h.label));
  assert.strictEqual(setup.qty,13);
  assert.strictEqual(x.equipment.length,0);
  assert.ok(Math.abs((x.mat+x.tax)-(2.25*450*1.1*1.105))<0.05);
});

check('full-broadcast flake shows the tier rate and a separate upgrade',()=>{
  for(const [tier,rate] of [['opt1',8],['opt2',9],['regular',10]]){
    const j=job(450,'flake',{flake:'full'});
    j.priceOption=tier;
    const x=E.calculate(j,E.defaults);
    const b=x.selected.breakdown;
    assert.strictEqual(b.finishRate,rate);
    assert.ok(Math.abs(b.finishRate*b.finishQty-b.finishAmount)<0.01);
    assert.ok(x.lines.some(l=>l.kind==='upgrade'&&l.total===450));
    assert.strictEqual(x.total,450*(rate+1));
  }
});

check('the property add-in never becomes its own line',()=>{
  const j=job(450,'flake');
  j.addOnIncluded=true;
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.addOn.enabled=true;s.addOn.low=9;
  const x=E.calculate(j,s);
  assert.strictEqual(x.addOn.included,false);
  assert.ok(!x.lines.some(l=>l.kind==='addon'));
  assert.strictEqual(x.total,4500);
});

check('turning allowances off restores per-job equipment and warns about double counting',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.costs.allowancesInOverhead=false;
  const x=E.calculate(job(450,'flake'),s);
  assert.ok(x.equipment.some(e=>/Grinder/.test(e.label)));
  assert.ok(x.equipment.some(e=>/Disposal/.test(e.label)));
  assert.ok(x.warnings.some(w=>/double counts job cost/.test(w)));
  const staff=Q.staffSnapshot(E,job(450,'flake'),x,s);
  assert.ok(!staff.warnings.some(w=>/double counts/.test(w)));
});

check('markup 30 is a 23.1% margin and the minimum-margin warning stays off the staff snapshot',()=>{
  assert.ok(Math.abs(E.marginToMarkup(30)-42.857)<0.001);
  assert.ok(Math.abs(E.markupToMargin(30)-23.0769)<0.01);
  const j=job(450,'solid');
  j.method='cost';j.markup=30;
  const x=E.calculate(j,E.defaults);
  assert.ok(x.warnings.some(w=>/below the 25% minimum margin/.test(w)));
  const staff=Q.staffSnapshot(E,j,x,E.defaults);
  assert.ok(!staff.warnings.some(w=>/minimum margin/.test(w)));
});

check('cost input bounds warn without blocking a rates-method quote, and staff never see them',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.costs.labor=5;
  const found=S.costIssues(s);
  assert.ok(found.blocks.some(b=>/Loaded labor cost/.test(b.message)));
  const x=E.calculate(job(450,'solid'),s);
  assert.strictEqual(x.quoteReady,true);
  assert.ok((x.sanity.warnings||[]).some(w=>/Loaded labor cost/.test(w.message)));
  const staff=Q.staffSnapshot(E,job(450,'solid'),x,s);
  assert.ok(!staff.warnings.some(w=>/labor cost/.test(w)));
  s.costs.labor=42.5;s.costs.waste=40;
  assert.ok(S.costIssues(s).blocks.some(b=>/Material waste cost/.test(b.message)));
  s.costs.waste=10;s.costs.purchaseTax=20;
  assert.ok(S.costIssues(s).blocks.some(b=>/purchase tax cost/.test(b.message)));
  s.costs.purchaseTax=10.5;s.costs.setupHours=80;
  assert.ok(S.costIssues(s).blocks.some(b=>/Setup hours cost/.test(b.message)));
  s.costs.setupHours=13;s.costs.overhead=20000;
  assert.ok(S.costIssues(s).blocks.some(b=>/Flat overhead cost/.test(b.message)));
  s.costs.overhead=0;s.costs.markup=20;
  assert.ok(S.costIssues(s).warnings.some(w=>/below 33.33%/.test(w.message)));
  s.costs.markup=42.86;s.costs.targetMargin=10;
  assert.ok(S.costIssues(s).warnings.some(w=>/Target margin cost/.test(w.message)));
});

check('flake supplier warning fires above $10 per lb and staff do not see it',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.products.flake={size:5,price:75,unit:'lb',label:'Decorative flakes'};
  assert.ok(S.productIssues(s).some(w=>/supplier/.test(w.message)));
  assert.ok(Math.abs(E.defaults.products.flake.price/E.defaults.products.flake.size-2.7)<0.001);
  const x=E.calculate(job(450,'flake',{flake:'full'}),s);
  const flake=x.material.find(m=>m.key==='flake');
  const staff=Q.staffSnapshot(E,job(450,'flake'),x,s);
  assert.ok(!staff.warnings.some(w=>/supplier/.test(w)));
  assert.ok(flake);
});

check('an old book without the new production keys keeps the old hour formula',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  delete s.costs.grindProduction;
  s.costs.setupHours=6;s.costs.prepProduction=60;s.costs.coatProduction=120;
  s.costs.materialPerSqft={solid:null,flake:null,metallic:null};
  const x=E.calculate(job(450,'flake'),s);
  assert.ok(Math.abs(x.personHours-24.75)<0.01,x.personHours);
});

check('crew of 4 is kept for travel',()=>{
  const j=job(450,'solid');j.crew=4;j.minutes=30;j.visits=1;
  const t=E.travelInfo(j,E.defaults);
  assert.strictEqual(t.crew,4);
});

if(failed){console.error(failed+' failed');process.exit(1)}
console.log('all cost model checks passed');
