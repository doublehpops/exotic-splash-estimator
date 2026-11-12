'use strict';
const assert=require('assert');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

/* Mirrors the live tables/bars polyaspartic amount: a flat $125 per item, not per sq ft. */
function liveBook(){
  const book=JSON.parse(JSON.stringify(E.defaults));
  book.catalog.flatwork.topcoatAdj.premium=125;
  book.catalog.flatwork.sizeBands[0].starting=400;
  book.catalog.flatwork.materialAdj.solid=0;
  book.rates.minimumJob=0;
  return book;
}
function metallicGarage(){
  const j=E.newJob();
  Object.assign(j,{customer:'Pat',projectType:'garage',garagePackage:'2car',garageStyle:'metallic',garageTopcoat:'protective',garageCondition:'good',priceOption:'regular',miles:0,minutes:0,tax:0});
  return j;
}
function tableWithPoly(){
  const j=E.newJob();
  j.customer='Pat';
  j.projectType='flatwork';
  j.tax=0;j.miles=0;j.minutes=0;
  const it=E.newFlatItem();
  it.name='Bar top';
  it.condition='good';
  it.style='solid';
  it.topcoat='premium';
  it.length=2;it.width=2;
  j.catalogItems=[it];
  return j;
}

check('a live flat $125 tables/bars polyaspartic does not block a plain metallic package',()=>{
  const book=liveBook();
  const j=metallicGarage();
  const x=E.calculate(j,book);
  assert.strictEqual(x.quoteReady,true);
  assert.strictEqual(x.finalizedBlocked,false);
  assert.strictEqual((x.blockingIssues||[]).length,0);
  assert.strictEqual(x.total,7100);
  assert.ok(!x.lines.some(l=>/Polyaspartic/.test(l.label)));
  const customer=Q.customerSnapshot(E,j,x,book);
  assert.strictEqual(customer.totals.total,7100);
  assert.ok(!JSON.stringify(customer).includes('125'));
});

check('a table with polyaspartic adds the flat $125 and does not multiply by sq ft',()=>{
  const book=liveBook();
  const j=tableWithPoly();
  const x=E.calculate(j,book);
  assert.strictEqual(x.quoteReady,true);
  const row=x.lines.find(l=>l.label==='Polyaspartic topcoat — Bar top');
  assert.ok(row);
  assert.strictEqual(row.total,125);
  assert.notStrictEqual(row.total,125*4);
  assert.strictEqual(x.total,400+125);
  const customer=Q.customerSnapshot(E,j,x,book);
  assert.strictEqual(customer.totals.total,525);
});

if(failed){console.error(failed+' failed');process.exit(1)}
console.log('all live polyaspartic checks passed');
