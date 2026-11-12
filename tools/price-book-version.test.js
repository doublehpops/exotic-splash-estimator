'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');

const JOB='00000000-0000-4000-8000-0000000000aa';
function floor(){
  const j=E.newJob();
  j.id=JOB;j.customer='Synthetic';j.tax=0;j.discount=0;j.miles=0;j.minutes=0;j.addOnIncluded=false;
  j.priceOption='regular';j.areas[0].sqft=1000;j.areas[0].style='solid';j.areas[0].coats=1;
  j.areas[0].moisture=false;j.areas[0].level=false;j.areas[0].grip=false;
  return j;
}
function deps(version,recordQuote){
  const jobs={};jobs[JOB]={id:JOB,version:14,job_data:floor()};
  const saved=[];
  return {
    saved,
    discountStore:null,
    getProfile:async()=>({id:'own-1',role:'owner',active:true}),
    getJob:async(id)=>jobs[id]||null,
    getPriceBook:async()=>({version,staff_settings:{},owner_settings:{}}),
    getJobMarkup:async()=>null,
    recordQuote:async(args)=>{if(recordQuote)return recordQuote(args);saved.push(args);return 'quote-synthetic'}
  };
}

(async()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','js','quote-core.js'),'utf8');
  const cloud=fs.readFileSync(path.join(__dirname,'..','js','es-cloud.js'),'utf8');
  assert.ok(!/body\.price_book_version|body\.priceBookVersion/.test(src));
  const quoteFn=cloud.slice(cloud.indexOf('async quote('),cloud.indexOf('async createShare'));
  assert.ok(!/priceBookVersion|price_book_version|expectedVersion/.test(quoteFn));
  assert.ok(cloud.includes('p_expected_version:expectedVersion'));

  const at7=deps(7);
  const preview7=await Q.handleQuoteRequest({mode:'preview',job_id:JOB,job_data:floor(),price_book_version:99},at7,E);
  const at8=deps(8);
  const preview8=await Q.handleQuoteRequest({mode:'preview',job_id:JOB,job_data:floor(),price_book_version:7},at8,E);
  assert.strictEqual(preview7.status,200);
  assert.strictEqual(preview8.status,200);
  assert.strictEqual(preview7.body.priceBookVersion,7);
  assert.strictEqual(preview8.body.priceBookVersion,8);
  assert.strictEqual(preview8.body.staff.total,preview7.body.staff.total);

  const recorded=deps(8);
  const saved=await Q.handleQuoteRequest({mode:'record',job_id:JOB},recorded,E);
  assert.strictEqual(saved.status,200);
  assert.strictEqual(saved.body.priceBookVersion,8);
  assert.strictEqual(recorded.saved.length,1);
  assert.strictEqual(recorded.saved[0].p_price_book_version,8);
  assert.notStrictEqual(recorded.saved[0].p_price_book_version,7);

  for(const message of [
    'Price book changed during quote calculation',
    'Job changed since the quote was computed (server version 15)'
  ]){
    const bumped=deps(8,()=>{throw new Error(message)});
    const res=await Q.handleQuoteRequest({mode:'record',job_id:JOB},bumped,E);
    assert.strictEqual(res.status,409,message);
    assert.strictEqual(res.body.code,'conflict',message);
    assert.strictEqual(bumped.saved.length,0);
  }

  console.log('price book version checks passed');
})().catch(err=>{console.error(err);process.exit(1)});
