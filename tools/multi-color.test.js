'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

function garage(style,extra){
  const j=E.newJob();
  Object.assign(j,{customer:'Pat',projectType:'garage',garagePackage:'2car',garageStyle:style,garageTopcoat:'protective',garageCondition:'good',priceOption:'regular',miles:0,minutes:0,tax:0,garageMetallicColors:1,garageFlakeBlend:'stock'});
  if(extra)Object.assign(j,extra);
  return j;
}
function line(x,label){return (x.lines||[]).find(l=>l.label===label);}

check('metallic 3 colors on a regular 2-car adds 1.50 per package sq ft',()=>{
  assert.strictEqual(E.defaults.extras.multiColor.metallicPerSqft,1.5);
  assert.strictEqual(E.defaults.extras.multiColor.customFlakePerSqft,1);
  const two=E.calculate(garage('metallic',{garageMetallicColors:2}),E.defaults);
  assert.strictEqual(two.total,7100);
  assert.ok(!line(two,'Metallic extra colors'));
  const three=E.calculate(garage('metallic',{garageMetallicColors:3}),E.defaults);
  assert.strictEqual(three.quoteReady,true);
  assert.strictEqual(line(three,'Metallic extra colors').qty,450);
  assert.strictEqual(line(three,'Metallic extra colors').rate,1.5);
  assert.strictEqual(line(three,'Metallic extra colors').total,675);
  assert.strictEqual(three.total,7775);
  assert.ok(line(three,'Metallic extra colors').total>0);
  const four=E.calculate(garage('metallic',{garageMetallicColors:4}),E.defaults);
  assert.strictEqual(four.total,7775);
  const five=E.calculate(garage('metallic',{garageMetallicColors:5}),E.defaults);
  assert.strictEqual(line(five,'Metallic extra colors').qty,450);
  assert.strictEqual(five.total,7775);
  const over=garage('metallic',{garageMetallicColors:3});
  over.areas[0].sqft=500;
  const wide=E.calculate(over,E.defaults);
  assert.strictEqual(line(wide,'Metallic extra colors').qty,500);
  assert.strictEqual(line(wide,'Metallic extra colors').total,750);
});

check('a custom flake blend adds 1.00 per sq ft and a stock blend does not',()=>{
  const stock=E.calculate(garage('flake',{garageFlakeBlend:'stock'}),E.defaults);
  assert.strictEqual(stock.total,5500);
  assert.ok(!line(stock,'Custom flake blend'));
  const custom=E.calculate(garage('flake',{garageFlakeBlend:'custom',garageFlakeColors:4}),E.defaults);
  assert.strictEqual(line(custom,'Custom flake blend').qty,450);
  assert.strictEqual(line(custom,'Custom flake blend').total,450);
  assert.strictEqual(custom.total,5950);
  const solid=E.calculate(garage('solid',{garageMetallicColors:4,garageFlakeBlend:'custom'}),E.defaults);
  assert.ok(!line(solid,'Metallic extra colors'));
  assert.ok(!line(solid,'Custom flake blend'));
});

check('a missing multi-color rate does not block, and employees do not see owner cost',()=>{
  const book=JSON.parse(JSON.stringify(E.defaults));
  book.extras.multiColor.metallicPerSqft=null;
  const j=garage('metallic',{garageMetallicColors:3});
  const x=E.calculate(j,book);
  assert.strictEqual(x.quoteReady,true);
  assert.strictEqual(x.finalizedBlocked,false);
  assert.strictEqual(x.total,7100);
  assert.ok(!line(x,'Metallic extra colors'));
  assert.ok((x.unpricedLines||[]).some(r=>r==='Metallic extra colors: price not set (owner: set it in Price book)'));
  const priced=E.calculate(j,E.defaults);
  const staff=Q.staffSnapshotSafe(E,j,priced,E.defaults);
  const customer=Q.customerSnapshot(E,j,priced,E.defaults);
  const hits=[];
  (function walk(v){
    if(!v||typeof v!=='object')return;
    for(const k of Object.keys(v)){
      if(/^(cost|profit|margin|grossMargin|operatingMargin|unitPrice)$/.test(k))hits.push(k);
      walk(v[k]);
    }
  })({staff,customer});
  assert.deepStrictEqual(hits,[]);
  assert.strictEqual(customer.totals.total,7775);
  assert.ok(priced.cost>0);
});

check('the price book UI offers four colors and the migration is later than the live versions',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','js/guided-app.js'),'utf8');
  assert.ok(app.includes('Metallic 3–4 colors ($/sq ft)'));
  assert.ok(app.includes('Custom flake blend ($/sq ft)'));
  assert.ok(app.includes('settings.extras.multiColor.metallicPerSqft'));
  assert.ok(app.includes('settings.extras.multiColor.customFlakePerSqft'));
  assert.ok(app.includes("[4,'4 colors']"));
  assert.ok(!app.includes("[5,'5"));
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase/migrations/20261112183000_multi_color_rates.sql'),'utf8');
  assert.ok(sql.includes('Not applied'));
  assert.ok(sql.indexOf("'{extras}'")<sql.indexOf("'{extras,multiColor}'"));
  assert.ok(sql.indexOf("'{extras,multiColor}'")<sql.indexOf("'{extras,multiColor,metallicPerSqft}'"));
  assert.ok(sql.indexOf("'{extras,multiColor,metallicPerSqft}'")<sql.indexOf("'{extras,multiColor,customFlakePerSqft}'"));
  assert.ok(sql.includes("'1.50'"));
  assert.ok(sql.includes("'1.00'"));
  assert.ok(!/\bdelete\s+from\b/i.test(sql));
  const names=fs.readdirSync(path.join(__dirname,'..','supabase/migrations')).filter(n=>n.endsWith('.sql')).sort();
  assert.strictEqual(names[names.length-1],'20261112183000_multi_color_rates.sql');
});

if(failed){console.error(failed+' failed');process.exit(1)}
console.log('all multi-color checks passed');
