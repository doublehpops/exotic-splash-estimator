/* Draft price-book review. Nothing here is applied to quotes unless activation is explicit.
 * No Chicagoland averages are embedded: that sourced dataset was not in this repo.
 * The only numeric proposals are the three owner-confirmed floor selling rates. */
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
/* Already stored on live price book v4. Not a proposal and not re-seeded. */
const LIVE_CONFIRMED_FLOOR=[
  {path:'rates.solid',label:'Solid epoxy / sq ft',unit:'USD per sq ft',confirmedLive:8},
  {path:'rates.flake',label:'Flake epoxy / sq ft',unit:'USD per sq ft',confirmedLive:10},
  {path:'rates.metallic',label:'Metallic epoxy / sq ft',unit:'USD per sq ft',confirmedLive:15}
];
const LIVE_CONFIRMED_PROVENANCE='Price book v4 already stores these selling rates. They are not owner costs. This draft does not write them again and will not replace any other configured value.';
/* 18 null catalog prices from the private v4 audit. xlarge.maxSqft is excluded (structural). Amounts are not copied here. */
const PENDING_PRICE_PATHS=[
  'catalog.garage.prepAdj.leveling','catalog.garage.prepAdj.moisture','catalog.garage.topcoatAdj.premium',
  'catalog.garage.materialAdj.solid','catalog.garage.materialAdj.custom','catalog.garage.materialAdj.sealer','catalog.garage.materialAdj.metallic',
  'catalog.garage.conditionAdj.unknown','catalog.garage.conditionAdj.critical',
  'catalog.seating.materialAdj.custom','catalog.seating.materialAdj.sealer','catalog.seating.conditionAdj.unknown','catalog.seating.conditionAdj.critical',
  'catalog.flatwork.materialAdj.custom','catalog.flatwork.materialAdj.sealer','catalog.flatwork.conditionAdj.unknown','catalog.flatwork.conditionAdj.critical',
  'catalog.flatwork.customStarting'
];
const STRUCTURAL_NULL_PATHS=['catalog.flatwork.sizeBands.3.maxSqft'];
/* Provisional Nov 5 fills are rejected until a corrected dataset arrives. */
const SOURCED_ESTIMATES=[];
const AWAITING_PROVENANCE='Live price book v4 leaves this selling field null. A provisional Nov 5 fill exists elsewhere and is not loaded. Corrected sourced estimates have not arrived. Null stays null; it is not zero.';

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
  ['pricingOptions.opt1.rate','Family option 1 rate','USD per sq ft','floor'],
  ['pricingOptions.opt2.rate','Family option 2 rate','USD per sq ft','floor'],
  ['addOn.low','Property add-in, standard','USD per sq ft','floor'],
  ['addOn.high','Property add-in, higher','USD per sq ft','floor']
];
const GARAGE_MONEY=[
  ['catalog.garage.oneCarStarting','1-car package start','USD per package'],
  ['catalog.garage.twoCarStarting','2-car package start','USD per package'],
  ['catalog.garage.threeCarStarting','3-car package start','USD per package']
];
const ADJ_KEYS={
  materialAdj:['solid','flake','metallic','sealer','custom'],
  topcoatAdj:['protective','none','premium'],
  conditionAdjGarage:['unknown','good','fair','poor','critical','sound','paint','adhesive'],
  conditionAdjOther:['unknown','good','fair','poor','critical'],
  prepAdj:['cracks','spalling','coatingRemoval','patching','leveling','moisture']
};
const PRODUCT_UNITS={primer:'USD per package',base:'USD per package',white:'USD per package',metal:'USD per package',pigment:'USD per pack',sealer:'USD per package',top:'USD per package',flake:'USD per lb',level:'USD per bag',levelPrimer:'USD per package',patch:'USD per kit',grip:'USD per pack',moisture:'USD per package'};
const COST_UNITS={
  waste:'percent',labor:'USD per person-hour',prepProduction:'sq ft per person-hour',coatProduction:'sq ft per person-hour',
  levelProduction:'sq ft per person-hour',removalProduction:'sq ft per person-hour',patchHours:'hours',setupHours:'hours',
  rentalDay:'USD per day',tooling:'USD allowance',supplies:'USD allowance',dust:'USD allowance',disposal:'USD allowance',
  mile:'USD per mile',overhead:'USD per job',contingency:'percent',purchaseTax:'percent',markup:'percent',minimum:'USD per job'
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

function pushMoney(rows,settings,path,label,unit,area,audience){
  const current=getPath(settings,path);
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
    reviewStatus=audience==='selling'?'preserved_do_not_overwrite':'owner_book_empty_runtime_default';
    proposed=null;
    estimateFlag=false;
    confirmedLive=null;
    provenance=audience==='selling'
      ?'Not in the 18 live nulls. Keep whatever the live staff book already stored. Code fallback is not a license to overwrite it.'
      :'owner_settings is an empty object on price book v4. Owners currently calculate with epoxy-engine defaults. Employees receive zeros. Do not copy those defaults into the database from this draft.';
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
  const g=(((s.catalog||{}).garage)||{});
  for(const key of ADJ_KEYS.materialAdj)pushMoney(rows,s,'catalog.garage.materialAdj.'+key,'Garage material '+key,'USD per package','garage','selling');
  for(const key of ADJ_KEYS.topcoatAdj)pushMoney(rows,s,'catalog.garage.topcoatAdj.'+key,'Garage topcoat '+key,'USD per package','garage','selling');
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
  for(const key of Object.keys((s.products)||{}))pushMoney(rows,s,'products.'+key+'.price',((s.products[key]&&s.products[key].label)||key),'USD package price (owner)','products','product');
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
/** Never replaces a configured number. Sourced rows are empty until a corrected dataset is reviewed. */
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
    preserved:by('preserved_current_or_code_default').length,
    unconfiguredSelling:rows.filter(r=>r.audience==='selling'&&r.valueState==='unconfigured').length,
    configuredZero:rows.filter(r=>r.valueState==='configured_zero').length,
    v8:'not_in_repo'
  };
}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function inventoryMarkdown(settings){
  const rows=publicInventory(settings);
  const lines=['# Pending field inventory','','Live price-book dollars are not copied here. Product and cost amounts are omitted. Unconfigured means null, not zero.','',
    '| Path | Area | Audience | State | Review | Proposed | Unit |',
    '| --- | --- | --- | --- | --- | --- | --- |'];
  for(const r of rows){
    lines.push('| `'+r.path+'` | '+r.area+' | '+r.audience+' | '+r.valueState+' | '+r.reviewStatus+' | — | '+r.unit+' |');
  }
  lines.push('','Live confirmed floor selling rates (already on price book v4, not proposed): solid 8, flake 10, metallic 15 USD per sq ft.','',AWAITING_PROVENANCE,'','Pending price paths: '+PENDING_PRICE_PATHS.length+'. Sourced rows loaded: '+SOURCED_ESTIMATES.length+'. Structural nulls excluded from that count: '+STRUCTURAL_NULL_PATHS.join(', ')+'.');
  return lines.join('\n')+'\n';
}

function proposalReviewHTML(settings,owner){
  if(!owner)return '';
  const model=reviewModel(settings);
  const rows=model.ownerConfirmed.map(r=>`<tr><td>${esc(r.label)}<small>${esc(r.path)}</small></td><td>${esc(r.unit)}</td><td class="num">${esc(String(r.confirmedLive))}</td><td>Already on the live book. Not a new estimate.</td></tr>`).join('');
  return `<details open class="proposal-review"><summary>Draft review — inactive price proposals</summary><div class="detail-body">
  <div class="warn-banner"><b>Not on customer quotes.</b> Solid $8, flake $10, and metallic $15 per sq ft stay as approved selling rates. This draft does not adopt a solid-vs-flake policy, does not seed installer 250/450/650 sq ft guesses, and does not load vendor costs. ${model.awaitingSourced} catalog prices remain unresolved. Sourced rows loaded: ${model.sourcedEstimateCount}.</div>
  <p class="method-note">${model.configuredZero} fields on the code book are an explicit zero, which is different from Pending. Configured live values are preserved. Owner product costs and cost rates are not in the database yet; employees still receive zeros.</p>
  <table><thead><tr><th>Floor selling rate</th><th>Unit</th><th class="num">Live</th><th>Review</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="method-note">${esc(LIVE_CONFIRMED_PROVENANCE)}</p>
  <button type="button" class="button secondary" id="proposalActivate" disabled>Activation stays off until a corrected dataset is reviewed</button>
  </div></details>`;
}

function ownerPricingSchema(){
  const products=['primer','base','white','metal','pigment','sealer','top','flake','level','levelPrimer','patch','grip','moisture'];
  const costs=Object.keys(COST_UNITS);
  return {
    schema:'exotic-splash.owner-pricing.v1',
    live:'owner_settings is {} on price book v4. Do not treat epoxy-engine defaults as saved owner costs.',
    books:{
      staff_settings:'selling rates, catalog starts and adjustments, approvedAdjustment, business, notes. Employees can read this book.',
      owner_settings:'products and costs only. Employees receive zeros, not this object.'
    },
    overwrite_rule:'If a live value is a finite number, including 0, do not replace it. Fill only null or missing leaves, and only after review.',
    product_record:{path:'owner_settings.products.<key>',fields:['label','size','price','coverage','unit'],price_unit:'USD per package',keys:products},
    cost_record:{path:'owner_settings.costs.<key>',keys:costs.map(k=>({key:k,unit:COST_UNITS[k]}))},
    material_costbook_item:{id:'string',category:'string',product:'string',supplier:'string',unit_size:'string',verified_unit_cost:'USD owner-only or null',customer_material_price:'USD materials-only charge or null',coverage:'string',consumable_type:'CONSUMABLE|REUSABLE_TOOL|EQUIPMENT|QUOTE_REQUIRED',quote_required:'boolean',notes:'string'},
    size_mismatches:[
      {key:'primer',engine:'3 gal package',archive:'1.5 gal kit',apply:false,reason:'Package size does not match. Do not copy a unit cost until size, price, and coverage describe the same kit.'},
      {key:'flake',engine:'5 lb package',archive:'40 lb unit',apply:false,reason:'Package size does not match.'},
      {key:'grip',engine:'pack',archive:'not identified',apply:false,reason:'Traction pack was not matched to a catalog row.'},
      {key:'base',engine:'3 gal colored epoxy',archive:'base kit plus possible pigment',apply:false,reason:'Pigment is a separate row. Do not treat one verified kit cost as the full colored system.'}
    ],
    garage_adjustment_rule:'Material system changes are (system rate − flake rate) × that package’s own area. A flat delta calibrated to one 450 sq ft reference is rejected. Package area is not stored, so no material delta is seeded. Package starting prices stay as already configured.',
    pending_selling_paths:PENDING_PRICE_PATHS.slice(),
    structural_nulls:STRUCTURAL_NULL_PATHS.slice(),
    sourced_rows_loaded:SOURCED_ESTIMATES.length
  };
}
return {ACTIVATION_DEFAULT,LIVE_CONFIRMED_FLOOR,PENDING_PRICE_PATHS,STRUCTURAL_NULL_PATHS,SOURCED_ESTIMATES,inventory,publicInventory,inventoryMarkdown,applyActivation,activationChangesQuotes,reviewModel,proposalReviewHTML,ownerPricingSchema,isConfiguredNumber};
});
