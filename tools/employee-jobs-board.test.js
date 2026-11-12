'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

function el(id){
  return {
    id:id||'',
    hidden:false,
    innerHTML:'',
    textContent:'',
    value:'',
    dataset:{},
    style:{},
    className:'',
    classList:{
      add(){},remove(){},toggle(){return false},contains(){return false}
    },
    appendChild(){},
    setAttribute(){},
    getAttribute(){return null},
    addEventListener(){},
    querySelector(){return null},
    querySelectorAll(){return []},
    closest(){return null},
    children:[],
    open:false,
    showModal(){this.open=true},
    close(){this.open=false}
  };
}
const els={};
const store=new Map();
global.window=global;
global.document={
  getElementById(id){if(!els[id])els[id]=el(id);return els[id]},
  createElement(){return el('')},
  addEventListener(){},
  querySelector(){return null},
  querySelectorAll(){return []},
  body:el('body'),
  documentElement:{style:{setProperty(){}}}
};
global.localStorage={
  getItem(k){return store.has(k)?store.get(k):null},
  setItem(k,v){store.set(k,String(v))},
  removeItem(k){store.delete(k)}
};
global.scrollTo=()=>{};
global.confirm=()=>false;
global.alert=()=>{};

const E=require('../js/epoxy-engine');
const B=require('../ui/job-board');
global.EsJobBoard=B;
require('../js/guided-app.js');
const G=global.GuidedApp;

const filters=B.defaultFilters();
filters.system='flake';
filters.sort='price-asc';
localStorage.setItem(B.FILTER_KEY,JSON.stringify(filters));

const settings=JSON.parse(JSON.stringify(E.defaults));
settings.business.crews=['North crew','South crew'];
G.boot({
  mode:'auth',
  profile:{id:'emp-1',email:'sam@example.com',full_name:'Sam Ellis',role:'employee',active:true},
  settings,
  estimatorDirectory:{'emp-1':'Sam Ellis'},
  onSave(){},
  jobs:[
    {id:'flake-job',number:'ES-20261101-01',customer:'Alex Rivera',company:'Rivera Auto Care',phone:'312-555-0148',address:'1200 W Hubbard St, Chicago, IL 60622',city:'Chicago',projectType:'floor',priceOption:'regular',areas:[{name:'Shop',sqft:450,sqftMode:'manual',style:'flake',moisture:false}],assignedCrew:'North crew',_status:'quoted',_estimatorName:'Sam Ellis',_createdBy:'emp-1',date:'2026-11-01',createdAt:'2026-11-01T00:00:00.000Z',updatedAt:'2026-11-11T00:00:00.000Z',_updatedAt:'2026-11-11T00:00:00.000Z'},
    {id:'solid-job',number:'ES-20261103-03',customer:'Oak Park Library',phone:'708-555-0133',address:'834 Lake St, Oak Park, IL 60302',city:'Oak Park',projectType:'floor',priceOption:'opt2',areas:[{name:'Room',sqft:100,sqftMode:'manual',style:'solid',moisture:false}],assignedCrew:'South crew',_status:'draft',_estimatorName:'Preview Owner',_createdBy:'own-1',date:'2026-10-20',createdAt:'2026-10-18T00:00:00.000Z',updatedAt:'2026-11-03T00:00:00.000Z',_updatedAt:'2026-11-03T00:00:00.000Z',markup:42.86}
  ]
});
G.go('jobs');
const html=document.getElementById('main').innerHTML;

check('employee jobs view renders search, filters, and sort',()=>{
  assert.ok(html.includes('data-jobs-role="employee"'));
  assert.ok(html.includes('id="jobBoardQuery"'));
  for(const key of ['status','type','system','tier','garageSize','city','zip','crew','estimator','dateField','sort','group']){
    assert.ok(html.includes('data-board-filter="'+key+'"'),key);
  }
  assert.ok(html.includes('Who took the estimate'));
  assert.ok(html.includes('Customer total min'));
  assert.ok(html.includes('Customer total max'));
  assert.ok(html.includes('value="price-asc" selected'));
  assert.ok(html.includes('value="flake" selected'));
  assert.ok(html.includes('Alex Rivera'));
  assert.ok(!html.includes('Oak Park Library'));
  assert.ok(html.includes('$4,500.00'));
});

check('employee jobs view has no delete or archive controls',()=>{
  assert.ok(!html.includes('data-job-delete'));
  assert.ok(!html.includes('data-job-archive'));
  assert.ok(!html.includes('jobBoardDeleteSelected'));
  assert.ok(!html.includes('data-job-select'));
  assert.ok(!/>\s*Archive\s*</.test(html));
  assert.ok(!/>\s*Delete\s*</.test(html));
  assert.ok(!/>\s*Unarchive\s*</.test(html));
});

check('employee jobs view has no cost, margin, or profit fields',()=>{
  assert.ok(!/\bmargin\b/i.test(html));
  assert.ok(!/\bmarkup\b/i.test(html));
  assert.ok(!/\bprofit\b/i.test(html));
  assert.ok(!/\bcost\b/i.test(html));
  assert.ok(!html.includes('42.86'));
  assert.ok(!html.includes('42.5'));
  assert.ok(html.includes('Customer total'));
});

check('staff names for the estimator filter stay on the staff directory or fail quietly',()=>{
  const sql=read('supabase/migrations/20261112160000_jobs_board.sql');
  const directory=sql.slice(sql.indexOf('function public.staff_directory'),sql.indexOf('function public.owner_delete_jobs'));
  assert.ok(directory.includes('private.is_active_staff()'));
  assert.ok(!directory.includes('private.is_owner()'));
  assert.ok(!/email/i.test(directory));
  const cloud=read('js/es-cloud.js');
  assert.ok(cloud.includes(".select('id,full_name')"));
  assert.ok(!cloud.includes(".select('id,full_name,email')"));
  const gate=read('js/es-gate.js');
  assert.ok(gate.includes('catch(e){}'));
  assert.ok(gate.includes('listProfileNames'));
  assert.ok(cloud.includes("client.from('jobs').select"));
});

if(failed){console.error(failed+' failed');process.exit(1)}
console.log('employee jobs board tests passed');
