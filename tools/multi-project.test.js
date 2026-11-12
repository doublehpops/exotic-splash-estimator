'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');
const B=require('../ui/job-board');
const V=require('../js/es-estimate-view');
const DA=require('../js/discount-approval');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

function floorJob(sqft,style){
  const j=E.newJob();
  j.customer='Pat';j.tax=0;j.miles=0;j.minutes=0;j.discount=0;
  j.areas[0].sqft=sqft;j.areas[0].style=style||'flake';j.areas[0].coats=1;j.areas[0].flake='light';
  j.areas[0].level=false;j.areas[0].moisture=false;j.areas[0].grip=false;
  return j;
}
function pricedBook(){
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.catalog.flatwork.sizeBands[0].starting=640;
  s.catalog.flatwork.materialAdj.solid=0;
  s.catalog.flatwork.conditionAdj.good=0;
  s.catalog.seating.byType.chair=90;
  s.catalog.seating.materialAdj.solid=0;
  s.catalog.seating.conditionAdj.good=0;
  return s;
}
function garageHome(){
  const j=E.newJob();
  Object.assign(j,{
    customer:'Pat',projectType:'garage',garagePackage:'2car',garageStyle:'flake',
    garageTopcoat:'protective',garageCondition:'good',priceOption:'regular',
    miles:0,minutes:0,tax:0,address:'10 Home Lane, Chicago, IL 60622',sectionLabel:'Home garage'
  });
  return j;
}

check('single-project fixtures keep the same totals with or without an empty section list',()=>{
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','smoke-jobs.json'),'utf8'));
  for(const row of fixture.jobs){
    const j=E.newJob();
    j.customer='Smoke';j.tax=0;j.miles=0;j.minutes=0;j.discount=0;j.addOnIncluded=false;
    j.projectType=row.projectType;j.priceOption=row.priceOption||'regular';
    if(row.projectType==='garage'){
      j.garagePackage=row.garagePackage;j.garageStyle=row.style||'flake';
      j.garageTopcoat='protective';j.garageCondition='good';
    }else{
      Object.assign(j.areas[0],{sqft:row.sqft,style:row.style||'solid',flake:'light',coats:1,level:false,moisture:false,grip:false,rate:null});
    }
    const plain=E.calculate(j,E.defaults);
    const empty=E.calculate(Object.assign({},j,{sections:[]}),E.defaults);
    assert.strictEqual(plain.total,row.total,row.id);
    assert.strictEqual(empty.total,plain.total,row.id+' empty sections');
    assert.strictEqual(empty.minimum,plain.minimum,row.id+' minimum');
    assert.strictEqual(plain.multi,undefined);
    const server=Q.computeQuote(E,{jobData:j,staffSettings:{},ownerSettings:{},markupPct:null}).x;
    assert.strictEqual(server.total,plain.total,row.id+' server');
  }
  const sample=floorJob(250,'solid');
  assert.strictEqual(DA.revisionOf(sample,2750),DA.revisionOf(Object.assign({},sample,{sections:[]}),2750));
});

check('garage plus a table plus chairs prices each section and sums once',()=>{
  const book=pricedBook();
  const j=garageHome();
  const table=E.newSection('flatwork');
  table.label='Dining table';
  table.catalogItems[0].name='Dining table';
  table.catalogItems[0].kind='table';
  table.catalogItems[0].length=2;table.catalogItems[0].width=2;table.catalogItems[0].condition='good';
  const chairs=E.newSection('seating');
  chairs.label='Dining chairs';
  chairs.catalogItems[0].name='Dining chair';
  chairs.catalogItems[0].seatType='chair';
  chairs.catalogItems[0].qty=4;
  chairs.catalogItems[0].condition='good';
  j.sections=[table,chairs];
  const x=E.calculate(j,book);
  assert.strictEqual(x.quoteReady,true);
  assert.deepStrictEqual(x.sections.map(s=>s.subtotal),[5500,640,360]);
  assert.strictEqual(x.total,5500+640+360);
  assert.strictEqual(x.minimum,0);
  assert.strictEqual(x.selected.payments.length,0);
  const server=Q.computeQuote(E,{jobData:j,staffSettings:book,ownerSettings:book,markupPct:null}).x;
  assert.strictEqual(server.total,x.total);
  assert.deepStrictEqual(server.sections.map(s=>s.subtotal),x.sections.map(s=>s.subtotal));
});

check('garage at home plus a bar at a second address keeps both locations',()=>{
  const j=garageHome();
  const bar=E.newSection('flatwork');
  bar.label='Bar';
  bar.address='200 Bar St, Oak Park, IL 60302';
  bar.catalogItems[0].name='Bar top';
  bar.catalogItems[0].kind='bar';
  bar.catalogItems[0].length=8;bar.catalogItems[0].width=2;
  bar.catalogItems[0].customStarting=2200;
  bar.catalogItems[0].condition='good';
  j.sections=[bar];
  const x=E.calculate(j,E.defaults);
  assert.strictEqual(x.quoteReady,true);
  assert.strictEqual(x.sections[0].address,'10 Home Lane, Chicago, IL 60622');
  assert.strictEqual(x.sections[0].subtotal,5500);
  assert.strictEqual(x.sections[1].label,'Bar');
  assert.strictEqual(x.sections[1].address,'200 Bar St, Oak Park, IL 60302');
  assert.strictEqual(x.sections[1].subtotal,2200);
  assert.strictEqual(x.total,7700);
  assert.ok((x.unpricedLines||[]).some(u=>/Material \/ system \(solid\)/.test(String(u))&&/price not set/i.test(String(u))));
  const snap=Q.customerSnapshot(E,j,x,E.defaults);
  assert.strictEqual(snap.sections.length,2);
  assert.strictEqual(snap.sections[1].address,'200 Bar St, Oak Park, IL 60302');
  assert.strictEqual(snap.sections[1].subtotal,2200);
  assert.strictEqual(snap.totals.total,7700);
  const html=V.render({estimate:snap});
  assert.ok(html.includes('10 Home Lane, Chicago, IL 60622'));
  assert.ok(html.includes('200 Bar St, Oak Park, IL 60302'));
  assert.ok(html.includes('Home garage'));
  assert.ok(html.includes('Bar'));
  assert.ok(!/"cost"/.test(JSON.stringify(snap)));
  assert.ok(!html.includes('price not set'));
});

check('the $2,000 minimum is applied once to the whole quote',()=>{
  const j=floorJob(50,'flake');
  j.priceOption='opt1';
  const alone=E.calculate(floorJob(50,'flake'),E.defaults);
  assert.strictEqual(alone.total,2000);
  const second=E.newSection('floor');
  second.label='Second room';
  second.areas[0].sqft=50;second.areas[0].style='flake';second.areas[0].coats=1;
  j.sections=[second];
  j.priceOption='regular';
  const regular=E.calculate(j,E.defaults);
  assert.strictEqual(regular.sections[0].subtotal,500);
  assert.strictEqual(regular.sections[1].subtotal,500);
  assert.strictEqual(regular.minimum,1000);
  assert.strictEqual(regular.minimumLabel,'Minimum job charge');
  assert.strictEqual(regular.total,2000);
  assert.notStrictEqual(regular.total,4000);
  j.priceOption='opt1';
  const tier=E.calculate(j,E.defaults);
  assert.strictEqual(tier.total,2000);
  assert.strictEqual(tier.selected.payments.length,2);
  assert.strictEqual(tier.selected.payments[0].amount,1000);
  assert.strictEqual(tier.selected.payments[0].label,'Booking');
  assert.strictEqual(tier.selected.payments.reduce((s,p)=>s+p.amount,0),2000);
  j.priceOption='regular';
  j.discountApproval={ok:true,amount:250,tier:'regular'};
  const wide=floorJob(200,'flake');
  wide.sections=[Object.assign(E.newSection('floor'),{label:'Other floor',areas:[{sqft:200,style:'flake',coats:1,flake:'light'}]})];
  wide.discountApproval={ok:true,amount:250,tier:'regular'};
  const cut=E.calculate(wide,E.defaults);
  assert.strictEqual(cut.sections[0].subtotal,2000);
  assert.strictEqual(cut.sections[1].subtotal,2000);
  assert.strictEqual(cut.discount,250);
  assert.strictEqual(cut.total,3750);
  assert.strictEqual(cut.choices.opt1.total,3200);
  assert.strictEqual(cut.choices.opt1.discount,0);
});

check('an unpriced extra does not zero or block the quote',()=>{
  const book=JSON.parse(JSON.stringify(E.defaults));
  book.extras.stairs.solid=null;
  const j=floorJob(1000,'flake');
  j.extras.stairsSolid=4;
  const x=E.calculate(j,book);
  assert.strictEqual(x.quoteReady,true);
  assert.strictEqual(x.total,10000);
  assert.ok(!x.lines.some(l=>/Stairs/.test(l.label||'')));
  assert.ok((x.unpricedLines||[]).some(u=>/Stairs \(solid\)/.test(String(u))&&/price not set/i.test(String(u))));
  const snap=Q.customerSnapshot(E,j,x,book);
  assert.ok(!JSON.stringify(snap).includes('Stairs'));
  assert.strictEqual(snap.totals.total,10000);
  const staff=Q.staffSnapshot(E,j,x,book);
  assert.ok(!JSON.stringify(staff).includes('price not set'));
  const internal=Q.internalSnapshot(x,null);
  assert.ok((internal.unpricedLines||[]).some(u=>/price not set/i.test(String(u))));
  const fair=garageHome();
  fair.garageCondition='fair';
  const priced=E.calculate(fair,E.defaults);
  assert.strictEqual(priced.quoteReady,true);
  assert.strictEqual(priced.total,5500);
  assert.ok((priced.unpricedLines||[]).some(u=>/fair/i.test(String(u))));
});

check('jobs board matches a type or address on any section',()=>{
  const row={
    id:'multi',customer:'Pat',number:'ES-1',projectType:'garage',garagePackage:'2car',garageStyle:'flake',
    address:'10 Home Lane, Chicago, IL 60622',priceOption:'regular',areas:[],
    sections:[
      {projectType:'flatwork',address:'200 Bar St, Oak Park, IL 60302',catalogItems:[{style:'solid'}],areas:[]},
      {projectType:'seating',address:'',catalogItems:[{style:'flake'}],areas:[]}
    ],
    customerTotal:7700,_status:'quoted'
  };
  assert.strictEqual(B.matches(row,{type:'garage'}),true);
  assert.strictEqual(B.matches(row,{type:'flatwork'}),true);
  assert.strictEqual(B.matches(row,{type:'seating'}),true);
  assert.strictEqual(B.matches(row,{type:'floor'}),false);
  assert.strictEqual(B.apply([row],{q:'bar st'}).jobs.length,1);
  assert.strictEqual(B.apply([row],{q:'oak park'}).jobs.length,1);
  assert.strictEqual(B.apply([row],{city:'Oak Park'}).jobs.length,1);
  assert.strictEqual(B.apply([row],{zip:'60302'}).jobs.length,1);
  assert.strictEqual(B.apply([row],{system:'solid'}).jobs.length,1);
  const labels=B.apply([row],{group:'type'}).groups.map(g=>g.label);
  assert.ok(labels.indexOf('Garage')>=0);
  assert.ok(labels.indexOf('Tables / counters / bars')>=0);
  assert.ok(labels.indexOf('Chairs / stools')>=0);
});

function el(id){
  return {id:id||'',hidden:false,innerHTML:'',textContent:'',value:'',dataset:{},style:{},className:'',
    classList:{add(){},remove(){},toggle(){return false},contains(){return false}},
    appendChild(){},setAttribute(){},getAttribute(){return null},addEventListener(){},
    querySelector(){return null},querySelectorAll(){return []},closest(){return null},children:[],
    open:false,showModal(){this.open=true},close(){this.open=false}};
}
check('employee views have no cost or margin data',()=>{
  const book=E.defaults;
  const j=floorJob(200,'flake');
  j.sectionLabel='Shop floor';
  j.address='10 Home Lane, Chicago, IL 60622';
  const office=E.newSection('floor');
  office.label='Office';
  office.address='200 Bar St, Oak Park, IL 60302';
  office.areas[0].sqft=80;office.areas[0].style='solid';office.areas[0].coats=1;
  j.sections=[office];
  const ownerMath=E.calculate(j,book);
  assert.ok(ownerMath.cost>0);
  const costText=ownerMath.cost.toLocaleString('en-US',{style:'currency',currency:'USD'});
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
  global.EsJobBoard=B;
  require('../js/guided-app.js');
  const G=global.GuidedApp;
  G.boot({mode:'auth',profile:{id:'emp-1',role:'employee',active:true,full_name:'Sam Ellis'},settings:book,jobs:[j],onSave(){},requestPreview(){}});
  G.go('internal');
  const internal=document.getElementById('main').innerHTML;
  G.go('customer');
  const customer=document.getElementById('main').innerHTML;
  const blob=internal+customer;
  assert.ok(blob.includes('Shop floor'));
  assert.ok(blob.includes('Office'));
  assert.ok(blob.includes('200 Bar St, Oak Park, IL 60302'));
  assert.ok(!blob.includes(costText),costText);
  assert.ok(!blob.includes('Whole quote cost'));
  assert.ok(!blob.includes('Estimated job cost'));
  assert.ok(!blob.includes('Potential profit'));
  assert.ok(!blob.includes('price not set'));
  const staff=Q.staffSnapshotSafe(E,j,ownerMath,book);
  const staffBlob=JSON.stringify(staff);
  assert.ok(!staffBlob.includes('"cost"'));
  assert.ok(!staffBlob.includes('"profit"'));
  assert.ok(!staffBlob.includes('"margin"'));
  assert.ok(!staffBlob.includes('"markup"'));
  assert.strictEqual(staff.sections[0].subtotal,2000);
  assert.strictEqual(staff.sections[1].subtotal,2750);
  assert.strictEqual(staff.sections[0].cost,undefined);
  assert.strictEqual(staff.total,4750);
});

if(failed){console.error(failed+' failed');process.exit(1)}
console.log('multi-project tests passed');
