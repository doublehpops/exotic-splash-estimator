(function(root){
'use strict';
/* Catalog starting prices / adjustment amounts default to null (= UNCONFIGURED).
   Never invent furniture/package dollar prices. Floor per-sq-ft rates remain for measured floors only.
   Sources searched (v6): brand-brain.txt, post-queue, rate book in prior estimators, discount-options —
   no approved 1/2/3-car package flats, countertop/table starting prices, or chair/stool per-item prices found.
   Countertops/tables explicitly "priced at free on-site estimate" (brand-brain). */
const UNCONFIGURED=null;
const catalogDefaults={
  garage:{
    /* Empty default so the staff price-book string survives defaults-only merge. Not a price. */
    disclaimer:'',
    oneCarStarting:UNCONFIGURED,
    twoCarStarting:UNCONFIGURED,
    threeCarStarting:UNCONFIGURED,
    materialAdj:{solid:UNCONFIGURED,flake:UNCONFIGURED,metallic:UNCONFIGURED,sealer:UNCONFIGURED,custom:UNCONFIGURED},
    topcoatAdj:{protective:0,none:0,premium:UNCONFIGURED},
    conditionAdj:{unknown:UNCONFIGURED,good:0,fair:UNCONFIGURED,poor:UNCONFIGURED,critical:UNCONFIGURED,sound:0,paint:UNCONFIGURED,adhesive:UNCONFIGURED},
    prepAdj:{cracks:UNCONFIGURED,spalling:UNCONFIGURED,coatingRemoval:UNCONFIGURED,patching:UNCONFIGURED,leveling:UNCONFIGURED,moisture:UNCONFIGURED}
  },
  flatwork:{
    /* size bands — owner sets starting price per band; custom size uses customStarting or falls back to unconfigured */
    sizeBands:[
      {id:'small',label:'Small (up to ~6 sq ft)',maxSqft:6,starting:UNCONFIGURED},
      {id:'medium',label:'Medium (~6–12 sq ft)',maxSqft:12,starting:UNCONFIGURED},
      {id:'large',label:'Large (~12–24 sq ft)',maxSqft:24,starting:UNCONFIGURED},
      {id:'xlarge',label:'Extra large (>24 sq ft)',maxSqft:null,starting:UNCONFIGURED}
    ],
    customStarting:UNCONFIGURED,
    materialAdj:{solid:UNCONFIGURED,flake:UNCONFIGURED,metallic:UNCONFIGURED,sealer:UNCONFIGURED,custom:UNCONFIGURED},
    topcoatAdj:{protective:0,none:0,premium:UNCONFIGURED},
    conditionAdj:{unknown:UNCONFIGURED,good:0,fair:UNCONFIGURED,poor:UNCONFIGURED,critical:UNCONFIGURED}
  },
  seating:{
    byType:{chair:UNCONFIGURED,stool:UNCONFIGURED,other:UNCONFIGURED},
    materialAdj:{solid:UNCONFIGURED,flake:UNCONFIGURED,metallic:UNCONFIGURED,sealer:UNCONFIGURED,custom:UNCONFIGURED},
    topcoatAdj:{protective:0,none:0,premium:UNCONFIGURED},
    conditionAdj:{unknown:UNCONFIGURED,good:0,fair:UNCONFIGURED,poor:UNCONFIGURED,critical:UNCONFIGURED}
  }
};
const defaults={business:{name:'Exotic Splash Epoxy LLC',address:'211 W. Wacker Drive, Ste 120, Chicago, IL 60606',phone:'331-315-5738',email:''},products:{primer:{label:'Epoxy primer',size:3,price:210,coverage:250,unit:'gal'},base:{label:'Colored epoxy',size:3,price:210,coverage:150,unit:'gal'},white:{label:'White epoxy',size:3,price:225,coverage:150,unit:'gal'},metal:{label:'Metallic clear epoxy',size:3,price:270,coverage:40,unit:'gal'},pigment:{label:'Metallic pigment',size:1,price:35,coverage:200,unit:'pack'},sealer:{label:'Clear base sealer',size:1,price:80,coverage:200,unit:'gal'},top:{label:'Protective topcoat',size:1,price:120,coverage:220,unit:'gal'},flake:{label:'Decorative flakes',size:5,price:75,coverage:0,unit:'lb'},level:{label:'Self-leveling cement, 50 lb',size:1,price:75,coverage:25,unit:'bag'},levelPrimer:{label:'Self-leveling primer',size:1,price:50,coverage:120,unit:'gal'},patch:{label:'Concrete patch kit',size:1,price:75,coverage:0,unit:'kit'},grip:{label:'Traction additive',size:1,price:65,coverage:1200,unit:'pack'},moisture:{label:'Moisture-control primer',size:3,price:330,coverage:100,unit:'gal'}},rates:{solid:6,flake:7,metallic:12,sealer:3,level:6,removal:2,patch:150,moisture:4,extraCoat:1.5,mediumFlakeExtra:0.5,fullFlakeExtra:1},costs:{waste:10,labor:30,prepProduction:60,coatProduction:120,levelProduction:40,removalProduction:40,patchHours:1,setupHours:6,rentalDay:250,tooling:250,supplies:280,dust:100,disposal:150,mile:0.85,overhead:1000,contingency:5,purchaseTax:0,markup:30,minimum:0},notes:'Our quoted price covers the scope described. If you receive a lower written estimate for comparable work, materials, preparation, and finish, share it with us. Where feasible, we will try to match the price or beat it by $1,000, subject to our review and written confirmation. The quoted total remains in effect until a revised written estimate is issued.',pricingOptions:{opt1:{label:'Option 1 — Family Discount / Three Payments',short:'Option 1 · Family / 3 payments',rate:6,schedule:[{pct:50,label:'Upfront for supplies and materials'},{pct:25,label:'Upon project completion'},{pct:25,label:'Due 14 days after project completion'}]},opt2:{label:'Option 2 — Family Discount / Two Payments',short:'Option 2 · Family / 2 payments',rate:5,schedule:[{pct:50,label:'Upfront for supplies and materials'},{pct:50,label:'Upon project completion'}]}},addOn:{label:'Standard property / trip add-in',low:1,high:2},approvedAdjustment:{mode:'amount',amount:0,pct:0},catalog:catalogDefaults};
const date=()=>new Date().toLocaleDateString('en-CA');
const newArea=()=>({id:Math.random().toString(36).slice(2,10),name:'Floor area',sqft:0,style:'solid',color:'Gray',colorKey:'gray',customColor:'',flakeBlend:'neutral-gray',customFlakeBlend:'',coats:1,flake:'light',grip:false,level:false,depth:0.25,rate:null,moisture:false});
const newFlatItem=()=>({id:Math.random().toString(36).slice(2,10),name:'Countertop / table / bar',kind:'countertop',length:0,width:0,sqft:'',sizeBand:'',style:'solid',topcoat:'protective',condition:'unknown',notes:'',photos:[]});
const newSeatItem=()=>({id:Math.random().toString(36).slice(2,10),name:'Chair',seatType:'chair',qty:1,style:'solid',topcoat:'protective',condition:'unknown',notes:'',photos:[]});
const newJob=()=>({number:'ES-'+date().replaceAll('-','')+'-01',date:date(),customer:'',company:'',email:'',phone:'',address:'',origin:defaults.business.address,areas:[newArea()],condition:'sound',patchKits:0,moisture:false,visits:3,vehicles:1,crew:3,rentalDays:3,miles:0,minutes:0,routeNote:'',routeAddress:'',routeOrigin:'',method:'rates',markup:30,discount:0,tax:0,agreedTotal:0,paid:0,docType:'estimate',terms:'Schedule, payment milestones and return-to-service timing will be confirmed before work begins.',notes:'',priceOption:'regular',showOptions:true,addOnIncluded:true,addOnTier:'low',
  /* v6 catalog */
  projectType:'floor', /* floor | garage | flatwork | seating */
  garagePackage:'measured', /* 1car | 2car | 3car | measured — >3-car MUST be measured */
  garageStyle:'flake',garageTopcoat:'protective',garageCondition:'unknown',garagePrep:{cracks:false,spalling:false,coatingRemoval:false,patching:false,leveling:false,moisture:false},
  catalogItems:[],
  quoteFinalizeBlocked:false
});
const n=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
const ceil=v=>Math.ceil(v-1e-10);
const r2=v=>Math.round((Number(v)+Number.EPSILON)*100)/100;
const isConfigured=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const configuredAmount=v=>isConfigured(v)?Number(v):null;
const crewSize=job=>{const c=Math.round(Number(job.crew));return c===2||c===3?c:3};
function travelInfo(job,settings){const c=settings.costs,oneWay=n(job.miles),trips=n(job.visits),vehicles=n(job.vehicles),rate=n(c.mile),crew=crewSize(job);const vehicleMiles=oneWay*2*trips*vehicles;const crewHours=n(job.minutes)/60*2*trips*crew;return{oneWay,trips,vehicles,rate,crew,vehicleMiles,mileage:vehicleMiles*rate,minutes:n(job.minutes),crewHours,crewTravel:crewHours*n(c.labor)}}
function addOnInfo(job,settings,sqft){const a=settings.addOn||{},high=job.addOnTier==='high',rate=high?n(a.high):n(a.low),included=!!job.addOnIncluded;return{label:a.label||'Standard property / trip add-in',tier:high?'high':'low',rate,included,total:included&&sqft?sqft*rate:0}}

function projectTypeOf(job){
  const t=String(job&&job.projectType||'floor').toLowerCase();
  return ['floor','garage','flatwork','seating'].includes(t)?t:'floor';
}
function garageUsesMeasured(job){
  const pkg=String(job&&job.garagePackage||'measured');
  return pkg==='measured'||pkg==='4plus'||pkg==='custom';
}
function garageStartingKey(pkg){
  if(pkg==='1car'||pkg==='one'||pkg==='oneCar')return 'oneCarStarting';
  if(pkg==='2car'||pkg==='two'||pkg==='twoCar')return 'twoCarStarting';
  if(pkg==='3car'||pkg==='three'||pkg==='threeCar')return 'threeCarStarting';
  return null;
}
function flatworkBandForSqft(cat,sqft){
  const bands=(cat&&cat.flatwork&&cat.flatwork.sizeBands)||catalogDefaults.flatwork.sizeBands;
  const sf=n(sqft);
  for(const b of bands){
    if(b.maxSqft==null||b.maxSqft===''){if(sf>0)return b;continue;}
    if(sf<=n(b.maxSqft))return b;
  }
  return bands[bands.length-1]||null;
}
function resolveAdj(map,key,label,pending,lines){
  if(!map||!Object.prototype.hasOwnProperty.call(map,key)){
    pending.push('Starting price needed — no approved adjustment configured for '+label+' ('+key+').');
    return {ok:false,amount:0,configured:false};
  }
  const raw=map[key];
  if(!isConfigured(raw)){
    pending.push('Starting price needed — '+label+' adjustment is unconfigured in the price book.');
    return {ok:false,amount:0,configured:false};
  }
  const amount=Number(raw);
  if(amount){
    lines.push({kind:'adjustment',label:label,description:'Catalog adjustment from price book',qty:1,unit:'ea',rate:amount,total:amount});
  }
  return {ok:true,amount,configured:true};
}

function buildCatalogBreakdown(job,settings){
  const cat=Object.assign({},catalogDefaults,settings.catalog||{});
  cat.garage=Object.assign({},catalogDefaults.garage,(settings.catalog&&settings.catalog.garage)||{});
  cat.flatwork=Object.assign({},catalogDefaults.flatwork,(settings.catalog&&settings.catalog.flatwork)||{});
  cat.seating=Object.assign({},catalogDefaults.seating,(settings.catalog&&settings.catalog.seating)||{});
  const type=projectTypeOf(job);
  const pending=[],lines=[],adjustments=[];
  let startingTotal=0, startingConfigured=true, itemCount=0, measureSqft=0;
  let startingLabel='Starting price';

  if(type==='garage' && !garageUsesMeasured(job)){
    const key=garageStartingKey(job.garagePackage);
    const startRaw=key?cat.garage[key]:UNCONFIGURED;
    const pkgLabel=job.garagePackage==='1car'?'1-car garage package':job.garagePackage==='2car'?'2-car garage package':job.garagePackage==='3car'?'3-car garage package':'Garage package';
    if(!isConfigured(startRaw)){
      pending.push('Starting price needed — set '+pkgLabel+' starting price in Costs & pricing → Catalog packages.');
      startingConfigured=false;
    } else {
      const start=Number(startRaw);
      startingTotal=start;
      lines.push({kind:'starting',label:pkgLabel+' — starting price',description:'Configured package starting price (editable price book)',qty:1,unit:'package',rate:start,total:start});
    }
    const style=job.garageStyle||'flake';
    const mat=resolveAdj(cat.garage.materialAdj,style,'Material / system ('+style+')',pending,adjustments);
    const top=resolveAdj(cat.garage.topcoatAdj,job.garageTopcoat||'protective','Topcoat ('+(job.garageTopcoat||'protective')+')',pending,adjustments);
    const condKey=job.garageCondition||'unknown';
    if(condKey==='unknown'){
      pending.push('Condition is Unknown / not inspected — do not assume $0. Inspect or set an explicit unknown-condition adjustment in the price book.');
    }
    const cond=resolveAdj(cat.garage.conditionAdj,condKey,'Concrete condition ('+condKey+')',pending,adjustments);
    const prep=job.garagePrep||{};
    for(const [pk,on] of Object.entries(prep)){
      if(!on)continue;
      resolveAdj(cat.garage.prepAdj,pk,'Prep: '+pk,pending,adjustments);
    }
    itemCount=1;
    startingLabel=pkgLabel+' starting';
  } else if(type==='flatwork'){
    const items=Array.isArray(job.catalogItems)?job.catalogItems:[];
    if(!items.length)pending.push('Add at least one table / countertop / bar item with dimensions.');
    for(const it of items){
      itemCount++;
      const L=n(it.length),W=n(it.width);
      let sf=n(it.sqft); if(!sf&&L&&W)sf=r2(L*W);
      measureSqft+=sf;
      const band=it.sizeBand?((cat.flatwork.sizeBands||[]).find(b=>b.id===it.sizeBand)||null):flatworkBandForSqft(cat,sf);
      let startRaw=band?band.starting:cat.flatwork.customStarting;
      if(it.customStarting!==undefined&&it.customStarting!==null&&it.customStarting!=='')startRaw=it.customStarting;
      const name=it.name||('Flatwork item '+itemCount);
      if(!sf&&!band){
        pending.push('Starting price needed — enter size/dimensions for '+name+'.');
        startingConfigured=false;
      } else if(!isConfigured(startRaw)){
        pending.push('Starting price needed — set flatwork starting price'+(band?(' for size band "'+band.label+'"'):'')+' in the price book (or on this item).');
        startingConfigured=false;
      } else {
        const start=Number(startRaw);
        startingTotal+=start;
        lines.push({kind:'starting',label:name+' — starting price',description:(band?band.label+' · ':'')+(sf?sf+' sq ft':'size noted')+(L&&W?' · '+L+'×'+W+' ft':''),qty:1,unit:'item',rate:start,total:start});
      }
      resolveAdj(cat.flatwork.materialAdj,it.style||'solid','Material / system ('+(it.style||'solid')+') — '+name,pending,adjustments);
      resolveAdj(cat.flatwork.topcoatAdj,it.topcoat||'protective','Topcoat ('+(it.topcoat||'protective')+') — '+name,pending,adjustments);
      const ck=it.condition||'unknown';
      if(ck==='unknown')pending.push('Condition is Unknown for '+name+' — do not assume $0. Inspect or configure an explicit adjustment.');
      resolveAdj(cat.flatwork.conditionAdj,ck,'Condition ('+ck+') — '+name,pending,adjustments);
    }
    startingLabel='Flatwork starting';
  } else if(type==='seating'){
    const items=Array.isArray(job.catalogItems)?job.catalogItems:[];
    if(!items.length)pending.push('Add at least one chair / stool / seating item with quantity.');
    for(const it of items){
      itemCount++;
      const qty=Math.max(1,Math.round(n(it.qty)||1));
      const seatType=it.seatType||'chair';
      const name=it.name||(seatType+' × '+qty);
      let startRaw=(cat.seating.byType&&cat.seating.byType[seatType]);
      if(it.customStarting!==undefined&&it.customStarting!==null&&it.customStarting!=='')startRaw=it.customStarting;
      if(!isConfigured(startRaw)){
        pending.push('Starting price needed — set per-item starting price for '+seatType+' in the price book (or on this item).');
        startingConfigured=false;
      } else {
        const unit=Number(startRaw);
        const total=unit*qty;
        startingTotal+=total;
        lines.push({kind:'starting',label:name+' — starting price',description:seatType+' · '+qty+' × $'+unit.toFixed(2),qty:qty,unit:'item',rate:unit,total:total});
      }
      resolveAdj(cat.seating.materialAdj,it.style||'solid','Material / system ('+(it.style||'solid')+') — '+name,pending,adjustments);
      resolveAdj(cat.seating.topcoatAdj,it.topcoat||'protective','Topcoat ('+(it.topcoat||'protective')+') — '+name,pending,adjustments);
      const ck=it.condition||'unknown';
      if(ck==='unknown')pending.push('Condition is Unknown for '+name+' — do not assume $0. Inspect or configure an explicit adjustment.');
      resolveAdj(cat.seating.conditionAdj,ck,'Condition ('+ck+') — '+name,pending,adjustments);
    }
    startingLabel='Seating starting';
  }

  const adjTotal=adjustments.reduce((s,x)=>s+n(x.total),0);
  const allLines=[...lines,...adjustments];
  const scopeTotal=startingTotal+adjTotal;
  const quoteReady=pending.length===0 && startingConfigured && (itemCount>0||type==='garage');
  return {
    type, pending, lines:allLines, startingLines:lines, adjustments, startingTotal, adjTotal, scopeTotal,
    startingConfigured, quoteReady, itemCount, measureSqft, startingLabel,
    pendingUnique:[...new Set(pending)]
  };
}

function emptyResult(overrides){
  const tr={oneWay:0,trips:0,vehicles:0,rate:0,crew:3,vehicleMiles:0,mileage:0,minutes:0,crewHours:0,crewTravel:0};
  const sel={key:'regular',label:'Regular price',short:'Regular retail',rate:0,project:0,adjustment:0,pre:0,minimum:0,discount:0,subtotal:0,salesTax:0,total:0,savings:0,savingsPct:0,payments:[],pctTotal:0};
  return Object.assign({sqft:0,finished:0,levelArea:0,levelEquiv:0,material:[],mat:0,tax:0,hours:[],labor:0,equipment:[],equip:0,direct:0,overhead:0,overheadBase:0,overheadItems:[],contingency:0,cost:0,lines:[],base:0,regularBase:0,discountable:0,discountSqft:0,choices:{regular:sel},selected:sel,addOn:{label:'',tier:'low',rate:0,included:false,total:0},travel:tr,travelCost:0,travelInQuote:0,crew:3,discount:0,minimum:0,subtotal:0,salesTax:0,total:0,profit:0,margin:0,perSqft:0,travelMiles:0,personHours:0,balance:0,warnings:[],quoteReady:false,quoteStatus:'incomplete',pendingReasons:[],catalog:null,finalizedBlocked:true},overrides||{});
}

function calculateCatalog(job,settings){
  const c=settings.costs,tr=travelInfo(job,settings);
  const br=buildCatalogBreakdown(job,settings);
  const warnings=[...br.pendingUnique];
  if(!job.customer&&!job.company)warnings.push('Add a customer name before issuing the document.');
  /* Travel/equipment still fold into overhead once when quote can price; do not invent scope $ */
  const hasScope=br.scopeTotal>0||br.quoteReady;
  const travelCost=hasScope?(tr.mileage+tr.crewTravel):0;
  const equipment=hasScope?[
    {label:'Grinder + dust extractor',qty:n(job.rentalDays),unit:'day',unitPrice:n(c.rentalDay),total:n(job.rentalDays)*n(c.rentalDay)},
    {label:'Diamond tooling',qty:1,unit:'allowance',unitPrice:n(c.tooling),total:n(c.tooling)},
    {label:'Application supplies',qty:1,unit:'allowance',unitPrice:n(c.supplies),total:n(c.supplies)},
    {label:'Dust bags / filters',qty:1,unit:'allowance',unitPrice:n(c.dust),total:n(c.dust)},
    {label:'Disposal',qty:1,unit:'allowance',unitPrice:n(c.disposal),total:n(c.disposal)}
  ]:[];
  const equip=equipment.reduce((s,x)=>s+x.total,0);
  const overheadBase=hasScope?n(c.overhead):0;
  const overhead=overheadBase+travelCost+equip;
  const overheadItems=hasScope?[
    {label:'Business overhead / job',qty:1,unit:'allowance',unitPrice:overheadBase,total:overheadBase},
    ...(tr.mileage?[{label:'Vehicle mileage (in overhead)',qty:tr.vehicleMiles,unit:'mile',unitPrice:tr.rate,total:tr.mileage}]:[]),
    ...(tr.crewTravel?[{label:'Crew travel time (in overhead)',qty:tr.crewHours,unit:'person-hr',unitPrice:n(c.labor),total:tr.crewTravel}]:[]),
    {label:'Equipment & job supplies (in overhead)',qty:1,unit:'allowance',unitPrice:equip,total:equip}
  ]:[];
  /* Catalog jobs: no invented material/labor BOM — keep planning hours empty unless measured */
  const material=[],mat=0,tax=0,hours=[],labor=0;
  const direct=mat+tax+labor;
  const contingency=(direct+overhead)*n(c.contingency)/100,cost=direct+overhead+contingency;

  const lines=[...br.lines];
  /* Property add-in is per-sq-ft floor economics — do not auto-apply to unmeasured catalog packages */
  const addOn={label:(settings.addOn||{}).label||'Standard property / trip add-in',tier:'low',rate:0,included:false,total:0};
  const travelInQuote=travelCost;
  const lineSum=lines.reduce((s,x)=>s+n(x.total),0);
  const discountable=br.startingTotal; /* adjustments stay; discount applies to starting scope similar to finish */
  const regularBase=lineSum+travelInQuote;
  const discount=Math.min(regularBase,n(job.discount));
  const minimum=0;
  const pre=regularBase;
  const subtotal=br.quoteReady?Math.max(0,pre+minimum-discount):0;
  const salesTax=subtotal*n(job.tax)/100;
  const total=br.quoteReady?(subtotal+salesTax):0;
  if(hasScope&&!job.miles&&!job.minutes)warnings.push('Travel overhead is $0 until one-way miles and drive time are entered (Internal).');
  if(!br.quoteReady){
    warnings.unshift('Quote pending — configure required starting prices / adjustments before finalizing. Shown total is not a finalized customer price.');
  }
  const sel={key:'regular',label:'Regular price',short:'Regular retail',rate:0,project:discountable,adjustment:0,pre,minimum,discount:br.quoteReady?discount:0,subtotal,salesTax,total,savings:0,savingsPct:0,payments:[],pctTotal:0};
  const choices={regular:sel};
  /* Family per-sq-ft options do not apply to catalog package jobs */
  if(job.priceOption&&job.priceOption!=='regular'){
    warnings.push('Family per-sq-ft payment options apply to measured floor jobs. Catalog package jobs use the configured starting price + adjustments (Regular).');
  }
  const profit=subtotal-cost,margin=subtotal?profit/subtotal*100:0;
  const sqft=br.measureSqft||0;
  return{
    sqft,finished:sqft,levelArea:0,levelEquiv:0,material,mat,tax,hours,labor,equipment,equip,direct,overhead,overheadBase,overheadItems,contingency,cost,
    lines,base:regularBase,regularBase,discountable,discountSqft:0,choices,selected:sel,addOn,travel:tr,travelCost,travelInQuote,crew:tr.crew,
    discount:sel.discount,minimum,subtotal,salesTax,total,profit,margin,perSqft:sqft&&br.quoteReady?total/sqft:0,travelMiles:tr.vehicleMiles,
    personHours:0,balance:Math.max(0,total-n(job.paid)),warnings,
    quoteReady:br.quoteReady,quoteStatus:br.quoteReady?'ready':'pending_prices',pendingReasons:br.pendingUnique,
    catalog:{
      type:br.type,startingTotal:br.startingTotal,adjTotal:br.adjTotal,scopeTotal:br.scopeTotal,
      startingLabel:br.startingLabel,startingLines:br.startingLines,adjustments:br.adjustments,
      itemCount:br.itemCount,measureSqft:br.measureSqft,garagePackage:job.garagePackage||null
    },
    finalizedBlocked:!br.quoteReady
  };
}

function calculate(job,settings){
 const type=projectTypeOf(job);
 /* Garage 1/2/3-car packages use catalog path; measured/>3-car and floor use floor engine */
 if(type==='flatwork'||type==='seating'||(type==='garage'&&!garageUsesMeasured(job))){
   return calculateCatalog(job,settings);
 }
 /* Measured garage: treat as floor workflow (existing per-sq-ft rates — approved floor economics) */
 const p=Object.fromEntries(Object.entries(settings.products).map(([k,v])=>[k,{...v,coverage:n(v.coverage)>0?n(v.coverage):(defaults.products[k]?.coverage||1)}])),c=settings.costs,r=settings.rates,w=1+n(c.waste)/100,tr=travelInfo(job,settings);
 const demand={},material=[],customer=[],extras=[];let sqft=0,finished=0,levelArea=0,levelEquiv=0,coatPassArea=0,gripArea=0;
 const add=(key,q)=>{demand[key]=(demand[key]||0)+n(q)};
 for(const a of job.areas){const sf=n(a.sqft);if(!sf)continue;sqft+=sf;const style=['solid','flake','metallic','sealer','level'].includes(a.style)?a.style:'solid';const lev=style==='level'||a.level;
  if(lev){const depth=n(a.depth);levelArea+=sf;levelEquiv+=sf*depth/0.25;add('level',sf*depth/0.25/p.level.coverage*w);add('levelPrimer',sf/p.levelPrimer.coverage*w)}
  const areaMoisture=!!(a.moisture||(a.prep&&a.prep.moisture));
  if(style!=='level'){finished+=sf;add('top',sf/p.top.coverage*w);coatPassArea+=sf;
   if(style==='sealer'){add('sealer',sf/p.sealer.coverage*w);coatPassArea+=sf}
   else {if(!areaMoisture)add('primer',sf/p.primer.coverage*w);coatPassArea+=sf;const color=String(a.color).toLowerCase();const base=color.includes('white')?'white':'base';const coats=style==='solid'?Math.max(1,n(a.coats)):1;add(base,sf/p[base].coverage*coats*w);coatPassArea+=sf*coats;
    if(style==='flake')add('flake',sf/(a.flake==='full'?7:a.flake==='medium'?125:250)*w);
    if(style==='metallic'){add('metal',sf/p.metal.coverage*w);add('pigment',sf/p.pigment.coverage*w);coatPassArea+=sf}
   }
   if(a.grip){gripArea+=sf;add('grip',sf/p.grip.coverage)}
   if(areaMoisture){add('moisture',sf/p.moisture.coverage*w);extras.push({label:'Moisture-control primer / barrier — '+(a.name||'area'),description:'Per-area allowance · pending testing and system approval',qty:sf,unit:'sq ft',rate:n(r.moisture),total:sf*n(r.moisture),areaId:a.id,kind:'moisture'})}
  }
  const custom=a.rate!==null&&a.rate!==''&&a.rate!==undefined;
  let unit=custom?n(a.rate):n(r[style]);
  if(!custom&&style==='solid')unit+=Math.max(0,n(a.coats)-1)*n(r.extraCoat??1.5);
  if(!custom&&style==='flake')unit+=a.flake==='full'?n(r.fullFlakeExtra??1):a.flake==='medium'?n(r.mediumFlakeExtra??0.5):0;
  const effective=style==='level'?unit*n(a.depth)/0.25:unit;
  customer.push({kind:style==='level'?'scope':'finish',label:a.name||'Floor area',description:describe(a),qty:sf,unit:'sq ft',rate:effective,total:sf*effective});
  if(a.level&&style!=='level')extras.push({label:'Self-leveling preparation - '+(a.name||'area'),description:n(a.depth)+' inch average depth; additional to finish',qty:sf,unit:'sq ft',rate:n(r.level)*n(a.depth)/0.25,total:sf*n(r.level)*n(a.depth)/0.25});
 }
 /* v5: job.moisture no longer auto-charges all finished sqft — per-area only. Legacy job.moisture ignored for charging. */
 if(n(job.patchKits)){add('patch',n(job.patchKits));extras.push({label:'Minor patching allowance',description:'Patch kits and application; nonstructural repairs',qty:n(job.patchKits),unit:'kit',rate:n(r.patch),total:n(job.patchKits)*n(r.patch)})}
 const removal=job.condition!=='sound';if(removal&&sqft)extras.push({label:'Additional surface removal',description:job.condition==='adhesive'?'Existing adhesive removal':'Existing paint / coating removal',qty:sqft,unit:'sq ft',rate:n(r.removal),total:sqft*n(r.removal)});
 for(const [key,q]of Object.entries(demand)){const x=p[key],packs=ceil(q/Math.max(.001,n(x.size)));if(packs)material.push({key,label:x.label,qty:packs,unit:(n(x.size)===1?x.unit+' units':n(x.size)+'-'+x.unit+' kits'),unitPrice:n(x.price),total:packs*n(x.price),volume:packs*n(x.size),volumeUnit:x.unit,demand:q})}
 const mat=material.reduce((s,x)=>s+x.total,0);const tax=mat*n(c.purchaseTax)/100;
 const hours=[{label:'Grinding / vacuuming',qty:sqft/Math.max(1,n(c.prepProduction))},{label:'Coating application',qty:coatPassArea/Math.max(1,n(c.coatProduction))},{label:'Leveling application',qty:levelArea/Math.max(1,n(c.levelProduction))},{label:'Extra coating / adhesive removal',qty:removal?sqft/Math.max(1,n(c.removalProduction)):0},{label:'Patch application',qty:n(job.patchKits)*n(c.patchHours)},{label:'Setup and cleanup',qty:sqft?n(c.setupHours):0}].filter(x=>x.qty>0).map(x=>({...x,unit:'person-hr',unitPrice:n(c.labor),total:x.qty*n(c.labor)}));
 const labor=hours.reduce((s,x)=>s+x.total,0);const travelMiles=tr.vehicleMiles;
 const travelCost=sqft?tr.mileage+tr.crewTravel:0;
 const equipment=sqft?[{label:'Grinder + dust extractor',qty:n(job.rentalDays),unit:'day',unitPrice:n(c.rentalDay),total:n(job.rentalDays)*n(c.rentalDay)},{label:'Diamond tooling',qty:1,unit:'allowance',unitPrice:n(c.tooling),total:n(c.tooling)},{label:'Application supplies',qty:1,unit:'allowance',unitPrice:n(c.supplies),total:n(c.supplies)},{label:'Dust bags / filters',qty:1,unit:'allowance',unitPrice:n(c.dust),total:n(c.dust)},{label:'Disposal',qty:1,unit:'allowance',unitPrice:n(c.disposal),total:n(c.disposal)}]:[];
 const equip=equipment.reduce((s,x)=>s+x.total,0);
 const direct=mat+tax+labor;
 const overheadBase=sqft?n(c.overhead):0;
 const overhead=overheadBase+travelCost+equip;
 const overheadItems=sqft?[
   {label:'Business overhead / job',qty:1,unit:'allowance',unitPrice:overheadBase,total:overheadBase},
   ...(tr.mileage?[{label:'Vehicle mileage (in overhead)',qty:travelMiles,unit:'mile',unitPrice:tr.rate,total:tr.mileage}]:[]),
   ...(tr.crewTravel?[{label:'Crew travel time (in overhead)',qty:tr.crewHours,unit:'person-hr',unitPrice:n(c.labor),total:tr.crewTravel}]:[]),
   {label:'Equipment & job supplies (in overhead)',qty:1,unit:'allowance',unitPrice:equip,total:equip}
 ]:[];
 const contingency=(direct+overhead)*n(c.contingency)/100,cost=direct+overhead+contingency;
 const finishLines=customer.filter(l=>l.kind==='finish');
 let scopeLines=[...customer,...extras],discountable=finishLines.reduce((s,x)=>s+x.total,0),discountSqft=finishLines.reduce((s,x)=>s+x.qty,0);
 if(job.method==='cost'){const pkg=Math.max(0,cost)*(1+n(job.markup)/100);scopeLines=[{kind:'finish',label:'Flooring installation package',description:'Includes the areas, finishes, preparation, materials and mobilization described below',qty:sqft,unit:'sq ft',rate:sqft?pkg/sqft:0,total:pkg}];discountable=pkg;discountSqft=sqft}
 if(job.method==='agreed'){const pkg=n(job.agreedTotal);scopeLines=[{kind:'finish',label:'Agreed project price',description:'Includes the areas, finishes and preparation described below',qty:sqft,unit:'sq ft',rate:sqft?pkg/sqft:0,total:pkg}];discountable=pkg;discountSqft=sqft}
 const addOn=addOnInfo(job,settings,sqft);const lines=[...scopeLines];
 if(addOn.total)lines.push({kind:'addon',label:addOn.label,description:'$'+addOn.rate.toFixed(2)+' per sq ft across all measured areas (selected add-in)',qty:sqft,unit:'sq ft',rate:addOn.rate,total:addOn.total});
 const lineSum=lines.reduce((s,x)=>s+x.total,0);
 const travelInQuote=(job.method==='cost')?0:travelCost;
 const regularBase=lineSum+travelInQuote,po=settings.pricingOptions||{};
 const choice=key=>{const opt=key==='regular'?null:po[key];const project=opt?n(opt.rate)*discountSqft:discountable,adjustment=project-discountable,pre=regularBase+adjustment;const minimum=sqft?Math.max(0,n(c.minimum)-pre):0;const discount=opt?0:Math.min(pre+minimum,n(job.discount));const subtotal=Math.max(0,pre+minimum-discount),salesTax=subtotal*n(job.tax)/100,total=subtotal+salesTax,savings=discountable-project;const sched=opt&&Array.isArray(opt.schedule)?opt.schedule:[];let paid=0;const payments=sched.map((p,i)=>{const amount=i===sched.length-1?r2(total-paid):r2(total*n(p.pct)/100);paid=r2(paid+amount);return{pct:n(p.pct),label:p.label,amount}});return{key,label:opt?opt.label:'Regular price',short:opt?(opt.short||opt.label):'Regular retail',rate:opt?n(opt.rate):(discountSqft?discountable/discountSqft:0),project,adjustment,pre,minimum,discount,subtotal,salesTax,total,savings,savingsPct:discountable?savings/discountable*100:0,payments,pctTotal:sched.reduce((s,p)=>s+n(p.pct),0)}};
 const choices={regular:choice('regular')};for(const k of Object.keys(po))choices[k]=choice(k);
 const sel=choices[job.priceOption]||choices.regular;
 const {discount,minimum,subtotal,salesTax,total}=sel,profit=subtotal-cost,margin=subtotal?profit/subtotal*100:0;
 const warnings=[];if(!sqft)warnings.push('Add square footage to calculate a job.');if(sqft&&!job.miles&&!job.minutes)warnings.push('Travel overhead is $0 until one-way miles and drive time are entered (Internal).');if(sqft&&n(job.miles)&&!tr.rate)warnings.push('Mileage rate is $0.00/mile. Set Vehicle cost / mile in Costs & pricing (default $0.85).');if(levelArea)warnings.push('Leveling depth and product yield must be verified on site.');if(job.areas.some(a=>n(a.sqft)&&((a.style==='level'||a.level)&&n(a.depth)<=0)))warnings.push('Enter a positive depth for every leveled area.');if(job.routeAddress&&(job.address!==job.routeAddress||job.origin!==job.routeOrigin))warnings.push('Address changed: recalculate the route or update travel manually.');if(sqft&&profit<0)warnings.push('Customer price is below the estimated job cost.');if(job.method==='agreed'&&sqft&&!n(job.agreedTotal))warnings.push('Enter the agreed customer total.');if(!job.customer&&!job.company)warnings.push('Add a customer name before issuing the document.');
 if(sel.key!=='regular'&&n(job.discount))warnings.push('The manual $ discount is ignored while '+sel.short+' is selected. Pricing options never stack.');
 if(sel.key!=='regular'&&discountSqft&&sel.savings<=0)warnings.push(sel.short+' ($'+sel.rate.toFixed(2)+'/sq ft) is not lower than the regular price for this scope.');
 if(sel.key!=='regular'&&Math.abs(sel.pctTotal-100)>0.001)warnings.push(sel.short+' payment percentages add to '+sel.pctTotal+'%, not 100%. The last payment absorbs the difference.');
 if(type==='garage'&&garageUsesMeasured(job)){
   warnings.push('Garage >3-car / measured size: using measured sq ft with floor rate book (not a flat 1/2/3-car package).');
 }
 return{sqft,finished,levelArea,levelEquiv,material,mat,tax,hours,labor,equipment,equip,direct,overhead,overheadBase,overheadItems,contingency,cost,lines,base:regularBase,regularBase,discountable,discountSqft,choices,selected:sel,addOn,travel:tr,travelCost,travelInQuote,crew:tr.crew,discount,minimum,subtotal,salesTax,total,profit,margin,perSqft:sqft?total/sqft:0,travelMiles,personHours:hours.reduce((s,x)=>s+x.qty,0),balance:Math.max(0,total-n(job.paid)),warnings,
   quoteReady:!!sqft,quoteStatus:sqft?'ready':'incomplete',pendingReasons:[],catalog:type==='garage'?{type:'garage',garagePackage:'measured',mode:'measured_sqft'}:null,finalizedBlocked:!sqft};
}
function describe(a){const names={solid:'Solid-color epoxy',flake:'Decorative flake epoxy',metallic:'Metallic epoxy',sealer:'Clear sealer + protective topcoat',level:'Self-leveling preparation only'};let s=names[a.style]||names.solid;if(a.style!=='level'){const col=(a.colorKey==='custom'&&a.customColor)?a.customColor:(a.color||'color to be confirmed');s+='; '+col;}if(a.style==='solid')s+='; '+Math.max(1,n(a.coats))+' base coat(s)';if(a.style==='flake'){s+='; '+(a.flake==='full'?'full broadcast':a.flake==='medium'?'medium broadcast':'light spot flakes');const fb=(a.flakeBlend==='custom'&&a.customFlakeBlend)?a.customFlakeBlend:(a.flakeBlendLabel||a.flakeBlend||'');if(fb)s+=', flake blend: '+fb;}if(a.grip&&a.style!=='level')s+='; slip-resistant texture';if(a.style==='level'||a.level)s+='; leveling '+n(a.depth)+' inch average';if(a.moisture||(a.prep&&a.prep.moisture))s+='; moisture-control primer/barrier on this area';return s;}
function areaHasMoisture(a){return !!(a&&(a.moisture||(a.prep&&a.prep.moisture)))}
function moistureSqft(job){let s=0;for(const a of job.areas||[]){const sf=n(a.sqft);if(!sf)continue;if(a.style==='level')continue;if(areaHasMoisture(a))s+=sf}return s}
const api={defaults,newArea,newJob,newFlatItem,newSeatItem,calculate,describe,n,travelInfo,addOnInfo,crewSize,areaHasMoisture,moistureSqft,isConfigured,configuredAmount,projectTypeOf,garageUsesMeasured,garageStartingKey,flatworkBandForSqft,buildCatalogBreakdown,catalogDefaults,UNCONFIGURED};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.EpoxyEngine=api;
})(typeof window!=='undefined'?window:globalThis);
