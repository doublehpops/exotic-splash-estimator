/* Exotic Splash Estimator v7 — server-authoritative quote core (UMD).
 * Shared, byte-identical, by:
 *   - supabase/functions/quote-job (Edge Function, Deno)  -> authoritative
 *   - app/js (browser)  -> parity helpers + snapshot shape only
 *   - tools/*.test.js (Node) -> tests
 * Contains NO secrets and NO prices (prices come from the database).
 */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.EsQuoteCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const CORE_VERSION='7.0.0';
const clone=x=>JSON.parse(JSON.stringify(x));
const STAFF_SECTIONS=['business','rates','pricingOptions','addOn','approvedAdjustment','catalog','notes'];
const OWNER_SECTIONS=['products','costs'];
function discountApi(){return (typeof globalThis!=='undefined'&&globalThis.EsDiscountApproval)||(typeof require==='function'?function(){try{return require('./discount-approval.js')}catch(e){return null}}():null)}
function sanityApi(){return (typeof globalThis!=='undefined'&&globalThis.EsPriceSanity)||(typeof require==='function'?function(){try{return require('./price-sanity.js')}catch(e){return null}}():null)}
function priceStop(x,owner,body){
  const S=sanityApi();
  if(S&&S.quoteStop)return S.quoteStop(x,{owner:!!owner,sanityContinue:!!(body&&body.sanityContinue)});
  const blocks=x&&x.blockingIssues||[];
  if(blocks.length)return {status:422,body:{ok:false,code:'price_blocked',error:blocks[0].message||'Price is blocked',blockingIssues:blocks.map(b=>b.message)}};
  return null;
}

/* identical semantics to guided-app.js merge(): only keys present in defaults are taken */
function merge(target,source){for(const k of Object.keys(target)){if(source&&Object.prototype.hasOwnProperty.call(source,k)){if(target[k]&&typeof target[k]==='object'&&!Array.isArray(target[k])&&source[k]&&typeof source[k]==='object'&&!Array.isArray(source[k]))merge(target[k],source[k]);else target[k]=source[k]}}return target}
function deepMergeSettings(E,stored){
  const out=merge(clone(E.defaults),stored||{});
  if(!out.catalog)out.catalog=clone(E.defaults.catalog);
  else out.catalog=merge(clone(E.defaults.catalog),out.catalog);
  return out;
}
function pick(obj,keys){const o={};for(const k of keys)if(obj&&Object.prototype.hasOwnProperty.call(obj,k))o[k]=clone(obj[k]);return o}
/** Split full app settings into the two DB books. */
function splitSettings(settings){return{staff:pick(settings,STAFF_SECTIONS),owner:pick(settings,OWNER_SECTIONS)}}
/** Full (owner/server) settings = defaults ⊕ staff book ⊕ owner book. */
function buildSettings(E,staff,owner){
  return deepMergeSettings(E,Object.assign({},pick(staff||{},STAFF_SECTIONS),pick(owner||{},OWNER_SECTIONS)));
}
/** Employee browser settings: owner-only sections replaced by zeros (never real values). */
function redactedStaffSettings(E,staff){
  const s=buildSettings(E,staff,{});
  for(const p of Object.values(s.products||{}))if(p&&typeof p==='object'){if('price' in p)p.price=0}
  for(const k of Object.keys(s.costs||{}))if(typeof s.costs[k]==='number')s.costs[k]=0;
  s._redacted=true;
  return s;
}

/* ---- job normalisation (mirrors guided-app.js syncPrepIntoEngineFields) ---- */
const BASE_COLORS={'gray':'Gray','light-gray':'Light gray','charcoal':'Charcoal','beige':'Beige / sand','taupe':'Taupe','white':'White','off-white':'Off-white','black':'Black','slate-blue':'Slate blue','sage':'Sage'};
const FLAKE_BLENDS={'neutral-gray':'Neutral gray blend','black-white':'Black & white','brown-tan':'Brown / tan','beige-cream':'Beige / cream','charcoal-silver':'Charcoal / silver','salt-pepper':'Salt & pepper'};
const PREP_LABELS={cracks:'Cracks / joint issues',spalling:'Spalling / soft concrete',coatingRemoval:'Existing coating / paint removal',patching:'Patching / hole repair',leveling:'Self-leveling needed'};
function resolveBaseColor(a){
  if(a.colorKey==='custom'){return (a.customColor||a.color||'Custom color').trim()||'Custom color'}
  if(a.colorKey&&BASE_COLORS[a.colorKey])return BASE_COLORS[a.colorKey];
  return a.color||'Gray';
}
function resolveFlakeBlend(a){
  if(a.flakeBlend==='custom'){return (a.customFlakeBlend||'').trim()||'Custom flake blend'}
  if(FLAKE_BLENDS[a.flakeBlend])return FLAKE_BLENDS[a.flakeBlend];
  return a.flakeBlendLabel||a.flakeBlend||'';
}
function computeAreaSqft(a){
  if(a.sqftMode==='rectangles'){const sum=(a.rectangles||[]).reduce((s,r)=>s+(Number(r.length)||0)*(Number(r.width)||0),0);return Math.round(sum*100)/100}
  return Number(a.sqft)||0;
}
function prepareJob(E,raw){
  const j=Object.assign(E.newJob(),clone(raw||{}));
  j.areas=Array.isArray(j.areas)&&j.areas.length?j.areas:[E.newArea()];
  j.catalogItems=Array.isArray(j.catalogItems)?j.catalogItems:[];
  let patch=0,anyRemoval=false,anyAdhesive=false;
  for(const a of j.areas){
    if(a.sqftMode==='rectangles')a.sqft=computeAreaSqft(a);
    a.color=resolveBaseColor(a);
    a.flakeBlendLabel=a.style==='flake'?resolveFlakeBlend(a):'';
    const p=a.prep||(a.prep={});
    if(a.moisture)p.moisture=true;else if(p.moisture)a.moisture=true;else{a.moisture=false;p.moisture=false}
    if(p.patching||p.spalling)patch+=Math.max(0,Number(p.patchKits)||0);
    if(p.coatingRemoval)anyRemoval=true;
    if(p.adhesive)anyAdhesive=true;
    if(p.leveling){a.level=true;a.depth=Number(p.levelDepth)||a.depth||0.25}
  }
  if(patch)j.patchKits=patch;
  j.moisture=false;j.moistureBarrier=false;
  if(anyAdhesive)j.condition='adhesive';else if(anyRemoval)j.condition='paint';
  return j;
}
/** Strip heavy / irrelevant fields before sending a job for preview. */
function jobForTransport(job){
  const j=clone(job||{});
  delete j.history;delete j.step;
  for(const a of j.areas||[]){delete a.photos;delete a.conditionPhotos}
  for(const it of j.catalogItems||[]){delete it.photos}
  delete j.photos;
  return j;
}
/** Employee-locked pricing inputs are always taken from the stored job (or baseline). */
function applyEmployeeLocks(job,stored){
  const s=stored||{};
  job.method=s.method||'rates';
  job.agreedTotal=Number(s.agreedTotal)||0;
  job.includeInternalInCustomer=false;
  const byId={};for(const a of (s.areas||[]))if(a&&a.id)byId[a.id]=a;
  for(const a of job.areas||[]){const o=byId[a.id];a.rate=o&&o.rate!==undefined?o.rate:null}
  return job;
}

/* ---- money helpers ---- */
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const r2=v=>Math.round(n(v)*100)/100;
function approvedAdjustment(settings){
  const a=(settings&&settings.approvedAdjustment)||{mode:'amount',amount:0,pct:0};
  return{mode:a.mode==='pct'?'pct':'amount',amount:n(a.amount),pct:n(a.pct)};
}
function capBase(x){return n(x&&x.selected&&x.selected.pre!=null?x.selected.pre:x&&x.base)+n(x&&x.minimum)}
function approvedAdjustmentCap(settings,x){
  const a=approvedAdjustment(settings);
  if(a.mode==='pct')return Math.max(0,Math.round(capBase(x)*(a.pct/100)*100)/100);
  return Math.max(0,a.amount);
}
/** Amount server_record_quote stores when a consumed approval matches this snapshot. */
function recordedDiscountAmount(snapshot){
  const raw=snapshot&&snapshot.totals?snapshot.totals.discount:0;
  const x=Number(raw);
  if(!Number.isFinite(x)||x<0)return 0;
  return Math.round(x*100)/100;
}
function customerVisibleLines(x){
  return (x.lines||[]).filter(l=>{const k=l.kind||'';return k!=='mileage'&&k!=='travel'&&k!=='equipment'&&k!=='overhead'&&k!=='equip'});
}
function quoteAllocation(x){
  const subtotal=n(x.subtotal),salesTax=n(x.salesTax),total=n(x.total);
  const matW=n(x.mat)+n(x.tax),labW=n(x.labor),otherW=Math.max(0,n(x.overhead)+n(x.contingency));
  const weight=matW+labW+otherW;let materials=0,labor=0,other=0;
  if(subtotal<=0||weight<=0){other=subtotal}
  else{materials=Math.round(subtotal*(matW/weight)*100)/100;labor=Math.round(subtotal*(labW/weight)*100)/100;other=Math.round((subtotal-materials-labor)*100)/100}
  const sumParts=Math.round((materials+labor+other)*100)/100;
  return{label:'Planning allocation from approved quote (selling prices — not supplier invoices or payroll)',
    personHours:n(x.personHours),hourRows:(x.hours||[]).map(h=>({label:h.label,hours:n(h.qty)})),
    materials,labor,other,subtotal,salesTax,total,sumParts,reconciles:Math.abs(sumParts-subtotal)<0.015};
}
const COST_WARNING=/cost|profit|margin|markup|\/mi\b|per mile|mileage rate|pay rate|hourly|wage|overhead \$|supplier/i;
function staffWarnings(ws){return (ws||[]).filter(w=>!COST_WARNING.test(String(w)))}
function safeChoice(c){
  return{key:c.key,label:c.label,short:c.short,rate:n(c.rate),project:n(c.project),adjustment:n(c.adjustment),pre:n(c.pre),
    minimum:n(c.minimum),discount:n(c.discount),subtotal:n(c.subtotal),salesTax:n(c.salesTax),total:n(c.total),
    savings:n(c.savings),savingsPct:n(c.savingsPct),savingsBasis:c.savingsBasis||'full quote total',pctTotal:n(c.pctTotal),
    breakdown:c.breakdown?{finishRate:n(c.breakdown.finishRate),finishQty:n(c.breakdown.finishQty),finishAmount:n(c.breakdown.finishAmount),extrasAmount:n(c.breakdown.extrasAmount),extras:(c.breakdown.extras||[]).map(e=>({label:String(e.label||''),amount:n(e.amount)})),total:n(c.total),reconciles:!!c.breakdown.reconciles}:null,
    paymentsReconcile:c.paymentsReconcile!==false,
    payments:(c.payments||[]).map(p=>({pct:n(p.pct),label:String(p.label||''),amount:n(p.amount)}))};
}
function safeLine(l){return{kind:l.kind,label:l.label,description:l.description,qty:n(l.qty),unit:l.unit,rate:n(l.rate),total:n(l.total),pending:l.pending?true:undefined}}

/** Fields an employee may see (selling prices, quantities, hours) — no $ cost, pay, markup, profit, margin. */
function staffSnapshot(E,job,x,settings){
  const cap=approvedAdjustmentCap(settings,x);
  const choices={};for(const [k,c] of Object.entries(x.choices||{}))choices[k]=safeChoice(c);
  const t=x.travel||{};
  const cat=x.catalog?{type:x.catalog.type,quoteReady:!!x.catalog.quoteReady,startingConfigured:!!x.catalog.startingConfigured,
    startingTotal:n(x.catalog.startingTotal),adjTotal:n(x.catalog.adjTotal),scopeTotal:n(x.catalog.scopeTotal),itemCount:n(x.catalog.itemCount),
    measureSqft:n(x.catalog.measureSqft),startingLabel:x.catalog.startingLabel,
    pending:clone(x.catalog.pending||[]),pendingUnique:clone(x.catalog.pendingUnique||[]),
    startingLines:(x.catalog.startingLines||[]).map(safeLine),adjustments:(x.catalog.adjustments||[]).map(safeLine),lines:(x.catalog.lines||[]).map(safeLine)}:null;
  return{
    coreVersion:CORE_VERSION,
    sqft:n(x.sqft),finished:n(x.finished),levelArea:n(x.levelArea),levelEquiv:n(x.levelEquiv),
    lines:customerVisibleLines(x).map(safeLine),
    base:n(x.base),regularBase:n(x.regularBase),discountable:n(x.discountable),discountSqft:n(x.discountSqft),
    choices,selected:safeChoice(x.selected||{}),
    addOn:x.addOn?{included:!!x.addOn.included,label:x.addOn.label,rate:n(x.addOn.rate),total:n(x.addOn.total),tier:x.addOn.tier}:null,
    discount:n(x.discount),minimum:n(x.minimum),subtotal:n(x.subtotal),salesTax:n(x.salesTax),total:n(x.total),perSqft:n(x.perSqft),
    balance:n(x.balance),finalizedBlocked:!!x.finalizedBlocked,
    personHours:n(x.personHours),crew:x.crew,
    hours:(x.hours||[]).map(h=>({label:h.label,qty:n(h.qty)})),
    material:(x.material||[]).map(m=>({key:m.key,label:m.label,qty:n(m.qty),unit:m.unit})),
    travelPlan:{oneWay:n(t.oneWay),trips:n(t.trips),vehicles:n(t.vehicles),crew:t.crew,vehicleMiles:n(t.vehicleMiles),minutes:n(t.minutes),crewHours:n(t.crewHours)},
    travelMiles:n(x.travelMiles),
    warnings:staffWarnings(x.warnings),
    quoteReady:!!x.quoteReady,quoteStatus:x.quoteStatus||'',pendingReasons:clone(x.pendingReasons||[]),
    catalog:cat,
    allocation:quoteAllocation(x),
    cap,capBase:r2(capBase(x)),capMode:approvedAdjustment(settings).mode
  };
}
/** Owner-only internal figures. */
function internalSnapshot(x,markupPct){
  return{cost:n(x.cost),profit:n(x.profit),margin:n(x.margin),mat:n(x.mat),tax:n(x.tax),labor:n(x.labor),equip:n(x.equip),
    direct:n(x.direct),overhead:n(x.overhead),overheadBase:n(x.overheadBase),contingency:n(x.contingency),
    travelCost:n(x.travelCost),travelInQuote:n(x.travelInQuote),markupPct:markupPct==null?null:n(markupPct)};
}
function isCatalogJob(E,j){const t=E.projectTypeOf(j);return t==='flatwork'||t==='seating'||(t==='garage'&&!E.garageUsesMeasured(j))}
/** Whitelisted customer document data (DB re-whitelists via private.customer_safe_snapshot). */
function customerSnapshot(E,job,x,settings){
  const b=settings.business||{};const catalog=isCatalogJob(E,job);
  const sel=x.selected||{};
  const prepNotes=(job.areas||[]).filter(a=>(a.conditionRating&&a.conditionRating!=='unknown')||(a.prep&&Object.values(a.prep).some(v=>v===true))).map(a=>{
    const items=Object.keys(PREP_LABELS).filter(k=>a.prep&&a.prep[k]).map(k=>PREP_LABELS[k]);
    return (a.name||'Area')+': condition '+(a.conditionRating||'unknown')+(items.length?' — '+items.join(', '):'')+(a.conditionNotes?' — '+a.conditionNotes:'');
  });
  return{
    schema:1,
    business:{name:b.name||'',address:b.address||'',phone:b.phone||'',email:b.email||''},
    document:{type:job.docType==='invoice'?'invoice':'estimate',number:job.number||'',date:job.date||''},
    customer:{name:job.customer||'',company:job.company||'',address:job.address||''},
    project:{catalog,type:job.projectType||'floor',package:job.garagePackage||'',itemCount:(job.catalogItems||[]).length,sqft:n(x.sqft)},
    lines:catalog?[]:customerVisibleLines(x).map(safeLine),
    catalogStarting:catalog&&x.catalog?(x.catalog.startingLines||[]).map(safeLine):[],
    catalogAdjustments:catalog&&x.catalog?(x.catalog.adjustments||[]).map(safeLine):[],
    scope:(job.areas||[]).filter(a=>n(computeAreaSqft(a))).map(a=>({name:a.name||'Area',sqft:n(computeAreaSqft(a)),description:E.describe(a),
      grip:!!a.grip,topcoat:!!(a.topcoat&&a.topcoat!=='none'),moisture:!!a.moisture,color:a.color||'',flakeBlend:a.style==='flake'?(a.flakeBlendLabel||''):''})),
    prepNotes,
    totals:{base:n(x.base),adjustment:n(sel.adjustment),minimum:n(x.minimum),discount:n(x.discount),subtotal:n(x.subtotal),
      taxPct:n(job.tax),salesTax:n(x.salesTax),total:n(x.total),perSqft:n(x.perSqft)},
    selected:{key:sel.key||'regular',label:sel.label||'',short:sel.short||'',rate:n(sel.rate),payments:(sel.payments||[]).map(p=>({pct:n(p.pct),label:String(p.label||''),amount:n(p.amount)}))},
    options:Object.values(x.choices||{}).map(c=>({key:c.key,label:c.label,rate:n(c.rate),total:n(c.total),savings:n(c.savings),savingsPct:n(c.savingsPct),savingsBasis:'full quote total',
      finishAmount:n(c.breakdown&&c.breakdown.finishAmount),extrasAmount:n(c.breakdown&&c.breakdown.extrasAmount),reconciles:!!(c.breakdown&&c.breakdown.reconciles),paymentsReconcile:c.paymentsReconcile!==false,
      payments:(c.payments||[]).map(p=>({pct:n(p.pct),label:String(p.label||''),amount:n(p.amount)}))})),
    showOptions:!!((job.showOptions||sel.key!=='regular')&&x.sqft&&x.quoteReady),
    addOn:x.addOn&&x.addOn.included?{included:true,label:x.addOn.label||'',rate:n(x.addOn.rate)}:{included:false},
    allocation:(()=>{const q=quoteAllocation(x);return{materials:q.materials,labor:q.labor,other:q.other,subtotal:q.subtotal,salesTax:q.salesTax,total:q.total}})(),
    quoteReady:!!x.quoteReady,quoteStatus:x.quoteStatus||'',pendingReasons:(x.pendingReasons||[]).map(String),
    priceNotes:settings.notes||'',terms:job.terms||'',jobNotes:job.notes||''
  };
}
/** Pure server computation. */
function computeQuote(E,{jobData,staffSettings,ownerSettings,markupPct}){
  const settings=buildSettings(E,staffSettings,ownerSettings);
  const job=prepareJob(E,jobData);
  job.markup=markupPct!=null?n(markupPct):n(settings.costs&&settings.costs.markup);
  const x=E.calculate(job,settings);
  return{settings,job,x};
}

class HttpError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}

/**
 * Edge-function core, dependency-injected so it is testable without Supabase.
 * deps: getProfile(), getJob(id), getPriceBook(), getJobMarkup(id), recordQuote(args)
 * body: {mode:'preview', job_id?, job_data} | {mode:'record', job_id}
 */
async function handleQuoteRequest(body,deps,E){
  try{
    const profile=await deps.getProfile();
    if(!profile||!profile.active||(profile.role!=='owner'&&profile.role!=='employee'))
      throw new HttpError(403,'forbidden','Account is not active staff');
    const owner=profile.role==='owner';
    const mode=body&&body.mode;
    const discountModes=mode==='discount-request'||mode==='discount-decide';
    if(mode!=='preview'&&mode!=='record'&&!discountModes)throw new HttpError(400,'bad_request','mode must be preview, record, discount-request, or discount-decide');
    const jobId=body.job_id||null;
    if(jobId!=null&&!/^[0-9a-f-]{36}$/i.test(String(jobId)))throw new HttpError(400,'bad_request','invalid job_id');
    let stored=null;
    if(jobId){stored=await deps.getJob(jobId);if(!stored)throw new HttpError(404,'not_found','Job not found or not accessible')}
    if((mode==='record'||mode==='discount-decide')&&mode==='record'&&!stored)throw new HttpError(400,'bad_request','record requires a saved job_id');
    if(mode==='discount-decide'){
      const store=deps.discountStore;
      if(!store)throw new HttpError(503,'not_configured','Discount approval store is not configured');
      const decided=await store.decide({id:profile.id,role:profile.role},{id:body.id,decision:body.decision,amount:body.amount,percent:body.percent,estimateId:body.estimateId,ownerNote:owner?body.ownerNote:undefined,lowMarginException:body.lowMarginException===true});
      if(!decided.ok)return{status:decided.status,body:{ok:false,code:decided.code,error:decided.error}};
      return{status:200,body:{ok:true,mode,request:decided.request}};
    }
    let jobData;
    if(mode==='record')jobData=clone(stored.job_data||{});
    else{
      const source=body.job_data||(stored&&stored.job_data);
      if(!source||typeof source!=='object'||Array.isArray(source))throw new HttpError(400,'bad_request','job_data required');
      if(JSON.stringify(source).length>2000000)throw new HttpError(413,'too_large','job_data too large (remove photos)');
      jobData=jobForTransport(source);
      if(!owner)applyEmployeeLocks(jobData,stored?stored.job_data:null);
    }
    const clientDiscount=n(jobData.discount);
    const approvalId=jobData.discountApprovalId||body.discountApprovalId||null;
    const approvalUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(approvalId||''));
    delete jobData.discountApproval;
    jobData.discount=0;
    const pb=await deps.getPriceBook();
    const markup=stored?await deps.getJobMarkup(stored.id):null;
    let {settings,job,x}=computeQuote(E,{jobData,staffSettings:pb.staff_settings,ownerSettings:pb.owner_settings,markupPct:markup});
    const DA=discountApi();
    const enforce=!settings.discountApproval||settings.discountApproval.enforce!==false;
    const estimateId=stored?stored.id:(job.id||jobId);
    const tier=job.priceOption||'regular';
    const revision=DA?DA.revisionOf(job,x.total):'';
    let discountGate={applied:false,status:'none'};
    if(mode==='discount-request'){
      const store=deps.discountStore;
      if(!store||!DA)throw new HttpError(503,'not_configured','Discount approval store is not configured');
      const requested=await store.request({id:profile.id,role:profile.role},{
        estimateId,revision,tier,beforeTotal:x.total,
        amount:body.amount,percent:body.percent,reason:body.reason
      });
      if(!requested.ok)return{status:requested.status,body:{ok:false,code:requested.code,error:requested.error,beforeTotal:r2(x.total),revision,tier}};
      return{status:200,body:{ok:true,mode,request:requested.request,beforeTotal:r2(x.total),revision,tier,customerTotal:r2(x.total)}};
    }
    if(enforce&&approvalId&&!approvalUuid){
      discountGate={applied:false,status:'invalid_approval_id',code:'invalid_approval_id',error:'Approval id is not a server record. The price was not changed.'};
    }else if(enforce&&approvalId){
      const store=deps.discountStore;
      if(!store)discountGate={applied:false,status:'not_configured',code:'not_configured'};
      else{
        const checked=await store.check({id:approvalId,estimateId,revision,tier,beforeTotal:x.total,markStale:mode==='record'});
        if(checked.ok){
          job.discountApproval={ok:true,amount:checked.amount,tier:(checked.request&&checked.request.tier)||tier};
          x=E.calculate(job,settings);
          if(mode==='record'){
            const stop=priceStop(x,owner,body);
            if(stop)return stop;
            const consumed=await store.consume({id:profile.id,role:profile.role},{id:approvalId,estimateId,revision,tier,beforeTotal:checked.beforeTotal});
            if(!consumed.ok)return{status:consumed.status,body:{ok:false,code:consumed.code,error:consumed.error}};
          }
          discountGate={applied:true,status:'approved',amount:checked.amount,beforeTotal:checked.beforeTotal,afterTotal:r2(x.total)};
        }else discountGate={applied:false,status:checked.code,code:checked.code,error:checked.error};
      }
    }else if(enforce&&clientDiscount>0){
      discountGate={applied:false,status:'not_approved',code:'discount_not_approved',error:'An extra discount needs owner approval for this estimate revision and tier'};
    }
    if(mode==='record'&&enforce&&(clientDiscount>0||approvalId)&&!discountGate.applied){
      return{status:422,body:{ok:false,code:discountGate.code||'discount_not_approved',error:discountGate.error||'Extra discount was not applied'}};
    }
    const staff=staffSnapshot(E,job,x,settings);
    staff.discountStatus=discountGate.status;
    const out={ok:true,mode,role:profile.role,coreVersion:CORE_VERSION,priceBookVersion:pb.version,jobVersion:stored?stored.version:null,staff,discountStatus:discountGate.status};
    if(mode==='preview'&&!owner&&n(job.discount)>staff.cap+0.005&&(job.priceOption||'regular')==='regular')
      out.discountOverCap=true;
    if(mode==='record'){
      const stop=priceStop(x,owner,body);
      if(stop)return stop;
      const customer=customerSnapshot(E,job,x,settings);
      delete customer.ownerNote;delete customer.discountApproval;
      const internal=internalSnapshot(x,job.markup);
      const quoteId=await deps.recordQuote({
        p_job_id:stored.id,p_job_version:stored.version,p_requested_by:profile.id,p_engine_version:CORE_VERSION,
        p_price_book_version:pb.version,p_quote_ready:!!x.quoteReady,p_quote_status:x.quoteStatus||'',
        p_total:r2(x.total),p_cap_base:r2(capBase(x)),p_customer_snapshot:customer,p_staff_snapshot:staff,p_internal:internal});
      out.quoteId=quoteId;out.customer=customer;
    }
    if(owner)out.internal=internalSnapshot(x,job.markup);
    return{status:200,body:out};
  }catch(e){
    if(e instanceof HttpError)return{status:e.status,body:{ok:false,code:e.code,error:e.message}};
    const msg=String(e&&e.message||e);
    if(/exceeds the owner-approved adjustment limit/i.test(msg))return{status:422,body:{ok:false,code:'discount_over_cap',error:'Discount exceeds the owner-approved adjustment limit'}};
    if(/changed since|changed during/i.test(msg))return{status:409,body:{ok:false,code:'conflict',error:'Job or price book changed — retry'}};
    if(/cannot access|disabled/i.test(msg))return{status:403,body:{ok:false,code:'forbidden',error:'Not allowed'}};
    return{status:500,body:{ok:false,code:'server_error',error:'Quote calculation failed'}};
  }
}

return{CORE_VERSION,STAFF_SECTIONS,OWNER_SECTIONS,merge,deepMergeSettings,splitSettings,buildSettings,redactedStaffSettings,recordedDiscountAmount,
  prepareJob,jobForTransport,applyEmployeeLocks,computeAreaSqft,approvedAdjustment,approvedAdjustmentCap,capBase,
  customerVisibleLines,quoteAllocation,staffWarnings,staffSnapshot,internalSnapshot,customerSnapshot,computeQuote,handleQuoteRequest,HttpError};
});
