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
    /* Typical size the base fee covers. Base fee = selected tier's flake rate × this size. */
    packageSqft:{oneCar:250,twoCar:450,threeCar:650},
    /* Regular reference only ($10 × typical size). The quote computes the base from the selected tier. */
    oneCarStarting:2500,
    twoCarStarting:4500,
    threeCarStarting:6500,
    materialAdj:{solid:{oneCar:-750,twoCar:-1350,threeCar:-1950},flake:0,metallic:UNCONFIGURED,sealer:UNCONFIGURED,custom:UNCONFIGURED},
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
    /* Above this, the item is not priced on the flat band. Quote it per sq ft on the floor flow, or set a custom start. */
    maxItemSqft:32,
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
const OVERHEAD_LINES=[
  {key:'base',label:'Base overhead',monthly:15000,status:'OWNER-PROVIDED',note:'All-inclusive monthly overhead: licensing, insurance, equipment, and the rest of fixed cost.'}
];
/* Owner-only source tags. Not part of the price book, so they are never sent to employees. */
const FIGURE_STATUS={
  labor:'VERIFIED',setupHours:'NOT VERIFIED',waste:'VERIFIED',purchaseTax:'VERIFIED',
  grindProduction:'NOT VERIFIED',baseProduction:'NOT VERIFIED',flakeProduction:'NOT VERIFIED',topProduction:'NOT VERIFIED',metallicProduction:'NOT VERIFIED',primerPass:'NOT VERIFIED',
  materialSolid:'NOT VERIFIED',materialFlake:'NOT VERIFIED',materialMetallic:'NOT VERIFIED',
  flakeProduct:'VERIFIED',targetMargin:'NOT VERIFIED',minMargin:'NOT VERIFIED',minimumJob:'NOT VERIFIED',
  billableHoursPerMonth:'OWNER-PROVIDED',tooling:'NOT VERIFIED',supplies:'NOT VERIFIED',mile:'NOT VERIFIED'
};
/* Explicit package prices: garage.packages[tier][system][size]. Overflow still uses the tier rate. */
const garagePackageDefaults={packages:{
  opt1:{solid:{oneCar:2600,twoCar:3500,threeCar:4400},flake:{oneCar:3100,twoCar:4400,threeCar:5750},metallic:{oneCar:3500,twoCar:5200,threeCar:6850}},
  opt2:{solid:{oneCar:2850,twoCar:3800,threeCar:4800},flake:{oneCar:3500,twoCar:4950,threeCar:6450},metallic:{oneCar:4150,twoCar:6150,threeCar:8100}},
  regular:{solid:{oneCar:3300,twoCar:4450,threeCar:5600},flake:{oneCar:3900,twoCar:5500,threeCar:7200},metallic:{oneCar:4750,twoCar:7100,threeCar:9350}}
}};
const defaults={business:{name:'Exotic Splash Epoxy LLC',address:'211 W. Wacker Drive, Ste 120, Chicago, IL 60606',phone:'331-315-5738',email:'',crews:[]},products:{primer:{label:'Epoxy primer',size:3,price:210,coverage:250,unit:'gal'},base:{label:'Colored epoxy',size:3,price:210,coverage:150,unit:'gal'},white:{label:'White epoxy',size:3,price:225,coverage:150,unit:'gal'},metal:{label:'Metallic clear epoxy',size:3,price:270,coverage:40,unit:'gal'},pigment:{label:'Metallic pigment',size:1,price:35,coverage:200,unit:'pack'},sealer:{label:'Clear base sealer',size:1,price:80,coverage:200,unit:'gal'},top:{label:'Protective topcoat',size:1,price:120,coverage:220,unit:'gal'},flake:{label:'Decorative flakes (40 lb box)',size:40,price:108,coverage:0,unit:'lb'},level:{label:'Self-leveling cement, 50 lb',size:1,price:75,coverage:25,unit:'bag'},levelPrimer:{label:'Self-leveling primer',size:1,price:50,coverage:120,unit:'gal'},patch:{label:'Concrete patch kit',size:1,price:75,coverage:0,unit:'kit'},grip:{label:'Traction additive',size:1,price:65,coverage:1200,unit:'pack'},moisture:{label:'Moisture-control primer',size:3,price:330,coverage:100,unit:'gal'}},rates:{solid:7,flake:10,metallic:15,sealer:3,level:6,removal:2,patch:150,moisture:4,extraCoat:1.5,mediumFlakeExtra:0.5,fullFlakeExtra:1,minimumJob:2000,minimumFloorsDiscount:false,smallSolidFloor:{maxSqft:400,min:2750,bands:[{minSqft:400,maxSqft:500,source:'package',system:'solid',size:'2'}]}},costs:{waste:10,labor:42.5,prepProduction:60,coatProduction:120,levelProduction:40,removalProduction:40,patchHours:1,setupHours:13,rentalDay:250,tooling:250,supplies:280,dust:100,disposal:150,mile:0.85,overhead:0,contingency:5,purchaseTax:10.5,markup:42.86,targetMargin:30,minMargin:25,minimum:0,grindProduction:75,baseProduction:200,flakeProduction:250,topProduction:200,metallicProduction:100,primerPass:false,materialPerSqft:{solid:1.26,flake:2.25,metallic:2.72},billableHoursPerMonth:448,allowancesInOverhead:true,overheadLines:OVERHEAD_LINES.map(x=>({...x}))},notes:'Our quoted price covers the scope described. If you receive a lower written estimate for comparable work, materials, preparation, and finish, share it with us. Where feasible, we will try to match the price or beat it by $1,000, subject to our review and written confirmation. The quoted total remains in effect until a revised written estimate is issued.',pricingOptions:{opt1:{label:'Option 1 — Bank transfer',short:'Option 1 · Bank transfer',payMethod:'bank transfer',rates:{solid:5,flake:8,metallic:11},schedule:[{pct:50,label:'Booking'},{pct:50,label:'Final walkthrough'}]},opt2:{label:'Option 2 — Scheduled payments',short:'Option 2 · 50 / 25 / 25',payMethod:'scheduled',rates:{solid:6,flake:9,metallic:13},schedule:[{pct:50,label:'Booking'},{pct:25,label:'Upon project completion'},{pct:25,label:'Within 14 days'}]}},discountApproval:{enforce:true},addOn:{label:'Standard property / trip add-in',low:0,high:0,enabled:false},approvedAdjustment:{mode:'amount',amount:0,pct:0},catalog:catalogDefaults,garage:garagePackageDefaults,extras:{
  crackRepair:{flat:250,includedLf:10,perLf:12},
  coatingRemoval:{perSqft:1.5,min:650},
  paintRemoval:{perSqft:1.25,min:250},
  adhesiveRemoval:{perSqft:1.5,min:350},
  poorSlab:{perSqft:0.75,min:400},
  stairs:{solid:85,flake:110},
  stemWall:{perLf:9},
  countertop:{solid:45,metallic:65,min:900},
  antiSlip:{perSqft:0.35},
  multiColor:{metallicPerSqft:1.5,customFlakePerSqft:1},
  travelBeyond:{includedMiles:25,perMile:2.5},
  moving:{perHour:150},
  rush:{withinDays:7,pct:10},
  weekend:{pct:15},
  winterHeat:{perDay:250},
  consumables:{flat:150},
  fuelWear:{perMile:0.65},
  extraVisit:{flat:125},
  warranty:{includedYears:1,extendedYears:3,pct:4}
}};
const date=()=>new Date().toLocaleDateString('en-CA');
const newArea=()=>({id:Math.random().toString(36).slice(2,10),name:'Floor area',sqft:0,style:'solid',color:'Gray',colorKey:'gray',customColor:'',flakeBlend:'neutral-gray',customFlakeBlend:'',coats:1,flake:'light',grip:false,level:false,depth:0.25,rate:null,moisture:false});
const newFlatItem=()=>({id:Math.random().toString(36).slice(2,10),name:'Countertop / table / bar',kind:'countertop',length:0,width:0,sqft:'',sizeBand:'',style:'solid',topcoat:'protective',condition:'unknown',notes:'',photos:[]});
const newSeatItem=()=>({id:Math.random().toString(36).slice(2,10),name:'Chair',seatType:'chair',qty:1,style:'solid',topcoat:'protective',condition:'unknown',notes:'',photos:[]});
const newJob=()=>({number:'ES-'+date().replaceAll('-','')+'-01',date:date(),customer:'',company:'',email:'',phone:'',address:'',origin:defaults.business.address,areas:[newArea()],condition:'sound',patchKits:0,moisture:false,visits:3,vehicles:1,crew:3,rentalDays:3,miles:0,minutes:0,routeNote:'',routeAddress:'',routeOrigin:'',method:'rates',markup:42.86,discount:0,tax:0,agreedTotal:0,paid:0,docType:'estimate',terms:'Schedule, payment milestones and return-to-service timing will be confirmed before work begins.',notes:'',priceOption:'regular',showOptions:true,addOnIncluded:false,addOnTier:'low',
  /* v6 catalog */
  projectType:'floor', /* floor | garage | flatwork | seating */
  garagePackage:'measured', /* 1car | 2car | 3car | measured — >3-car MUST be measured */
  garageStyle:'flake',garageTopcoat:'protective',garageMetallicColors:1,garageFlakeBlend:'stock',garageCondition:'unknown',garagePrep:{cracks:false,crackLf:0,spalling:false,coatingRemoval:false,paintRemoval:false,patching:false,leveling:false,moisture:false},
  extras:{crackLf:0,coatingRemoval:false,paintRemoval:false,adhesiveRemoval:false,poorSlab:false,stairsSolid:0,stairsFlake:0,stemWallLf:0,countertopSqft:0,countertopStyle:'solid',travel:false,movingHours:0,rush:false,weekend:false,winterHeatDays:0,consumables:false,fuel:false,extraVisits:0,warrantyYears:1},
  catalogItems:[],
  quoteFinalizeBlocked:false
});
const n=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
/* Signed amount. Used only for catalog adjustment totals so a credit stays negative. Do not change n(). */
const sn=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const ceil=v=>Math.ceil(v-1e-10);
const r2=v=>Math.round((Number(v)+Number.EPSILON)*100)/100;
const isConfigured=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const configuredAmount=v=>isConfigured(v)?Number(v):null;
const crewSize=job=>{const c=Math.round(Number(job.crew));return c>=2&&c<=4?c:3};
function marginToMarkup(m){const x=Number(m);if(!Number.isFinite(x)||x>=100)return 0;return x/(100-x)*100}
function markupToMargin(k){const x=Number(k);if(!Number.isFinite(x)||x<=-100)return 0;return x/(100+x)*100}
function overheadMonthlyTotal(c){
  const lines=c&&Array.isArray(c.overheadLines)?c.overheadLines:[];
  if(lines.length)return lines.reduce((s,l)=>s+sn(l&&l.monthly),0);
  if(c&&isConfigured(c.overheadMonthly))return sn(c.overheadMonthly);
  return 0;
}
function overheadPerHourRate(c){
  const lines=c&&Array.isArray(c.overheadLines)?c.overheadLines:[];
  const hours=n(c&&c.billableHoursPerMonth);
  if((lines.length||(c&&isConfigured(c.overheadMonthly)))&&hours>0)return overheadMonthlyTotal(c)/hours;
  return n(c&&c.overheadPerHour);
}
function overheadSpread(c){
  const lines=c&&Array.isArray(c.overheadLines)?c.overheadLines:[];
  const monthly=overheadMonthlyTotal(c);
  const without=lines.filter(l=>!(l&&l.insideBaseRisk)).reduce((s,l)=>s+sn(l&&l.monthly),0);
  const hours=n(c&&c.billableHoursPerMonth);
  return {monthly:r2(monthly),withoutLoanMonthly:r2(without),hours,perHour:hours?monthly/hours:0,withoutLoansPerHour:hours?without/hours:0,at75PerHour:hours?monthly/(hours*0.75):0};
}
function allowancesIncluded(c){return !!(c&&c.allowancesInOverhead!==false&&(c.allowancesInOverhead===true||(Array.isArray(c.overheadLines)&&c.overheadLines.length)))}
function flatOverhead(c){return allowancesIncluded(c)?0:n(c&&c.overhead)}
function equipmentLines(job,c,active){
  if(!active||allowancesIncluded(c))return [];
  return [
    {label:'Grinder + dust extractor',qty:n(job.rentalDays),unit:'day',unitPrice:n(c.rentalDay),total:n(job.rentalDays)*n(c.rentalDay)},
    {label:'Diamond tooling',qty:1,unit:'allowance',unitPrice:n(c.tooling),total:n(c.tooling)},
    {label:'Application supplies',qty:1,unit:'allowance',unitPrice:n(c.supplies),total:n(c.supplies)},
    {label:'Dust bags / filters',qty:1,unit:'allowance',unitPrice:n(c.dust),total:n(c.dust)},
    {label:'Disposal',qty:1,unit:'allowance',unitPrice:n(c.disposal),total:n(c.disposal)}
  ];
}
function styleTierRate(settings,job,style){
  const key=job&&job.priceOption;
  const opt=key&&key!=='regular'&&settings&&settings.pricingOptions&&settings.pricingOptions[key];
  if(opt&&opt.rates&&opt.rates[style]!=null&&opt.rates[style]!=='')return n(opt.rates[style]);
  return n(settings&&settings.rates&&settings.rates[style]);
}
function minimumJobAmount(settings){const r=(settings&&settings.rates)||{},c=(settings&&settings.costs)||{};return n(r.minimumJob)||n(c.minimum)}
function travelInfo(job,settings){const c=settings.costs,oneWay=n(job.miles),trips=n(job.visits),vehicles=n(job.vehicles),rate=n(c.mile),crew=crewSize(job);const vehicleMiles=oneWay*2*trips*vehicles;const crewHours=n(job.minutes)/60*2*trips*crew;return{oneWay,trips,vehicles,rate,crew,vehicleMiles,mileage:vehicleMiles*rate,minutes:n(job.minutes),crewHours,crewTravel:crewHours*n(c.labor)}}
function addOnInfo(job,settings,sqft){
  const a=settings.addOn||{};
  /* Folded into the base price. Never a separate customer line, even on older jobs that still have the box checked. */
  return {label:a.label||'Standard property / trip add-in',tier:job.addOnTier==='high'?'high':'low',rate:0,included:false,enabled:false,total:0};
}

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
function garagePkgKey(job){
  const p=String(job&&job.garagePackage||'');
  if(p==='1car'||p==='one'||p==='oneCar')return 'oneCar';
  if(p==='2car'||p==='two'||p==='twoCar')return 'twoCar';
  if(p==='3car'||p==='three'||p==='threeCar')return 'threeCar';
  return '';
}
/* Null when this tier/system/size has no explicit package price. Callers then use the flake-rate base and the solid credit. */
function packageTablePrice(settings,job,pkgKey){
  const table=settings&&settings.garage&&settings.garage.packages;
  if(!table||typeof table!=='object'||!pkgKey)return null;
  const tier=job&&job.priceOption?job.priceOption:'regular';
  const tierTable=table[tier];
  if(!tierTable||typeof tierTable!=='object')return null;
  const style=job&&job.garageStyle?job.garageStyle:'flake';
  const sys=tierTable[style];
  if(!sys||typeof sys!=='object')return null;
  const aliases={oneCar:['oneCar','1car','1'],twoCar:['twoCar','2car','2'],threeCar:['threeCar','3car','3']};
  const keys=aliases[pkgKey]||[pkgKey];
  for(const k of keys){
    if(Object.prototype.hasOwnProperty.call(sys,k)&&isConfigured(sys[k]))return Number(sys[k]);
  }
  return null;
}
function readAdj(raw,pkgKey){
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
    if(!pkgKey||!Object.prototype.hasOwnProperty.call(raw,pkgKey))return {configured:false,amount:0};
    const inner=raw[pkgKey];
    if(!isConfigured(inner))return {configured:false,amount:0};
    return {configured:true,amount:Number(inner)};
  }
  if(!isConfigured(raw))return {configured:false,amount:0};
  return {configured:true,amount:Number(raw)};
}
function adjConfigured(map,key,pkgKey){
  if(!map||!Object.prototype.hasOwnProperty.call(map,key))return false;
  return readAdj(map[key],pkgKey).configured;
}
function flatworkCap(cat){
  const raw=cat&&cat.flatwork&&cat.flatwork.maxItemSqft;
  if(raw==null||raw==='')return null;
  const x=Number(raw);
  return Number.isFinite(x)?x:null;
}
function flatworkBandForSqft(cat,sqft){
  const bands=(cat&&cat.flatwork&&cat.flatwork.sizeBands)||catalogDefaults.flatwork.sizeBands;
  const sf=n(sqft);
  /* No measured size = no band. Otherwise a 0 sq ft item would match the smallest band and get priced. */
  if(!(sf>0))return null;
  const cap=flatworkCap(cat);
  if(cap!=null&&sf>cap)return null;
  for(const b of bands){
    if(b.maxSqft==null||b.maxSqft===''){if(sf>0)return b;continue;}
    if(sf<=n(b.maxSqft))return b;
  }
  return bands[bands.length-1]||null;
}
function priceNotSet(label){
  return label+': price not set (owner: set it in Price book)';
}
/* Unpriced add-ons do not fail the quote. Pass unpriced to record them for the owner. */
function resolveAdj(map,key,label,pending,lines,pkgKey,unpriced){
  const missing=unpriced||pending;
  if(!map||!Object.prototype.hasOwnProperty.call(map,key)){
    missing.push(unpriced?priceNotSet(label):('Starting price needed — no approved adjustment configured for '+label+' ('+key+').'));
    return {ok:!unpriced,amount:0,configured:false};
  }
  const read=readAdj(map[key],pkgKey||'');
  if(!read.configured){
    missing.push(unpriced?priceNotSet(label):('Starting price needed — '+label+' adjustment is unconfigured in the price book.'));
    return {ok:!unpriced,amount:0,configured:false};
  }
  const amount=read.amount;
  /* Flat dollar amount, which may be a credit. Never multiply a catalog adjustment by area sq ft. */
  if(amount){
    lines.push({kind:'adjustment',label:label,description:'Catalog adjustment from price book',qty:1,unit:'ea',rate:amount,total:amount});
  }
  return {ok:true,amount,configured:true};
}
function noteUnknown(map,key,pkgKey,pending,notes,unconfiguredText,unpriced){
  if(key!=='unknown')return;
  if(!adjConfigured(map,'unknown',pkgKey)){if(!unpriced)pending.push(unconfiguredText);}
  else notes.push('Condition not inspected — unknown-condition allowance applied.');
}
/* Best topcoat. The stored key stays premium. The rate is dollars per sq ft, or null until the owner sets it. */
function addPolyLine(lines,unpriced,sqft,rawRate){
  const sf=n(sqft);
  if(!(sf>0))return;
  if(!isConfigured(rawRate)){
    unpriced.push(priceNotSet('Polyaspartic topcoat'));
    return;
  }
  const rate=Number(rawRate);
  const total=r2(sf*rate);
  if(!(total>0))return;
  lines.push({kind:'extra',label:'Polyaspartic topcoat',description:'$'+rate.toFixed(2)+' / sq ft',qty:sf,unit:'sq ft',rate,total});
}
function topcoatAdjLabel(key){
  return key==='premium'?'Polyaspartic topcoat':'Topcoat ('+(key||'protective')+')';
}
/* 1–4 only. Five or more is capped at 4. Blank counts as one included color. */
function colorCount(v){
  const x=Math.round(Number(v));
  if(!Number.isFinite(x)||x<=1)return 1;
  return x>4?4:x;
}
function pushRateLine(rows,unpriced,label,sqft,rawRate){
  const sf=n(sqft);
  if(!(sf>0))return;
  if(!isConfigured(rawRate)){
    unpriced.push(priceNotSet(label));
    return;
  }
  const rate=Number(rawRate);
  if(!(rate>0))return;
  const total=r2(sf*rate);
  if(!(total>0))return;
  rows.push({kind:'extra',label,description:'$'+rate.toFixed(2)+' / sq ft',qty:sf,unit:'sq ft',rate,total});
}
/* Metallic 3–4 colors and a custom flake blend add on top. Solid has no multi-color charge. */
function collectColorCharges(job,settings,rows,unpriced){
  const cfg=extrasConfig(settings).multiColor||{};
  let metalSf=0,flakeSf=0;
  const type=projectTypeOf(job);
  if(type==='garage'&&!garageUsesMeasured(job)){
    const sf=packageBillableSqft(job,settings);
    if((job.garageStyle||'')==='metallic'&&colorCount(job.garageMetallicColors)>=3)metalSf+=sf;
    if((job.garageStyle||'')==='flake'&&job.garageFlakeBlend==='custom')flakeSf+=sf;
  }else if(type==='floor'||(type==='garage'&&garageUsesMeasured(job))){
    for(const a of job.areas||[]){
      const sf=n(a.sqft);
      if(!(sf>0)||a.style==='level')continue;
      if(a.style==='metallic'&&colorCount(a.metallicColors)>=3)metalSf+=sf;
      if(a.style==='flake'&&a.flakeBlend==='custom')flakeSf+=sf;
    }
  }else if(type==='flatwork'){
    for(const it of job.catalogItems||[]){
      let sf=n(it.sqft);
      if(!(sf>0))sf=r2(n(it.length)*n(it.width));
      if(!(sf>0))continue;
      if(it.style==='metallic'&&colorCount(it.metallicColors)>=3)metalSf+=sf;
      if(it.style==='flake'&&it.flakeBlend==='custom')flakeSf+=sf;
    }
  }
  if(metalSf>0)pushRateLine(rows,unpriced,'Metallic extra colors',metalSf,cfg.metallicPerSqft);
  if(flakeSf>0)pushRateLine(rows,unpriced,'Custom flake blend',flakeSf,cfg.customFlakePerSqft);
}
function blankExtras(){
  return {crackLf:0,coatingRemoval:false,paintRemoval:false,adhesiveRemoval:false,poorSlab:false,stairsSolid:0,stairsFlake:0,stemWallLf:0,countertopSqft:0,countertopStyle:'solid',antiSlip:false,travel:false,movingHours:0,rush:false,weekend:false,winterHeatDays:0,consumables:false,fuel:false,extraVisits:0,warrantyYears:1};
}
function cfgNum(v,fallback){
  if(v===null||v===undefined||v==='')return fallback;
  const x=Number(v);
  return Number.isFinite(x)?x:fallback;
}
function extrasConfig(settings){
  const over=(settings&&settings.extras)||{};
  const base=defaults.extras;
  const out={};
  for(const k of Object.keys(base)){
    const src=over[k];
    out[k]=(src&&typeof src==='object'&&!Array.isArray(src))?Object.assign({},base[k],src):Object.assign({},base[k]);
  }
  return out;
}
function smallSolidSpec(settings){
  const d=defaults.rates.smallSolidFloor;
  const raw=settings&&settings.rates&&settings.rates.smallSolidFloor;
  const src=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  /* A saved floor object with no bands keeps the single floor. Missing settings use the default band. */
  const bands=Array.isArray(src.bands)?src.bands:(raw?[]:(Array.isArray(d.bands)?d.bands:[]));
  return {maxSqft:cfgNum(src.maxSqft,d.maxSqft),min:cfgNum(src.min,d.min),bands};
}
function packageSizeKey(size){
  const s=String(size==null?'2':size);
  if(s==='1'||s==='1car'||s==='one'||s==='oneCar')return 'oneCar';
  if(s==='3'||s==='3car'||s==='three'||s==='threeCar')return 'threeCar';
  return 'twoCar';
}
/* Copy 1/2/3 size aliases onto oneCar/twoCar/threeCar when the canonical key is blank. */
function normalizeStaffPackages(raw){
  const packs=raw&&raw.garage&&raw.garage.packages;
  if(!packs||typeof packs!=='object')return raw;
  const alias={oneCar:['1car','1'],twoCar:['2car','2'],threeCar:['3car','3']};
  for(const tier of Object.keys(packs)){
    const systems=packs[tier];
    if(!systems||typeof systems!=='object'||Array.isArray(systems))continue;
    for(const sys of Object.keys(systems)){
      const sizes=systems[sys];
      if(!sizes||typeof sizes!=='object'||Array.isArray(sizes))continue;
      for(const canon of Object.keys(alias)){
        if(isConfigured(sizes[canon]))continue;
        for(const key of alias[canon]){
          if(!isConfigured(sizes[key]))continue;
          sizes[canon]=Number(sizes[key]);
          break;
        }
      }
    }
  }
  return raw;
}
function packageCellAmount(settings,tier,system,sizeKey){
  const priceTier=tier==='opt1'||tier==='opt2'||tier==='regular'?tier:'regular';
  const listed=packageTablePrice(settings,{priceOption:priceTier,garageStyle:system},sizeKey);
  if(listed!=null)return listed>0?listed:0;
  const table=garagePackageDefaults.packages[priceTier]||garagePackageDefaults.packages.regular;
  const cell=table&&table[system]&&table[system][sizeKey];
  return isConfigured(cell)&&Number(cell)>0?Number(cell):0;
}
function bandAmount(settings,band,tier){
  if(!band||typeof band!=='object')return 0;
  if(isConfigured(band.min)&&Number(band.min)>0)return Number(band.min);
  if(isConfigured(band.amount)&&Number(band.amount)>0)return Number(band.amount);
  if(band.source&&band.source!=='package'&&band.source!=='garagePackage')return 0;
  const system=band.system||'solid';
  const sizeKey=packageSizeKey(band.size!=null?band.size:band.packageSize);
  return packageCellAmount(settings,tier,system,sizeKey);
}
function inSqftBand(sf,band){
  const lo=Number(band&&band.minSqft);
  const hi=Number(band&&band.maxSqft);
  if(!Number.isFinite(lo)||sf<lo)return false;
  if(Number.isFinite(hi)&&sf>=hi)return false;
  return true;
}
function packageTypicalSqft(job,settings){
  const key=garagePkgKey(job);
  const from=settings&&settings.catalog&&settings.catalog.garage&&settings.catalog.garage.packageSqft;
  const map=Object.assign({oneCar:250,twoCar:450,threeCar:650},from||{});
  return n(map[key]);
}
function sumAreaSqft(job,pred){
  let s=0;
  for(const a of (job&&job.areas)||[]){
    if(pred&&!pred(a))continue;
    s+=n(a.sqft);
  }
  return s;
}
/* Actual size used for per-sqft prep. Measured sq ft wins, including overflow above the package. Unmeasured packages use the typical size. */
function actualJobSqft(job,settings){
  const measured=sumAreaSqft(job);
  if(projectTypeOf(job)==='garage'&&!garageUsesMeasured(job)){
    if(measured>0)return measured;
    return packageTypicalSqft(job,settings);
  }
  return measured;
}
/* Per job, not per area: solid-system sq ft is the sum of solid areas, or a solid package's measured size (typical size when unmeasured). */
function solidSystemSqft(job,settings){
  const type=projectTypeOf(job);
  if(type==='garage'&&!garageUsesMeasured(job)){
    if((job.garageStyle||'flake')!=='solid')return 0;
    const measured=sumAreaSqft(job);
    if(measured>0)return measured;
    return packageTypicalSqft(job,settings);
  }
  if(type==='floor'||(type==='garage'&&garageUsesMeasured(job))){
    return sumAreaSqft(job,a=>{
      const style=['solid','flake','metallic','sealer','level'].includes(a.style)?a.style:'solid';
      return style==='solid';
    });
  }
  return 0;
}
/* Under the small ceiling: the flat small-solid minimum. A configured band owns its range and looks up that tier's package price when it has no amount. */
function smallSolidFloorAmount(settings,job,tier){
  if(job&&job.method&&job.method!=='rates')return 0;
  const spec=smallSolidSpec(settings);
  const sf=solidSystemSqft(job,settings);
  if(!(sf>0))return 0;
  const priceTier=tier||(job&&job.priceOption)||'regular';
  let bandBest=0,bandMatched=false;
  for(const band of spec.bands){
    if(!inSqftBand(sf,band))continue;
    bandMatched=true;
    bandBest=Math.max(bandBest,bandAmount(settings,band,priceTier));
  }
  if(bandMatched&&bandBest>0)return bandBest;
  if(spec.maxSqft>0&&spec.min>0&&sf<spec.maxSqft)return spec.min;
  return 0;
}
function bindingMinimum(settings,job,pre,active,tier){
  if(!active)return {minimum:0,label:''};
  const jobMin=minimumJobAmount(settings);
  const solidMin=smallSolidFloorAmount(settings,job,tier);
  const target=Math.max(jobMin,solidMin);
  const minimum=Math.max(0,target-pre);
  let label='';
  if(minimum>0.001&&solidMin>=jobMin&&solidMin>pre)label='Small solid floor minimum';
  else if(minimum>0.001)label='Minimum job charge';
  return {minimum:r2(minimum),label};
}
/* Package installs are costed as a floor of the same system. Sq ft is the package size, plus overflow above it. */
function packageBillableSqft(job,settings){
  const typical=packageTypicalSqft(job,settings);
  const measured=sumAreaSqft(job);
  if(!(typical>0))return measured;
  return Math.max(typical,measured);
}
function floorSystemCost(settings,job,sqft,style){
  const shadow=newJob();
  shadow.customer=job.customer||'Package';
  shadow.company=job.company||'';
  shadow.projectType='floor';
  shadow.method='rates';
  shadow.priceOption='regular';
  shadow.tax=0;
  shadow.discount=0;
  shadow.miles=n(job.miles);
  shadow.minutes=n(job.minutes);
  shadow.visits=job.visits;
  shadow.vehicles=job.vehicles;
  shadow.crew=job.crew;
  shadow.rentalDays=job.rentalDays;
  shadow.condition='sound';
  shadow.patchKits=0;
  shadow.extras=blankExtras();
  shadow.areas=[{...newArea(),name:'Package area',sqft:sqft,style:style,coats:1,flake:'light',grip:false,level:false,moisture:false,rate:null}];
  return calculate(shadow,settings);
}
function sqftCharge(cfg,sqft){
  const sf=n(sqft);
  if(!(sf>0)||!cfg)return null;
  const rate=Number(cfg.perSqft);
  const minCharge=Number(cfg.min);
  const rateOk=Number.isFinite(rate)&&rate>0;
  const minOk=Number.isFinite(minCharge)&&minCharge>0;
  if(!rateOk&&!minOk)return null;
  const raw=r2(sf*(rateOk?rate:0));
  const total=r2(Math.max(raw,minOk?minCharge:0));
  if(!(total>0))return null;
  return {qty:sf,rate:rateOk?rate:0,total,minApplied:minOk&&total>raw+0.001};
}
function prepChargeSqft(job,settings,areaKey,garageKey){
  const ex=job.extras||{};
  const named=ex[areaKey+'Sqft'];
  if(named!=null&&named!==''&&n(named)>0)return n(named);
  const flagged=sumAreaSqft(job,a=>a.prep&&a.prep[areaKey]);
  if(flagged>0)return flagged;
  if(garageKey&&job.garagePrep&&job.garagePrep[garageKey])return actualJobSqft(job,settings);
  if(ex[areaKey]===true)return actualJobSqft(job,settings);
  return 0;
}
function crackRepairSelected(job){
  const ex=job.extras||{};
  if(n(ex.crackLf)>0)return true;
  if(job.garagePrep&&job.garagePrep.cracks)return true;
  return (job.areas||[]).some(a=>a.prep&&a.prep.cracks);
}
function crackRepairFeet(job){
  const ex=job.extras||{};
  if(ex.crackLf!=null&&ex.crackLf!==''&&n(ex.crackLf)>0)return n(ex.crackLf);
  if(projectTypeOf(job)==='garage'&&!garageUsesMeasured(job))return n(job.garagePrep&&job.garagePrep.crackLf);
  let s=0;
  for(const a of job.areas||[])if(a.prep&&a.prep.cracks)s+=n(a.prep.crackLf);
  return s;
}
function usesScheduledRemoval(job){
  const ex=job.extras||{};
  if(ex.coatingRemoval||ex.paintRemoval||ex.adhesiveRemoval)return true;
  if(n(ex.coatingRemovalSqft)||n(ex.paintRemovalSqft)||n(ex.adhesiveRemovalSqft))return true;
  if(job.garagePrep&&(job.garagePrep.coatingRemoval||job.garagePrep.paintRemoval))return true;
  if(job.garageCondition==='paint'||job.garageCondition==='adhesive')return true;
  for(const a of job.areas||[]){
    const p=a.prep||{};
    if(p.coatingRemoval||p.paintRemoval||p.adhesive)return true;
  }
  return false;
}
function extraPriceReady(cfg){
  if(!cfg)return false;
  const rate=Number(cfg.perSqft);
  const minCharge=Number(cfg.min);
  return (Number.isFinite(rate)&&rate>0)||(Number.isFinite(minCharge)&&minCharge>0);
}
function pushSqftExtra(rows,cfg,sqft,label,minNote,unpriced){
  const sf=n(sqft);
  if(!(sf>0))return;
  if(!extraPriceReady(cfg)){
    if(unpriced)unpriced.push(priceNotSet(label));
    return;
  }
  const hit=sqftCharge(cfg,sf);
  if(!hit)return;
  rows.push({kind:'extra',label,description:hit.minApplied?('$'+(n(cfg.perSqft)).toFixed(2)+'/sq ft, '+minNote+' minimum'):'$'+(n(cfg.perSqft)).toFixed(2)+' / sq ft',qty:hit.qty,unit:'sq ft',rate:hit.rate,total:hit.total});
}
/* Optional selling lines. Per-sqft prep uses the rate and minimum, on actual sq ft, not a per-size flat. Off until selected. */
function collectOptionalExtras(job,settings){
  const cfg=extrasConfig(settings);
  const ex=job.extras||{};
  const rows=[];
  const unpriced=[];
  rows.unpriced=unpriced;
  if(crackRepairSelected(job)){
    if(!isConfigured(cfg.crackRepair.flat)&&!isConfigured(cfg.crackRepair.perLf))unpriced.push(priceNotSet('Crack repair'));
    else {
    const feet=crackRepairFeet(job);
    const included=n(cfg.crackRepair.includedLf)||10;
    const flat=n(cfg.crackRepair.flat);
    const per=n(cfg.crackRepair.perLf);
    const over=Math.max(0,feet-included);
    const total=r2(flat+over*per);
    if(total>0)rows.push({kind:'extra',label:'Crack repair',description:feet<=included?'Flat rate up to '+included+' linear ft':included+' linear ft included, then $'+per.toFixed(2)+'/ft',qty:feet>0?feet:included,unit:'lf',rate:feet<=included?flat:per,total});
    }
  }
  pushSqftExtra(rows,cfg.coatingRemoval,prepChargeSqft(job,settings,'coatingRemoval','coatingRemoval'),'Coating removal','$'+n(cfg.coatingRemoval.min).toFixed(0),unpriced);
  let paintSf=prepChargeSqft(job,settings,'paintRemoval','paintRemoval');
  if(!(paintSf>0)&&job.garageCondition==='paint')paintSf=actualJobSqft(job,settings);
  pushSqftExtra(rows,cfg.paintRemoval,paintSf,'Paint removal','$'+n(cfg.paintRemoval.min).toFixed(0),unpriced);
  let adhSf=sumAreaSqft(job,a=>a.prep&&a.prep.adhesive);
  if(!(adhSf>0)&&n(ex.adhesiveRemovalSqft)>0)adhSf=n(ex.adhesiveRemovalSqft);
  if(!(adhSf>0)&&job.garagePrep&&job.garagePrep.adhesive)adhSf=actualJobSqft(job,settings);
  if(!(adhSf>0)&&ex.adhesiveRemoval===true)adhSf=actualJobSqft(job,settings);
  if(!(adhSf>0)&&job.garageCondition==='adhesive')adhSf=actualJobSqft(job,settings);
  pushSqftExtra(rows,cfg.adhesiveRemoval,adhSf,'Adhesive / mastic removal','$'+n(cfg.adhesiveRemoval.min).toFixed(0),unpriced);
  let poorSf=prepChargeSqft(job,settings,'spalling','spalling');
  if(!(poorSf>0)&&n(ex.poorSlabSqft)>0)poorSf=n(ex.poorSlabSqft);
  if(!(poorSf>0)&&ex.poorSlab===true)poorSf=actualJobSqft(job,settings);
  pushSqftExtra(rows,cfg.poorSlab,poorSf,'Poor slab','$'+n(cfg.poorSlab.min).toFixed(0),unpriced);
  let gripSf=sumAreaSqft(job,a=>a.grip&&a.style!=='level');
  if(!(gripSf>0)&&n(ex.antiSlipSqft)>0)gripSf=n(ex.antiSlipSqft);
  if(!(gripSf>0)&&ex.antiSlip===true){
    gripSf=(projectTypeOf(job)==='garage'&&!garageUsesMeasured(job))?packageBillableSqft(job,settings):actualJobSqft(job,settings);
  }
  pushSqftExtra(rows,cfg.antiSlip,gripSf,'Anti-slip additive','$'+n(cfg.antiSlip.min||0).toFixed(0),unpriced);
  if(n(ex.stairsSolid)>0){
    if(!isConfigured(cfg.stairs.solid))unpriced.push(priceNotSet('Stairs (solid)'));
    else rows.push({kind:'extra',label:'Stairs (solid)',description:'$' + n(cfg.stairs.solid).toFixed(2)+' per step',qty:n(ex.stairsSolid),unit:'step',rate:n(cfg.stairs.solid),total:r2(n(ex.stairsSolid)*n(cfg.stairs.solid))});
  }
  if(n(ex.stairsFlake)>0){
    if(!isConfigured(cfg.stairs.flake))unpriced.push(priceNotSet('Stairs (flake)'));
    else rows.push({kind:'extra',label:'Stairs (flake)',description:'$' + n(cfg.stairs.flake).toFixed(2)+' per step',qty:n(ex.stairsFlake),unit:'step',rate:n(cfg.stairs.flake),total:r2(n(ex.stairsFlake)*n(cfg.stairs.flake))});
  }
  if(n(ex.stemWallLf)>0){
    if(!isConfigured(cfg.stemWall.perLf))unpriced.push(priceNotSet('Stem walls / cove'));
    else rows.push({kind:'extra',label:'Stem walls / cove',description:'$' + n(cfg.stemWall.perLf).toFixed(2)+' per linear ft',qty:n(ex.stemWallLf),unit:'lf',rate:n(cfg.stemWall.perLf),total:r2(n(ex.stemWallLf)*n(cfg.stemWall.perLf))});
  }
  if(n(ex.countertopSqft)>0){
    const sf=n(ex.countertopSqft);
    const metallic=ex.countertopStyle==='metallic';
    const raw=metallic?cfg.countertop.metallic:cfg.countertop.solid;
    if(!isConfigured(raw)&&!isConfigured(cfg.countertop.min))unpriced.push(priceNotSet(metallic?'Countertop / bar top (metallic)':'Countertop / bar top (solid)'));
    else {
      const rate=n(raw);
      const total=r2(Math.max(sf*rate,n(cfg.countertop.min)));
      if(total>0)rows.push({kind:'extra',label:metallic?'Countertop / bar top (metallic)':'Countertop / bar top (solid)',description:'$' + rate.toFixed(2)+'/sq ft, $'+n(cfg.countertop.min).toFixed(0)+' minimum',qty:sf,unit:'sq ft',rate,total});
    }
  }
  if(ex.travel){
    const beyond=Math.max(0,n(job.miles)-n(cfg.travelBeyond.includedMiles));
    const qty=beyond*2;
    const rate=n(cfg.travelBeyond.perMile);
    const total=r2(qty*rate);
    if(total>0)rows.push({kind:'extra',label:'Travel beyond 25 miles',description:'$' + rate.toFixed(2)+' per mile each way past '+n(cfg.travelBeyond.includedMiles)+' miles',qty,unit:'mile',rate,total});
  }
  if(n(ex.movingHours)>0)rows.push({kind:'extra',label:'Furniture / vehicle moving',description:'$' + n(cfg.moving.perHour).toFixed(2)+' per hour, 2 people',qty:n(ex.movingHours),unit:'hr',rate:n(cfg.moving.perHour),total:r2(n(ex.movingHours)*n(cfg.moving.perHour))});
  if(n(ex.winterHeatDays)>0)rows.push({kind:'extra',label:'Winter heat',description:'$' + n(cfg.winterHeat.perDay).toFixed(2)+' per day',qty:n(ex.winterHeatDays),unit:'day',rate:n(cfg.winterHeat.perDay),total:r2(n(ex.winterHeatDays)*n(cfg.winterHeat.perDay))});
  if(ex.consumables)rows.push({kind:'extra',label:'Per-job consumables',description:'Tape, plastic, rollers, and spikes',qty:1,unit:'job',rate:n(cfg.consumables.flat),total:r2(n(cfg.consumables.flat))});
  if(ex.fuel){
    const miles=n(ex.fuelMiles)>0?n(ex.fuelMiles):n(job.miles)*2;
    const rate=n(cfg.fuelWear.perMile);
    const total=r2(miles*rate);
    if(total>0)rows.push({kind:'extra',label:'Fuel and vehicle wear',description:'$' + rate.toFixed(2)+' per mile',qty:miles,unit:'mile',rate,total});
  }
  if(n(ex.extraVisits)>0)rows.push({kind:'extra',label:'Extra site visit',description:'$' + n(cfg.extraVisit.flat).toFixed(2)+' each',qty:n(ex.extraVisits),unit:'visit',rate:n(cfg.extraVisit.flat),total:r2(n(ex.extraVisits)*n(cfg.extraVisit.flat))});
  collectColorCharges(job,settings,rows,unpriced);
  const kept=rows.filter(row=>n(row.total)>0);
  kept.unpriced=unpriced;
  return kept;
}
/* Rush, weekend, and the 3-year warranty are each a percent of the same job price. They add. They do not multiply, and they do not change the other tier. */
function percentExtraLines(job,settings,base){
  const ex=job.extras||{};
  const cfg=extrasConfig(settings);
  const rows=[];
  const add=(on,pct,label,description)=>{
    const p=n(pct);
    if(!on||!(p>0)||!(base>0))return;
    const total=r2(base*p/100);
    if(!(total>0))return;
    rows.push({kind:'extra',label,description,qty:1,unit:'job',rate:total,total});
  };
  add(!!ex.rush,cfg.rush&&cfg.rush.pct,'Rush (within 7 days)','Adds '+n(cfg.rush&&cfg.rush.pct)+'% of this tier. Payment tiers are not combined.');
  add(!!ex.weekend,cfg.weekend&&cfg.weekend.pct,'Weekend','Adds '+n(cfg.weekend&&cfg.weekend.pct)+'% of this tier. Added to rush, not multiplied by it.');
  const years=ex.warrantyYears==null||ex.warrantyYears===''?1:Number(ex.warrantyYears);
  add(Number.isFinite(years)&&years>=3,cfg.warranty&&cfg.warranty.pct,'3-year warranty','1-year warranty is included. 3-year coverage adds '+n(cfg.warranty&&cfg.warranty.pct)+'% of this tier.');
  return rows;
}

function buildCatalogBreakdown(job,settings){
  const cat=Object.assign({},catalogDefaults,settings.catalog||{});
  cat.garage=Object.assign({},catalogDefaults.garage,(settings.catalog&&settings.catalog.garage)||{});
  cat.flatwork=Object.assign({},catalogDefaults.flatwork,(settings.catalog&&settings.catalog.flatwork)||{});
  cat.seating=Object.assign({},catalogDefaults.seating,(settings.catalog&&settings.catalog.seating)||{});
  const type=projectTypeOf(job);
  const pending=[],notes=[],lines=[],adjustments=[],unpriced=[];
  const pkgKey=garagePkgKey(job);
  let startingTotal=0, startingConfigured=true, itemCount=0, measureSqft=0;
  let startingLabel='Starting price';

  if(type==='garage' && !garageUsesMeasured(job)){
    const pkgLabel=job.garagePackage==='1car'?'1-car garage package':job.garagePackage==='2car'?'2-car garage package':job.garagePackage==='3car'?'3-car garage package':'Garage package';
    const typical=n(cat.garage.packageSqft&&cat.garage.packageSqft[pkgKey]);
    const styleName=job.garageStyle||'flake';
    const listed=packageTablePrice(settings,job,pkgKey);
    const flakeRate=styleTierRate(settings,job,'flake');
    let baseReady=false;
    let usedTable=false;
    if(listed!=null && !(listed>0)){
      pending.push('Package price is not positive. The package was not rewritten to a free $0 quote.');
      startingConfigured=false;
      usedTable=true;
      if(listed){
        startingTotal=listed;
        lines.push({kind:'starting',label:pkgLabel+' — base fee',description:'Package price for this tier and '+styleName+' system is not a positive selling price.',qty:1,unit:'package',rate:listed,total:listed});
      }
    } else if(listed!=null){
      startingTotal=listed;
      baseReady=true;
      usedTable=true;
      lines.push({kind:'starting',label:pkgLabel+' — base fee',description:'Package price for this tier and '+styleName+' system. Square feet above '+typical+' sq ft use that tier’s '+styleName+' rate.',qty:1,unit:'package',rate:listed,total:listed});
    } else if(!(typical>0)||!(flakeRate>0)){
      pending.push('Starting price needed — '+pkgLabel+' base fee is the selected flake tier rate × the typical size (250 / 450 / 650 sq ft).');
      startingConfigured=false;
    } else {
      const start=r2(flakeRate*typical);
      startingTotal=start;
      baseReady=true;
      lines.push({kind:'starting',label:pkgLabel+' — base fee',description:'Flake tier rate $'+flakeRate.toFixed(2)+' × '+typical+' sq ft. Square feet above that use the selected system’s tier rate.',qty:1,unit:'package',rate:start,total:start});
    }
    let measured=0;
    for(const a of (job.areas||[]))measured+=n(a.sqft);
    if(measured)measureSqft=measured;
    const overflow=typical>0&&measured>typical?r2(measured-typical):0;
    if(overflow>0&&baseReady){
      const rate=styleTierRate(settings,job,styleName);
      const amount=r2(overflow*rate);
      if(amount){
        startingTotal+=amount;
        lines.push({kind:'overflow',label:'Overflow above '+typical+' sq ft',description:'Typical '+pkgLabel.replace(' package','')+' is '+typical+' sq ft. Extra '+overflow+' sq ft at the selected '+styleName+' tier rate.',qty:overflow,unit:'sq ft',rate:rate,total:amount});
      }
    }
    const style=styleName;
    if(style==='sealer'){
      unpriced.push(priceNotSet('Clear seal'));
    } else if(style==='custom'){
      unpriced.push(priceNotSet('Custom scope'));
    }
    if((job.garageCondition||'')==='critical'){
      unpriced.push(priceNotSet('Critical slab'));
    }
    const prepOn=job.garagePrep||{};
    if(prepOn.leveling){
      unpriced.push(priceNotSet('Leveling'));
    }
    /* The package table is the full system price. Skip the solid credit. Unpriced add-ons stay off the customer total. */
    const skipSolidCredit=usedTable&&style==='solid';
    const metallicCovered=usedTable&&style==='metallic'&&!adjConfigured(cat.garage.materialAdj,'metallic',pkgKey);
    if(style!=='sealer'&&style!=='custom'&&!skipSolidCredit&&!metallicCovered){
      resolveAdj(cat.garage.materialAdj,style,'Material / system ('+style+')',pending,adjustments,pkgKey,unpriced);
    }
    const topKey=job.garageTopcoat||'protective';
    if(topKey==='premium')addPolyLine(adjustments,unpriced,typical,cat.garage.topcoatAdj&&cat.garage.topcoatAdj.premium);
    else resolveAdj(cat.garage.topcoatAdj,topKey,topcoatAdjLabel(topKey),pending,adjustments,pkgKey,unpriced);
    const condKey=job.garageCondition||'unknown';
    /* Paint and adhesive are optional per-sqft extras. A critical slab note does not remove the base price. */
    if(condKey!=='paint'&&condKey!=='adhesive'&&condKey!=='critical'){
      noteUnknown(cat.garage.conditionAdj,condKey,pkgKey,pending,notes,'Condition is Unknown / not inspected — do not assume $0. Inspect or set an explicit unknown-condition adjustment in the price book.',unpriced);
      resolveAdj(cat.garage.conditionAdj,condKey,'Concrete condition ('+condKey+')',pending,adjustments,pkgKey,unpriced);
    }
    const prep=job.garagePrep||{};
    const scheduledPrep={cracks:1,spalling:1,coatingRemoval:1,paintRemoval:1};
    for(const [pk,on] of Object.entries(prep)){
      if(!on||pk==='leveling'||scheduledPrep[pk])continue;
      resolveAdj(cat.garage.prepAdj,pk,'Prep: '+pk,pending,adjustments,pkgKey,unpriced);
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
      const cap=flatworkCap(cat);
      const customSet=it.customStarting!==undefined&&it.customStarting!==null&&it.customStarting!=='';
      const overCap=cap!=null&&sf>cap&&!customSet;
      const band=it.sizeBand?((cat.flatwork.sizeBands||[]).find(b=>b.id===it.sizeBand)||null):flatworkBandForSqft(cat,sf);
      let startRaw=band?band.starting:cat.flatwork.customStarting;
      if(customSet)startRaw=it.customStarting;
      const name=it.name||('Flatwork item '+itemCount);
      if(overCap){
        pending.push('Over '+cap+' sq ft: measure and quote per sq ft or set a custom starting price for this item.');
        startingConfigured=false;
      } else if(!sf&&!band){
        pending.push('Starting price needed — enter size/dimensions for '+name+'.');
        startingConfigured=false;
      } else if(!isConfigured(startRaw)){
        if(!band){
          pending.push('Optional flatwork override is blank and no size band matched for '+name+'. A blank override is not a missing package price. Choose a size band or enter an item override. The item stays Pending.');
        } else {
          pending.push('Starting price needed — size band "'+band.label+'" has no configured starting price for '+name+'.');
        }
        startingConfigured=false;
      } else {
        const start=Number(startRaw);
        startingTotal+=start;
        lines.push({kind:'starting',label:name+' — starting price',description:(band?band.label+' · ':'')+(sf?sf+' sq ft':'size noted')+(L&&W?' · '+L+'×'+W+' ft':''),qty:1,unit:'item',rate:start,total:start});
      }
      resolveAdj(cat.flatwork.materialAdj,it.style||'solid','Material / system ('+(it.style||'solid')+') — '+name,pending,adjustments,'',unpriced);
      if((it.topcoat||'protective')==='premium')addPolyLine(adjustments,unpriced,sf,cat.flatwork.topcoatAdj&&cat.flatwork.topcoatAdj.premium);
      else resolveAdj(cat.flatwork.topcoatAdj,it.topcoat||'protective',topcoatAdjLabel(it.topcoat||'protective')+' — '+name,pending,adjustments,'',unpriced);
      const ck=it.condition||'unknown';
      noteUnknown(cat.flatwork.conditionAdj,ck,'',pending,notes,'Condition is Unknown for '+name+' — do not assume $0. Inspect or configure an explicit adjustment.',unpriced);
      if(ck==='critical')unpriced.push(priceNotSet('Critical condition — '+name));
      if((it.style||'')==='custom')unpriced.push(priceNotSet('Custom material — '+name));
      if(ck!=='critical')resolveAdj(cat.flatwork.conditionAdj,ck,'Condition ('+ck+') — '+name,pending,adjustments,'',unpriced);
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
      resolveAdj(cat.seating.materialAdj,it.style||'solid','Material / system ('+(it.style||'solid')+') — '+name,pending,adjustments,'',unpriced);
      if((it.topcoat||'protective')==='premium'){
        if(!isConfigured(cat.seating.topcoatAdj&&cat.seating.topcoatAdj.premium))unpriced.push(priceNotSet('Polyaspartic topcoat — '+name));
        else resolveAdj(cat.seating.topcoatAdj,'premium','Polyaspartic topcoat — '+name,pending,adjustments,'',unpriced);
      } else resolveAdj(cat.seating.topcoatAdj,it.topcoat||'protective',topcoatAdjLabel(it.topcoat||'protective')+' — '+name,pending,adjustments,'',unpriced);
      const ck=it.condition||'unknown';
      noteUnknown(cat.seating.conditionAdj,ck,'',pending,notes,'Condition is Unknown for '+name+' — do not assume $0. Inspect or configure an explicit adjustment.',unpriced);
      if(ck==='critical')unpriced.push(priceNotSet('Critical condition — '+name));
      if((it.style||'')==='custom')unpriced.push(priceNotSet('Custom material — '+name));
      if(ck!=='critical')resolveAdj(cat.seating.conditionAdj,ck,'Condition ('+ck+') — '+name,pending,adjustments,'',unpriced);
    }
    startingLabel='Seating starting';
  }

  const adjTotal=adjustments.reduce((s,x)=>s+sn(x.total),0);
  const allLines=[...lines,...adjustments];
  const scopeTotal=startingTotal+adjTotal;
  const hasNegative=adjustments.some(x=>sn(x.total)<0);
  /* Leave the raw scope. A non-positive package is blocked; it is not rewritten into a free quote. */
  if(hasNegative&&scopeTotal<=0)pending.push('Adjustments exceed the starting price. The package was not rewritten to a free $0 quote.');
  const quoteReady=pending.length===0 && startingConfigured && (itemCount>0||type==='garage');
  return {
    type, pending, notes, lines:allLines, startingLines:lines, adjustments, startingTotal, adjTotal, scopeTotal,
    startingConfigured, quoteReady, itemCount, measureSqft, startingLabel,
    pendingUnique:[...new Set(pending)], notesUnique:[...new Set(notes)], unpriced:[...new Set(unpriced)]
  };
}

function emptyResult(overrides){
  const tr={oneWay:0,trips:0,vehicles:0,rate:0,crew:3,vehicleMiles:0,mileage:0,minutes:0,crewHours:0,crewTravel:0};
  const sel={key:'regular',label:'Regular price',short:'Regular retail',rate:0,project:0,adjustment:0,pre:0,minimum:0,discount:0,subtotal:0,salesTax:0,total:0,savings:0,savingsPct:0,payments:[],pctTotal:0};
  return Object.assign({sqft:0,finished:0,levelArea:0,levelEquiv:0,material:[],mat:0,tax:0,hours:[],labor:0,equipment:[],equip:0,direct:0,overhead:0,overheadBase:0,overheadItems:[],contingency:0,cost:0,lines:[],base:0,regularBase:0,discountable:0,discountSqft:0,choices:{regular:sel},selected:sel,addOn:{label:'',tier:'low',rate:0,included:false,total:0},travel:tr,travelCost:0,travelInQuote:0,crew:3,discount:0,minimum:0,subtotal:0,salesTax:0,total:0,profit:0,margin:0,perSqft:0,travelMiles:0,personHours:0,balance:0,warnings:[],quoteReady:false,quoteStatus:'incomplete',pendingReasons:[],catalog:null,finalizedBlocked:true},overrides||{});
}

function appliedExtraDiscount(job,settings,pre,choiceKey){
  const flag=settings&&settings.discountApproval;
  const enforce=!flag||flag.enforce!==false;
  const room=Math.max(0,n(pre));
  const key=typeof choiceKey==='string'?choiceKey:'';
  if(!enforce){
    if(key&&key!=='regular')return 0;
    return Math.min(room,Math.max(0,n(job&&job.discount)));
  }
  const gate=job&&job.discountApproval;
  if(!gate||gate.ok!==true)return 0;
  if(!gate.tier||gate.tier!==key)return 0;
  const amt=n(gate.amount);
  if(!(amt>0)||!(room>amt))return 0;
  return r2(amt);
}
function tierFinishProject(finishLines,ratesMap){
  let project=0;const used={};
  for(const line of finishLines||[]){
    const style=line.style;
    const tier=!line.customRate&&ratesMap&&ratesMap[style]!=null&&ratesMap[style]!==''?n(ratesMap[style]):null;
    if(tier==null)project+=n(line.total);
    else{project+=tier*n(line.qty);used[style]=tier;}
  }
  return {project,used};
}
function sanityApi(){
  const g=typeof globalThis!=='undefined'?globalThis:root;
  if(g&&g.EsPriceSanity)return g.EsPriceSanity;
  if(typeof require==='function'){try{return require('./price-sanity.js')}catch(e){return null}}
  return null;
}
function finishQuote(job,result,collected){
  const S=sanityApi();
  const blocks=[...((collected&&collected.blocks)||[])];
  const warnings=[...((collected&&collected.warnings)||[])];
  if(S){
    const extra=S.review(job,result);
    blocks.push(...(extra.blocks||[]));
    warnings.push(...(extra.warnings||[]));
  }
  const seenB=new Set(),seenW=new Set();
  const b=blocks.filter(i=>{if(!i||seenB.has(i.message))return false;seenB.add(i.message);return true});
  const w=warnings.filter(i=>{if(!i||seenB.has(i.message)||seenW.has(i.message))return false;seenW.add(i.message);return true});
  result.blockingIssues=b;
  result.sanity={warnings:w,blocks:b,ok:b.length===0};
  if(b.length){
    result.quoteReady=false;
    result.finalizedBlocked=true;
    result.quoteStatus='blocked';
    result.pendingReasons=[...new Set([...(result.pendingReasons||[]),...b.map(i=>i.message)])];
  }
  for(const i of b)result.warnings.push(i.message);
  for(const i of w)result.warnings.push(i.message);
  return result;
}
function calculateCatalog(job,settings){
  const S=sanityApi();
  const guarded=S?S.guardSettings(settings):{settings:settings,blocks:[],warnings:[]};
  settings=guarded.settings;
  const collected={blocks:[...guarded.blocks],warnings:[...guarded.warnings]};
  const c=settings.costs,tr=travelInfo(job,settings);
  const br=buildCatalogBreakdown(job,settings);
  const warnings=[...br.pendingUnique,...(br.notesUnique||[])];
  if(!job.customer&&!job.company)warnings.push('Add a customer name before issuing the document.');
  /* Selling travel stays in the quote total. Garage package owner cost is applied after the selling price is set. */
  const hasScope=br.scopeTotal>0||br.quoteReady;
  const sellingTravel=hasScope?(tr.mileage+tr.crewTravel):0;
  let equipment=equipmentLines(job,c,hasScope);
  let equip=equipment.reduce((s,x)=>s+x.total,0);
  let overheadBase=hasScope?flatOverhead(c):0;
  let travelCost=sellingTravel;
  let overhead=overheadBase+travelCost+equip;
  let overheadItems=hasScope?[
    {label:'Business overhead / job',qty:1,unit:'allowance',unitPrice:overheadBase,total:overheadBase},
    ...(tr.mileage?[{label:'Vehicle mileage (in overhead)',qty:tr.vehicleMiles,unit:'mile',unitPrice:tr.rate,total:tr.mileage}]:[]),
    ...(tr.crewTravel?[{label:'Crew travel time (in overhead)',qty:tr.crewHours,unit:'person-hr',unitPrice:n(c.labor),total:tr.crewTravel}]:[]),
    {label:'Equipment & job supplies (in overhead)',qty:1,unit:'allowance',unitPrice:equip,total:equip}
  ]:[];
  /* Flatwork and seating keep an empty material/labor bill. Garage packages are costed like a floor below. */
  let material=[],mat=0,tax=0,hours=[],labor=0,personHours=0,costSqft=0;
  let direct=mat+tax+labor;
  let contingency=(direct+overhead)*n(c.contingency)/100,cost=direct+overhead+contingency;

  const optional=collectOptionalExtras(job,settings);
  const unpriced=[...(br.unpriced||[]),...(optional.unpriced||[])];
  const lines=[...br.lines,...optional];
  /* Property add-in is per-sq-ft floor economics — do not auto-apply to unmeasured catalog packages */
  const addOn={label:(settings.addOn||{}).label||'Standard property / trip add-in',tier:'low',rate:0,included:false,total:0};
  const travelInQuote=sellingTravel;
  const lineSum=lines.reduce((s,x)=>s+sn(x.total),0);
  const discountable=br.startingTotal; /* adjustments stay; discount applies to starting scope similar to finish */
  const regularBase=lineSum+travelInQuote;
  const dollarPre=regularBase;
  const bind=bindingMinimum(settings,job,dollarPre,!!br.quoteReady);
  const minimum=bind.minimum;
  const pctLines=br.quoteReady?percentExtraLines(job,settings,dollarPre+minimum):[];
  const pctSum=r2(pctLines.reduce((s,x)=>s+n(x.total),0));
  const pre=r2(dollarPre+pctSum);
  const displayLines=[...lines,...pctLines];
  const discount=appliedExtraDiscount(job,settings,discountRoom(job,settings,pre,minimum),'regular');
  const subtotal=br.quoteReady?Math.max(0,r2(pre+minimum-discount)):0;
  const salesTax=subtotal*n(job.tax)/100;
  const total=br.quoteReady?(subtotal+salesTax):0;
  if(hasScope&&!job.miles&&!job.minutes)warnings.push('Travel overhead is $0 until one-way miles and drive time are entered (Internal).');
  if(!br.quoteReady){
    warnings.unshift('Quote pending — configure required starting prices / adjustments before finalizing. Shown total is not a finalized customer price.');
  }
  const sel={key:'regular',label:'Regular price',short:'Regular retail',rate:0,project:discountable,adjustment:0,pre,minimum,discount:br.quoteReady?discount:0,subtotal,salesTax,total,savings:0,savingsPct:0,payments:[],pctTotal:0};
  const choices={regular:Object.assign({},sel)};
  const opt=job.priceOption&&job.priceOption!=='regular'&&(settings.pricingOptions||{})[job.priceOption];
  if(opt&&br.quoteReady){
    const sched=Array.isArray(opt.schedule)?opt.schedule:[];
    let paid=0;
    sel.key=job.priceOption;sel.label=opt.label;sel.short=opt.short||opt.label;sel.payMethod=opt.payMethod||'';
    sel.payments=sched.map((p,i)=>{const amount=i===sched.length-1?r2(total-paid):r2(total*n(p.pct)/100);paid=r2(paid+amount);return{pct:n(p.pct),label:p.label,amount}});
    sel.pctTotal=sched.reduce((s,p)=>s+n(p.pct),0);
    sel.paymentsReconcile=!sel.payments.length||Math.abs(r2(sel.payments.reduce((s,p)=>s+n(p.amount),0))-total)<0.02;
    choices[job.priceOption]=sel;
  }
  if(br.type==='garage'){
    const style=['solid','flake','metallic','sealer'].includes(job.garageStyle)?job.garageStyle:'';
    const sf=packageBillableSqft(job,settings);
    if(style&&sf>0){
      const floor=floorSystemCost(settings,job,sf,style);
      if(floor&&Number.isFinite(floor.cost)){
        material=floor.material;mat=floor.mat;tax=floor.tax;hours=floor.hours;labor=floor.labor;
        personHours=floor.personHours;equipment=floor.equipment;equip=floor.equip;
        direct=floor.direct;overhead=floor.overhead;overheadBase=floor.overheadBase;
        overheadItems=floor.overheadItems;contingency=floor.contingency;cost=floor.cost;
        travelCost=floor.travelCost;costSqft=sf;
      }
    }
  }
  const materialCost=mat+tax;
  const grossProfit=subtotal-labor-materialCost,grossMargin=subtotal?grossProfit/subtotal*100:0;
  const operatingProfit=grossProfit-overheadBase,operatingMargin=subtotal?operatingProfit/subtotal*100:0;
  const profit=subtotal-cost,margin=subtotal?profit/subtotal*100:0;
  if(costSqft&&subtotal>0&&(labor+materialCost)>0&&grossMargin<40)warnings.push('Gross margin is '+grossMargin.toFixed(1)+'%, under the 40% gross target. Review the job cost before selling this tier.');
  if(costSqft&&subtotal>0&&(labor+materialCost)>0&&operatingMargin<15)warnings.push('Net margin is '+operatingMargin.toFixed(1)+'%, under the 15% net target after overhead. Review the job cost.');
  for(const msg of unpriced)warnings.push(msg);
  const sqft=br.measureSqft||0;
  const result={
    sqft,finished:sqft,levelArea:0,levelEquiv:0,material,mat,tax,hours,labor,equipment,equip,direct,overhead,overheadBase,overheadItems,contingency,cost,
    lines:displayLines,base:regularBase,regularBase,discountable,discountSqft:0,choices,selected:sel,addOn,travel:tr,travelCost,travelInQuote,crew:tr.crew,
    discount:sel.discount,minimum,minimumLabel:bind.label,subtotal,salesTax,total,profit,margin,grossProfit,grossMargin,operatingProfit,operatingMargin,perSqft:sqft&&br.quoteReady?total/sqft:0,travelMiles:tr.vehicleMiles,
    personHours,balance:Math.max(0,total-n(job.paid)),warnings,unpricedLines:unpriced,
    quoteReady:br.quoteReady,quoteStatus:br.quoteReady?'ready':'pending_prices',pendingReasons:br.pendingUnique,
    catalog:{
      type:br.type,startingTotal:br.startingTotal,adjTotal:br.adjTotal,scopeTotal:br.scopeTotal,
      startingLabel:br.startingLabel,startingLines:br.startingLines,adjustments:[...br.adjustments,...optional,...pctLines],
      itemCount:br.itemCount,measureSqft:br.measureSqft,garagePackage:job.garagePackage||null
    },
    finalizedBlocked:!br.quoteReady
  };
  const done=finishQuote(job,result,collected);
  if(S&&S.garageStartWarnings&&br.type==='garage'){
    for(const w of S.garageStartWarnings(settings))done.warnings.push(w.message);
  }
  return done;
}
function discountRoom(job,settings,pre,minimum){
  const approved=!!(job&&job.discountApproval&&job.discountApproval.ok===true);
  const lock=!!(settings&&settings.rates&&settings.rates.minimumFloorsDiscount===true);
  if(approved&&!lock)return n(pre)+n(minimum);
  return n(pre);
}

function calculate(job,settings){
 const type=projectTypeOf(job);
 /* Garage 1/2/3-car packages use catalog path; measured/>3-car and floor use floor engine */
 if(type==='flatwork'||type==='seating'||(type==='garage'&&!garageUsesMeasured(job))){
   return calculateCatalog(job,settings);
 }
 /* Measured garage: treat as floor workflow (existing per-sq-ft rates — approved floor economics) */
 const S=sanityApi();
 const guarded=S?S.guardSettings(settings):{settings:settings,blocks:[],warnings:[]};
 settings=guarded.settings;
 const collected={blocks:[...guarded.blocks],warnings:[...guarded.warnings]};
 const p=Object.fromEntries(Object.entries(settings.products).map(([k,v])=>[k,{...v,coverage:n(v.coverage)>0?n(v.coverage):(defaults.products[k]?.coverage||1)}])),c=settings.costs,r=settings.rates,w=1+n(c.waste)/100,tr=travelInfo(job,settings);
 const orderDemand={},bomDemand={},customer=[],extras=[];let sqft=0,finished=0,levelArea=0,levelEquiv=0,coatPassArea=0,gripArea=0,overrideMat=0,basePassArea=0,topArea=0,flakeArea=0,metallicArea=0;
 const mps=c.materialPerSqft||{};
 const primerPass=c.primerPass===true;
 function styleOverride(style){if(!mps||mps[style]==null||mps[style]==='')return null;const v=Number(mps[style]);return Number.isFinite(v)?v:null}
 const addOrder=(key,q)=>{orderDemand[key]=(orderDemand[key]||0)+n(q)};
 const addBom=(key,q)=>{bomDemand[key]=(bomDemand[key]||0)+n(q)};
 for(const a of job.areas){
  const rateProblem=S&&S.customRateProblem(a);
  if(rateProblem)collected.blocks.push(rateProblem);
  const sf=n(a.sqft);if(!sf)continue;sqft+=sf;const style=['solid','flake','metallic','sealer','level'].includes(a.style)?a.style:'solid';const lev=style==='level'||a.level;
  const depthCap=S?S.capDepth(a.depth,a.name||'Floor area'):{depth:n(a.depth),issue:null};
  if(depthCap.issue)collected.blocks.push(depthCap.issue);
  const depth=depthCap.depth;
  if(lev){levelArea+=sf;levelEquiv+=sf*depth/0.25;addOrder('level',sf*depth/0.25/p.level.coverage*w);addBom('level',sf*depth/0.25/p.level.coverage*w);addOrder('levelPrimer',sf/p.levelPrimer.coverage*w);addBom('levelPrimer',sf/p.levelPrimer.coverage*w)}
  const areaMoisture=!!(a.moisture||(a.prep&&a.prep.moisture));
  if(style!=='level'){
   finished+=sf;
   const ov=styleOverride(style);
   if(ov!=null)overrideMat+=ov*sf*w;
   const track=(key,q)=>{addOrder(key,q);if(ov==null)addBom(key,q)};
   track('top',sf/p.top.coverage*w);coatPassArea+=sf;topArea+=sf;
   if(style==='sealer'){track('sealer',sf/p.sealer.coverage*w);coatPassArea+=sf;basePassArea+=sf}
   else {if(!areaMoisture){track('primer',sf/p.primer.coverage*w);if(primerPass)basePassArea+=sf}coatPassArea+=sf;const color=String(a.color).toLowerCase();const base=color.includes('white')?'white':'base';const coats=style==='solid'?Math.max(1,n(a.coats)):1;track(base,sf/p[base].coverage*coats*w);coatPassArea+=sf*coats;basePassArea+=sf*coats;
    /* Current flake yield: full 7 sq ft/lb, medium 125, light 250. Flagged for verification; not a confirmed bug and not a market average. */
    if(style==='flake'){track('flake',sf/(a.flake==='full'?7:a.flake==='medium'?125:250)*w);flakeArea+=sf}
    if(style==='metallic'){track('metal',sf/p.metal.coverage*w);track('pigment',sf/p.pigment.coverage*w);coatPassArea+=sf;metallicArea+=sf}
   }
   if(a.grip){gripArea+=sf;addOrder('grip',sf/p.grip.coverage);addBom('grip',sf/p.grip.coverage)}
   if(areaMoisture){addOrder('moisture',sf/p.moisture.coverage*w);addBom('moisture',sf/p.moisture.coverage*w);extras.push({label:'Moisture-control primer / barrier — '+(a.name||'area'),description:'Per-area allowance · pending testing and system approval',qty:sf,unit:'sq ft',rate:n(r.moisture),total:sf*n(r.moisture),areaId:a.id,kind:'moisture'})}
  }
  const custom=!rateProblem&&a.rate!==null&&a.rate!==''&&a.rate!==undefined;
  const baseRate=custom?n(a.rate):n(r[style]);
  let extraPerSqft=0;
  if(!custom&&style==='solid')extraPerSqft=Math.max(0,n(a.coats)-1)*n(r.extraCoat??1.5);
  if(!custom&&style==='flake')extraPerSqft=a.flake==='full'?n(r.fullFlakeExtra??1):a.flake==='medium'?n(r.mediumFlakeExtra??0.5):0;
  const unit=baseRate;
  const effective=style==='level'?unit*depth/0.25:unit;
  customer.push({kind:style==='level'?'scope':'finish',style,customRate:!!custom,extraPerSqft:0,label:a.name||'Floor area',description:describe(a),qty:sf,unit:'sq ft',rate:effective,total:sf*effective});
  if(!custom&&extraPerSqft>0&&style!=='level'){
    const upLabel=style==='solid'?'Additional solid base coat(s)':(a.flake==='full'?'Full-broadcast flake upgrade':'Medium-broadcast flake upgrade');
    extras.push({kind:'upgrade',label:upLabel,qty:sf,unit:'sq ft',rate:extraPerSqft,total:sf*extraPerSqft,areaId:a.id});
  }
  if(a.level&&style!=='level')extras.push({label:'Self-leveling preparation - '+(a.name||'area'),description:depth+' inch average depth; additional to finish',qty:sf,unit:'sq ft',rate:n(r.level)*depth/0.25,total:sf*n(r.level)*depth/0.25});
 }
 /* v5: job.moisture no longer auto-charges all finished sqft — per-area only. Legacy job.moisture ignored for charging. */
 if(n(job.patchKits)){addOrder('patch',n(job.patchKits));addBom('patch',n(job.patchKits));extras.push({label:'Minor patching allowance',description:'Patch kits and application; nonstructural repairs',qty:n(job.patchKits),unit:'kit',rate:n(r.patch),total:n(job.patchKits)*n(r.patch)})}
 const removal=!usesScheduledRemoval(job)&&job.condition!=='sound';if(removal&&sqft)extras.push({label:'Additional surface removal',description:job.condition==='adhesive'?'Existing adhesive removal':'Existing paint / coating removal',qty:sqft,unit:'sq ft',rate:n(r.removal),total:sqft*n(r.removal)});
 const optionalExtras=collectOptionalExtras(job,settings);
 for(const row of optionalExtras)extras.push(row);
 const unpriced=[...(optionalExtras.unpriced||[])];
 let polySf=0;
 for(const area of job.areas){
  if(area.style==='level')continue;
  if((area.topcoat||'')==='premium')polySf+=n(area.sqft);
 }
 if(polySf>0){
  const polyRaw=settings.catalog&&settings.catalog.garage&&settings.catalog.garage.topcoatAdj&&settings.catalog.garage.topcoatAdj.premium;
  addPolyLine(extras,unpriced,polySf,polyRaw);
 }
 function kitLines(demand){const rows=[];for(const [key,q]of Object.entries(demand)){const x=p[key];if(!x)continue;const packs=ceil(q/Math.max(.001,n(x.size)));if(packs)rows.push({key,label:x.label,qty:packs,unit:(n(x.size)===1?x.unit+' units':n(x.size)+'-'+x.unit+' kits'),unitPrice:n(x.price),total:packs*n(x.price),volume:packs*n(x.size),volumeUnit:x.unit,demand:q})}return rows}
 const material=kitLines(orderDemand);
 const mat=overrideMat+kitLines(bomDemand).reduce((s,x)=>s+x.total,0);const tax=mat*n(c.purchaseTax)/100;
 const useNew=c.grindProduction!=null&&c.grindProduction!==''&&Number.isFinite(Number(c.grindProduction));
 /* ASSUMED step mapping 75/200/250/200/100 — confirm with Double */
 const hourSrc=useNew?[
   {label:'Grinding / vacuuming',qty:sqft/Math.max(1,n(c.grindProduction))},
   {label:'Base coat application',qty:basePassArea/Math.max(1,n(c.baseProduction)||200)},
   {label:'Flake broadcast',qty:flakeArea/Math.max(1,n(c.flakeProduction)||250)},
   {label:'Topcoat application',qty:topArea/Math.max(1,n(c.topProduction)||200)},
   {label:'Metallic application',qty:metallicArea/Math.max(1,n(c.metallicProduction)||100)},
   {label:'Leveling application',qty:levelArea/Math.max(1,n(c.levelProduction))},
   {label:'Extra coating / adhesive removal',qty:removal?sqft/Math.max(1,n(c.removalProduction)):0},
   {label:'Patch application',qty:n(job.patchKits)*n(c.patchHours)},
   {label:'Setup and cleanup',qty:sqft?n(c.setupHours):0}
 ]:[
   {label:'Grinding / vacuuming',qty:sqft/Math.max(1,n(c.prepProduction))},
   {label:'Coating application',qty:coatPassArea/Math.max(1,n(c.coatProduction))},
   {label:'Leveling application',qty:levelArea/Math.max(1,n(c.levelProduction))},
   {label:'Extra coating / adhesive removal',qty:removal?sqft/Math.max(1,n(c.removalProduction)):0},
   {label:'Patch application',qty:n(job.patchKits)*n(c.patchHours)},
   {label:'Setup and cleanup',qty:sqft?n(c.setupHours):0}
 ];
 const hours=hourSrc.filter(x=>x.qty>0).map(x=>({...x,unit:'person-hr',unitPrice:n(c.labor),total:x.qty*n(c.labor)}));
 const labor=hours.reduce((s,x)=>s+x.total,0);const travelMiles=tr.vehicleMiles;
 const personHours=hours.reduce((s,x)=>s+x.qty,0);
 const travelCost=sqft?tr.mileage+tr.crewTravel:0;
 const equipment=equipmentLines(job,c,!!sqft);
 const equip=equipment.reduce((s,x)=>s+x.total,0);
 const direct=mat+tax+labor;
 const ohRate=overheadPerHourRate(c);
 const overheadBase=sqft?flatOverhead(c)+ohRate*personHours:0;
 const overhead=overheadBase+travelCost+equip;
 const ohLabel=ohRate?('Business overhead ('+personHours.toFixed(2)+' person-hr × $'+ohRate.toFixed(2)+')'):'Business overhead / job';
 const overheadItems=sqft?[
   {label:ohLabel,qty:1,unit:'allowance',unitPrice:overheadBase,total:overheadBase},
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
 const choice=key=>{
  const opt=key==='regular'?null:po[key];
  let project,rateShown;
  if(opt&&opt.rates){const tiered=tierFinishProject(finishLines,opt.rates);project=tiered.project;const styles=Object.keys(tiered.used);rateShown=styles.length===1?tiered.used[styles[0]]:(discountSqft?project/discountSqft:0);}
  else if(opt&&opt.rate!=null&&opt.rate!==''){project=n(opt.rate)*discountSqft;rateShown=n(opt.rate);}
  else{project=discountable;rateShown=discountSqft?discountable/discountSqft:0;}
  const adjustment=project-discountable;
  const dollarPre=regularBase+adjustment;
  const bind=bindingMinimum(settings,job,dollarPre,!!sqft,key);
  const minimum=bind.minimum;
  const pctLines=percentExtraLines(job,settings,dollarPre+minimum);
  const pctSum=r2(pctLines.reduce((s,x)=>s+n(x.total),0));
  const pre=r2(dollarPre+pctSum);
  const discount=appliedExtraDiscount(job,settings,discountRoom(job,settings,pre,minimum),key);
  const subtotal=Math.max(0,r2(pre+minimum-discount)),salesTax=subtotal*n(job.tax)/100,total=subtotal+salesTax;
  const sched=opt&&Array.isArray(opt.schedule)?opt.schedule:[];
  let paid=0;
  const payments=sched.map((p,i)=>{const amount=i===sched.length-1?r2(total-paid):r2(total*n(p.pct)/100);paid=r2(paid+amount);return{pct:n(p.pct),label:p.label,amount}});
  const extras=lines.filter(l=>l.kind!=='finish').map(l=>({label:l.label,kind:l.kind||'extra',qty:n(l.qty),unit:l.unit||'',rate:n(l.rate),amount:r2(l.total)}));
  for(const p of pctLines)extras.push({label:p.label,kind:'extra',qty:n(p.qty),unit:p.unit||'',rate:n(p.rate),amount:r2(p.total)});
  if(travelInQuote)extras.push({label:'Travel included in the total',kind:'travel',qty:1,unit:'included',rate:r2(travelInQuote),amount:r2(travelInQuote)});
  const extrasAmount=r2(extras.reduce((s,x)=>s+n(x.amount),0));
  const finishAmount=r2(project);
  const summed=r2(finishAmount+extrasAmount+minimum-discount+salesTax);
  return{key,label:opt?opt.label:'Regular price',short:opt?(opt.short||opt.label):'Regular retail',payMethod:opt&&opt.payMethod||'',rate:rateShown,project,adjustment,pre,minimum,minimumLabel:bind.label,discount,subtotal,salesTax,total,savings:0,savingsPct:0,payments,pctTotal:sched.reduce((s,p)=>s+n(p.pct),0),percentLines:pctLines,
    breakdown:{finishRate:rateShown,finishQty:discountSqft,finishAmount,extras,extrasAmount,minimum,discount,salesTax,total,reconciles:Math.abs(summed-total)<0.02},
    paymentsReconcile:!payments.length||Math.abs(r2(payments.reduce((s,p)=>s+n(p.amount),0))-total)<0.02};
 };
 const choices={regular:choice('regular')};for(const k of Object.keys(po))choices[k]=choice(k);
 const regularTotal=choices.regular?choices.regular.total:0;
 for(const c of Object.values(choices)){c.savings=r2(regularTotal-c.total);c.savingsPct=regularTotal?c.savings/regularTotal*100:0;c.savingsBasis='full quote total';}
 const sel=choices[job.priceOption]||choices.regular;
 const {discount,minimum,subtotal,salesTax,total}=sel,profit=subtotal-cost,margin=subtotal?profit/subtotal*100:0;
 const materialCost=mat+tax,grossProfit=subtotal-labor-materialCost,grossMargin=subtotal?grossProfit/subtotal*100:0;
 const operatingProfit=grossProfit-overheadBase,operatingMargin=subtotal?operatingProfit/subtotal*100:0;
 const warnings=[];if(!sqft)warnings.push('Add square footage to calculate a job.');if(sqft&&!job.miles&&!job.minutes)warnings.push('Travel overhead is $0 until one-way miles and drive time are entered (Internal).');if(sqft&&n(job.miles)&&!tr.rate)warnings.push('Mileage rate is $0.00/mile. Set Vehicle cost / mile in Costs & pricing (default $0.85).');if(levelArea)warnings.push('Leveling depth and product yield must be verified on site.');if(job.areas.some(a=>n(a.sqft)&&((a.style==='level'||a.level)&&n(a.depth)<=0)))warnings.push('Enter a positive depth for every leveled area.');if(job.routeAddress&&(job.address!==job.routeAddress||job.origin!==job.routeOrigin))warnings.push('Address changed: recalculate the route or update travel manually.');if(sqft&&profit<0)warnings.push('Customer price is below the estimated job cost.');if(job.method==='agreed'&&sqft&&!n(job.agreedTotal))warnings.push('Enter the agreed customer total.');if(!job.customer&&!job.company)warnings.push('Add a customer name before issuing the document.');
 if(sqft&&subtotal>0&&(labor+materialCost)>0&&grossMargin<40)warnings.push('Gross margin is '+grossMargin.toFixed(1)+'%, under the 40% gross target. Review the job cost before selling this tier.');
 else if(sqft&&minimum>0&&subtotal>minimum){const prePrice=subtotal-minimum;const preGross=prePrice?(prePrice-labor-materialCost)/prePrice*100:0;if(preGross<40)warnings.push('Gross margin on the rate price before the minimum job charge is under the 40% gross target. Charged gross margin is '+grossMargin.toFixed(1)+'% after the minimum. Review the job cost.');}
 if(sqft&&subtotal>0&&(labor+materialCost)>0&&operatingMargin<15)warnings.push('Net margin is '+operatingMargin.toFixed(1)+'%, under the 15% net target after overhead. Review the job cost.');
 if(n(job.tax)>0&&(type==='floor'||type==='garage'))warnings.push('Installed floors are construction contracts in IL; the contractor pays use tax on the cost of materials. Confirm before charging customer sales tax.');
 if(job.method==='cost'&&sqft){const tm=markupToMargin(n(job.markup));const minM=n(c.minMargin)||25;if(tm+1e-6<minM)warnings.push('Target margin '+tm.toFixed(1)+'% is below the '+minM+'% minimum margin.');}
 if(!allowancesIncluded(c))warnings.push('Per-job disposal and equipment allowances are on while monthly overhead already includes equipment. This double counts job cost.');
 if(n(job.discount)>0&&!(job.discountApproval&&job.discountApproval.ok))warnings.push('An extra discount is not applied until the owner approves this estimate revision and selected price tier.');
 if(sel.key!=='regular')warnings.push('Payment tiers do not stack. Prep, removal, moisture, and the property add-in stay at their own prices.');
 if(sel.key!=='regular'&&discountSqft&&sel.savings<=0)warnings.push(sel.short+' ($'+sel.rate.toFixed(2)+'/sq ft) is not lower than the regular price for this scope.');
 if(sel.key!=='regular'&&Math.abs(sel.pctTotal-100)>0.001)warnings.push(sel.short+' payment percentages add to '+sel.pctTotal+'%, not 100%. The last payment absorbs the difference.');
 if(type==='garage'&&garageUsesMeasured(job)){
   warnings.push('Garage >3-car / measured size: using measured sq ft with floor rate book (not a flat 1/2/3-car package).');
 }
 for(const msg of unpriced)warnings.push(msg);
 const result={sqft,finished,levelArea,levelEquiv,material,mat,tax,hours,labor,equipment,equip,direct,overhead,overheadBase,overheadItems,contingency,cost,lines:lines.concat(sel.percentLines||[]),base:regularBase,regularBase,discountable,discountSqft,choices,selected:sel,addOn,travel:tr,travelCost,travelInQuote,crew:tr.crew,discount,minimum,minimumLabel:sel.minimumLabel||'',subtotal,salesTax,total,profit,margin,grossProfit,grossMargin,operatingProfit,operatingMargin,perSqft:sqft?total/sqft:0,travelMiles,personHours,balance:Math.max(0,total-n(job.paid)),warnings,unpricedLines:unpriced,
   quoteReady:!!sqft,quoteStatus:sqft?'ready':'incomplete',pendingReasons:[],catalog:type==='garage'?{type:'garage',garagePackage:'measured',mode:'measured_sqft'}:null,finalizedBlocked:!sqft};
 return finishQuote(job,result,collected);
}
function describe(a){const names={solid:'Solid-color epoxy',flake:'Decorative flake epoxy',metallic:'Metallic epoxy',sealer:'Clear sealer + protective topcoat',level:'Self-leveling preparation only'};let s=names[a.style]||names.solid;if(a.style!=='level'){const col=(a.colorKey==='custom'&&a.customColor)?a.customColor:(a.color||'color to be confirmed');s+='; '+col;}if(a.style==='solid')s+='; '+Math.max(1,n(a.coats))+' base coat(s)';if(a.style==='flake'){s+='; '+(a.flake==='full'?'full broadcast':a.flake==='medium'?'medium broadcast':'light spot flakes');const fb=(a.flakeBlend==='custom'&&a.customFlakeBlend)?a.customFlakeBlend:(a.flakeBlendLabel||a.flakeBlend||'');if(fb)s+=', flake blend: '+fb;}if(a.topcoat==='premium'&&a.style!=='level')s+='; Polyaspartic topcoat';if(a.grip&&a.style!=='level')s+='; slip-resistant texture';if(a.style==='level'||a.level)s+='; leveling '+n(a.depth)+' inch average';if(a.moisture||(a.prep&&a.prep.moisture))s+='; moisture-control primer/barrier on this area';return s;}
function areaHasMoisture(a){return !!(a&&(a.moisture||(a.prep&&a.prep.moisture)))}
function moistureSqft(job){let s=0;for(const a of job.areas||[]){const sf=n(a.sqft);if(!sf)continue;if(a.style==='level')continue;if(areaHasMoisture(a))s+=sf}return s}
const api={defaults,newArea,newJob,newFlatItem,newSeatItem,calculate,describe,n,sn,travelInfo,addOnInfo,crewSize,areaHasMoisture,moistureSqft,isConfigured,configuredAmount,projectTypeOf,garageUsesMeasured,garageStartingKey,flatworkBandForSqft,buildCatalogBreakdown,catalogDefaults,garagePackageDefaults,UNCONFIGURED,marginToMarkup,markupToMargin,overheadMonthlyTotal,overheadPerHourRate,overheadSpread,FIGURE_STATUS,OVERHEAD_LINES,minimumJobAmount,allowancesIncluded,blankExtras,packageTablePrice,smallSolidFloorAmount,solidSystemSqft,normalizeStaffPackages};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.EpoxyEngine=api;
})(typeof window!=='undefined'?window:globalThis);
