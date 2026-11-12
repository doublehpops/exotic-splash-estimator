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
  err.code='price_book_version_mismatch';
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
  assert.strictEqual(caught.code,'price_book_version_mismatch');
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

checkAsync('the quote client sends the book version and names a mismatch',async()=>{
  let body=null;
  const api=Cloud.create(client(async(_name,opts)=>{
    body=opts.body;
    return {error:{context:{json:async()=>({ok:false,code:'price_book_version_mismatch',error:'Price book version mismatch',priceBookVersion:9})}},data:null};
  }));
  let caught=null;
  try{await api.quote('preview','job-1',{areas:[{sqft:450}]},{priceBookVersion:4});}catch(e){caught=e;}
  assert.strictEqual(body.mode,'preview');
  assert.strictEqual(body.job_id,'job-1');
  assert.strictEqual(body.priceBookVersion,4);
  assert.strictEqual(body.job_data.areas[0].sqft,450);
  assert.strictEqual(caught.code,'price_book_version_mismatch');
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

checkAsync('quote-job returns a version mismatch and does not price the stale book',async()=>{
  const box=deps(9);
  const res=await Q.handleQuoteRequest({mode:'preview',job_data:job,priceBookVersion:4},box.deps,E);
  assert.strictEqual(res.status,409);
  assert.strictEqual(res.body.ok,false);
  assert.strictEqual(res.body.code,'price_book_version_mismatch');
  assert.strictEqual(res.body.error,'Price book version mismatch');
  assert.strictEqual(res.body.priceBookVersion,9);
  assert.strictEqual(res.body.staff,undefined);
  assert.strictEqual(box.recorded(),0);
});

checkAsync('a matching version and an omitted version still price',async()=>{
  const matched=deps(9);
  const ok=await Q.handleQuoteRequest({mode:'preview',job_data:job,priceBookVersion:9},matched.deps,E);
  assert.strictEqual(ok.status,200);
  assert.strictEqual(ok.body.staff.total,4500);
  const omitted=deps(9);
  const legacy=await Q.handleQuoteRequest({mode:'preview',job_data:job},omitted.deps,E);
  assert.strictEqual(legacy.status,200);
  assert.strictEqual(legacy.body.staff.total,4500);
});

checkAsync('the browser path reloads once and the second quote uses the new version',async()=>{
  let version=4;
  const calls=[];
  const shown=[];
  async function quote(){
    calls.push(version);
    const res=await Q.handleQuoteRequest({mode:'preview',job_data:job,priceBookVersion:version},deps(9).deps,E);
    if(res.body&&res.body.code==='price_book_version_mismatch')throw mismatch(res.body.error);
    if(!res.body||res.body.ok!==true){
      const err=new Error(res.body&&res.body.error||'failed');
      err.code=res.body&&res.body.code;
      throw err;
    }
    return res.body;
  }
  async function reload(){version=9;}
  try{
    const res=await Cloud.quoteWithPriceBookReload(quote,reload);
    assert.strictEqual(res.staff.total,4500);
  }catch(e){shown.push(e.message);}
  assert.deepStrictEqual(shown,[]);
  assert.deepStrictEqual(calls,[4,9]);
});

(async()=>{
  await Promise.all(pending);
  if(failed){console.error(failed+' failed');process.exit(1);}
  console.log('price book reload checks passed');
})();
