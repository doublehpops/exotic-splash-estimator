'use strict';
const assert=require('assert');
const B=require('../ui/job-board');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

function job(over){
  return Object.assign({
    id:'j',
    customer:'Alex Rivera',
    company:'Rivera Auto Care',
    address:'1200 W Hubbard St, Chicago, IL 60622',
    phone:'312-555-0148',
    number:'ES-20261101-01',
    projectType:'floor',
    priceOption:'regular',
    areas:[{style:'flake'}],
    assignedCrew:'North crew',
    estimatorName:'Preview Owner',
    createdAt:'2026-11-01T12:00:00.000Z',
    updatedAt:'2026-11-08T12:00:00.000Z',
    date:'2026-11-03',
    _status:'quoted',
    customerTotal:4500
  },over||{});
}

function mem(){
  const m=new Map();
  return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v))};
}

check('free-text search hits customer, company, address, city, zip, job number, and phone last 4',()=>{
  const rows=[job(),job({id:'b',customer:'Sam',company:'North Hall',address:'10 Main St, Berwyn, IL 60402',phone:'708-555-0199',number:'ES-20261102-02',areas:[{style:'solid'}],customerTotal:2750})];
  assert.strictEqual(B.apply(rows,{q:'rivera'}).jobs.length,1);
  assert.strictEqual(B.apply(rows,{q:'north hall'}).jobs[0].id,'b');
  assert.strictEqual(B.apply(rows,{q:'hubbard'}).jobs[0].id,'j');
  assert.strictEqual(B.apply(rows,{q:'berwyn'}).jobs[0].id,'b');
  assert.strictEqual(B.apply(rows,{q:'60402'}).jobs[0].id,'b');
  assert.strictEqual(B.apply(rows,{q:'ES-20261102-02'}).jobs[0].id,'b');
  assert.strictEqual(B.apply(rows,{q:'0148'}).jobs.length,1);
  assert.strictEqual(B.apply(rows,{q:'0148'}).jobs[0].id,'j');
  assert.strictEqual(B.apply(rows,{q:'148'}).jobs.length,0);
  assert.strictEqual(B.apply(rows,{q:'3125550148'}).jobs[0].id,'j');
});

check('filters status, type, system, tier, garage size, city, zip, crew, and estimator',()=>{
  const rows=[
    job(),
    job({id:'g',projectType:'garage',garagePackage:'2car',garageStyle:'metallic',areas:[],priceOption:'opt1',address:'1 Oak St, Oak Park, IL 60302',assignedCrew:'',estimatorName:'Sam Ellis',_status:'issued',customerTotal:5200,zip:'60302',city:'Oak Park'}),
    job({id:'a',_status:'archived',customerTotal:1000,areas:[{style:'solid'}]})
  ];
  assert.strictEqual(B.apply(rows,{status:'issued'}).jobs[0].id,'g');
  assert.strictEqual(B.apply(rows,{type:'garage'}).jobs.length,1);
  assert.strictEqual(B.apply(rows,{system:'flake'}).jobs.length,1);
  assert.strictEqual(B.apply(rows,{system:'metallic'}).jobs[0].id,'g');
  assert.strictEqual(B.apply(rows,{tier:'opt1'}).jobs[0].id,'g');
  assert.strictEqual(B.apply(rows,{garageSize:'2car'}).jobs[0].id,'g');
  assert.strictEqual(B.apply(rows,{garageSize:'1car'}).jobs.length,0);
  assert.strictEqual(B.apply(rows,{city:'Oak Park'}).jobs[0].id,'g');
  assert.strictEqual(B.apply(rows,{zip:'60622'}).jobs[0].id,'j');
  assert.strictEqual(B.apply(rows,{crew:'North crew'}).jobs[0].id,'j');
  assert.strictEqual(B.apply(rows,{crew:'__unassigned__'}).jobs[0].id,'g');
  assert.strictEqual(B.apply(rows,{estimator:'Sam Ellis'}).jobs[0].id,'g');
  assert.strictEqual(B.apply(rows,{}).jobs.some(r=>r.id==='a'),false);
  assert.strictEqual(B.apply(rows,{showArchived:true}).jobs.some(r=>r.id==='a'),true);
  assert.strictEqual(B.apply(rows,{status:'archived'}).jobs[0].id,'a');
});

check('date range uses the selected field and price range uses customer total only',()=>{
  const priced=job({customerTotal:4500,cost:99,margin:80,profit:4000,markup:42});
  assert.strictEqual(B.priceOf(priced),4500);
  assert.strictEqual(B.apply([priced],{priceMin:'4000',priceMax:'5000'}).jobs.length,1);
  assert.strictEqual(B.apply([priced],{priceMin:'100',priceMax:'200'}).jobs.length,0);
  const pending=job({id:'p',customerTotal:null,cost:9000});
  assert.strictEqual(B.priceOf(pending),null);
  assert.strictEqual(B.apply([pending],{priceMax:'1'}).jobs.length,0);
  assert.strictEqual(B.apply([pending],{}).jobs.length,1);
  const early=job({id:'e',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-11-02T00:00:00.000Z',date:'2026-10-15'});
  const late=job({id:'l',createdAt:'2026-11-20T00:00:00.000Z',updatedAt:'2026-11-21T00:00:00.000Z',date:'2026-11-20'});
  const rows=[early,late];
  assert.deepStrictEqual(B.apply(rows,{dateField:'created',dateFrom:'2026-11-01',dateTo:'2026-11-30'}).jobs.map(r=>r.id),['l']);
  assert.deepStrictEqual(B.apply(rows,{dateField:'job',dateFrom:'2026-10-01',dateTo:'2026-10-31'}).jobs.map(r=>r.id),['e']);
  assert.deepStrictEqual(B.apply(rows,{dateField:'updated',dateFrom:'2026-11-21',dateTo:'2026-11-21'}).jobs.map(r=>r.id),['l']);
});

check('sort and group cover the jobs-board choices',()=>{
  const rows=[
    job({id:'b',customer:'Zoe',number:'ES-20261102-02',updatedAt:'2026-11-02T00:00:00.000Z',date:'2026-11-02',customerTotal:100,assignedCrew:'South crew',estimatorName:'Sam',address:'1 A St, Berwyn, IL 60402'}),
    job({id:'a',customer:'Ann',number:'ES-20261103-10',updatedAt:'2026-11-09T00:00:00.000Z',date:'2026-11-09',customerTotal:800,assignedCrew:'North crew',estimatorName:'Preview Owner'})
  ];
  assert.deepStrictEqual(B.apply(rows,{sort:'updated-desc'}).jobs.map(r=>r.id),['a','b']);
  assert.deepStrictEqual(B.apply(rows,{sort:'updated-asc'}).jobs.map(r=>r.id),['b','a']);
  assert.deepStrictEqual(B.apply(rows,{sort:'date-asc'}).jobs.map(r=>r.id),['b','a']);
  assert.deepStrictEqual(B.apply(rows,{sort:'price-desc'}).jobs.map(r=>r.id),['a','b']);
  assert.deepStrictEqual(B.apply(rows,{sort:'price-asc'}).jobs.map(r=>r.id),['b','a']);
  assert.deepStrictEqual(B.apply(rows,{sort:'customer-asc'}).jobs.map(r=>r.id),['a','b']);
  assert.deepStrictEqual(B.apply(rows,{sort:'number-asc'}).jobs.map(r=>r.id),['b','a']);
  const grouped=B.apply(rows,{group:'crew',sort:'customer-asc'});
  assert.deepStrictEqual(grouped.groups.map(g=>g.label),['North crew','South crew']);
  assert.strictEqual(B.apply(rows,{group:'city'}).groups.some(g=>g.label==='Chicago'),true);
  assert.strictEqual(B.apply(rows,{group:'estimator'}).groups.length,2);
  assert.strictEqual(B.apply(rows,{group:'status'}).groups[0].label,'Quoted');
  assert.strictEqual(B.apply(rows,{group:'type'}).groups[0].label,'Floors');
});

check('system filter uses garage style for garages and area style for other jobs',()=>{
  const garage=job({projectType:'garage',garageStyle:'solid',areas:[{style:'flake'}]});
  assert.strictEqual(B.matches(garage,{system:'solid'}),true);
  assert.strictEqual(B.matches(garage,{system:'flake'}),false);
  const floor=job({projectType:'floor',garageStyle:'flake',areas:[{style:'metallic'}]});
  assert.strictEqual(B.matches(floor,{system:'metallic'}),true);
  assert.strictEqual(B.matches(floor,{system:'flake'}),false);
  const seating=job({projectType:'seating',garageStyle:'flake',areas:[],catalogItems:[{style:'solid'}]});
  assert.strictEqual(B.matches(seating,{system:'solid'}),true);
  assert.strictEqual(B.matches(seating,{system:'flake'}),false);
});

check('last filter choice persists and drops anything outside the filter list',()=>{
  const store=mem();
  B.saveFilters(store,Object.assign(B.defaultFilters(),{q:'oak',system:'flake',showArchived:true,cost:12,margin:9,markup:4}));
  const saved=JSON.parse(store.getItem(B.FILTER_KEY));
  assert.strictEqual(saved.q,'oak');
  assert.strictEqual(saved.system,'flake');
  assert.strictEqual(saved.showArchived,true);
  assert.strictEqual(saved.cost,undefined);
  assert.ok(!Object.prototype.hasOwnProperty.call(saved,'margin'));
  assert.ok(!Object.prototype.hasOwnProperty.call(saved,'markup'));
  const again=B.loadFilters(store);
  assert.strictEqual(again.q,'oak');
  assert.strictEqual(again.showArchived,true);
  store.setItem(B.FILTER_KEY,'{');
  assert.strictEqual(B.loadFilters(store).sort,'updated-desc');
  store.setItem(B.FILTER_KEY,JSON.stringify({sort:'nope',group:'nope',dateField:'nope',showArchived:'yes'}));
  const cleaned=B.loadFilters(store);
  assert.strictEqual(cleaned.sort,'updated-desc');
  assert.strictEqual(cleaned.group,'none');
  assert.strictEqual(cleaned.dateField,'updated');
  assert.strictEqual(cleaned.showArchived,false);
});

check('delete confirmation is the job number, or DELETE plus the count',()=>{
  assert.strictEqual(B.expectedDeletePhrase([{number:'ES-20261101-01'}]),'ES-20261101-01');
  assert.strictEqual(B.expectedDeletePhrase([{number:'ES-1'},{number:'ES-2'},{number:'ES-3'}]),'DELETE 3');
  assert.strictEqual(B.phraseMatches('ES-20261101-01','ES-20261101-01'),true);
  assert.strictEqual(B.phraseMatches('es-20261101-01','ES-20261101-01'),false);
  assert.strictEqual(B.phraseMatches('DELETE 2','DELETE 3'),false);
  assert.strictEqual(B.phraseMatches('','ES-1'),false);
  assert.strictEqual(B.expectedDeletePhrase([]),'');
});

if(failed){console.error(failed+' failed');process.exit(1)}
console.log('job-board tests passed');
