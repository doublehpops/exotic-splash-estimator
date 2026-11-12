'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');
const Cloud=require('../js/es-cloud');

let failed=0;
const pending=[];
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}
function checkAsync(name,fn){
  pending.push((async()=>{
    try{await fn();console.log('ok',name);}
    catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}
  })());
}

check('shared quote core stays byte-identical',()=>{
  const a=fs.readFileSync(path.join('js','quote-core.js'),'utf8');
  const b=fs.readFileSync(path.join('supabase/functions/_shared','quote-core.js'),'utf8');
  assert.strictEqual(a,b);
  for(const name of ['epoxy-engine.js','price-sanity.js','discount-approval.js']){
    assert.strictEqual(fs.readFileSync(path.join('js',name),'utf8'),fs.readFileSync(path.join('supabase/functions/_shared',name),'utf8'),name);
  }
});

function mismatch(message){
  const err=new Error(message||'Price book version mismatch');
  err.code='stale_book';
  return err;
}

checkAsync('a version mismatch reloads the price book and re-prices once',async()=>{
  let version=2;
  const seen=[];
  let reloads=0;
  let shown='';
  async function quote(){
    seen.push(version);
    if(version!==5)throw mismatch();
    return {ok:true,staff:{total:4500}};
  }
  async function reload(){reloads+=1;version=5;}
  try{
    const res=await Cloud.quoteWithPriceBookReload(quote,reload);
    assert.strictEqual(res.staff.total,4500);
  }catch(e){
    shown=e.message;
  }
  assert.strictEqual(shown,'');
  assert.strictEqual(reloads,1);
  assert.deepStrictEqual(seen,[2,5]);
});

checkAsync('a second mismatch is shown and does not reload again',async()=>{
  let reloads=0;
  let quotes=0;
  async function quote(){
    quotes+=1;
    throw mismatch();
  }
  async function reload(){reloads+=1;}
  let caught=null;
  try{await Cloud.quoteWithPriceBookReload(quote,reload);}catch(e){caught=e;}
  assert.ok(caught);
  assert.strictEqual(caught.code,'stale_book');
  assert.strictEqual(reloads,1);
  assert.strictEqual(quotes,2);
});

checkAsync('other quote errors are not retried',async()=>{
  let reloads=0;
  let quotes=0;
  async function quote(){
    quotes+=1;
    const err=new Error('Account is not active staff.');
    err.code='forbidden';
    throw err;
  }
  try{await Cloud.quoteWithPriceBookReload(quote,async()=>{reloads+=1;});}catch(e){
    assert.strictEqual(e.code,'forbidden');
  }
  assert.strictEqual(reloads,0);
  assert.strictEqual(quotes,1);
});

function client(invoke){
  return {auth:{},functions:{invoke}};
}

check('quote does not take a client price-book version',()=>{
  const src=fs.readFileSync(path.join('js','quote-core.js'),'utf8');
  const cloud=fs.readFileSync(path.join('js','es-cloud.js'),'utf8');
  assert.ok(!/body\.price_book_version|body\.priceBookVersion/.test(src));
  const quoteFn=cloud.slice(cloud.indexOf('async quote('),cloud.indexOf('async createShare'));
  assert.ok(!/priceBookVersion|price_book_version|expectedVersion/.test(quoteFn));
});

checkAsync('the quote client names a price-book mismatch and leaves a job conflict alone',async()=>{
  let body=null;
  const api=Cloud.create(client(async(_name,opts)=>{
    body=opts.body;
    return {error:{context:{json:async()=>({ok:false,code:'conflict',error:'Price book version mismatch'})}},data:null};
  }));
  let caught=null;
  try{await api.quote('preview','job-1',{areas:[{sqft:450}]});}catch(e){caught=e;}
  assert.strictEqual(body.mode,'preview');
  assert.strictEqual(body.job_id,'job-1');
  assert.strictEqual(body.priceBookVersion,undefined);
  assert.strictEqual(body.price_book_version,undefined);
  assert.strictEqual(body.job_data.areas[0].sqft,450);
  assert.strictEqual(caught.code,'stale_book');
  const jobApi=Cloud.create(client(async()=>({error:{context:{json:async()=>({ok:false,code:'conflict',error:'Job or price book changed — retry'})}},data:null})));
  let jobErr=null;
  try{await jobApi.quote('record','job-1',null);}catch(e){jobErr=e;}
  assert.strictEqual(jobErr.code,'conflict');
});

const JOB='00000000-0000-4000-8000-0000000000aa';
function deps(version){
  let recorded=0;
  return {
    recorded:()=>recorded,
    deps:{
      getProfile:async()=>({id:'emp-1',role:'employee',active:true}),
      getJob:async()=>null,
      getPriceBook:async()=>({version,staff_settings:{},owner_settings:{}}),
      getJobMarkup:async()=>null,
      recordQuote:async()=>{recorded+=1;return 'quote-synthetic'},
      discountStore:null
    }
  };
}
const job={projectType:'floor',customer:'Smoke',areas:[{id:'a',name:'Floor',sqft:450,style:'flake'}]};

checkAsync('quote-job reports a price-book mismatch when the book changes during the quote',async()=>{
  const stored={id:JOB,version:1,job_data:job};
  let recorded=0;
  const res=await Q.handleQuoteRequest({mode:'record',job_id:JOB},{
    getProfile:async()=>({id:'emp-1',role:'employee',active:true}),
    getJob:async()=>stored,
    getPriceBook:async()=>({version:9,staff_settings:{},owner_settings:{}}),
    getJobMarkup:async()=>null,
    recordQuote:async()=>{throw new Error('Price book changed during quote calculation')},
    discountStore:null
  },E);
  assert.strictEqual(res.status,409);
  assert.strictEqual(res.body.code,'conflict');
  assert.strictEqual(res.body.error,'Price book version mismatch');
  assert.strictEqual(recorded,0);
  const jobChange=await Q.handleQuoteRequest({mode:'record',job_id:JOB},{
    getProfile:async()=>({id:'emp-1',role:'employee',active:true}),
    getJob:async()=>stored,
    getPriceBook:async()=>({version:9,staff_settings:{},owner_settings:{}}),
    getJobMarkup:async()=>null,
    recordQuote:async()=>{throw new Error('Job changed since the quote was computed (server version 15)')},
    discountStore:null
  },E);
  assert.strictEqual(jobChange.status,409);
  assert.strictEqual(jobChange.body.code,'conflict');
  assert.strictEqual(jobChange.body.error,'Job or price book changed — retry');
});

checkAsync('a preview still prices when the caller does not send a book version',async()=>{
  const res=await Q.handleQuoteRequest({mode:'preview',job_data:job},deps(9).deps,E);
  assert.strictEqual(res.status,200);
  assert.strictEqual(res.body.priceBookVersion,9);
  assert.strictEqual(res.body.staff.total,4500);
});

checkAsync('the browser reloads once after the mismatch and does not reload a job conflict',async()=>{
  let books=0;
  let reloads=0;
  const shown=[];
  async function quote(){
    books+=1;
    if(books===1){
      const err=new Error('Price book version mismatch');
      err.code='stale_book';
      throw err;
    }
    return {ok:true,staff:{total:4500}};
  }
  const res=await Cloud.quoteWithPriceBookReload(quote,async()=>{reloads+=1;});
  assert.strictEqual(res.staff.total,4500);
  assert.strictEqual(reloads,1);
  assert.strictEqual(books,2);
  async function jobQuote(){
    const err=new Error('Job or price book changed — retry');
    err.code='conflict';
    throw err;
  }
  try{await Cloud.quoteWithPriceBookReload(jobQuote,async()=>{reloads+=1;});}
  catch(e){shown.push(e.code);}
  assert.deepStrictEqual(shown,['conflict']);
  assert.strictEqual(reloads,1);
});

(async()=>{
  await Promise.all(pending);
  if(failed){console.error(failed+' failed');process.exit(1);}
  console.log('price book reload checks passed');
})();
