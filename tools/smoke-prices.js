'use strict';
/* Post-deploy engine smoke. Compares fixture jobs to customer selling totals.
 * Does not print or require owner costs, margins, or secrets. */
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const E=require('../js/epoxy-engine');

const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','smoke-jobs.json'),'utf8'));

function jobFrom(row){
  const j=E.newJob();
  j.customer='Smoke';
  j.company='';
  j.tax=0;
  j.discount=0;
  j.miles=0;
  j.minutes=0;
  j.addOnIncluded=false;
  j.projectType=row.projectType;
  j.priceOption=row.priceOption||'regular';
  if(row.projectType==='garage'){
    j.garagePackage=row.garagePackage;
    j.garageStyle=row.style||'flake';
    j.garageTopcoat='protective';
    j.garageCondition='good';
  }else{
    Object.assign(j.areas[0],{name:'Floor area',sqft:row.sqft,style:row.style||'solid',flake:'light',coats:1,level:false,moisture:false,grip:false,rate:null});
  }
  return j;
}

let failed=0;
for(const row of fixture.jobs){
  const x=E.calculate(jobFrom(row),E.defaults);
  try{
    assert.strictEqual(x.quoteReady,true,row.id);
    assert.strictEqual(x.total,row.total,row.id+' total');
    console.log('ok',row.id,x.total);
  }catch(e){
    failed++;
    console.error('FAIL',row.id,e&&e.message||e);
  }
}
if(failed){
  console.error(failed+' smoke price check(s) failed');
  process.exit(1);
}
console.log('smoke prices passed');
