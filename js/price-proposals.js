/* Draft price-book review. Nothing here is applied to quotes.
 * No sourced averages are embedded. Confirmed selling rates are displayed only
 * so a reviewer can see they are already on this build. This module does not
 * write them, and it does not carry owner costs, margins, or vendor prices. */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.EsPriceProposals=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const ACTIVATION_DEFAULT={
  applyOwnerConfirmedFloorSelling:false,
  applySourcedEstimates:false
};
/* Approved regular selling rates on main 74307da. Not a proposal and not re-seeded.
 * Solid is $7 on this build. An older $8 figure is not written over it. */
const LIVE_CONFIRMED_FLOOR=[
  {path:'rates.solid',label:'Solid epoxy / sq ft',unit:'USD per sq ft',confirmedLive:7},
  {path:'rates.flake',label:'Flake epoxy / sq ft',unit:'USD per sq ft',confirmedLive:10},
  {path:'rates.metallic',label:'Metallic epoxy / sq ft',unit:'USD per sq ft',confirmedLive:15}
];
const LIVE_CONFIRMED_PROVENANCE='These regular selling rates are already in the engine on this build. They are not owner costs. This draft does not write them again and will not replace any other configured value.';
/* Catalog leaves that are still null after the garage-start and price-cap work.
 * Per-package solid credits are configured and are not in this list.
 * Amounts are not copied here. */
const PENDING_PRICE_PATHS=[
  'catalog.garage.prepAdj.leveling','catalog.garage.prepAdj.moisture','catalog.garage.topcoatAdj.premium',
  'catalog.garage.materialAdj.custom','catalog.garage.materialAdj.sealer','catalog.garage.materialAdj.metallic',
  'catalog.garage.conditionAdj.unknown','catalog.garage.conditionAdj.critical',
  'catalog.seating.materialAdj.custom','catalog.seating.materialAdj.sealer','catalog.seating.conditionAdj.unknown','catalog.seating.conditionAdj.critical',
  'catalog.flatwork.materialAdj.custom','catalog.flatwork.materialAdj.sealer','catalog.flatwork.conditionAdj.unknown','catalog.flatwork.conditionAdj.critical',
  'catalog.flatwork.customStarting'
];
const STRUCTURAL_NULL_PATHS=['catalog.flatwork.sizeBands.3.maxSqft'];
const SOURCED_ESTIMATES=[];
const AWAITING_PROVENANCE='A null selling field stays null. It is not zero, and this draft does not fill it from a sourced average. Corrected sourced estimates are not in this pull request.';

const SELLING_RATES=[
  ['rates.solid','Solid epoxy','USD per sq ft','floor'],
  ['rates.flake','Flake epoxy','USD per sq ft','floor'],
  ['rates.metallic','Metallic epoxy','USD per sq ft','floor'],
  ['rates.sealer','Clear sealer','USD per sq ft','floor'],
  ['rates.level','Leveling at 1/4 inch','USD per sq ft','floor'],
  ['rates.removal','Coating removal','USD per sq ft','floor'],
  ['rates.patch','Patch kit installed','USD per kit','floor'],
  ['rates.moisture','Moisture-control primer','USD per sq ft','floor'],
  ['rates.extraCoat','Additional solid base coat','USD per sq ft','floor'],
  ['rates.mediumFlakeExtra','Medium flake premium','USD per sq ft','floor'],
  ['rates.fullFlakeExtra','Full flake premium','USD per sq ft','floor'],
  ['rates.minimumJob','Minimum job charge','USD per job','floor'],
  ['pricingOptions.opt1.rates.solid','Option 1 solid','USD per sq ft','floor'],
  ['pricingOptions.opt1.rates.flake','Option 1 flake','USD per sq ft','floor'],
  ['pricingOptions.opt1.rates.metallic','Option 1 metallic','USD per sq ft','floor'],
  ['pricingOptions.opt2.rates.solid','Option 2 solid','USD per sq ft','floor'],
  ['pricingOptions.opt2.rates.flake','Option 2 flake','USD per sq ft','floor'],
  ['pricingOptions.opt2.rates.metallic','Option 2 metallic','USD per sq ft','floor'],
  ['addOn.low','Property add-in, standard','USD per sq ft','floor'],
  ['addOn.high','Property add-in, higher','USD per sq ft','floor']
];
const GARAGE_MONEY=[
  ['catalog.garage.oneCarStarting','1-car package reference','USD per package'],
  ['catalog.garage.twoCarStarting','2-car package reference','USD per package'],
  ['catalog.garage.threeCarStarting','3-car package reference','USD per package']
];
const ADJ_KEYS={
  materialAdj:['solid','flake','metallic','sealer','custom'],
  topcoatAdj:['protective','none','premium'],
  conditionAdjGarage:['unknown','good','fair','poor','critical','sound','paint','adhesive'],
  conditionAdjOther:['unknown','good','fair','poor','critical'],
  prepAdj:['cracks','spalling','coatingRemoval','patching','leveling','moisture']
};
const COST_UNITS={
  waste:'percent',labor:'USD per person-hour',prepProduction:'sq ft per person-hour',coatProduction:'sq ft per person-hour',
  levelProduction:'sq ft per person-hour',removalProduction:'sq ft per person-hour',patchHours:'hours',setupHours:'hours',
  rentalDay:'USD per day',tooling:'USD allowance',supplies:'USD allowance',dust:'USD allowance',disposal:'USD allowance',
  mile:'USD per mile',overhead:'USD per job',contingency:'percent',purchaseTax:'percent',markup:'percent',
  targetMargin:'percent',minMargin:'percent',minimum:'USD per job',
  grindProduction:'sq ft per person-hour',baseProduction:'sq ft per person-hour',flakeProduction:'sq ft per person-hour',
  topProduction:'sq ft per person-hour',metallicProduction:'sq ft per person-hour',billableHoursPerMonth:'hours per month'
};

function getPath(obj,path){
  return String(path).split('.').reduce((o,k)=>o==null?undefined:o[k],obj);
}
function classify(v){
  if(v===null||v===undefined||v==='')return 'unconfigured';
  const n=Number(v);
  if(!Number.isFinite(n))return 'non_numeric';
  if(n===0)return 'configured_zero';
  return 'configured_amount';
}
function clone(x){return JSON.parse(JSON.stringify(x))}
function isPlainObject(v){return !!v&&typeof v==='object'&&!Array.isArray(v)}

function pushMoney(rows,settings,path,label,unit,area,audience){
  const current=getPath(settings,path);
  if(isPlainObject(current)){
    for(const key of Object.keys(current)){
      pushMoney(rows,settings,path+'.'+key,label+' '+key,unit,area,audience);
    }
    return;
  }
  if(Array.isArray(current))return;
  const state=classify(current);
  const confirmed=LIVE_CONFIRMED_FLOOR.find(p=>p.path===path);
  const pending=PENDING_PRICE_PATHS.indexOf(path)>=0;
  const structural=STRUCTURAL_NULL_PATHS.indexOf(path)>=0;
  let reviewStatus,proposed,estimateFlag,provenance,confirmedLive;
  if(structural){
    reviewStatus='structural_null_not_a_price';
    proposed=null;estimateFlag=false;confirmedLive=null;
    provenance='Open-ended size band. Not a pending price.';
  }else if(confirmed){
    reviewStatus='preserved_live_selling';
    proposed=null;estimateFlag=false;confirmedLive=confirmed.confirmedLive;
    provenance=LIVE_CONFIRMED_PROVENANCE;
  }else if(pending){
    reviewStatus='awaiting_corrected_source';
    proposed=null;estimateFlag=false;confirmedLive=null;
    provenance=AWAITING_PROVENANCE;
  }else if(state==='unconfigured'){
    reviewStatus='awaiting_sourced_estimate';
    proposed=null;
    estimateFlag=false;
    provenance=AWAITING_PROVENANCE;
  }else{
    reviewStatus=audience==='selling'?'preserved_do_not_overwrite':'owner_book_not_copied';
    proposed=null;
    estimateFlag=false;
    confirmedLive=null;
    provenance=audience==='selling'
      ?'Configured on this build, including an explicit zero. This draft does not overwrite it. Per-sq-ft caps and the per-package solid credits stay as they are.'
      :'Owner product prices and cost rates are not copied into this review. Employees receive zeros from the server, and those zeros are not an owner decision.';
  }
  rows.push({
    path,label,unit,area,audience,
    presence:current===undefined?'missing':'present',
    valueState:state,
    proposed,estimateFlag,reviewStatus,provenance,confirmedLive:confirmedLive==null?null:confirmedLive,
    activated:false
  });
}

function inventory(settings){
  const s=settings||{};
  const rows=[];
  for(const [path,label,unit,area] of SELLING_RATES)pushMoney(rows,s,path,label,unit,area,'selling');
  for(const [path,label,unit] of GARAGE_MONEY)pushMoney(rows,s,path,label,unit,'garage','selling');
  for(const key of ADJ_KEYS.materialAdj)pushMoney(rows,s,'catalog.garage.materialAdj.'+key,'Garage material '+key,'USD per package','garage','selling');
  for(const key of ADJ_KEYS.topcoatAdj){
    const unit=key==='premium'?'USD per sq ft':'USD per package';
    pushMoney(rows,s,'catalog.garage.topcoatAdj.'+key,'Garage topcoat '+key,unit,'garage','selling');
  }
  for(const key of ADJ_KEYS.conditionAdjGarage)pushMoney(rows,s,'catalog.garage.conditionAdj.'+key,'Garage condition '+key,'USD per package','garage','selling');
  for(const key of ADJ_KEYS.prepAdj)pushMoney(rows,s,'catalog.garage.prepAdj.'+key,'Garage prep '+key,'USD per package','garage','selling');
  const bands=((((s.catalog||{}).flatwork)||{}).sizeBands)||[];
  bands.forEach((b,i)=>pushMoney(rows,s,'catalog.flatwork.sizeBands.'+i+'.starting','Flatwork '+(b.label||b.id||('band '+i)),'USD per item','flatwork','selling'));
  pushMoney(rows,s,'catalog.flatwork.customStarting','Flatwork custom start','USD per item','flatwork','selling');
  for(const key of ADJ_KEYS.materialAdj)pushMoney(rows,s,'catalog.flatwork.materialAdj.'+key,'Flatwork material '+key,'USD per item','flatwork','selling');
  for(const key of ADJ_KEYS.topcoatAdj)pushMoney(rows,s,'catalog.flatwork.topcoatAdj.'+key,'Flatwork topcoat '+key,'USD per item','flatwork','selling');
  for(const key of ADJ_KEYS.conditionAdjOther)pushMoney(rows,s,'catalog.flatwork.conditionAdj.'+key,'Flatwork condition '+key,'USD per item','flatwork','selling');
  for(const key of ['chair','stool','other'])pushMoney(rows,s,'catalog.seating.byType.'+key,'Seating '+key,'USD per item','seating','selling');
  for(const key of ADJ_KEYS.materialAdj)pushMoney(rows,s,'catalog.seating.materialAdj.'+key,'Seating material '+key,'USD per item','seating','selling');
  for(const key of ADJ_KEYS.topcoatAdj)pushMoney(rows,s,'catalog.seating.topcoatAdj.'+key,'Seating topcoat '+key,'USD per item','seating','selling');
  for(const key of ADJ_KEYS.conditionAdjOther)pushMoney(rows,s,'catalog.seating.conditionAdj.'+key,'Seating condition '+key,'USD per item','seating','selling');
  for(const key of Object.keys(s.products||{}))pushMoney(rows,s,'products.'+key+'.price',((s.products[key]&&s.products[key].label)||key),'USD package price (owner)','products','product');
  for(const key of Object.keys(COST_UNITS))pushMoney(rows,s,'costs.'+key,key,COST_UNITS[key],'costs','cost');
  return rows;
}

function publicInventory(settings){
  return inventory(settings).map(row=>{
    const copy={path:row.path,label:row.label,unit:row.unit,area:row.area,audience:row.audience,presence:row.presence,valueState:row.valueState,estimateFlag:row.estimateFlag,reviewStatus:row.reviewStatus,activated:false,provenance:row.provenance};
    copy.proposed=null;
    if(row.reviewStatus==='preserved_live_selling')copy.confirmedLive=row.confirmedLive;
    return copy;
  });
}

function setPath(obj,path,value){
  const parts=path.split('.');
  let cur=obj;
  for(let i=0;i<parts.length-1;i++){
    if(!cur[parts[i]]||typeof cur[parts[i]]!=='object')cur[parts[i]]={};
    cur=cur[parts[i]];
  }
  cur[parts[parts.length-1]]=value;
}

function isConfiguredNumber(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
/** Never replaces a configured number. Sourced rows stay empty until a corrected dataset is reviewed. */
function applyActivation(settings,activation){
  const out=clone(settings||{});
  const gate=Object.assign({},ACTIVATION_DEFAULT,activation||{});
  if(gate.applySourcedEstimates===true){
    for(const row of SOURCED_ESTIMATES){
      if(!row||row.estimateFlag!==true||row.reviewStatus!=='approved_for_customer'||row.proposed==null)continue;
      if(isConfiguredNumber(getPath(out,row.path)))continue;
      setPath(out,row.path,row.proposed);
    }
  }
  return out;
}

function activationChangesQuotes(activation){
  const gate=Object.assign({},ACTIVATION_DEFAULT,activation||{});
  if(gate.applySourcedEstimates!==true)return false;
  return SOURCED_ESTIMATES.some(r=>r&&r.estimateFlag&&r.reviewStatus==='approved_for_customer'&&r.proposed!=null);
}

function reviewModel(settings){
  const rows=inventory(settings);
  const by=status=>rows.filter(r=>r.reviewStatus===status);
  return {
    activation:clone(ACTIVATION_DEFAULT),
    sourcedEstimateCount:SOURCED_ESTIMATES.length,
    ownerConfirmed:LIVE_CONFIRMED_FLOOR.map(r=>({path:r.path,label:r.label,unit:r.unit,confirmedLive:r.confirmedLive,proposed:null,reviewStatus:'preserved_live_selling',estimateFlag:false})),
    awaitingSourced:by('awaiting_corrected_source').length,
    unconfiguredSelling:rows.filter(r=>r.audience==='selling'&&r.valueState==='unconfigured').length,
    configuredZero:rows.filter(r=>r.valueState==='configured_zero').length,
    costbookV8:'not_in_this_pull_request',
    wholePackBilling:'not_in_this_pull_request'
  };
}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function inventoryMarkdown(settings){
  const rows=publicInventory(settings);
  const lines=['# Pending field inventory','','Live price-book dollars are not copied here. Product prices, cost rates, and margins are omitted. Unconfigured means null, not zero.','',
    '| Path | Area | Audience | State | Review | Proposed | Unit |',
    '| --- | --- | --- | --- | --- | --- | --- |'];
  for(const r of rows){
    lines.push('| `'+r.path+'` | '+r.area+' | '+r.audience+' | '+r.valueState+' | '+r.reviewStatus+' | — | '+r.unit+' |');
  }
  lines.push('','Approved regular selling rates already on this build (not proposed, not owner costs): solid 7, flake 10, metallic 15 USD per sq ft.','',AWAITING_PROVENANCE,'','Pending price paths: '+PENDING_PRICE_PATHS.length+'. Sourced rows loaded: '+SOURCED_ESTIMATES.length+'. Structural nulls excluded from that count: '+STRUCTURAL_NULL_PATHS.join(', ')+'.','');
  return lines.join('\n');
}

function proposalReviewHTML(settings,owner){
  if(!owner)return '';
  const model=reviewModel(settings);
  const rows=model.ownerConfirmed.map(r=>`<tr><td>${esc(r.label)}<small>${esc(r.path)}</small></td><td>${esc(r.unit)}</td><td class="num">${esc(String(r.confirmedLive))}</td><td>Already on this build. Not a new estimate.</td></tr>`).join('');
  return `<details open class="proposal-review"><summary>Draft review — inactive price proposals</summary><div class="detail-body">
  <div class="warn-banner"><b>Not on customer quotes.</b> This panel does not write the price book. Approved selling rates, per-package solid credits, garage base fees, and per-sq-ft caps stay as they are. A flat sealer adjustment is not seeded. Vendor costs are not loaded. ${model.awaitingSourced} catalog prices remain unresolved. Sourced rows loaded: ${model.sourcedEstimateCount}.</div>
  <p class="method-note">${model.configuredZero} fields on the code book are an explicit zero, which is different from Pending. Configured values are preserved. Owner product costs and cost rates are not listed with amounts. Whole-pack billing and the material costbook wait for their own reviewed pull request.</p>
  <table><thead><tr><th>Floor selling rate</th><th>Unit</th><th class="num">On this build</th><th>Review</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="method-note">${esc(LIVE_CONFIRMED_PROVENANCE)}</p>
  <button type="button" class="button secondary" id="proposalActivate" disabled>Activation stays off until a corrected dataset is reviewed</button>
  </div></details>`;
}

function ownerPricingSchema(){
  const products=['primer','base','white','metal','pigment','sealer','top','flake','level','levelPrimer','patch','grip','moisture'];
  const costs=Object.keys(COST_UNITS);
  return {
    schema:'exotic-splash.owner-pricing.v1',
    live:'Do not treat epoxy-engine defaults as a license to write owner costs. This file lists fields and units only. It does not contain prices, costs, or margins.',
    books:{
      staff_settings:'selling rates, catalog starts and adjustments, approvedAdjustment, business, notes. Employees can read this book.',
      owner_settings:'products and costs only. Employees receive zeros, not this object.'
    },
    overwrite_rule:'If a live value is a finite number, including 0, do not replace it. Fill only null or missing leaves, and only after review.',
    product_record:{path:'owner_settings.products.<key>',fields:['label','size','price','coverage','unit'],price_unit:'USD per package',keys:products},
    cost_record:{path:'owner_settings.costs.<key>',keys:costs.map(k=>({key:k,unit:COST_UNITS[k]}))},
    omitted_from_this_draft:['material costbook v8','whole-pack billing','owner cost amounts','margin amounts'],
    size_review:[
      {key:'primer',note:'Do not copy a unit cost until size, price, and coverage describe the same kit.',apply:false},
      {key:'flake',note:'The engine package is 40 lb. Do not apply an archive unit cost from this draft.',apply:false},
      {key:'grip',note:'Traction pack was not matched to a catalog row.',apply:false},
      {key:'base',note:'Pigment is a separate row. Do not treat one kit cost as the full colored system.',apply:false}
    ],
    garage_adjustment_rule:'Garage base fee is the selected tier flake rate times that package typical size. Solid credits stay per package. The garage polyaspartic topcoat is USD per sq ft. Flatwork topcoat stays a flat amount per item. A single flat sealer or custom delta is not applied to a package. Critical condition and package leveling stay unfinished until inspection. Package reference dollars and per-sq-ft caps are left as already configured.',
    pending_selling_paths:PENDING_PRICE_PATHS.slice(),
    structural_nulls:STRUCTURAL_NULL_PATHS.slice(),
    sourced_rows_loaded:SOURCED_ESTIMATES.length
  };
}

return {ACTIVATION_DEFAULT,LIVE_CONFIRMED_FLOOR,PENDING_PRICE_PATHS,STRUCTURAL_NULL_PATHS,SOURCED_ESTIMATES,inventory,publicInventory,inventoryMarkdown,applyActivation,activationChangesQuotes,reviewModel,proposalReviewHTML,ownerPricingSchema,isConfiguredNumber};
});
