'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

function garage(extra){
  const j=E.newJob();
  Object.assign(j,{customer:'Pat',projectType:'garage',garagePackage:'2car',garageStyle:'metallic',garageTopcoat:'protective',garageCondition:'good',priceOption:'regular',miles:0,minutes:0,tax:0});
  if(extra)Object.assign(j,extra);
  return j;
}
function line(x,label){return (x.lines||[]).find(l=>l.label===label);}

check('a null polyaspartic rate leaves the regular metallic 2-car at 7100',()=>{
  assert.strictEqual(E.defaults.catalog.garage.topcoatAdj.premium,null);
  assert.strictEqual(E.defaults.extras.antiSlip.perSqft,0.35);
  const j=garage({garageTopcoat:'premium'});
  const x=E.calculate(j,E.defaults);
  assert.strictEqual(x.quoteReady,true);
  assert.strictEqual(x.finalizedBlocked,false);
  assert.strictEqual(x.total,7100);
  assert.ok(!line(x,'Polyaspartic topcoat'));
  assert.ok((x.unpricedLines||[]).some(r=>r==='Polyaspartic topcoat: price not set (owner: set it in Price book)'));
  const customer=Q.customerSnapshot(E,j,x,E.defaults);
  const blob=JSON.stringify(customer);
  assert.strictEqual(customer.totals.total,7100);
  assert.ok(!blob.includes('price not set'));
  assert.ok(!blob.includes('"cost"'));
});

check('a polyaspartic rate adds that rate times 450, and 1.00 makes 7550',()=>{
  const book=JSON.parse(JSON.stringify(E.defaults));
  book.catalog.garage.topcoatAdj.premium=2;
  const doubled=E.calculate(garage({garageTopcoat:'premium'}),book);
  assert.strictEqual(line(doubled,'Polyaspartic topcoat').qty,450);
  assert.strictEqual(line(doubled,'Polyaspartic topcoat').total,900);
  assert.strictEqual(doubled.total,7100+900);
  book.catalog.garage.topcoatAdj.premium=1;
  const priced=E.calculate(garage({garageTopcoat:'premium'}),book);
  assert.strictEqual(priced.quoteReady,true);
  assert.strictEqual(line(priced,'Polyaspartic topcoat').total,450);
  assert.strictEqual(priced.total,7550);
});

check('garage package anti-slip uses the existing rate on package sq ft plus overflow',()=>{
  const plain=E.calculate(garage(),E.defaults);
  assert.strictEqual(plain.total,7100);
  const slip=garage();
  slip.extras.antiSlip=true;
  const x=E.calculate(slip,E.defaults);
  assert.strictEqual(x.quoteReady,true);
  assert.strictEqual(line(x,'Anti-slip additive').qty,450);
  assert.strictEqual(line(x,'Anti-slip additive').rate,0.35);
  assert.strictEqual(line(x,'Anti-slip additive').total,157.5);
  assert.strictEqual(x.total,7257.5);
  const over=garage();
  over.extras.antiSlip=true;
  over.areas[0].sqft=500;
  const wide=E.calculate(over,E.defaults);
  assert.strictEqual(line(wide,'Anti-slip additive').qty,500);
  assert.strictEqual(line(wide,'Anti-slip additive').total,175);
  const book=JSON.parse(JSON.stringify(E.defaults));
  book.catalog.garage.topcoatAdj.premium=1;
  const both=garage({garageTopcoat:'premium'});
  both.extras.antiSlip=true;
  const y=E.calculate(both,book);
  assert.strictEqual(line(y,'Polyaspartic topcoat').total,450);
  assert.strictEqual(line(y,'Anti-slip additive').total,157.5);
  assert.strictEqual(y.total,7707.5);
  const staff=Q.staffSnapshotSafe(E,slip,x,E.defaults);
  const hits=[];
  (function walk(v){
    if(!v||typeof v!=='object')return;
    for(const k of Object.keys(v)){
      if(/^(cost|profit|margin|grossMargin|operatingMargin|unitPrice)$/.test(k))hits.push(k);
      walk(v[k]);
    }
  })(staff);
  assert.deepStrictEqual(hits,[]);
  assert.ok(x.cost>0);
  assert.ok(x.margin<99.9);
});

check('an unpriced extra does not block the base quote',()=>{
  const j=garage();
  j.garageCondition='unknown';
  const x=E.calculate(j,E.defaults);
  assert.strictEqual(x.quoteReady,true);
  assert.strictEqual(x.finalizedBlocked,false);
  assert.strictEqual(x.total,7100);
  assert.ok((x.unpricedLines||[]).length>0);
  const book=JSON.parse(JSON.stringify(E.defaults));
  book.extras.antiSlip.perSqft=null;
  book.extras.antiSlip.min=null;
  const slip=garage();
  slip.extras.antiSlip=true;
  const bare=E.calculate(slip,book);
  assert.strictEqual(bare.quoteReady,true);
  assert.strictEqual(bare.total,7100);
  assert.ok(!line(bare,'Anti-slip additive'));
  assert.ok((bare.unpricedLines||[]).some(r=>/Anti-slip/.test(r)));
});

check('polyaspartic migration sets 1.00 after parent objects and is a later version',()=>{
  const names=fs.readdirSync(path.join(__dirname,'..','supabase/migrations'));
  assert.ok(!names.includes('20261112170000_mid_solid_floor_band.sql'));
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase/migrations/20261112181500_polyaspartic_topcoat_rate.sql'),'utf8');
  assert.ok(sql.includes('Not applied'));
  assert.ok(sql.indexOf("'{catalog}'")<sql.indexOf("'{catalog,garage}'"));
  assert.ok(sql.indexOf("'{catalog,garage}'")<sql.indexOf("'{catalog,garage,topcoatAdj}'"));
  assert.ok(sql.indexOf("'{catalog,garage,topcoatAdj}'")<sql.indexOf("'{catalog,garage,topcoatAdj,premium}'"));
  assert.ok(sql.includes("'1.00'"));
  assert.ok(!/\bdelete\s+from\b/i.test(sql));
  const app=fs.readFileSync(path.join(__dirname,'..','js/guided-app.js'),'utf8');
  assert.ok(app.includes("['premium','Polyaspartic topcoat']"));
  assert.ok(app.includes('Polyaspartic topcoat ($/sq ft)'));
  assert.ok(app.includes("checkbox('Slip-resistant texture','job.extras.antiSlip')"));
  assert.ok(app.includes("checkbox('Slip-resistant texture',base+'.grip')"));
});

if(failed){console.error(failed+' failed');process.exit(1)}
console.log('all polyaspartic and anti-slip checks passed');
