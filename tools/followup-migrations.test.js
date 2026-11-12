'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const followup=read('supabase/migrations/20261112110000_cost_model_followup.sql');
const trigger=read('supabase/migrations/20261112113000_price_book_version_trigger.sql');
const unique=read('supabase/migrations/20261112120000_jobs_job_number_unique.sql');
const previous=read('supabase/migrations/20261112053000_cost_model_owner_defaults.sql');
const quote=read('js/quote-core.js');
const record=read('supabase/migrations/20261110160000_record_approved_discount_columns.sql');
const numbering=read('supabase/migrations/20261111090000_job_numbering.sql');

function forbidDataLoss(sql,file){
  assert.ok(!/\bdelete\s+from\b/i.test(sql),file+' deletes rows');
  assert.ok(!/\bdrop\s+table\b/i.test(sql),file+' drops a table');
  assert.ok(!/\btruncate\b/i.test(sql),file+' truncates');
  assert.ok(!/\bdrop\s+column\b/i.test(sql),file+' drops a column');
}

check('shared js copies stay byte-identical',()=>{
  for(const name of ['epoxy-engine.js','quote-core.js','price-sanity.js','discount-approval.js']){
    assert.strictEqual(read('js/'+name),read('supabase/functions/_shared/'+name),name);
  }
});

check('setup label says Owner and repo URLs stay',()=>{
  const gate=read('js/es-gate.js');
  const app=read('js/guided-app.js');
  assert.ok(gate.includes('Owner: follow <b>SUPABASE_SETUP.md</b>'));
  assert.ok(!gate.includes('Owner (Double)'));
  assert.ok(app.includes('REVIEW WITH OWNER'));
  assert.ok(app.includes('Confirm with Owner which area(s)'));
  assert.ok(app.includes('Open product confirmations for Owner / manufacturer:'));
  assert.ok(!/Owner \(Double\)|REVIEW WITH DOUBLE|Confirm with Double|for Double/.test(gate+'\n'+app));
  assert.ok(read('public-config.js').includes('https://doublehpops.github.io/exotic-splash-estimator/index.html'));
  assert.ok(read('SUPABASE_SETUP.md').includes('https://doublehpops.github.io'));
});

check('flake follow-up creates products before products.flake and copies the earlier object',()=>{
  forbidDataLoss(followup,'followup');
  const pairs=["'label', 'Decorative flakes (40 lb box)'","'size', 40","'price', 108","'coverage', 0","'unit', 'lb'"];
  const prevAt=previous.indexOf(pairs[0]);
  const nextAt=followup.indexOf(pairs[0]);
  assert.ok(prevAt>0&&nextAt>0);
  for(const pair of pairs){
    assert.ok(previous.includes(pair),pair);
    assert.ok(followup.includes(pair),pair);
  }
  assert.ok(followup.indexOf("'{products}'")<followup.indexOf("'{products,flake}'"));
  assert.ok(followup.includes('coalesce(p.owner_settings->\'products\', \'{}\'::jsonb)'));
  assert.ok(followup.includes('where p.id = 1'));
  assert.ok(followup.includes('where id = 1'));
  assert.ok(followup.includes('version = version + 1'));
  assert.ok(followup.includes('version = 7'));
  assert.ok(followup.includes("set_config('es.price_book_version_assigned', 'on', true)"));
  assert.ok(!/\bdrop\b/i.test(followup));
});

check('version trigger bumps once unless the update already changes version',()=>{
  forbidDataLoss(trigger,'trigger');
  assert.ok(trigger.includes('new.staff_settings is distinct from old.staff_settings'));
  assert.ok(trigger.includes('new.version is not distinct from old.version'));
  assert.ok(!/new\.version\s*:=/.test(trigger),'row trigger must not rewrite version');
  assert.ok(trigger.includes('version = version + 1'));
  assert.ok(trigger.includes("set_config('es.price_book_version_assigned', 'on', true)"));
  assert.ok(trigger.includes("set_config('es.price_book_staff_needs_bump', 'on', true)"));
  assert.ok(trigger.includes("current_setting('es.price_book_version_assigned', true)"));
  assert.ok(trigger.includes('deferrable initially deferred'));
  assert.ok(trigger.includes('after update of owner_settings on public.price_book_owner'));
  assert.ok(trigger.includes('after update of staff_settings on public.price_book'));
  assert.ok(trigger.includes('before update on public.price_book'));
  assert.ok(/drop trigger if exists price_book_note_version/i.test(trigger));
  assert.ok(!/\bdrop\s+(table|function|index|schema)\b/i.test(trigger));
  assert.ok(quote.includes('priceBookVersion:pb.version'));
  assert.ok(quote.includes('p_price_book_version:pb.version'));
  assert.ok(/changed since\|changed during/.test(quote));
  assert.ok(record.includes('Price book changed during quote calculation'));
  assert.ok(record.includes('if v_pbv <> p_price_book_version then'));
});

check('job-number unique index fails safe and does not rewrite rows',()=>{
  forbidDataLoss(unique,'unique');
  assert.ok(numbering.includes('new.job_number'));
  assert.ok(unique.includes('public.jobs'));
  assert.ok(unique.includes('where job_number is not null'));
  assert.ok(unique.includes('having count(*) > 1'));
  assert.ok(/raise exception/i.test(unique));
  assert.ok(unique.includes('does not renumber or delete rows'));
  assert.ok(unique.includes('jobs_job_number_unique'));
  assert.ok(unique.includes('create unique index jobs_job_number_unique on public.jobs (job_number)'));
  assert.ok(unique.toLowerCase().indexOf('raise exception')<unique.toLowerCase().indexOf('create unique index'));
  assert.ok(!/\bupdate\s+public\.jobs\b/i.test(unique));
  assert.ok(!/\bdelete\s+from\b/i.test(unique));
});

/* Deferred bump: remember a settings change, and at commit add one version
   only when this transaction never assigned one itself. */
function runBook(start,steps){
  let version=start;
  let assigned=false;
  let staffNeeds=false;
  let ownerNeeds=false;
  let staff='{}';
  let owner='{}';
  for(const step of steps){
    if(step.flag)assigned=true;
    if(step.price){
      const staffChanged=step.price.staff!==staff;
      const versionChanged=step.price.version!==version;
      if(staffChanged&&!versionChanged)staffNeeds=true;
      if(versionChanged)assigned=true;
      staff=step.price.staff;
      version=step.price.version;
    }
    if(step.owner&&step.owner!==owner){owner=step.owner;ownerNeeds=true}
  }
  if(!assigned&&(staffNeeds||ownerNeeds))version+=1;
  return version;
}

check('owner_update_price_book does not double-bump',()=>{
  const staff='{"rates":1}';
  const owner='{"products":{"flake":true}}';
  assert.strictEqual(runBook(7,[
    {price:{staff,version:8}},
    {owner}
  ]),8,'staff and version, then owner settings');
  assert.strictEqual(runBook(7,[
    {owner},
    {price:{staff,version:8}}
  ]),8,'owner settings, then staff and version');
  assert.strictEqual(runBook(7,[
    {price:{staff,version:7}}
  ]),8,'staff change that leaves version untouched');
  assert.strictEqual(runBook(7,[
    {owner}
  ]),8,'owner settings only');
  assert.strictEqual(runBook(7,[
    {owner},
    {price:{staff,version:7}}
  ]),8,'both settings, neither statement assigns version');
  assert.strictEqual(runBook(7,[
    {flag:true},
    {owner},
    {price:{staff:'{}',version:8}}
  ]),8,'follow-up migration assigns the single bump itself');
  assert.strictEqual(runBook(8,[
    {flag:true}
  ]),8,'second run leaves a book that is already past 7');
  assert.strictEqual(runBook(7,[
    {price:{staff,version:7}},
    {price:{staff,version:8}}
  ]),8,'staff write, then a separate version assignment');
});

if(failed){console.error(failed+' failed');process.exit(1)}
console.log('all follow-up migration checks passed');
