'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const sql=read('supabase/migrations/20261112210000_jobs_status_owner_only.sql');

/* JS mirror of private.jobs_guard_status(). A trusted server write and an
 * owner write may change status. Anyone else, including an employee, may not.
 * Inserts and updates that leave status alone are allowed. */
function statusChangeAllowed(input){
  const op=input&&input.op||'UPDATE';
  const trusted=!!(input&&input.trusted);
  const owner=!!(input&&input.role==='owner'&&input.active!==false);
  const changed=String(input&&input.oldStatus)!==String(input&&input.newStatus);
  if(op!=='UPDATE'||!changed||trusted||owner)return {ok:true};
  return {ok:false,code:'42501',error:'Only the owner can change job status'};
}

check('migration sorts after the applied follow-up migration and does not remove rows',()=>{
  const names=fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql'));
  const versions=names.map(n=>n.slice(0,14)).sort();
  assert.ok(versions.includes('20261112210000'));
  assert.ok(versions.indexOf('20261112210000')>versions.indexOf('20261112203000'));
  assert.ok(!versions.includes('20261112190000'));
  assert.ok(versions.indexOf('20261112211500')>versions.indexOf('20261112210000'));
  assert.ok(sql.includes('Not applied by the pull request that adds this file'));
  assert.ok(sql.includes('private.is_owner()'));
  assert.ok(sql.includes("current_setting('es.trusted_job_write', true)"));
  assert.ok(sql.includes('new.status is distinct from old.status'));
  assert.ok(sql.includes("raise exception 'Only the owner can change job status'"));
  assert.ok(sql.includes("errcode = '42501'"));
  assert.ok(sql.includes('before update of status on public.jobs'));
  assert.ok(sql.includes('jobs_guard_status_trg'));
  assert.ok(sql.includes('security definer'));
  assert.ok(sql.includes("set search_path = ''"));
  assert.ok(sql.includes('revoke all on function private.jobs_guard_status() from public, anon, authenticated, service_role'));
  assert.ok(!/\bdelete\s+from\b/i.test(sql));
  assert.ok(!/\bdrop\s+table\b/i.test(sql));
  assert.ok(!/\btruncate\b/i.test(sql));
  assert.ok(!/grant execute/i.test(sql));
  assert.ok(sql.indexOf('jobs_guard_status_trg')>0);
  assert.ok(sql.includes('jobs_guard_trg'),'comment names the earlier trigger so the order stays obvious');
});

check('mirror rejects an employee status change and allows owner, trusted, and field edits',()=>{
  assert.deepStrictEqual(statusChangeAllowed({role:'employee',active:true,oldStatus:'draft',newStatus:'quoted'}),{ok:false,code:'42501',error:'Only the owner can change job status'});
  assert.deepStrictEqual(statusChangeAllowed({role:'employee',active:true,oldStatus:'quoted',newStatus:'draft'}),{ok:false,code:'42501',error:'Only the owner can change job status'});
  assert.deepStrictEqual(statusChangeAllowed({role:'employee',active:true,oldStatus:'quoted',newStatus:'issued'}),{ok:false,code:'42501',error:'Only the owner can change job status'});
  assert.deepStrictEqual(statusChangeAllowed({role:'employee',active:true,oldStatus:'archived',newStatus:'draft'}),{ok:false,code:'42501',error:'Only the owner can change job status'});
  assert.strictEqual(statusChangeAllowed({role:'employee',oldStatus:'draft',newStatus:'draft'}).ok,true);
  assert.strictEqual(statusChangeAllowed({op:'INSERT',role:'employee',oldStatus:'',newStatus:'draft'}).ok,true);
  assert.strictEqual(statusChangeAllowed({role:'owner',active:true,oldStatus:'draft',newStatus:'issued'}).ok,true);
  assert.strictEqual(statusChangeAllowed({role:'owner',active:true,oldStatus:'archived',newStatus:'quoted'}).ok,true);
  assert.strictEqual(statusChangeAllowed({role:'employee',trusted:true,oldStatus:'draft',newStatus:'quoted'}).ok,true);
  assert.strictEqual(statusChangeAllowed({role:'employee',trusted:true,oldStatus:'quoted',newStatus:'issued'}).ok,true);
  assert.strictEqual(statusChangeAllowed({role:'employee',active:false,oldStatus:'draft',newStatus:'quoted'}).ok,false);
  assert.ok(sql.includes('not v_trusted'));
  assert.ok(sql.includes('not private.is_owner()'));
  assert.ok(sql.includes("tg_op = 'UPDATE'"));
});

function el(id){
  return {id:id||'',hidden:false,innerHTML:'',textContent:'',value:'',dataset:{},style:{},className:'',
    classList:{add(){},remove(){},toggle(){return false},contains(){return false}},
    appendChild(){},setAttribute(){},getAttribute(){return null},addEventListener(){},
    querySelector(){return null},querySelectorAll(){return []},closest(){return null},children:[],
    open:false,showModal(){this.open=true},close(){this.open=false}};
}

check('employee job screens do not offer a status change',()=>{
  const els={};
  global.window=global;
  global.document={
    getElementById(id){if(!els[id])els[id]=el(id);return els[id]},
    createElement(){return el('')},
    addEventListener(){},querySelector(){return null},querySelectorAll(){return []},
    body:el('body'),documentElement:{style:{setProperty(){}}}
  };
  global.localStorage={getItem(){return null},setItem(){},removeItem(){}};
  global.scrollTo=()=>{};
  global.confirm=()=>false;
  global.alert=()=>{};
  const E=require('../js/epoxy-engine');
  global.EsJobBoard=require('../ui/job-board');
  require('../js/guided-app.js');
  const G=global.GuidedApp;
  const settings=JSON.parse(JSON.stringify(E.defaults));
  const job={id:'flake-job',number:'ES-20261101-01',customer:'Alex Rivera',company:'Rivera Auto Care',phone:'312-555-0148',address:'1200 W Hubbard St, Chicago, IL 60622',city:'Chicago',projectType:'floor',priceOption:'regular',areas:[{name:'Shop',sqft:450,sqftMode:'manual',style:'flake',moisture:false,coats:1}],assignedCrew:'North crew',_status:'quoted',_estimatorName:'Sam Ellis',_createdBy:'emp-1',date:'2026-11-01',createdAt:'2026-11-01T00:00:00.000Z',updatedAt:'2026-11-11T00:00:00.000Z',_updatedAt:'2026-11-11T00:00:00.000Z'};
  G.boot({mode:'auth',profile:{id:'emp-1',role:'employee',active:true,full_name:'Sam Ellis'},settings,jobs:[job],onSave(){},requestPreview(){}});
  G.go('jobs');
  const jobs=document.getElementById('main').innerHTML;
  assert.ok(jobs.includes('data-jobs-role="employee"'));
  assert.ok(!jobs.includes('data-job-archive'));
  assert.ok(!jobs.includes('saveAsIssued'));
  assert.ok(!/>\s*Archive\s*</.test(jobs));
  assert.ok(!/>\s*Save as issued\s*</.test(jobs));
  G.goStep('review');
  const review=document.getElementById('main').innerHTML;
  assert.ok(!review.includes('id="saveAsIssued"'));
  assert.ok(!review.includes('Save as issued'));
  G.boot({mode:'auth',profile:{id:'own-1',role:'owner',active:true,full_name:'Owner'},settings,jobs:[job],onSave(){},requestPreview(){}});
  G.goStep('review');
  const owner=document.getElementById('main').innerHTML;
  assert.ok(owner.includes('id="saveAsIssued"'));
  assert.ok(owner.includes('Save as issued'));
  const app=read('js/guided-app.js');
  assert.ok(app.includes("if(!isOwner()){toast('Only the owner can change job status.');break}"));
  const cloud=read('js/es-cloud.js');
  assert.ok(cloud.indexOf('Only the owner can change job status')<cloud.indexOf("if(/Only the owner/i.test(m))"));
});

check('garage polyaspartic topcoat is priced per sq ft and flatwork stays per item',()=>{
  const P=require('../js/price-proposals');
  const E=require('../js/epoxy-engine');
  const rows=P.inventory(E.defaults);
  assert.strictEqual(rows.find(r=>r.path==='catalog.garage.topcoatAdj.premium').unit,'USD per sq ft');
  assert.strictEqual(rows.find(r=>r.path==='catalog.garage.topcoatAdj.protective').unit,'USD per package');
  assert.strictEqual(rows.find(r=>r.path==='catalog.flatwork.topcoatAdj.premium').unit,'USD per item');
  assert.strictEqual(rows.find(r=>r.path==='catalog.seating.topcoatAdj.premium').unit,'USD per item');
  const app=read('js/guided-app.js');
  assert.ok(app.includes('Polyaspartic topcoat ($/sq ft)'));
  assert.ok(app.includes('Flat dollars for one table, bar, or countertop. Not a per-sq-ft rate.'));
  assert.ok(app.includes("premium:'Polyaspartic topcoat ($/sq ft)'"));
  const disk=read('docs/field-inventory.md');
  assert.ok(disk.includes('| `catalog.garage.topcoatAdj.premium` | garage | selling | unconfigured | awaiting_corrected_source | — | USD per sq ft |'));
  assert.ok(disk.includes('| `catalog.flatwork.topcoatAdj.premium` | flatwork | selling | unconfigured | awaiting_sourced_estimate | — | USD per item |'));
});

if(failed){console.error(failed+' failed');process.exit(1)}
console.log('job status owner tests passed');
