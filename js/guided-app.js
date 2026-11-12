(function(){
'use strict';
const E=window.EpoxyEngine,clone=x=>JSON.parse(JSON.stringify(x));
const STORAGE_KEY='exotic-splash-estimator-v7';
const LEGACY_KEYS=['exotic-splash-estimator-v6','exotic-splash-estimator-v5','exotic-splash-estimator-v4','exotic-splash-estimator-v3','exotic-splash-estimator-v2','exotic-splash-estimator-v1'];
const APP_VERSION=7;
/* v7 runtime: 'demo' = offline local preview (NOT SECURE); 'auth' = Supabase-signed-in staff.
 * In auth mode the role comes ONLY from the server profile; prices are enforced by the server. */
let runtime={mode:'demo'};
function authMode(){return runtime.mode==='auth'}
const serverQuotes={}; // jobId -> {key, staff, at}
function stableJSON(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stableJSON).join(',')+']';return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stableJSON(v[k])).join(',')+'}'}
function quoteInput(j){const Q=window.EsQuoteCore;const t=Q?Q.jobForTransport(j):JSON.parse(JSON.stringify(j));delete t.updatedAt;delete t.createdAt;delete t.markup;for(const k of Object.keys(t))if(k.charAt(0)==='_')delete t[k];return t}
function quoteKey(j){return (j&&j.id||'')+'|'+stableJSON(quoteInput(j))}
const PHOTO_MAX_BYTES=1500000;
const STORE_SOFT_LIMIT=4500000;
const STEPS=[
  {id:'contact',label:'Contact',short:'01'},
  {id:'areas',label:'Areas & photos',short:'02'},
  {id:'prep',label:'Slab & prep',short:'03'},
  {id:'selections',label:'System',short:'04'},
  {id:'pricing',label:'Pricing',short:'05'},
  {id:'review',label:'Review & export',short:'06'}
];
const PREP_ITEMS=[
  {key:'cracks',label:'Cracks / joint issues',help:'$250 up to 10 linear ft, then $12 per ft. Enter the length when this is checked.',links:'notes'},
  {key:'spalling',label:'Poor slab / spalling',help:'Spalling means the surface is flaking or crumbling. Adds $0.75 per sq ft, $400 minimum, on this area.',links:'patch'},
  {key:'coatingRemoval',label:'Coating removal',help:'$1.50 per sq ft, $650 minimum, on this area’s square feet.',links:'removal'},
  {key:'paintRemoval',label:'Paint removal',help:'Thin paint only. $1.25 per sq ft, $250 minimum, on this area.',links:'removal'},
  {key:'patching',label:'Patching / hole repair',help:'Uses patch kit allowance from rate book.',links:'patch'},
  {key:'leveling',label:'Self-leveling needed',help:'Sets leveling on the area with entered average depth. The leveling rate stays $6 per sq ft at 1/4 inch.',links:'level'}
];
const CONDITION_RATINGS=[
  {id:'unknown',label:'Not inspected'},
  {id:'good',label:'Good'},
  {id:'fair',label:'Fair'},
  {id:'poor',label:'Poor'},
  {id:'critical',label:'Critical'}
];
const BASE_COLORS=[
  {key:'gray',label:'Gray',hex:'#8a8f93'},
  {key:'light-gray',label:'Light gray',hex:'#c5c9cc'},
  {key:'charcoal',label:'Charcoal',hex:'#3a3f44'},
  {key:'beige',label:'Beige / sand',hex:'#cbb896'},
  {key:'taupe',label:'Taupe',hex:'#9a8b7a'},
  {key:'white',label:'White',hex:'#f4f4f2'},
  {key:'off-white',label:'Off-white',hex:'#ebe6dc'},
  {key:'black',label:'Black',hex:'#1c1c1c'},
  {key:'slate-blue',label:'Slate blue',hex:'#6b7c8c'},
  {key:'sage',label:'Sage',hex:'#8a9a86'},
  {key:'custom',label:'Custom (type below)',hex:'#ffffff'}
];
const FLAKE_BLENDS=[
  {key:'neutral-gray',label:'Neutral gray blend',stops:['#2b2b2b','#7a7a7a','#d0d0d0']},
  {key:'black-white',label:'Black & white',stops:['#111','#888','#f2f2f2']},
  {key:'brown-tan',label:'Brown / tan',stops:['#4a3222','#8b6914','#d2b48c']},
  {key:'beige-cream',label:'Beige / cream',stops:['#c4a882','#e8dcc8','#f7f1e6']},
  {key:'charcoal-silver',label:'Charcoal / silver',stops:['#2f3438','#6e757a','#c9ced1']},
  {key:'salt-pepper',label:'Salt & pepper',stops:['#1a1a1a','#9a9a9a','#efefef']},
  {key:'custom',label:'Custom blend (type below)',stops:['#ddd','#bbb','#999']}
];
function resolveBaseColor(a){
  if(a.colorKey==='custom'){return (a.customColor||a.color||'Custom color').trim()||'Custom color';}
  const hit=BASE_COLORS.find(c=>c.key===a.colorKey);
  if(hit&&hit.key!=='custom')return hit.label;
  return a.color||'Gray';
}
function resolveFlakeBlend(a){
  if(a.flakeBlend==='custom'){return (a.customFlakeBlend||'').trim()||'Custom flake blend';}
  const hit=FLAKE_BLENDS.find(c=>c.key===a.flakeBlend);
  return hit?hit.label:(a.flakeBlendLabel||a.flakeBlend||'');
}
function applyColorFields(a){
  a.color=resolveBaseColor(a);
  a.flakeBlendLabel=a.style==='flake'?resolveFlakeBlend(a):'';
  return a;
}

function uid(){return 'j_'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4)}
function areaUid(){return 'a_'+Math.random().toString(36).slice(2,10)}
function photoUid(){return 'p_'+Math.random().toString(36).slice(2,10)}
function nowISO(){return new Date().toISOString()}
function $(id){return document.getElementById(id)}
function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function cash(n){return (Number(n)||0).toLocaleString('en-US',{style:'currency',currency:'USD'})}
function num(n,d=0){const x=Number(n);if(!Number.isFinite(x))return'0';return x.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d})}
function bytesLabel(n){if(n<1024)return n+' B';if(n<1024*1024)return (n/1024).toFixed(1)+' KB';return (n/1024/1024).toFixed(2)+' MB'}

function isOwner(){return authMode()?!!(runtime.profile&&runtime.profile.role==='owner'&&runtime.profile.active):state.role==='owner'}
function authBadgeHTML(){
  const p=runtime.profile||{};const owner=isOwner();
  return `<div class="role-switch auth-badge" role="note" aria-label="Signed-in account">
    <span class="role-label">Signed in:</span><b class="auth-who">${escape(p.full_name||p.email||'')}</b>
    <span class="lock-pill ${owner?'owner-pill':''}">${owner?'OWNER':'EMPLOYEE'}</span>
    <span class="role-disclosure">Role verified by the server. ${owner?'You can change product prices, rates, costs, markup and discount limits.':'Prices, costs and discount limits are set by the owner and enforced by the server.'}</span>
  </div>`;
}
function roleBadgeHTML(){
  if(authMode())return authBadgeHTML();
  const owner=isOwner();
  return `<div class="role-switch" role="group" aria-label="Role preview (not security)">
    <span class="role-label">Role preview:</span>
    <button type="button" class="role-btn ${!owner?'active':''}" id="roleWorker" aria-pressed="${!owner}">Worker</button>
    <button type="button" class="role-btn ${owner?'active':''}" id="roleOwner" aria-pressed="${owner}">Owner</button>
    <span class="role-disclosure"><b class="demo-insecure">OFFLINE DEMO — NOT SECURE.</b> Preview only — not secure enforcement. Real owner-only pricing needs authenticated deployment with server-side authorization.</span>
  </div>`;
}
function lockAttr(){return isOwner()?'':'disabled'}
function lockedField(label,path,type='text',placeholder='',extra=''){
  if(isOwner())return field(label,path,type,placeholder,extra);
  const v=getPath(path); const show=v==null||v===undefined?'':v;
  return `<div class="field locked"><label>${escape(label)} <span class="lock-pill">OWNER ONLY</span></label><input type="${type==='number'?'text':type}" value="${escape(show)}" disabled readonly><small>${authMode()?'Set by the owner (server-enforced).':'Locked in worker preview. Owner can edit rates in demo.'}</small></div>`;
}
function statusTag(status){return isOwner()&&status?' <span class="lock-pill">'+escape(status)+'</span>':'';}
function lockedCField(label,key,help='',status){return lockedField(label+statusTag(status),'settings.costs.'+key,'number',help)}

function guidedArea(base){
  const raw=base||{};
  const a={...E.newArea(),...raw};
  if(!a.id)a.id=areaUid();
  a.rectangles=Array.isArray(a.rectangles)?a.rectangles:[{length:0,width:0}];
  a.sqftMode=a.sqftMode||'manual';
  a.photos=Array.isArray(a.photos)?a.photos:[];
  a.conditionRating=a.conditionRating||'unknown';
  a.conditionNotes=a.conditionNotes||'';
  a.conditionPhotos=Array.isArray(a.conditionPhotos)?a.conditionPhotos:[];
  a.prep=Object.assign({cracks:false,crackLf:0,spalling:false,moisture:false,coatingRemoval:false,paintRemoval:false,patching:false,leveling:false,patchKits:0,removalSqft:null,levelDepth:0.25,adhesive:false},a.prep||{});
  a.topcoat=a.topcoat||'protective';
  a.textureNote=a.textureNote||'';
  // Per-area moisture: default OFF. Prefer explicit a.moisture, else prep.moisture. Never inherit job-global here.
  if(Object.prototype.hasOwnProperty.call(raw,'moisture'))a.moisture=!!raw.moisture;
  else if(a.prep&&a.prep.moisture)a.moisture=true;
  else a.moisture=false;
  a.prep.moisture=!!a.moisture;
  // Colors
  a.colorKey=a.colorKey||(String(a.color||'').toLowerCase().includes('white')?'white':'gray');
  a.customColor=a.customColor||'';
  a.flakeBlend=a.flakeBlend||'neutral-gray';
  a.customFlakeBlend=a.customFlakeBlend||'';
  applyColorFields(a);
  return a;
}
/* Next free ES-YYYYMMDD-NN for the given date, scanning jobs already in this workspace.
 * E.newJob() always yields -01, so without this every job started on the same day collides. */
function nextJobNumber(date){
  const d=String(date||new Date().toLocaleDateString('en-CA')).replaceAll('-','');
  const prefix='ES-'+d+'-';
  let max=0;
  for(const j of state.jobs||[]){
    const num=String(j&&j.number||'');
    if(!num.startsWith(prefix))continue;
    const seq=parseInt(num.slice(prefix.length),10);
    if(Number.isFinite(seq)&&seq>max)max=seq;
  }
  return prefix+String(max+1).padStart(2,'0');
}
function guidedJob(base){
  const raw=base||{};
  const j=Object.assign(E.newJob(),raw);
  if(!raw.number)j.number=nextJobNumber(j.date);
  if(!j.id)j.id=uid();
  if(!j.createdAt)j.createdAt=nowISO();
  j.updatedAt=j.updatedAt||j.createdAt;
  j.history=Array.isArray(j.history)?j.history:[];
  j.step=j.step||'contact';
  j.areas=(Array.isArray(j.areas)&&j.areas.length?j.areas:[E.newArea()]).map(guidedArea);
  j.jobConcerns=j.jobConcerns||'';
  j.includeInternalInCustomer=!!j.includeInternalInCustomer;
  j.includeCustomerContactInSub=!!j.includeCustomerContactInSub;
  j.includeCustomerPriceInSub=!!j.includeCustomerPriceInSub;
  j.includeGuideWithEstimate=j.includeGuideWithEstimate!==false; // default ON for customer package
  j.isSample=!!j.isSample;
  j.sampleLabel=j.sampleLabel||'';
  j.crew=E.crewSize(j);
  j.assignedCrew=String(raw.assignedCrew!=null?raw.assignedCrew:(j.assignedCrew||'')).trim().slice(0,80);
  j.projectType=j.projectType||'floor';
  j.garagePackage=j.garagePackage||'measured';
  j.garageStyle=j.garageStyle||'flake';
  j.garageTopcoat=j.garageTopcoat||'protective';
  j.garageCondition=j.garageCondition||'unknown';
  j.garagePrep=Object.assign({cracks:false,crackLf:0,spalling:false,coatingRemoval:false,paintRemoval:false,patching:false,leveling:false,moisture:false},j.garagePrep||{});
  if(E.blankExtras)j.extras=Object.assign(E.blankExtras(),j.extras||{});
  j.catalogItems=Array.isArray(j.catalogItems)?j.catalogItems:[];
  // v5/v6: moisture is PER-AREA only. Job-global moistureBarrier / job.moisture do NOT charge.
  // Historical area prep.moisture / a.moisture retained via guidedArea.
  const areaHadMoisture=(j.areas||[]).some(a=>a.moisture||(a.prep&&a.prep.moisture));
  const hadGlobal=!!(raw.moistureBarrier||(raw.moisture&&!areaHadMoisture)||raw._moistureMigratedFromJobFlag);
  j.moistureBarrier=false; // retired as charge source
  j.moisture=false; // engine uses per-area flags only
  if(hadGlobal && !areaHadMoisture){
    j._moistureLegacyReview={
      needed:true,
      label:'REVIEW WITH OWNER',
      detail:'A previous job-level moisture selection was found, but v5 charges moisture only on areas you check. No area was auto-checked. Confirm with Owner which area(s) need the moisture-control primer before charging.'
    };
  }else if(raw._moistureLegacyReview){
    j._moistureLegacyReview=raw._moistureLegacyReview;
  }else{
    j._moistureLegacyReview=null;
  }
  return j;
}
function pushHistory(job,type,summary,detail){
  job.history.push({at:nowISO(),type,summary,detail:detail||''});
  if(job.history.length>200)job.history=job.history.slice(-200);
}
function computeAreaSqft(a){
  if(a.sqftMode==='rectangles'){
    const sum=(a.rectangles||[]).reduce((s,r)=>s+(Number(r.length)||0)*(Number(r.width)||0),0);
    return Math.round(sum*100)/100;
  }
  return Number(a.sqft)||0;
}
function syncAreaSqft(a){
  if(a.sqftMode==='rectangles')a.sqft=computeAreaSqft(a);
  return a.sqft;
}
function moistureSelectedAreas(job){
  const rate=E.n(state.settings.rates.moisture);
  const items=[];
  for(const a of job.areas||[]){
    syncAreaSqft(a);
    const sf=computeAreaSqft(a);
    if(!sf||a.style==='level')continue;
    if(a.moisture||(a.prep&&a.prep.moisture)){
      items.push({id:a.id,name:a.name||'Area',sqft:sf,rate,total:sf*rate});
    }
  }
  const sqft=items.reduce((s,x)=>s+x.sqft,0);
  return{items,sqft,rate,total:sqft*rate};
}
function moisturePriceEstimate(job){return moistureSelectedAreas(job)}
function syncPrepIntoEngineFields(job){
  let patch=0, anyRemoval=false, anyAdhesive=false;
  for(const a of job.areas){
    syncAreaSqft(a);
    applyColorFields(a);
    const p=a.prep||(a.prep={});
    // Keep a.moisture and prep.moisture in sync (per-area only)
    if(a.moisture)p.moisture=true; else if(p.moisture)a.moisture=true; else {a.moisture=false;p.moisture=false;}
    if(p.patching||p.spalling)patch+=Math.max(0,Number(p.patchKits)||0);
    if(p.coatingRemoval)anyRemoval=true;
    if(p.adhesive)anyAdhesive=true;
    if(p.leveling){a.level=true;a.depth=Number(p.levelDepth)||a.depth||0.25;}
  }
  if(patch)job.patchKits=patch;
  job.moisture=false; // never job-global in v5
  job.moistureBarrier=false;
  if(anyAdhesive)job.condition='adhesive';
  else if(anyRemoval)job.condition='paint';
  return job;
}
function merge(target,source){for(const k of Object.keys(target)){if(source&&Object.prototype.hasOwnProperty.call(source,k)){if(target[k]&&typeof target[k]==='object'&&!Array.isArray(target[k])&&source[k]&&typeof source[k]==='object'&&!Array.isArray(source[k]))merge(target[k],source[k]);else target[k]=source[k]}}return target}
function deepMergeSettings(stored){
  const out=merge(clone(E.defaults),stored||{});
  // Ensure catalog tree exists even when migrating older saves
  if(!out.catalog)out.catalog=clone(E.defaults.catalog);
  else {
    out.catalog=merge(clone(E.defaults.catalog),out.catalog);
  }
  return out;
}
let state={version:APP_VERSION,settings:clone(E.defaults),jobs:[],activeJobId:null,view:'guided',role:'worker',cloud:{enabled:false,status:'OFF — not configured'}};
function activeJob(){return state.jobs.find(j=>j.id===state.activeJobId)||null}
function ensureJob(){
  if(!state.jobs.length){const j=guidedJob();j.origin=state.settings.business.address;state.jobs.push(j);state.activeJobId=j.id;}
  if(!activeJob())state.activeJobId=state.jobs[0].id;
  return activeJob();
}
function loadState(){
  let raw=null;
  try{raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{}
  if(!raw){
    for(const k of LEGACY_KEYS){
      try{
        const leg=JSON.parse(localStorage.getItem(k)||'null');
        if(!leg)continue;
        const jobs=Array.isArray(leg.jobs)?leg.jobs.map(guidedJob):(leg.job?[guidedJob(leg.job)]:[]);
        raw={version:APP_VERSION,settings:leg.settings,jobs,activeJobId:leg.activeJobId||null,view:'guided',cloud:{enabled:false,status:'OFF — not configured'},migratedFrom:k};
        break;
      }catch{}
    }
  }
  if(raw){
    state.version=APP_VERSION;
    state.settings=deepMergeSettings(raw.settings);
    state.jobs=Array.isArray(raw.jobs)?raw.jobs.map(guidedJob):(raw.job?[guidedJob(raw.job)]:[]);
    state.activeJobId=raw.activeJobId||null;
    state.view=raw.view||'guided';
    state.role='worker'; // always start locked; preview switch is session-only
    state.cloud={enabled:false,status:'OFF — not configured'};
  }
  ensureJob();
}
function storageSizeEstimate(){try{return (localStorage.getItem(STORAGE_KEY)||'').length}catch{return 0}}
function paintSavePill(text,state){
  document.querySelectorAll('.save-pill').forEach(el=>{el.hidden=false;el.textContent=text;el.dataset.state=state||''});
}
/* Server row is created only after a name and a phone, email, or address. "+ New job" alone stays on this device. */
function readyForServer(j){return !!(j&&(j._serverId||contactSufficient(j)))}
function warnFingerprint(warns){return (warns||[]).map(w=>w&&w.message?w.message:String(w||'')).join('\n')}
function ownerAcked(j,warns){
  if(!warns||!warns.length)return true;
  return !!(j&&j.sanityAck&&j.sanityAck.role==='owner'&&j.sanityAck.fingerprint===warnFingerprint(warns));
}
function refreshDraftMark(j){
  if(!j)return;
  const x=E.calculate(j,state.settings);
  const blocks=x.blockingIssues||[];
  const warns=(x.sanity&&x.sanity.warnings)||[];
  if(blocks.length||(warns.length&&!ownerAcked(j,warns)))j.draftMark='needs fixing';
  else if(j.draftMark==='needs fixing')j.draftMark='draft';
}
function issueGate(j){
  if(!j)return {ok:false,code:'blocked',message:'No job to issue.'};
  syncPrepIntoEngineFields(j);
  const x=E.calculate(j,state.settings);
  const blocks=x.blockingIssues||[];
  if(blocks.length)return {ok:false,code:'blocked',message:blocks[0].message,blocks,acked:false};
  const warns=(x.sanity&&x.sanity.warnings)||[];
  if(warns.length&&!ownerAcked(j,warns)){
    const tail=isOwner()?' Tap Looks right, continue.':' Employees cannot override a price warning.';
    return {ok:false,code:'warning',message:warns[0].message+tail,warnings:warns,acked:false};
  }
  return {ok:true,acked:warns.length>0,message:''};
}
function perSqftAcked(){
  const S=window.EsPriceSanity;
  if(!S)return true;
  const found=S.bookIssues(state.settings);
  if(!found.warnings.length)return true;
  if(found.blocks.length)return false;
  return state.perSqftAck===S.fingerprint(found.warnings);
}
function ackPerSqft(){
  const S=window.EsPriceSanity;
  if(!S||!isOwner())return;
  const found=S.bookIssues(state.settings);
  if(found.blocks.length){toast(found.blocks[0].message);return}
  state.perSqftAck=S.fingerprint(found.warnings);
  toast('Rate confirmed. You can save the price book.');
}
function save(opts){
  const j=activeJob();
  if(j){j.updatedAt=nowISO();syncPrepIntoEngineFields(j)}
  if(j&&opts&&opts.issue){
    const gate=issueGate(j);
    if(!gate.ok){
      j.draftMark='needs fixing';
      if(!opts.silent)toast(gate.message);
    }else{
      j.draftMark='issued';
      j.issuedAt=nowISO();
      if(!opts.silent)toast('Saved as issued.');
    }
  }else if(j)refreshDraftMark(j);
  if(authMode()){ // never write price book / owner settings to this device; server save via runtime hook
    if(readyForServer(j)&&runtime.onSave)runtime.onSave(j,opts||{});
    else paintSavePill('Saved','saved');
    return;
  }
  const payload={version:APP_VERSION,settings:state.settings,jobs:state.jobs,activeJobId:state.activeJobId,view:state.view,cloud:{enabled:false,status:'OFF — not configured'},savedAt:nowISO()};
  try{
    const text=JSON.stringify(payload);
    if(text.length>STORE_SOFT_LIMIT){
      $('saveStatus').textContent='Storage near limit — export backup; photos may not save';
      if(!(opts&&opts.silent))toast('Browser storage is near its limit. Export a full backup. Large photos may fail to persist.');
    }
    localStorage.setItem(STORAGE_KEY,text);
    $('saveStatus').textContent='Saved locally · Cloud OFF';
    paintSavePill('Saved','saved');
  }catch(err){
    $('saveStatus').textContent='Storage full — download a backup';
    toast('Could not autosave (browser storage full or blocked). Download a JSON backup now.');
  }
}
function contactSufficient(j){
  const name=(j.customer||j.company||'').trim();
  const phone=(j.phone||'').trim();
  const email=(j.email||'').trim();
  const addr=(j.address||'').trim();
  return !!(name && (phone||email||addr));
}
function stepStatus(j,stepId){
  const catalog=isCatalogJob(j);
  const hasCatalogItems=(j.catalogItems||[]).length>0;
  const garagePkg=j.projectType==='garage'&&!E.garageUsesMeasured(j);
  switch(stepId){
    case'contact':return contactSufficient(j)?'done':(j.customer||j.company||j.phone||j.email||j.address?'active':'todo');
    case'areas':
      if(garagePkg)return j.garagePackage?'done':'todo';
      if(j.projectType==='flatwork'||j.projectType==='seating')return hasCatalogItems?'done':'todo';
      return j.areas.some(a=>computeAreaSqft(a)>0)?'done':'todo';
    case'prep':
      if(catalog)return (j.notes||j.jobConcerns)?'done':'todo';
      return j.areas.some(a=>a.conditionRating&&a.conditionRating!=='unknown')||j.areas.some(a=>Object.values(a.prep||{}).some(v=>v===true))?'done':'todo';
    case'selections':
      if(catalog)return true;
      return j.areas.some(a=>a.style)?'done':'todo';
    case'pricing':return true;
    case'review':
      if(catalog)return contactSufficient(j)&&(garagePkg||hasCatalogItems)?'done':'todo';
      return contactSufficient(j)&&j.areas.some(a=>computeAreaSqft(a)>0)?'done':'todo';
    default:return'todo';
  }
}
function getPath(path){
  const keys=path.split('.');let o=state;
  if(keys[0]==='job'){o=activeJob();keys.shift()}
  for(const k of keys){if(o==null)return'';o=o[k]}
  return o;
}
function setPath(path,value){
  const keys=path.split('.');let o=state;
  if(keys[0]==='job'){o=activeJob();keys.shift()}
  for(const k of keys.slice(0,-1))o=o[k];
  o[keys.at(-1)]=value;
}
let toastTimer;
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3800)}
function field(label,path,type='text',help='',attrs=''){
  const v=getPath(path);
  let num='';
  if(type==='number'){
    if(!/(^|\s)min=/.test(attrs))num+='min="0" ';
    if(!/(^|\s)step=/.test(attrs))num+='step="any" ';
  }
  return `<div class="field"><label for="f-${escape(path)}">${label}</label><input id="f-${escape(path)}" data-path="${escape(path)}" type="${type}" value="${escape(v)}" ${num}${attrs}>${help?`<small>${help}</small>`:''}</div>`;
}
function normalTierRate(a){
  const j=activeJob();
  const style=['solid','flake','metallic','sealer','level'].includes(a.style)?a.style:'solid';
  const book=state.settings.rates||{};
  const opt=j&&j.priceOption&&j.priceOption!=='regular'&&state.settings.pricingOptions?state.settings.pricingOptions[j.priceOption]:null;
  const tier=opt&&opt.rates&&opt.rates[style]!=null&&opt.rates[style]!==''?E.n(opt.rates[style]):null;
  const base=tier==null?E.n(book[style]):tier;
  if(style==='level')return base*(Math.min(E.n(a.depth),2)/0.25);
  return base;
}
function areaUpgrade(a){
  const book=state.settings.rates||{};
  const style=['solid','flake','metallic','sealer','level'].includes(a.style)?a.style:'solid';
  let extra=0,label='';
  if(style==='solid'){extra=Math.max(0,E.n(a.coats)-1)*E.n(book.extraCoat!=null?book.extraCoat:1.5);label='Additional solid base coat(s)';}
  if(style==='flake'&&a.flake==='full'){extra=E.n(book.fullFlakeExtra!=null?book.fullFlakeExtra:1);label='Full-broadcast flake upgrade';}
  if(style==='flake'&&a.flake==='medium'){extra=E.n(book.mediumFlakeExtra!=null?book.mediumFlakeExtra:0.5);label='Medium-broadcast flake upgrade';}
  return {extra,label};
}
function rateOverrideField(a,base){
  const path=base+'.rate';
  const v=getPath(path);
  const normal=normalTierRate(a);
  const S=window.EsPriceSanity;
  const problem=S?S.customRateProblem(a):null;
  return `<div class="field rate-override"><label for="f-${escape(path)}">Override $/sq ft (optional)</label>
    <div class="rate-row"><input id="f-${escape(path)}" data-path="${escape(path)}" type="number" inputmode="decimal" min="3" max="20" step="0.01" value="${escape(v)}">
    <span class="rate-hint">Finish rate ${cash(normal)} / sq ft</span></div>
    ${(()=>{const up=areaUpgrade(a);if(!(up.extra>0))return '';const sf=computeAreaSqft(a);return `<p class="method-note">${escape(up.label)}: ${cash(up.extra)} / sq ft${sf?' · '+cash(sf*up.extra)+' on this area':''}. Separate line, so the finish rate × sq ft equals the finish amount.</p>`;})()}
    <small>Leave blank to use that rate. Allowed override is $3–$20 per sq ft. Flake and extra-coat upgrades stay on top of the tier and show as their own line.</small>
    ${problem?`<p class="warn-banner rate-error" role="alert">${escape(problem.message)}</p>`:''}
  </div>`;
}
function bookIssuesHTML(){
  const S=window.EsPriceSanity;
  if(!S||!isOwner())return '';
  const found=S.bookIssues(state.settings);
  if(!found.blocks.length&&!found.warnings.length)return '';
  const rows=[...found.blocks,...found.warnings].map(i=>escape(i.message)).join('<br>');
  const btn=found.warnings.length&&!found.blocks.length&&!perSqftAcked()?'<button type="button" class="button secondary" id="ackPerSqft">Looks right, continue</button>':'';
  return `<div class="${found.blocks.length?'warn-banner':'notice'}" role="alert">${rows}</div>${btn}`;
}
function select(label,path,options,help=''){
  return `<div class="field"><label for="f-${escape(path)}">${label}</label><select id="f-${escape(path)}" data-path="${escape(path)}">${options.map(([v,t])=>`<option value="${escape(v)}" ${String(getPath(path))===String(v)?'selected':''}>${escape(t)}</option>`).join('')}</select>${help?`<small>${help}</small>`:''}</div>`;
}
function textArea(label,path,help=''){return `<div class="field full"><label for="f-${escape(path)}">${label}</label><textarea id="f-${escape(path)}" data-path="${escape(path)}">${escape(getPath(path))}</textarea>${help?`<small>${help}</small>`:''}</div>`}
function checkbox(label,path){return `<label class="check-label"><input type="checkbox" data-path="${escape(path)}" ${getPath(path)?'checked':''}>${label}</label>`}
function cardHead(n,title,sub='',right=''){return `<div class="card-head"><span class="step">${n}</span><div><h3>${title}</h3>${sub?`<div class="sub">${sub}</div>`:''}</div>${right?`<div class="right">${right}</div>`:''}</div>`}
function heading(eyebrow,title,sub,action=''){return `<div class="page-head"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${sub}</p></div>${action}</div>`}

const STEP_NAMES={contact:'Contact',areas:'Areas',prep:'Prep',selections:'System',pricing:'Pricing',review:'Review'};
function wizardRail(j){
  const idx=Math.max(0,STEPS.findIndex(s=>s.id===j.step));
  const pct=Math.round(((idx+1)/STEPS.length)*100);
  const name=STEP_NAMES[j.step]||STEPS[idx].label;
  const kicker='Step '+(idx+1)+' of '+STEPS.length+' · '+name;
  return `<div class="wizard-progress"><p class="wizard-kicker" id="wizardKicker">${escape(kicker)}</p>
  <div class="progress-bar" role="progressbar" aria-valuenow="${idx+1}" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuetext="${escape(kicker)}" aria-label="${escape(kicker)}"><i style="width:${pct}%"></i></div>
  <div class="wizard-rail" role="tablist" aria-label="Guided steps">${STEPS.map((s)=>{
    const st=stepStatus(j,s.id);const active=j.step===s.id;
    return `<button type="button" class="wizard-step ${active?'active':''} ${st==='done'?'done':''}" data-step="${s.id}" role="tab" aria-selected="${active}"><span class="n">${s.short}</span><span class="lbl">${escape(STEP_NAMES[s.id]||s.label)}</span></button>`;
  }).join('')}</div></div>`;
}
function navFooter(j){
  const idx=STEPS.findIndex(s=>s.id===j.step);
  const prev=idx>0?STEPS[idx-1].id:null;
  const next=idx<STEPS.length-1?STEPS[idx+1].id:null;
  const nextName=next?(STEP_NAMES[next]||STEPS[idx+1].label):'';
  return `<div class="nav-footer">
    <button type="button" class="button secondary" data-step="${prev||''}" ${prev?'':'disabled'}>Back</button>
    <span class="save-pill" id="savePill" data-state="saved">Saved</span>
    ${next?`<button type="button" class="button" data-step="${next}">Next: ${escape(nextName)}</button>`:`<button type="button" class="button" data-view="customer">Open customer document</button>`}
  </div>`;
}
function jobListHTML(){
  const show=boardFilters().showArchived;
  const jobs=state.jobs.filter(j=>show||boardStatus(j)!=='archived');
  return `<div class="job-switcher">${jobs.map(j=>`<button type="button" class="job-chip ${j.id===state.activeJobId?'active':''}" data-switch-job="${j.id}"><b>${escape(j.customer||j.company||'Untitled lead')}${j.isSample?' · ILLUSTRATIVE SAMPLE':''}</b><small>${escape(j.address||'No address')} · ${escape(j.number)} · updated ${escape((j.updatedAt||'').slice(0,10))}</small></button>`).join('')}</div>`;
}
function syncDiscountApproval(j){
  if(!j)return;
  j.discount=0;
  if(authMode()){j.discountApproval=null;return;}
  const DA=window.EsDiscountApproval;const store=discountStore();
  const DC=window.EsDiscountClient;
  if(!DA||!store||!j.discountApprovalId||(DC&&DC.isServerApprovalId(j.discountApprovalId))){j.discountApproval=null;return;}
  const bare=Object.assign({},j,{discount:0,discountApproval:null});
  const before=E.calculate(bare,state.settings);
  const revision=DA.revisionOf(j,before.total);
  const checked=store.check({id:j.discountApprovalId,estimateId:j.id,revision,tier:j.priceOption||'regular',beforeTotal:before.total,markStale:false});
  j.discountApproval=checked.ok?{ok:true,amount:checked.amount,tier:checked.request&&checked.request.tier}:null;
}
async function requestExtraDiscount(){
  const j=activeJob();
  j.discountApproval=null;j.discount=0;
  const amount=j.discountRequestAmount;
  const percent=j.discountRequestPercent;
  const blankAmount=amount===''||amount==null;
  const blankPercent=percent===''||percent==null;
  if(authMode()){
    const DC=window.EsDiscountClient;
    const res=await DC.requestDiscount(runtime.discountCall,{
      serverId:j._serverId,jobData:quoteInput(j),
      amount:blankAmount?null:amount,percent:blankPercent?null:percent,reason:j.discountRequestReason
    });
    if(!res.ok){toast(res.error);return;}
    j.discountApprovalId=res.id;
    j.discountServerStatus='pending';
    j.discountServerTier=res.tier||j.priceOption||'regular';
    j.discountServerAmount=res.request&&res.request.amount;
    toast('Request recorded on the server. The customer total stays the same until the owner approves.');
    render();
    return;
  }
  const DA=window.EsDiscountApproval;const store=discountStore();
  if(!DA||!store){toast('Approval tools are not loaded');return;}
  const before=E.calculate(j,state.settings);
  const revision=DA.revisionOf(j,before.total);
  const res=store.request({id:'offline-preview',role:'employee'},{
    estimateId:j.id,revision,tier:j.priceOption||'regular',beforeTotal:before.total,
    amount:blankAmount?null:amount,percent:blankPercent?null:percent,reason:j.discountRequestReason
  });
  if(!res.ok){toast(res.error);return;}
  j.discountApprovalId=res.request.id;
  j.discountServerStatus='pending';
  toast('Offline preview only. This is not a server approval and cannot be finalized.');
  render();
}
async function decideExtraDiscount(decision){
  const j=activeJob();
  if(authMode()){
    if(!isOwner()){toast('Only the owner can approve or reject. The price was not changed.');return;}
    const DC=window.EsDiscountClient;
    const res=await DC.decideDiscount(runtime.discountCall,{id:j.discountApprovalId,serverId:j._serverId,decision});
    if(!res.ok){toast(res.error);j.discountApproval=null;return;}
    j.discountServerStatus=res.status;
    j.discountApproval=null;
    toast(res.status==='approved'?'Approved on the server for this revision and tier.':'Rejected. The customer total is unchanged.');
    if(runtime.requestPreview)runtime.requestPreview(j,quoteKey(j),true);
    render();
    return;
  }
  toast('Offline preview cannot approve a discount. The price was not changed.');
}
function calcLocal(){const j=ensureJob();syncPrepIntoEngineFields(j);syncDiscountApproval(j);return E.calculate(j,state.settings);}
const SERVER_FIELDS=['sqft','finished','levelArea','levelEquiv','lines','base','regularBase','discountable','discountSqft','choices','selected','addOn','discount','minimum','subtotal','salesTax','total','perSqft','balance','finalizedBlocked','personHours','hours','travelMiles','warnings','quoteReady','quoteStatus','pendingReasons'];
const COST_FIELDS=['cost','profit','margin','mat','tax','labor','equip','overhead','overheadBase','contingency','travelCost','travelInQuote','direct','grossProfit','grossMargin','operatingProfit','operatingMargin'];
function stripCosts(x){
  const y=Object.assign({},x);
  for(const k of COST_FIELDS)if(k in y)y[k]=0;
  y.travel=Object.assign({},x.travel||{},{rate:0,mileage:0,crewTravel:0});
  y.material=(x.material||[]).map(m=>Object.assign({},m,{unitPrice:0,total:0}));
  y.equipment=(x.equipment||[]).map(m=>Object.assign({},m,{unitPrice:0,total:0}));
  y.lines=(x.lines||[]).filter(l=>!['mileage','travel','equipment','overhead','equip'].includes(l.kind||''));
  return y;
}
function overlayServer(x,s){
  const y=stripCosts(x);
  for(const k of SERVER_FIELDS)if(s[k]!==undefined)y[k]=clone(s[k]);
  if(s.catalog)y.catalog=Object.assign({},x.catalog||{},clone(s.catalog));
  y._server=s;
  return y;
}
/** Employee (auth): totals come from the server quote for this exact job input. Until it arrives, mark Pending. */
function calc(){
  const x=calcLocal();
  if(!authMode())return x;
  const j=activeJob();const key=quoteKey(j);const sq=j&&serverQuotes[j.id];
  const needsServer=!isOwner()||!!(j&&j.discountApprovalId);
  if(!needsServer)return x;
  if(sq&&sq.key===key)return overlayServer(x,sq.staff);
  if(isOwner()){if(runtime.requestPreview)runtime.requestPreview(j,key);return x;}
  const y=stripCosts(x);
  y._serverPending=true;y.quoteReady=false;y.quoteStatus='pending';
  y.pendingReasons=['Server price check pending — totals are verified by the server before they can be shared.'].concat(x.pendingReasons||[]);
  if(runtime.requestPreview)runtime.requestPreview(j,key);
  return y;
}
function setServerQuote(jobId,key,staff){serverQuotes[jobId]={key,staff,at:Date.now()}}
function summaryHTML(){
  const j=activeJob(),x=calc(),owner=isOwner();
  const warnShow=(x.warnings||[]).filter(w=>!/below the estimated job cost|margin|profit/i.test(w));
  const alloc=quoteAllocation(x);
  const adjCap=approvedAdjustmentCap(x);
  const workerMini=`<div class="cost-mini"><span class="eyebrow">FIELD REVIEW · APPROVED PRICES</span>
  <p class="summary-note" style="margin:0 0 8px">Review scope, schedule and approved payment options. Planned hours and Materials/Labor are <b>selling-price</b> totals (markup included) — not raw cost or margin.</p>
  <div class="summary-row"><span>Planned work hours</span><strong>${num(alloc.personHours,2)} person-hr</strong></div>
  <div class="summary-row"><span>Materials (price)</span><strong>${cash(alloc.materials)}</strong></div>
  <div class="summary-row"><span>Labor (price)</span><strong>${cash(alloc.labor)}</strong></div>
  <div class="summary-row"><span>Other included (price)</span><strong>${cash(alloc.other)}</strong></div>
  <div class="summary-row"><span>Approved adjustment limit</span><strong>${adjCap?cash(adjCap):'$0'}</strong></div>
  <div class="summary-row"><span>Applied adjustment</span><strong>${cash(E.n(j.discount))}</strong></div>
  <button class="button secondary small" data-view="internal">Field plan / travel →</button></div>`;
  const blocked=(x.blockingIssues||[]).length>0;
  const catalogPending=isCatalogJob(j)&&!x.quoteReady&&!blocked;
  const floorIncomplete=!isCatalogJob(j)&&!x.sqft;
  const pending=catalogPending;
  const typeLabel={floor:'Measured floors',garage:'Garage',flatwork:'Tables / counters / bars',seating:'Chairs / stools'}[j.projectType]||j.projectType;
  const totalBlock=catalogPending
    ?`<div class="big-total pending-total">Pending</div><div class="per-sqft">Starting price needed · not a finalized quote</div>`
    :floorIncomplete
      ?`<div class="big-total">${cash(x.total)}</div><div class="per-sqft">Add measurements to calculate</div>`
      :`<div class="big-total">${cash(x.total)}</div><div class="per-sqft">${x.sqft?cash(x.perSqft)+' / sq ft · '+num(x.sqft)+' sq ft total':(x.catalog?escape(x.catalog.startingLabel||'Catalog package'):'')}</div>`;
  const warns=(x.sanity&&x.sanity.warnings)||[];
  const continueBtn=isOwner()&&warns.length&&!blocked&&!ownerAcked(j,warns)?'<button type="button" class="button secondary" id="sanityContinue">Looks right, continue</button>':'';
  const employeeNote=!isOwner()&&warns.length&&!ownerAcked(j,warns)?'<p class="method-note">Employees cannot override a price warning.</p>':'';
  const mark=j.draftMark==='needs fixing'?' · NEEDS FIXING':(j.draftMark==='issued'?' · ISSUED':'');
  return `<div class="quote-summary"><span class="summary-label">${blocked?'QUOTE STATUS · NEEDS FIXING':catalogPending?'QUOTE STATUS · PENDING':'CUSTOMER ESTIMATE'}${mark}</span>${totalBlock}<div class="summary-rule"></div>
  ${blocked?priceNeededBanner(x):''}
  ${continueBtn}${employeeNote}
  ${catalogPending?priceNeededBanner(x):''}
  ${[['Project type',escape(typeLabel)],['Price',escape(x.selected.short)],...(x.selected.key!=='regular'&&!pending?[['Below the regular full total',cash(x.selected.savings)+' ('+num(x.selected.savingsPct)+'% of that full total)']]:[]),['Property add-in',x.addOn.included?cash(x.addOn.total)+' @ '+cash(x.addOn.rate)+'/sq ft':'Not included'],['Areas / items',isCatalogJob(j)?String((j.catalogItems||[]).length||(j.projectType==='garage'?1:0)):j.areas.length],['Moisture areas',String((moistureSelectedAreas(j).items||[]).length)],['Cloud','OFF']].map(([k,v])=>`<div class="summary-row"><span>${k}</span><strong>${v}</strong></div>`).join('')}
  <p class="summary-note">${pending?'Unconfigured catalog jobs stay pending — never show a misleading $0 final as if priced.':'Quoted total is a blended customer price. Travel/mobilization (when calculated) is included in the total — not shown as a separate customer line.'}</p>
  <button class="button lime" data-step="review">Review & export ↗</button>
  <p class="summary-note">${owner?'Internal cost and margin are owner-only and never appear on customer or subcontractor documents by default.':'Internal cost, margin, and profit stay owner-only. Worker preview shows approved prices and operational review only.'}</p></div>
  ${owner?'':workerMini}
  ${authMode()?`<div class="cloud-badge on" style="margin-top:8px">SERVER ${escape(runtime.syncStatus||'connected')}</div>`:`<div class="cloud-badge off" style="margin-top:8px">CLOUD SYNC ${escape(state.cloud.status)}</div>`}
  ${warnShow.length?`<div class="notice ${owner&&x.profit<0?'error':''}">${warnShow.map(escape).join('<br/><br/>')}</div>`:''}
  <div class="notice">${authMode()?'Job data is saved to your Exotic Splash server account. Photos are stored with the job (large photos increase save time).':'Photos and job data stay in this browser. LocalStorage is limited (~5 MB typical). Export JSON backups regularly. Cloud backup is not configured.'}</div>`;
}
/** Image source for a photo: base64 on this device, or a signed Storage URL supplied by the signed-in runtime. */
function photoSrc(p){
  if(authMode()&&runtime.photoSrc)return runtime.photoSrc(p)||'';
  return (p&&p.dataUrl)||'';
}
function photoGrid(photos, areaId, bucket){
  const items=(photos||[]).map(p=>{const src=photoSrc(p);
    const img=src?`<img src="${src}" alt="${escape(p.name||'Photo')}">`:`<div class="photo-loading">${p.storagePath?'Loading photo…':'No image'}</div>`;
    return `<div class="photo-card"><button type="button" class="x" data-del-photo="${escape(p.id)}" data-area="${escape(areaId)}" data-bucket="${escape(bucket)}" aria-label="Remove photo">×</button>${img}<div class="meta">${escape(p.name||'Photo')}<br/>${bytesLabel(p.size||0)} · reference only${p.storagePath?' · stored':''}</div></div>`}).join('');
  return `<div class="photo-grid">${items}<label class="photo-add">+ Add photo reference<input type="file" accept="image/*" hidden data-add-photo data-area="${escape(areaId)}" data-bucket="${escape(bucket)}"></label></div>
  <small class="route-disclosure">Photos are reference only. Enter known wall measurements yourself — this prototype does not auto-measure, diagnose slabs, or use LiDAR/AI. Large images are resized; oversized files show a warning instead of pretending to save.</small>`;
}
function areaMoistureHTML(a,i){
  const base='job.areas.'+i;
  const sf=computeAreaSqft(a);
  const rate=E.n(state.settings.rates.moisture);
  const charge=(a.moisture&&a.style!=='level'&&sf)?sf*rate:0;
  return `<div class="moisture-panel area-moisture ${a.moisture?'on':''}">
    <div class="moisture-head"><span class="eyebrow">OPTIONAL — THIS AREA ONLY · DEFAULT OFF</span>
      <h4>Moisture-control primer / barrier</h4>
      <p class="hint">A moisture barrier is a coating that slows water vapor rising through the concrete. Leave it off unless this slab needs it. It is not a repair for a leak.</p>
      <div class="moisture-price">${cash(rate)} / sq ft · this area est. <b>${cash(charge)}</b>${a.style==='level'?' (level-only: no moisture charge)':''}</div>
    </div>
    <label class="check-item ${a.moisture?'active':''}"><input type="checkbox" data-path="${base}.moisture" ${a.moisture?'checked':''}><div><b>Include moisture-control primer / barrier on this area</b><div class="hint">Off means this area is not charged. On charges only this area’s finished sq ft.</div></div></label>
    <details class="more-options"><summary>More about this option</summary><div class="detail-body">
    <p><b>Why it may be needed:</b> some slabs show elevated moisture vapor or the manufacturer system requires a moisture-oriented primer/barrier. Selecting it helps manage vapor transmission risk so a <b>compatible</b> coating system can perform as intended when testing, site inspection, or manufacturer requirements call for it.</p>
    <p><b>Benefit:</b> adds a deliberate moisture-control layer under the finish on <b>this area’s square footage only</b> — charged at the rate-book allowance when checked.</p>
    <p>It is <b>not</b> a cure-all for every moisture problem, <b>not</b> a substitute for diagnosing source / structural / plumbing issues, and <b>not</b> inferred from photos alone. Exact product and acceptance criteria must be confirmed before work.</p>
    </div></details>
  </div>`;
}
function tapeGuideHTML(){
  return `<div class="tape-guide">
    <span class="eyebrow">TAPE MEASURE</span>
    <h4>How to measure this area</h4>
    <ol>
      <li>Measure <b>length</b> and <b>width</b> in <b>feet</b> with a tape measure (wall to wall of the floor section).</li>
      <li>For irregular rooms, split into rectangles — measure each section separately, then add them.</li>
      <li>Example: <b>20 ft × 15 ft = 300 sq ft</b>. Another bay 10 × 12 = 120 → total 420 sq ft.</li>
      <li>Deduct / exclude stairs, islands, or non-floor openings manually if they should not be coated.</li>
      <li>Photos next to measurements are for estimate reference only — they do not auto-measure.</li>
    </ol>
  </div>`;
}
function areaNameInput(a,path){
  const raw=String(a.name||'');
  const generic=!raw.trim()||/^floor area( \d+)?$/i.test(raw.trim());
  const placeholder=generic?(raw.trim()||'e.g. Garage floor'):'e.g. Garage floor';
  const value=generic?'':raw;
  return `<div class="field"><label for="f-${escape(path)}">Area name</label><input id="f-${escape(path)}" data-path="${escape(path)}" type="text" value="${escape(value)}" placeholder="${escape(placeholder)}" autocomplete="off"><small>Shown on the estimate. The gray text is only a suggestion.</small></div>`;
}
function areaMeasureHTML(a,i){
  const base='job.areas.'+i;
  const sqft=computeAreaSqft(a);
  const rects=(a.rectangles||[{length:0,width:0}]).map((r,ri)=>`<div class="rect-row">
    <div class="field"><label>Length (ft)</label><input data-path="${base}.rectangles.${ri}.length" type="number" min="0" step="any" inputmode="decimal" value="${escape(r.length)}"></div>
    <div class="field"><label>Width (ft)</label><input data-path="${base}.rectangles.${ri}.width" type="number" min="0" step="any" inputmode="decimal" value="${escape(r.width)}"></div>
    <div class="rect-prod">${num((Number(r.length)||0)*(Number(r.width)||0),1)} sq ft</div>
    <button type="button" class="quiet" data-del-rect="${ri}" data-area-index="${i}" ${a.rectangles.length<=1?'disabled':''} aria-label="Remove section">×</button>
  </div>`).join('');
  return `<section class="area" data-area-id="${escape(a.id)}">
    <div class="area-top"><span class="area-badge">AREA ${String(i+1).padStart(2,'0')}</span>
      ${activeJob().areas.length>1?`<button class="remove" data-remove-area="${i}" aria-label="Remove area">×</button>`:''}
    </div>
    <p class="hint">Measure in feet, wall to wall. For a rectangle, enter length and width. For an odd room, add a section for each bay and the sizes add up.</p>
    <div class="fields">${areaNameInput(a,base+'.name')}${select('How to enter size',base+'.sqftMode',[['manual','Enter total sq ft'],['rectangles','Length × width sections']])}</div>
    ${a.sqftMode==='rectangles'?`<div class="measure-block"><p class="hint">One row per bay or alcove.</p>${rects}<button type="button" class="quiet" data-add-rect="${i}">+ Add section</button><p class="method-note">Area total: <b>${num(sqft,2)} sq ft</b></p></div>`
      :`<div class="fields">${field('Square feet',base+'.sqft','number','Total measured floor area for this named space.'+(computeAreaSqft(a)>20000?' Square inches? Divide by 144.':''),'step="1" inputmode="decimal"')}</div>`}
    <details class="more-options"><summary>More options</summary><div class="detail-body">
      ${tapeGuideHTML()}
      ${areaMoistureHTML(a,i)}
      <h4>Area photos (estimate reference)</h4>
      <p class="hint">Photos are for the estimate only. They do not measure the room.</p>
      ${photoGrid(a.photos,a.id,'photos')}
    </div></details>
  </section>`;
}

function isCatalogJob(j){const t=E.projectTypeOf(j);return t==='flatwork'||t==='seating'||(t==='garage'&&!E.garageUsesMeasured(j))}
function isMeasuredFloorLike(j){return !isCatalogJob(j)}
function priceNeededBanner(x){
  const blocks=x&&x.blockingIssues||[];
  if(blocks.length){
    return `<div class="warn-banner" role="alert"><b>Price needs fixing</b><ul>${blocks.map(b=>'<li>'+escape(b.message)+'</li>').join('')}</ul></div>`;
  }
  if(!x||x.quoteReady)return '';
  const reasons=(x.pendingReasons||x.warnings||[]).filter(w=>/Starting price needed|Unknown|pending|unconfigured|Quote pending/i.test(w));
  const list=(reasons.length?reasons:(x.warnings||[])).slice(0,8);
  return `<div class="warn-banner price-needed" role="alert"><b>Starting price needed — quote pending</b><br/>This is <b>not</b> a finalized customer price. Configure the price-book fields listed in PRICE_INPUTS_REQUIRED, then re-check.<ul>${list.map(escape).map(s=>'<li>'+s+'</li>').join('')}</ul></div>`;
}
function catalogTotalHTML(x){
  if(x&&x.quoteReady)return cash(x.total);
  return `<span class="pending-total">Pending</span>`;
}
function projectTypePickerHTML(j){
  const types=[
    ['floor','Measured floors','Guided tape measure / prep / per-area moisture'],
    ['garage','Garage packages','1 / 2 / 3-car starting packages, or measured >3-car'],
    ['flatwork','Tables / countertops / bars','Size-based starting price + condition/material/topcoat'],
    ['seating','Chairs / stools','Quantity × per-item starting price + adjustments']
  ];
  return `<div class="project-type-grid">${types.map(([id,label,help])=>`<button type="button" class="project-type-card ${j.projectType===id?'active':''}" data-project-type="${id}" aria-pressed="${j.projectType===id}"><span class="opt-name">${escape(label)}</span><span class="opt-meta">${escape(help)}</span></button>`).join('')}</div>`;
}
function optionalExtrasHTML(j,base){
  const ex=j.extras||{};
  const root=base+'.extras';
  return `<details class="more-options"><summary>Optional extras</summary><div class="detail-body">
    <p class="method-note">Off until you enter a quantity or check a box. These lines stay at their own prices on every tier. Rush and weekend add together; they do not multiply. Moisture primer stays $4/sq ft and self-leveling stays $6/sq ft at 1/4 inch.</p>
    <div class="fields three">
      ${field('Solid stairs (steps)',root+'.stairsSolid','number','$85 per step')}
      ${field('Flake stairs (steps)',root+'.stairsFlake','number','$110 per step')}
      ${field('Stem walls / cove (ft)',root+'.stemWallLf','number','$9 per linear ft')}
      ${field('Countertop / bar (sq ft)',root+'.countertopSqft','number','$45 solid or $65 metallic, $900 minimum')}
      ${select('Countertop system',root+'.countertopStyle',[['solid','Solid — $45/sq ft'],['metallic','Metallic — $65/sq ft']])}
      ${field('Moving (hours, 2 people)',root+'.movingHours','number','$150 per hour')}
      ${field('Winter heat (days)',root+'.winterHeatDays','number','$250 per day')}
      ${field('Extra site visits',root+'.extraVisits','number','$125 each')}
      ${select('Warranty',root+'.warrantyYears',[[1,'1 year included'],[3,'3 years — add 4% of this tier']])}
    </div>
    <div class="area-options">
      ${checkbox('Travel charge past 25 miles ($2.50/mile each way)',root+'.travel')}
      ${checkbox('Fuel and vehicle wear ($0.65/mile round trip)',root+'.fuel')}
      ${checkbox('Per-job consumables ($150)',root+'.consumables')}
      ${checkbox('Rush — within 7 days (+10%)',root+'.rush')}
      ${checkbox('Weekend (+15%)',root+'.weekend')}
    </div>
    ${ex.crackLf?field('Job crack length if not entered on an area (ft)',root+'.crackLf','number'):''}
  </div></details>`;
}
function garagePackageHTML(j){
  const pkgs=[['1car','1-car package'],['2car','2-car package'],['3car','3-car package'],['measured','>3-car / measured sq ft']];
  const cat=(state.settings.catalog&&state.settings.catalog.garage)||{};
  const startFor=p=>{
    const key=p==='1car'?'oneCar':p==='2car'?'twoCar':p==='3car'?'threeCar':null;
    if(!key)return 'Uses floor sq ft rates';
    const tier=j.priceOption||'regular';
    const style=j.garageStyle||'flake';
    const table=state.settings.garage&&state.settings.garage.packages;
    const cell=table&&table[tier]&&table[tier][style]&&table[tier][style][key];
    if(E.isConfigured(cell))return cash(Number(cell))+' package';
    const opt=j.priceOption&&j.priceOption!=='regular'&&state.settings.pricingOptions&&state.settings.pricingOptions[j.priceOption];
    const flakeRate=opt&&opt.rates&&opt.rates.flake!=null&&opt.rates.flake!==''?E.n(opt.rates.flake):E.n((state.settings.rates||{}).flake);
    const sf=E.n((cat.packageSqft&&cat.packageSqft[key])||(E.defaults.catalog.garage.packageSqft||{})[key]);
    return sf&&flakeRate?cash(flakeRate*sf)+' base':'Starting price needed';
  };
  return `<div class="fields">${pkgs.map(([id,label])=>'').join('')}
    <div class="finish-picker" role="group">${pkgs.map(([id,label])=>`<button type="button" class="finish-choice ${j.garagePackage===id?'active':''}" data-garage-package="${id}" aria-pressed="${j.garagePackage===id}"><b>${escape(label)}</b><small style="display:block;margin-top:4px;font-size:10px;color:var(--muted)">${escape(startFor(id))}</small></button>`).join('')}</div>
    ${j.garagePackage!=='measured'?`${(cat.disclaimer||'').trim()?`<div class="warn-banner"><b>Garage package baseline:</b> ${escape(cat.disclaimer.trim())}</div>`:''}<div class="notice">Package price comes from the tier, system, and size table (1-car 250 sq ft, 2-car 450 sq ft, 3-car 650 sq ft). Square feet above that size use that tier’s per-sq-ft rate for the chosen system. The solid credit is not subtracted when the table has a price. A solid package under 500 sq ft is at least $2,750 in every tier, so 1-car solid Option 1 is $2,750. The $2,000 job minimum still applies.</div>
      <div class="fields">${field('Measured sq ft','job.areas.0.sqft','number','Leave blank to price the typical size only. Square feet above 250 / 450 / 650 use the tier rate.','step="1"')}</div>
      <div class="fields three">
        ${select('Material / system','job.garageStyle',[['solid','Solid'],['flake','Flake'],['metallic','Metallic'],['sealer','Clear seal — use measured sq ft'],['custom','Custom — inspection / override']])}
        ${select('Topcoat','job.garageTopcoat',[['protective','Protective (standard)'],['none','None noted'],['premium','Premium / upgraded']])}
        ${select('Concrete condition','job.garageCondition',[['unknown','Unknown / not inspected'],['good','Good'],['fair','Fair'],['poor','Poor'],['critical','Critical'],['sound','Sound / bare'],['paint','Paint / coating present'],['adhesive','Adhesive residue']])}
      </div>
      <p class="hint">Spalling means the concrete surface is flaking or crumbling.</p>
      <div class="checklist">${[['cracks','Cracks / joints'],['spalling','Poor slab / spalling'],['coatingRemoval','Coating removal'],['paintRemoval','Paint removal'],['patching','Patching'],['leveling','Leveling'],['moisture','Moisture barrier']].map(([k,l])=>{
        const on=!!(j.garagePrep&&j.garagePrep[k]);
        const hint=k==='leveling'?'Not a flat package price. Leveling on a package stays unfinished until it is measured by area and depth.':'Changes the price when that prep item has a price in the rate book.';
        return `<label class="check-item ${on?'active':''}"><input type="checkbox" data-path="job.garagePrep.${k}" ${on?'checked':''}><div><b>${escape(l)}</b><div class="hint">${hint}</div></div></label>`;
      }).join('')}</div>
      ${(j.garagePrep&&j.garagePrep.cracks)?field('Crack repair length (linear ft)','job.garagePrep.crackLf','number','$250 up to 10 ft, then $12 per ft.','step="1"'):''}
      ${optionalExtrasHTML(j,'job')}
      <p class="method-note">Photos / inspection notes: use Areas & Prep steps. Unknown condition never silently means $0. Coating, paint, adhesive, and poor slab use the actual measured sq ft, including overflow past the package size.</p>`
      :`<div class="notice"><b>>3-car / measured:</b> use the guided floor measurement workflow (tape / rectangles) and existing floor rate book. Flat 1/2/3-car starting prices do <b>not</b> apply.</div>`}`;
}
function flatworkItemsHTML(j){
  const items=j.catalogItems||[];
  const bands=((state.settings.catalog&&state.settings.catalog.flatwork&&state.settings.catalog.flatwork.sizeBands)||E.defaults.catalog.flatwork.sizeBands);
  return `<div class="notice">Capture length × width (ft). Starting price comes from the size-band price-book field (owner-configured). Brand guidance: countertops/tables are estimate-priced — no invented defaults.</div>
  ${items.map((it,i)=>{
    const base='job.catalogItems.'+i;
    const sf=E.n(it.sqft)||(E.n(it.length)*E.n(it.width));
    return `<section class="area"><div class="area-top"><span class="area-badge">ITEM ${String(i+1).padStart(2,'0')}</span>
      ${items.length>1?`<button class="remove" data-remove-catalog="${i}" aria-label="Remove item">×</button>`:''}</div>
      <div class="fields">
        ${field('Item name',base+'.name')}
        ${select('Kind',base+'.kind',[['countertop','Countertop'],['table','Table'],['bar','Bar top'],['other','Other flatwork']])}
        ${field('Length (ft)',base+'.length','number','','step="any" inputmode="decimal"')}
        ${field('Width (ft)',base+'.width','number','','step="any" inputmode="decimal"')}
        ${field('Sq ft (optional override)',base+'.sqft','number','Blank = length × width','step="any"')}
        ${select('Size band',base+'.sizeBand',[['',('Auto from sq ft')]].concat(bands.map(b=>[b.id,b.label+(E.isConfigured(b.starting)?' · '+cash(Number(b.starting)):' · Starting price needed')])))}

        ${select('Material / system',base+'.style',[['solid','Solid'],['flake','Flake'],['metallic','Metallic'],['sealer','Clear seal'],['custom','Custom']])}
        ${select('Topcoat',base+'.topcoat',[['protective','Protective'],['none','None'],['premium','Premium']])}
        ${select('Condition',base+'.condition',[['unknown','Unknown / not inspected'],['good','Good'],['fair','Fair'],['poor','Poor'],['critical','Critical']])}
        ${field('Item starting price override ($)',base+'.customStarting','number','Optional. Blank keeps the size-band price. A blank override is not a missing package price.','step="any"')}
      </div>
      <p class="method-note">Computed size: <b>${num(Number(sf)||0,2)}</b> sq ft (approx).</p>
      ${textArea('Notes / inspection',base+'.notes')}
    </section>`;
  }).join('')||'<div class="empty-state"><h3>No flatwork items yet</h3><p>Add a countertop, table, or bar.</p></div>'}
  <button class="add-area" id="addFlatItem">+ Add flatwork item</button>`;
}
function seatingItemsHTML(j){
  const items=j.catalogItems||[];
  const by=((state.settings.catalog&&state.settings.catalog.seating&&state.settings.catalog.seating.byType)||{});
  const tip=t=>E.isConfigured(by[t])?cash(Number(by[t])):'Starting price needed';
  return `<div class="notice">Set quantity and type. Per-item starting prices are owner price-book fields (no invented defaults).</div>
  ${items.map((it,i)=>{
    const base='job.catalogItems.'+i;
    return `<section class="area"><div class="area-top"><span class="area-badge">ITEM ${String(i+1).padStart(2,'0')}</span>
      ${items.length>1?`<button class="remove" data-remove-catalog="${i}" aria-label="Remove item">×</button>`:''}</div>
      <div class="fields">
        ${field('Item name',base+'.name')}
        ${select('Type',base+'.seatType',[['chair','Chair · '+tip('chair')],['stool','Stool · '+tip('stool')],['other','Other · '+tip('other')]])}
        ${field('Quantity',base+'.qty','number','','step="1"')}
        ${select('Material / system',base+'.style',[['solid','Solid'],['flake','Flake'],['metallic','Metallic'],['sealer','Clear seal'],['custom','Custom']])}
        ${select('Topcoat',base+'.topcoat',[['protective','Protective'],['none','None'],['premium','Premium']])}
        ${select('Condition',base+'.condition',[['unknown','Unknown / not inspected'],['good','Good'],['fair','Fair'],['poor','Poor'],['critical','Critical']])}
        ${field('Per-item starting override ($)',base+'.customStarting','number','Blank uses type price book','step="any"')}
      </div>
      ${textArea('Notes / inspection',base+'.notes')}
    </section>`;
  }).join('')||'<div class="empty-state"><h3>No seating items yet</h3><p>Add chairs, stools, or similar.</p></div>'}
  <button class="add-area" id="addSeatItem">+ Add seating item</button>`;
}
function catalogBreakdownDocHTML(x){
  if(!x||!x.catalog)return '';
  const c=x.catalog;
  const startRows=(c.startingLines||[]).map(a=>`<tr><td><b>${escape(a.label)}</b><small>${escape(a.description||'')}</small></td><td class="num">${num(a.qty)} ${escape(a.unit||'')}</td><td class="num">${cash(a.rate)}</td><td class="num">${cash(a.total)}</td></tr>`).join('');
  const adjRows=(c.adjustments||[]).map(a=>`<tr><td><b>${escape(a.label)}</b><small>${escape(a.description||'')}</small></td><td class="num">${num(a.qty)} ${escape(a.unit||'')}</td><td class="num">${cash(a.rate)}</td><td class="num">${cash(a.total)}</td></tr>`).join('');
  return `<div class="doc-terms"><h4>Starting price & adjustments</h4>
    <p>Customer-facing breakdown of the configured starting price and itemized adjustments (material/system, topcoat, condition/prep). Does not expose raw cost, profit, margin, employee pay, or markup %.</p></div>
    ${startRows?tableHTML(['Starting price','Qty','Rate','Amount'],[startRows]):'<p class="method-note">Starting price not yet configured.</p>'}
    ${adjRows?tableHTML(['Adjustment','Qty','Rate','Amount'],[adjRows]):'<p class="method-note">No priced adjustments (or adjustments still unconfigured).</p>'}
    <div class="doc-total"><div><span>Starting subtotal</span><span>${x.quoteReady?cash(c.startingTotal):'Pending'}</span></div>
    <div><span>Adjustments</span><span>${x.quoteReady?cash(c.adjTotal):'Pending'}</span></div>
    <div class="grand"><span>Final total ${x.quoteReady?'':' (pending)'}</span><span>${x.quoteReady?cash(x.total):'Pending — starting price needed'}</span></div></div>`;
}

function stepContact(j){
  return `<section class="card">${cardHead('01','Customer & lead','Name, then a phone, email, or the job address.')}
  ${j.isSample?`<div class="sample-banner"><b>ILLUSTRATIVE SAMPLE DATA</b> — fictional/demo content for training. Not a live customer record.</div>`:''}
  <div class="fields">${field('Customer name','job.customer','text','Who the quote is for')}${field('Phone','job.phone','tel','A phone, email, or the job address is enough, with the name')}${field('Email','job.email','email')}
  <div class="field full"><label for="f-job.address">Job address</label><input id="f-job.address" data-path="job.address" type="text" value="${escape(j.address)}" placeholder="Street, city, state" autocomplete="street-address"></div></div>
  ${contactSufficient(j)?`<div class="info-banner">This job is saved${authMode()?' to your account':''} for <b>${escape(j.customer||j.company||'this lead')}</b>.</div>`
    :`<div class="empty-state"><h3>Start with the customer</h3><p>Enter a name and at least one of phone, email, or job address. A server job is not created until then.</p></div>`}
  <div class="palette-block"><span class="eyebrow">PROJECT TYPE</span>
    <p class="hint">Floors use the tape-measure steps. Garage, counters, and seating use package prices set by the owner.</p>
    ${projectTypePickerHTML(j)}
  </div>
  <details class="more-options"><summary>More options</summary><div class="detail-body">
    <div class="fields">${field('Company','job.company')}${authMode()&&j._serverId?field('Document number','job.number','text','Assigned by the server when the job was first saved.','readonly'):field('Document number','job.number','text',authMode()?'Provisional — the server assigns the final number on first save.':'')}${field('Document date','job.date','date')}</div>
    <h4>Jobs on this device</h4>
    ${jobListHTML()}
    <div class="inline-actions">
      <button type="button" class="button secondary" id="newJobKeep">+ New job (keeps current)</button>
      <button type="button" class="button secondary" id="sampleIllustrative">Load illustrative sample</button>
    </div>
    <p class="route-disclosure">New job never erases another. Use Backup for a copy. Clearing this browser’s site data removes local jobs.</p>
  </div></details>
  </section>`;
}
function stepAreas(j){
  const moist=moistureSelectedAreas(j);
  const x=calc();
  if(j.projectType==='garage'){
    return `<section class="card">${cardHead('02','Garage package or measured size','1/2/3-car starting packages · >3-car measured')}
    ${priceNeededBanner(x)}
    ${garagePackageHTML(j)}
    ${E.garageUsesMeasured(j)?`<div class="divider"></div>
      <div class="notice">Measure the garage with a tape. Per-area moisture remains available (default OFF).</div>
      ${j._moistureLegacyReview&&j._moistureLegacyReview.needed?`<div class="warn-banner"><b>${escape(j._moistureLegacyReview.label)}</b> — ${escape(j._moistureLegacyReview.detail)}</div>`:''}
      <div id="areas">${j.areas.map(areaMeasureHTML).join('')}</div>
      <p class="method-note">Moisture selected on ${moist.items.length} area(s): <b>${num(moist.sqft)} sq ft</b> × ${cash(moist.rate)} = <b>${cash(moist.total)}</b></p>
      <button class="add-area" id="addArea">+ Add another floor area</button>
      <p class="method-note">Total measured: <b>${num(j.areas.reduce((s,a)=>s+computeAreaSqft(a),0),2)} sq ft</b></p>`:''}
    </section>`;
  }
  if(j.projectType==='flatwork'){
    return `<section class="card">${cardHead('02','Tables, countertops & bars','Dimensions · size band · photos')}
    ${priceNeededBanner(x)}
    ${flatworkItemsHTML(j)}
    </section>`;
  }
  if(j.projectType==='seating'){
    return `<section class="card">${cardHead('02','Chairs, stools & seating','Quantity · type · photos')}
    ${priceNeededBanner(x)}
    ${seatingItemsHTML(j)}
    </section>`;
  }
  return `<section class="card">${cardHead('02','Areas, measurements & photos','Size each floor. Photos and moisture barrier are optional.')}
  <p class="hint">Use a tape, in feet. Photos do not measure the room. The moisture barrier stays off until you turn it on for an area.</p>
  ${j._moistureLegacyReview&&j._moistureLegacyReview.needed?`<div class="warn-banner"><b>${escape(j._moistureLegacyReview.label)}</b> — ${escape(j._moistureLegacyReview.detail)}</div>`:''}
  <div id="areas">${j.areas.map(areaMeasureHTML).join('')}</div>
  <p class="method-note">Moisture selected on ${moist.items.length} area(s): <b>${num(moist.sqft)} sq ft</b> × ${cash(moist.rate)} = <b>${cash(moist.total)}</b></p>
  <button class="add-area" id="addArea">+ Add another floor area</button>
  <p class="method-note">Total measured: <b>${num(j.areas.reduce((s,a)=>s+computeAreaSqft(a),0),2)} sq ft</b></p>
  </section>`;
}
function moistureJobSummaryHTML(j){
  const m=moistureSelectedAreas(j);
  return `<div class="moisture-summary"><span class="eyebrow">MOISTURE CHARGE (PER AREA)</span>
    <p>Selected on <b>${m.items.length}</b> area(s) · <b>${num(m.sqft)} sq ft</b> × ${cash(m.rate)} = <b>${cash(m.total)}</b></p>
    ${m.items.length?`<ul>${m.items.map(it=>`<li>${escape(it.name)}: ${num(it.sqft)} sq ft → ${cash(it.total)}</li>`).join('')}</ul>`:'<p class="method-note">No areas selected — $0 moisture charge.</p>'}
  </div>`;
}
function stepPrep(j){
  if(isCatalogJob(j)){
    const x=calc();
    return `<section class="card">${cardHead('03','Inspection & notes','Condition already on catalog items / garage package')}
    ${priceNeededBanner(x)}
    <div class="notice"><b>Unknown condition never silently means $0.</b> Until you inspect and pick an explicit condition (or configure an unknown-condition adjustment in the price book), the quote stays pending. Photos are reference only.</div>
    ${textArea('Site notes / inspection','job.notes')}
    ${textArea('Job-level issues / concerns','job.jobConcerns')}
    <div class="divider"></div>
    <h4 style="margin:0 0 8px;font-size:13px">Change history (append-only)</h4>
    <div class="history-list">${(j.history||[]).slice().reverse().slice(0,30).map(h=>`<div><b>${escape(h.type)}</b> · ${escape((h.at||'').replace('T',' ').slice(0,19))} UTC<br/>${escape(h.summary)}${h.detail?' — '+escape(h.detail):''}</div>`).join('')||'<div class="empty-state">No history yet. Edits will appear here.</div>'}</div>
    </section>`;
  }
  return `<section class="card">${cardHead('03','Existing floor & preparation','Per-area moisture · condition · prep checklist · photos')}
  <div class="notice">Unknown / not inspected is distinct from “no problem.” Moisture-control primer is a <b>per-area</b> checkbox (default OFF). Prep items link to removal/patch/level allowances.</div>
  ${j._moistureLegacyReview&&j._moistureLegacyReview.needed?`<div class="warn-banner"><b>${escape(j._moistureLegacyReview.label)}</b> — ${escape(j._moistureLegacyReview.detail)}</div>`:''}
  ${moistureJobSummaryHTML(j)}
  ${j.areas.map((a,i)=>{
    const base='job.areas.'+i;
    return `<section class="area"><div class="area-top"><span class="area-badge">${escape(a.name||('Area '+(i+1)))}</span><small>${num(computeAreaSqft(a))} sq ft</small></div>
      ${areaMoistureHTML(a,i)}
      <label class="field-label">Condition rating</label>
      <div class="rating-row" style="margin:8px 0 14px">${CONDITION_RATINGS.map(r=>`<button type="button" class="rating-btn ${a.conditionRating===r.id?'active':''}" data-rating="${r.id}" data-area-index="${i}">${escape(r.label)}</button>`).join('')}</div>
      <div class="checklist">${PREP_ITEMS.map(item=>{
        const on=!!(a.prep&&a.prep[item.key]);
        return `<label class="check-item ${on?'active':''}"><input type="checkbox" data-path="${base}.prep.${item.key}" ${on?'checked':''}><div><b>${escape(item.label)}</b><div class="hint">${escape(item.help)}</div></div></label>`;
      }).join('')}</div>
      <details class="more-options"><summary>More options</summary><div class="detail-body">
      <div class="fields">
        ${(a.prep&&(a.prep.patching||a.prep.spalling))?field('Patch kits (this area)',base+'.prep.patchKits','number','Links to patch rate in rate book','step="1"'):''}
        ${(a.prep&&a.prep.cracks)?field('Crack length (linear ft)',base+'.prep.crackLf','number','$250 up to 10 ft, then $12/ft. Blank still uses the $250 flat.','step="1"'):''}
        ${(a.prep&&a.prep.leveling)?field('Avg leveling depth (in)',base+'.prep.levelDepth','number','¼ inch = 0.25. Maximum 2 inches. Leveling stays $6/sq ft at 1/4 inch.','min="0" max="2" step="0.125" inputmode="decimal"'):''}
        ${checkbox('Adhesive / mastic removal ($1.50/sq ft, $350 minimum)',base+'.prep.adhesive')}
      </div>
      ${textArea('Inspection notes / concerns',base+'.conditionNotes','Also kept in the job history when the concern changes.')}
      <h4>Condition photos</h4>
      ${photoGrid(a.conditionPhotos,a.id,'conditionPhotos')}
      </div></details>
    </section>`;
  }).join('')}
  ${optionalExtrasHTML(j,'job')}
  <details class="more-options"><summary>More options</summary><div class="detail-body">
  ${textArea('Job-level issues / concerns','job.jobConcerns','Stored on the job and copied into history when changed.')}
  <h4>Change history</h4>
  <div class="history-list">${(j.history||[]).slice().reverse().slice(0,30).map(h=>`<div><b>${escape(h.type)}</b> · ${escape((h.at||'').replace('T',' ').slice(0,19))} UTC<br/>${escape(h.summary)}${h.detail?' — '+escape(h.detail):''}</div>`).join('')||'<div class="empty-state">No history yet. Edits will appear here.</div>'}</div>
  </div></details>
  </section>`;
}
function colorPaletteHTML(a,i){
  const base='job.areas.'+i;
  if(a.style==='level')return '';
  const swatches=BASE_COLORS.map(c=>`<button type="button" class="color-swatch ${a.colorKey===c.key?'active':''}" data-color-key="${c.key}" data-area-index="${i}" title="${escape(c.label)}" aria-label="${escape(c.label)}" aria-pressed="${a.colorKey===c.key}"><span class="swatch-chip" style="background:${c.hex};${!c.hex||c.key==='custom'||c.key==='white'||c.key==='off-white'?'border:1px solid #c5cec5;':''}"></span><span class="swatch-name">${escape(c.label)}</span></button>`).join('');
  return `<div class="palette-block"><span class="eyebrow">BASE / SYSTEM COLOR</span>
    <p class="method-note">On-screen colors are <b>approximate</b>. Confirm physical samples and manufacturer availability before ordering. Compatibility with text field: selection writes into Floor color.</p>
    <div class="color-palette" role="listbox">${swatches}</div>
    ${a.colorKey==='custom'?field('Custom color description',base+'.customColor','text','Type the requested color / code — availability TBD'):field('Color name (editable)',base+'.color','text','Kept in sync with palette; edit for notes')}
  </div>`;
}
function flakePaletteHTML(a,i){
  if(a.style!=='flake')return '';
  const base='job.areas.'+i;
  const swatches=FLAKE_BLENDS.map(c=>{
    const g='linear-gradient(135deg,'+c.stops.join(',')+')';
    return `<button type="button" class="color-swatch flake ${a.flakeBlend===c.key?'active':''}" data-flake-blend="${c.key}" data-area-index="${i}" title="${escape(c.label)}" aria-label="${escape(c.label)}" aria-pressed="${a.flakeBlend===c.key}"><span class="swatch-chip" style="background:${g}"></span><span class="swatch-name">${escape(c.label)}</span></button>`;
  }).join('');
  return `<div class="palette-block"><span class="eyebrow">FLAKE COLOR / BLEND</span>
    <p class="method-note">Common neutral blends for planning. Does <b>not</b> claim manufacturer stock or exact match — confirm samples.</p>
    <div class="color-palette" role="listbox">${swatches}</div>
    ${a.flakeBlend==='custom'?field('Custom flake blend description',base+'.customFlakeBlend','text','Describe desired blend — availability TBD'):''}
  </div>`;
}
function stepSelections(j){
  if(isCatalogJob(j)){
    const x=calc();
    return `<section class="card">${cardHead('04','System confirmation','Material / topcoat already set on catalog items')}
    ${priceNeededBanner(x)}
    <div class="notice">Material/system and topcoat selections on catalog items <b>must change price</b> via configured adjustments — not description-only. Configure adjustments under Costs &amp; pricing → Catalog packages. Color palettes for measured floors remain on floor jobs.</div>
    <p class="method-note">Garage package: style <b>${escape(j.garageStyle||'—')}</b> · topcoat <b>${escape(j.garageTopcoat||'—')}</b> · condition <b>${escape(j.garageCondition||'unknown')}</b>.</p>
    ${(j.catalogItems||[]).map((it,i)=>`<p class="method-note">Item ${i+1}: <b>${escape(it.name||'Item')}</b> · ${escape(it.style||'solid')} · topcoat ${escape(it.topcoat||'protective')} · condition ${escape(it.condition||'unknown')}</p>`).join('')}
    </section>`;
  }
  return `<section class="card">${cardHead('04','System & finish selections','System · base color · flake blend · topcoat · grip')}
  <div class="notice">Material quantities use configurable coverage/yield allowances. Colors on screen are approximate planning aids — not manufacturer guarantees or exact matches.</div>
  ${j.areas.map((a,i)=>{
    const base='job.areas.'+i;
    return `<section class="area"><div class="area-top"><span class="area-badge">${escape(a.name||('Area '+(i+1)))}</span></div>
      <div class="finish-picker" role="group">${[['solid','Solid color'],['flake','Flake'],['metallic','Metallic'],['sealer','Clear seal'],['level','Level only']].map(([v,t])=>`<button type="button" class="finish-choice ${a.style===v?'active':''}" data-style="${v}" data-index="${i}" aria-pressed="${a.style===v}"><span class="swatch ${v}"></span>${t}</button>`).join('')}</div>
      ${colorPaletteHTML(a,i)}
      ${flakePaletteHTML(a,i)}
      <div class="fields">
        ${a.style==='solid'?select('Base coats',base+'.coats',[[1,'1 base coat'],[2,'2 base coats']]):''}
        ${a.style==='flake'?select('Flake coverage',base+'.flake',[['light','Light / spot'],['medium','Medium broadcast'],['full','Full broadcast']]):''}
        ${a.style!=='level'?select('Topcoat',base+'.topcoat',[['protective','Protective topcoat (standard allowance)'],['none','No separate topcoat note']]):''}
        ${rateOverrideField(a,base)}
      </div>
      <details class="more-options"><summary>More options</summary><div class="detail-body">
      ${a.style!=='level'?`<div class="area-options">${checkbox('Slip-resistant texture',base+'.grip')}${checkbox('Self-leveling before finish',base+'.level')}</div>`:''}
      ${(a.level||a.style==='level'||(a.prep&&a.prep.leveling))?`<div class="fields depth-row">${field('Average leveling depth (inches)',base+'.depth','number','Verify average, not deepest spot. Maximum 2 inches.','min="0" max="2" step="0.125" inputmode="decimal"')}</div>`:''}
      ${a.grip?field('Texture note (optional)',base+'.textureNote','text','Describe the texture you want. This is not a promise the floor will not be slippery.'):''}
      ${a.moisture?`<p class="method-note">Moisture barrier is on for this area (${num(computeAreaSqft(a))} sq ft).</p>`:''}
      </div></details>
    </section>`;
  }).join('')}
  </section>`;
}
function optionCardsHTML(x){
  const regularTotal=x.choices&&x.choices.regular?x.choices.regular.total:0;
  return Object.values(x.choices).map(c=>{
    const b=c.breakdown||{};
    const extras=(b.extras||[]).map(e=>`<li>${escape(e.label)}: ${cash(e.amount)} <small>separate from the finish rate</small></li>`).join('');
    const compared=c.key==='regular'?'<span class="opt-meta">Payment terms stay on the job terms. No extra schedule is added.</span>':`<span class="opt-save">${cash(c.savings)} below the regular full total of ${cash(regularTotal)} (${num(c.savingsPct)}% of that full total)</span>`;
    const pays=(c.payments||[]).length?`<ul>${c.payments.map(p=>`<li>${cash(p.amount)} · ${num(p.pct)}% of ${cash(c.total)} · ${escape(p.label)}</li>`).join('')}</ul>`:'';
    return `<button type="button" class="option-card ${x.selected.key===c.key?'active':''}" data-option="${c.key}" aria-pressed="${x.selected.key===c.key}"><span class="opt-name">${escape(c.label)}${x.selected.key===c.key?'<span class="pill">SELECTED</span>':''}</span><span class="opt-total">${cash(c.total)}</span><span class="opt-meta">Finish ${cash(b.finishRate)} / sq ft × ${num(b.finishQty)} sq ft = ${cash(b.finishAmount)}</span>${c.payMethod?`<span class="opt-meta">${escape(c.payMethod)}</span>`:''}${extras?`<ul>${extras}</ul>`:''}${compared}${pays}</button>`;
  }).join('');
}
function discountStore(){
  const DA=window.EsDiscountApproval;
  if(!DA)return null;
  if(!state.discountStore)state.discountStore=DA.createStore();
  return state.discountStore;
}
function discountRequestHTML(j){
  const owner=isOwner();
  const DC=window.EsDiscountClient;
  const serverId=j.discountApprovalId&&DC&&DC.isServerApprovalId(j.discountApprovalId);
  /* The server's preview carries the live approval status; it wins over the copy saved with the job
     (e.g. the owner approved from the Approvals inbox and this device has not reloaded the job). */
  const sq=serverQuotes[j.id];const live=authMode()&&serverId&&sq&&sq.staff&&sq.staff.discountStatus;
  if(live&&live!=='none'&&live!==j.discountServerStatus)j.discountServerStatus=live;
  const status=authMode()?(serverId?(j.discountServerStatus||'pending'):'none'):(j.discountServerStatus||'none');
  const ask=`<div class="fields three">${field('Extra discount amount ($)','job.discountRequestAmount','number','Dollars off the selected tier only. Leave blank to use a percent.')}${field('Or percent (%)','job.discountRequestPercent','number','Use one, not both.')}${field('Reason','job.discountRequestReason','text','Required. Shown on the approval record.')}</div>
  <button type="button" class="button secondary" id="requestExtraDiscount">Request owner approval</button>`;
  const review=owner&&serverId&&status==='pending'?`<div class="inline-actions"><button type="button" class="button" id="approveExtraDiscount">Approve request</button><button type="button" class="button secondary" id="rejectExtraDiscount">Reject request</button></div>`:'';
  const detail=serverId?` · server record ${escape(j.discountApprovalId)} · tier ${escape(j.discountServerTier||'')} · ${cash(j.discountServerAmount)}`:(authMode()?' · no server approval':' · offline preview, not a server approval');
  return `<div class="divider"></div><h4 style="margin:0 0 8px;font-size:13px">Extra discount</h4>
  <p class="method-note">The reduction applies only to the selected tier and revision after the server approves it. The other tiers stay at their own prices. Pending and rejected requests leave every total unchanged.</p>
  <div class="info-banner"><b>Status:</b> ${escape(status)}${detail}</div>
  ${ask}${review}`;
}
function travelFormulaHTML(x){
  const t=x.travel;const owner=isOwner();
  const crewBit=owner
    ? `${num(t.minutes)} min × 2 × ${num(t.trips)} visit(s) × ${t.crew}-person crew = ${num(t.crewHours,2)} person-hr × ${cash(state.settings.costs.labor)} = <b>${cash(x.sqft?t.crewTravel:0)}</b>`
    : `${num(t.minutes)} min × 2 × ${num(t.trips)} visit(s) × ${t.crew}-person crew = <b>${num(t.crewHours,2)} person-hr</b> (pay rate owner-only; travel $ folded into quote overhead)`;
  const mileBit=owner
    ? `× ${cash(t.rate)}/mi = <b>${cash(x.sqft?t.mileage:0)}</b> (once, blended into customer total)`
    : `(mileage $ rate owner-only; travel folded into the approved quote)`;
  return `<b>Mileage:</b> ${num(t.oneWay)} mi one way × 2 × ${num(t.trips)} visit(s) × ${num(t.vehicles)} vehicle(s) = <b>${num(t.vehicleMiles)} vehicle miles</b> ${mileBit}<br/><b>Crew travel:</b> ${crewBit}`;
}
function customerVisibleLines(x){
  return (x.lines||[]).filter(l=>{const k=l.kind||'';return k!=='mileage'&&k!=='travel'&&k!=='equipment'&&k!=='overhead'&&k!=='equip';});
}

/** Selling-price planning allocation from approved customer quote (includes markup/upcharge).
 * Weights use internal cost shares only as a transparent allocator — raw $ costs and markup % are never returned. */
function quoteAllocation(x){
  if(x&&x._server&&x._server.allocation)return clone(x._server.allocation);
  const subtotal=E.n(x.subtotal), salesTax=E.n(x.salesTax), total=E.n(x.total);
  const matW=E.n(x.mat)+E.n(x.tax); // material weight includes purchase tax on materials
  const labW=E.n(x.labor);
  const otherW=Math.max(0, E.n(x.overhead)+E.n(x.contingency));
  const weight=matW+labW+otherW;
  let materials=0, labor=0, other=0;
  if(subtotal<=0 || weight<=0){
    materials=0; labor=0; other=subtotal;
  } else {
    materials=Math.round(subtotal*(matW/weight)*100)/100;
    labor=Math.round(subtotal*(labW/weight)*100)/100;
    other=Math.round((subtotal-materials-labor)*100)/100; // exact reconcile
  }
  const sumParts=Math.round((materials+labor+other)*100)/100;
  const personHours=E.n(x.personHours);
  const hourRows=(x.hours||[]).map(h=>({label:h.label, hours:E.n(h.qty)}));
  return {
    label:'Planning allocation from approved quote (selling prices — not supplier invoices or payroll)',
    personHours,
    hourRows,
    materials, // selling-price Materials total
    labor,     // selling-price Labor total
    other,     // other included charges at selling price (mobilization/equip/overhead share)
    subtotal,
    salesTax,
    total,
    sumParts,
    reconciles: Math.abs(sumParts-subtotal)<0.015
  };
}
function approvedAdjustmentSettings(){
  const a=(state.settings&&state.settings.approvedAdjustment)||{mode:'amount',amount:0,pct:0};
  return {mode:a.mode==='pct'?'pct':'amount', amount:E.n(a.amount), pct:E.n(a.pct)};
}
/** Max $ the employee may apply as job.discount on Regular price (never derived from profit/margin). */
function approvedAdjustmentCap(x){
  if(x&&x._server)return Math.max(0,E.n(x._server.cap));
  if(authMode()&&!isOwner()){const j=activeJob();const sq=j&&serverQuotes[j.id];if(sq)return Math.max(0,E.n(sq.staff.cap));}
  const a=approvedAdjustmentSettings();
  const base=E.n(x&&x.selected&&x.selected.pre!=null?x.selected.pre:x&&x.base)+E.n(x&&x.minimum);
  if(a.mode==='pct') return Math.max(0, Math.round(base*(a.pct/100)*100)/100);
  return Math.max(0, a.amount);
}
function approvedAdjustmentLabel(){
  const a=approvedAdjustmentSettings();
  if(a.mode==='pct') return a.pct? (num(a.pct)+'% of pre-tax regular price') : '$0 (owner has not approved an adjustment)';
  return a.amount? cash(a.amount) : '$0 (owner has not approved an adjustment)';
}
function clampJobDiscountToCap(j,x){
  if(!j) return;
  if(j.priceOption && j.priceOption!=='regular'){ /* family options ignore manual discount */ return; }
  const cap=approvedAdjustmentCap(x||calc());
  const d=E.n(j.discount);
  if(d>cap){ j.discount=cap; }
}
function quoteAllocationHTML(x, opts={}){
  const q=quoteAllocation(x);
  const forCustomer=!!opts.customer;
  const hoursList=q.hourRows.length
    ? `<ul class="internal-list">${q.hourRows.map(h=>`<li>${escape(h.label)}: <b>${num(h.hours,2)} person-hr</b></li>`).join('')}<li><b>Total planned work: ${num(q.personHours,2)} person-hr</b></li></ul>`
    : `<p class="method-note">No production hours planned yet (add square footage).</p>`;
  return `<div class="quote-alloc ${forCustomer?'doc-alloc':''}">
    <h4>${forCustomer?'Materials, labor & planned hours':'Materials & labor (approved selling prices)'}</h4>
    <p class="method-note">${escape(q.label)}. Figures below are <b>price totals</b> that include applicable markup and reconcile to the approved quote — not raw supplier cost or hourly pay.</p>
    <div class="metrics">
      <div class="metric"><span>Planned work hours</span><strong>${num(q.personHours,2)}</strong><small>person-hours</small></div>
      <div class="metric"><span>Materials</span><strong>${cash(q.materials)}</strong><small>price total</small></div>
      <div class="metric"><span>Labor</span><strong>${cash(q.labor)}</strong><small>price total</small></div>
      <div class="metric"><span>Other included</span><strong>${cash(q.other)}</strong><small>mobilization / equip / overhead share</small></div>
    </div>
    ${hoursList}
    <div class="doc-total" style="max-width:100%;margin:12px 0">
      <div><span>Materials (price)</span><span>${cash(q.materials)}</span></div>
      <div><span>Labor (price)</span><span>${cash(q.labor)}</span></div>
      <div><span>Other included charges (planning allocation)</span><span>${cash(q.other)}</span></div>
      <div><span>Pre-tax subtotal</span><span>${cash(q.subtotal)}</span></div>
      ${q.salesTax?`<div><span>Sales tax</span><span>${cash(q.salesTax)}</span></div>`:''}
      <div class="grand"><span>Approved quote total</span><span>${cash(q.total)}</span></div>
    </div>
    <p class="method-note">Reconciliation check: Materials + Labor + Other = ${cash(q.sumParts)} ${q.reconciles?'✓ matches':'⚠ review'} pre-tax subtotal ${cash(q.subtotal)}.</p>
  </div>`;
}

function travelBlendedNote(x){
  const sum=E.n(x.travelInQuote||x.travelCost||0);
  if(!sum&&isOwner())return '<p class="method-note">Mobilization / travel overhead is $0 until miles &amp; drive time are set under Internal. Equipment &amp; travel never appear as separate customer lines.</p>';
  if(!isOwner())return '<p class="method-note">Mobilization / travel is included in the overall quoted total as overhead — not itemized for the customer. Dollar amounts are owner-only.</p>';
  return `<p class="method-note">Mobilization / travel is included in the overall quoted total (${cash(sum)}) as overhead — not itemized for the customer. Details under Internal job-cost.</p>`;
}
function equipmentPlan(j,x){
  const items=[];
  items.push('Diamond grinder + dust extractor (rental days: '+num(j.rentalDays)+')');
  items.push('Diamond tooling allowance');
  items.push('Application supplies & PPE');
  items.push('Dust bags / filters');
  items.push('Disposal allowance');
  if(j.areas.some(a=>a.moisture||(a.prep&&a.prep.moisture)))items.push('Moisture-control primer / barrier kits (selected areas)');
  if(j.areas.some(a=>a.prep&&(a.prep.coatingRemoval||a.prep.adhesive))||j.condition==='paint'||j.condition==='adhesive')items.push('Coating / adhesive removal tooling');
  if(j.areas.some(a=>a.level||a.style==='level'||(a.prep&&a.prep.leveling)))items.push('Self-leveling mixer / gauge rake / spiked rollers');
  if(j.areas.some(a=>a.style==='flake'))items.push('Flake broadcast & recovery tools');
  if(j.areas.some(a=>a.grip))items.push('Slip-resistant texture additive');
  if(E.n(j.patchKits)||j.areas.some(a=>a.prep&&(a.prep.patching||a.prep.spalling)))items.push('Concrete patch kits');
  return items;
}
function ownerViewHTML(){
  if(!isOwner())return '';
  const x=calc();
  const warnShow=(x.warnings||[]).filter(w=>/below the estimated job cost|margin|profit/i.test(w));
  return `<details class="owner-view"><summary>Owner view</summary><div class="detail-body">
    <p class="hint">Cost, margin, and profit stay in this section. They are left off the customer and subcontractor documents.</p>
    <div class="cost-mini"><span class="eyebrow">OWNER ONLY · INTERNAL</span>
      <div class="summary-row"><span>Estimated job cost</span><strong>${cash(x.cost)}</strong></div>
      <div class="summary-row"><span>Travel included in the quote</span><strong>${cash((x.sqft?x.travel.mileage:0)+(x.sqft?x.travel.crewTravel:0))}</strong></div>
      <div class="summary-row"><span>Potential remainder</span><strong class="${x.profit<0?'loss':''}">${cash(x.profit)}</strong></div>
      <div class="summary-row"><span>Gross margin</span><strong>${num(x.grossMargin,1)}%</strong></div>
      <div class="summary-row"><span>Net margin after overhead</span><strong>${num(x.operatingMargin,1)}%</strong></div>
      <div class="summary-row"><span>Margin after contingency and per-job tooling</span><strong>${num(x.margin,1)}%</strong></div>
      <p class="method-note">Gross is price minus labor minus materials. Net subtracts the monthly overhead spread only. A 30% markup is a 23.1% margin, not a 30% margin.</p>
      <div class="summary-row"><span>Approved adjustment limit</span><strong>${approvedAdjustmentLabel()}</strong></div>
      <button type="button" class="button secondary" data-view="internal">Internal job-cost and travel</button>
    </div>
    ${warnShow.length?`<div class="notice ${x.profit<0?'error':''}">${warnShow.map(escape).join('<br/><br/>')}</div>`:''}
  </div></details>`;
}
function stepPricing(j){
  const x=calc();
  const moist=moistureSelectedAreas(j);
  const catalog=isCatalogJob(j);
  const tierChoices=[['regular','Regular · full price'],['opt1','Option 1 · bank transfer'],['opt2','Option 2 · scheduled payments']];
  return `<section class="card">${cardHead('05','Customer pricing & payments','Pick one price. Travel stays inside the total.')}
  ${priceNeededBanner(x)}
  ${catalog?`<div class="notice"><b>Package pricing.</b> A garage base fee covers the typical size. Square feet above that use the tier rate selected below. Counters and seating use their starting prices. Flake and extra-coat upgrades on measured floors stay as their own lines on top of the tier.</div>${catalogBreakdownDocHTML(x)}`
    :`<p class="hint">Regular is the full price. Option 1 is lower when the customer pays by bank transfer: half to book the job, half at the final walkthrough. Option 2 is in between and splits into three payments — half, then 25%, then the last 25% within 14 days. Choose one. They do not combine.</p>
    <div id="optionCards" class="option-grid">${optionCardsHTML(x)}</div>`}
  <div class="fields">${select('Selected price','job.priceOption',tierChoices)}</div>
  ${catalog?'':discountRequestHTML(j)}
  <details class="more-options"><summary>More options</summary><div class="detail-body">
    <div class="fields">${select('Document type','job.docType',[['estimate','Estimate'],['invoice','Invoice']])}${field('Customer sales tax (%)','job.tax','number')}</div>
    ${checkbox('Show all pricing options on the customer document','job.showOptions')}
    <div class="divider"></div>
    <p class="hint">The property / trip add-in is included in the base price. There is no separate add-in line.</p>
    <div class="fields">
    ${select('Customer pricing method','job.method',[['rates','Customer rates per square foot'],['cost','Estimated cost + markup'],['agreed','Agreed total / manual quote']])}
    ${(()=>{const owner=isOwner();if(j.method!=='cost'){if(j.method==='agreed')return owner?field('Agreed total before discount / tax','job.agreedTotal','number'):lockedField('Agreed total before discount / tax','job.agreedTotal','number','Owner-only');return ''}const margin=E.markupToMargin(j.markup);const help='(= '+E.n(j.markup).toFixed(2)+'% markup). 30 markup is '+E.markupToMargin(30).toFixed(1)+'% margin, not 30% margin.';return owner?`<div class="field"><label for="f-job.marginTarget">Target margin on price (%)</label><input id="f-job.marginTarget" data-margin-input="1" type="number" min="0" max="80" step="0.01" value="${escape(margin.toFixed(2))}"><small>${escape(help)}</small></div>`:lockedField('Target margin on price (%)','job.markup','number',help);})()}
    </div>
    ${quoteAllocationHTML(x)}
    ${j.docType==='invoice'?field('Payments received ($)','job.paid','number'):''}
    <p class="method-note">Leveling, removal, patching, moisture, and the property add-in stay at their own prices. Travel is included in the total, not a separate line for the customer.</p>
    <p class="method-note">Moisture on ${moist.items.length} area(s): ${num(moist.sqft)} sq ft → ${cash(moist.total)}.</p>
    ${travelBlendedNote(x)}
    <div class="fields pricing-extra">${textArea('Scheduling & payment terms','job.terms')}${textArea('Extra project notes / exclusions','job.notes')}</div>
    <div class="info-banner">Crew size, drive time, ${isOwner()?'mileage rate ($'+E.n(state.settings.costs.mile).toFixed(2)+'), ':''}and equipment planning are under <b>Internal plan</b> in the menu.</div>
  </div></details>
  ${ownerViewHTML()}
  </section>`;
}

function stepReview(j){
  const x=calc(),owner=isOwner();
  const totalDisp=x.quoteReady?cash(x.total):'Pending';
  const metrics=`<div class="metrics">
    <div class="metric"><span>${owner?'Customer total':'Approved customer total'}</span><strong class="${x.quoteReady?'':'pending-total'}">${totalDisp}</strong><small>${escape(x.selected.short)}${x.quoteReady?'':' · incomplete'}</small></div>
    <div class="metric"><span>Sq ft / items</span><strong>${num(x.sqft)||(j.catalogItems||[]).length||'—'}</strong><small>${isCatalogJob(j)?'catalog':'floor'} · ${j.areas.length} area(s)</small></div>
    <div class="metric"><span>Payment option</span><strong>${escape(x.selected.label)}</strong><small>Approved terms only</small></div>
    ${authMode()?`<div class="metric"><span>Server check</span><strong>${x._server?'Verified':'Pending'}</strong><small>${x._server?'Totals from server':'Waiting for server'}</small></div>`:(owner?'':'<div class="metric"><span>Cloud</span><strong>OFF</strong><small>Not configured</small></div>')}
  </div>`;
  const reviewBanner=owner
    ?`<div class="info-banner"><b>Owner review:</b> confirm scope, schedule, approved payment options, and (privately) cost/margin. Profit and margin stay off customer/subcontractor documents.</div>`
    :`<div class="info-banner"><b>Review scope, schedule and approved payment options.</b> Show only approved customer prices and terms. Planned hours and Materials/Labor are selling-price totals. You may apply an adjustment only within the owner-set approved adjustment limit (default $0). No margin or profit figures. Cash: no special cash price wording — use approved option totals as shown.</div>`;
  return `<section class="card">${cardHead('06','Review & export',authMode()?(owner?'Owner docs · cost/margin private · server-saved':'Review scope, schedule & approved payment options · server-saved'):(owner?'Owner docs · cost/margin private · local backup · cloud OFF':'Review scope, schedule & approved payment options · local backup · cloud OFF'))}
  ${roleBadgeHTML()}
  ${j.isSample?`<div class="sample-banner"><b>ILLUSTRATIVE SAMPLE</b> — label exports accordingly.</div>`:''}
  ${priceNeededBanner(x)}
  ${reviewBanner}
  ${x.quoteReady||(x.blockingIssues||[]).length?'':`<div class="warn-banner"><b>Finalized quote blocked</b> until required starting prices and adjustments are configured. Do not present Pending as a $0 customer total.</div>`}
  ${metrics}
  ${ownerViewHTML()}
  <div class="inline-actions"><button type="button" class="button" id="saveAsIssued" ${(x.blockingIssues||[]).length||((x.sanity&&x.sanity.warnings||[]).length&&!ownerAcked(j,x.sanity.warnings))?'disabled':''}>Save as issued</button></div>
  ${(x.blockingIssues||[]).length?'<p class="method-note">Save as issued, issuing, and customer links stay off until the price is fixed. The draft still saves and is marked needs fixing.</p>':''}
  ${quoteAllocationHTML(x)}
  <div class="info-banner"><b>Approved adjustment limit:</b> ${approvedAdjustmentLabel()} · applied ${cash(E.n(j.discount))}.</div>
  <div class="export-grid">
    <div class="export-card"><span class="privacy-tag">CUSTOMER SAFE</span><h4>Customer estimate + install guide</h4><p>Scope, selections, approved pricing, payments, terms, plus “How we prepare &amp; install.” No costs, margins, or profit.</p>
      ${checkbox('Include install guide with estimate package','job.includeGuideWithEstimate')}
      <button class="button" data-view="customer">View estimate + guide</button>
      <button class="button secondary" data-view="guide">View guide only</button>
      <button class="quiet" data-export-html="customer">Download HTML package</button>
      <button class="quiet" data-export-html="guide">Download guide HTML</button></div>
    <div class="export-card"><span class="privacy-tag">SUB SAFE</span><h4>Subcontractor pack</h4><p>Scope, measurements, prep, schedule/crew. No internal costs or profit. Customer contact & prices off by default.</p>
      ${checkbox('Include customer contact on sub doc','job.includeCustomerContactInSub')}
      ${checkbox('Include customer prices on sub doc','job.includeCustomerPriceInSub')}
      <button class="button secondary" data-view="subcontractor">View / print</button>
      <button class="quiet" data-export-html="subcontractor">Download HTML</button></div>
    <div class="export-card"><span class="privacy-tag warn">INTERNAL ONLY</span><h4>${owner?'Internal job-cost':'Field plan (ops)'}</h4><p>${owner?'Materials, labor, prep, travel, overhead, margin/profit (owner-only). Never in customer/sub exports by default.':'Operational field plan, materials, labor, travel, equipment checklist. Profit and margin are owner-only — not shown in worker preview.'}</p>
      ${owner?checkbox('⚠ Explicitly allow internal figures in a special customer HTML export','job.includeInternalInCustomer'):'<p class="method-note">Internal cost/profit export opt-in is owner-only.</p>'}
      <button class="button secondary" data-view="internal">${owner?'Open internal':'Open field plan'}</button>
      ${owner?'<button class="quiet" id="costCSV">Export CSV</button>':'<p class="method-note">CSV cost export is owner-only.</p>'}</div>
    <div class="export-card"><span class="privacy-tag">LOCAL</span><h4>Backup & share file</h4><p>Full JSON backup/restore. Web Share when available; otherwise download.</p>
      <button class="button secondary" id="backup">Download JSON backup</button>
      <button class="quiet" id="shareBackup">Share / export file</button>
      ${authMode()?'<p class="method-note">Restore is disabled while signed in (server is the source of truth). Use Jobs → Import offline jobs.</p>':'<label class="quiet file-label">Restore JSON<input id="restoreInline" type="file" accept="application/json" hidden></label>'}</div>
  </div>
  ${authMode()?(runtime.sharePanelHTML?runtime.sharePanelHTML(j,x):''):`<div class="warn-banner" style="margin-top:14px"><b>Cloud backup is OFF and not configured.</b> This local HTML file cannot create hosted customer/sub links. See CLOUD_SYNC_ADAPTER.md and README for the exact approval question and Drive/connector setup. No upload is attempted.</div>`}
  <div class="info-banner">Storage used (approx): ${bytesLabel(storageSizeEstimate())}. Photos count toward browser limits.</div>
  </section>`;
}
function guidedView(){
  const j=ensureJob();
  const step=STEPS.some(s=>s.id===j.step)?j.step:'contact';
  j.step=step;
  const body={contact:stepContact,areas:stepAreas,prep:stepPrep,selections:stepSelections,pricing:stepPricing,review:stepReview}[step](j);
  return `<div class="page-head guided-intro"><div><span class="eyebrow">FIELD ESTIMATING</span><h1>Guided job walkthrough.</h1><p>Lead → measure → inspect → select → price → export.</p></div><button class="button secondary" id="sampleIllustrativeTop">Illustrative sample</button></div>`
    +wizardRail(j)+`<div class="layout" data-wizard-step="${escape(step)}"><div class="stack">${body}${navFooter(j)}</div><aside class="summary" id="liveSummary">${summaryHTML()}</aside></div>`;
}
function cField(label,key,help=''){return field(label,'settings.costs.'+key,'number',help)}
function overheadPanelHTML(){
  if(!isOwner())return '<p class="method-note">Monthly overhead is owner-only.</p>';
  const lines=state.settings.costs.overheadLines||[];
  const spread=E.overheadSpread(state.settings.costs);
  const rows=lines.map((l,i)=>`<div class="fields three">${field('Overhead line','settings.costs.overheadLines.'+i+'.label','text')}${field('Monthly amount ($)','settings.costs.overheadLines.'+i+'.monthly','number','','min="0" step="0.01"')}${select('Source tag','settings.costs.overheadLines.'+i+'.status',[['OWNER-PROVIDED','OWNER-PROVIDED'],['VERIFIED','VERIFIED'],['NOT VERIFIED','NOT VERIFIED']])}<p class="method-note">${escape(l.note||'')}</p></div>`).join('');
  return `<h4 style="margin:0 0 8px;font-size:13px">Monthly overhead ${statusTag('OWNER-PROVIDED')}</h4>
  <p class="method-note">One all-inclusive amount. Licensing, insurance, and equipment sit inside it. The per-hour spread is this total divided by billable person-hours.</p>
  ${rows}
  <p class="method-note" id="overheadSpread">Total ${cash(spread.monthly)} / ${num(spread.hours,0)} billable person-hours = <b>${cash(spread.perHour)} per hour</b>.</p>`;
}
function catalogAdjFields(label,path){
  const v=getPath(path);
  const neg='min="-10000" step="1"';
  if(v&&typeof v==='object'){
    return lockedField(label+' · 1-car ($)',path+'.oneCar','number','Negative is a credit.',neg)+lockedField(label+' · 2-car ($)',path+'.twoCar','number','Negative is a credit.',neg)+lockedField(label+' · 3-car ($)',path+'.threeCar','number','Negative is a credit.',neg);
  }
  return lockedField(label+' ($)',path,'number','Negative is a credit.',neg);
}
function ratesView(){
  const owner=isOwner();
  return heading('YOUR RATE BOOK','Costs & pricing.','Owner-approved rates. Workers use locked values.','')
  +roleBadgeHTML()
  +`<div class="rate-banner"><span>◉</span><p><b>${authMode()?(owner?'Owner — edits are a draft until you save the price book to the server.':'Employee — rate book set by the owner (server-enforced).'):(owner?'Owner preview — rates editable in this demo.':'Worker preview — rate book locked.')}</b> ${owner?(authMode()?'Draft changes update estimates on this screen; employees and customer links use the saved server version.':'Changing numbers here updates estimates in this browser only.'):'Workers enter job details and create estimates using approved rates; they cannot change product prices, labor, travel, equipment, or overhead rates. Profit and margin stay owner-only.'}</p></div>
  ${(typeof window!=='undefined'&&window.EsPriceProposals&&owner)?window.EsPriceProposals.proposalReviewHTML(state.settings,true):''}
  ${authMode()?(runtime.priceBookPanelHTML?runtime.priceBookPanelHTML():''):`<div class="warn-banner"><b>OFFLINE DEMO — NOT SECURE.</b> <b>Preview only — not security.</b> This OWNER/WORKER switch demonstrates UX in a local HTML file. It is <b>not</b> authenticated access control. Real owner-only enforcement requires authenticated deployment with server-side authorization. No sign-in service is configured.</div>`}
  ${bookIssuesHTML()}
  <details open><summary>Customer selling rates ${owner?'':'🔒'}</summary><div class="detail-body"><div class="fields three">${Object.entries({solid:'Solid epoxy / sq ft',flake:'Flake epoxy / sq ft',metallic:'Metallic epoxy / sq ft',sealer:'Clear seal / sq ft',level:'Leveling / sq ft at ¼ inch',removal:'Extra removal / sq ft',moisture:'Moisture control / sq ft',extraCoat:'Additional solid base coat / sq ft',mediumFlakeExtra:'Medium flake premium / sq ft',fullFlakeExtra:'Full flake premium / sq ft'}).map(([k,v])=>lockedField(v,'settings.rates.'+k,'number','$0–$40 per sq ft. Above $20 asks the owner to confirm.','min="0" max="40" step="0.01" inputmode="decimal"')).join('')}${lockedField('Patch / kit installed','settings.rates.patch','number')}</div></div></details>
  <details open><summary>Payment tiers & property add-in ${owner?'':'🔒'}</summary><div class="detail-body"><p>Regular is 7 / 10 / 15. Option 1 is bank transfer, 5 / 8 / 11, half at booking and half at the final walkthrough. Option 2 is 6 / 9 / 13, with 50%, 25%, and 25% within 14 days. Tiers do not stack and there is no extra 40% off. Prep and removal stay at their own prices. No material surcharge is added.</p>${['opt1','opt2'].map(k=>`<div class="fields three" style="margin-bottom:14px">${lockedField('Option label','settings.pricingOptions.'+k+'.label')}${lockedField('Solid / sq ft','settings.pricingOptions.'+k+'.rates.solid','number','$0–$40 per sq ft.','min="0" max="40" step="0.01" inputmode="decimal"')}${lockedField('Flake / sq ft','settings.pricingOptions.'+k+'.rates.flake','number','$0–$40 per sq ft.','min="0" max="40" step="0.01" inputmode="decimal"')}${lockedField('Metallic / sq ft','settings.pricingOptions.'+k+'.rates.metallic','number','$0–$40 per sq ft.','min="0" max="40" step="0.01" inputmode="decimal"')}${state.settings.pricingOptions[k].schedule.map((p,i)=>lockedField((p.label||('Payment '+(i+1)))+' %','settings.pricingOptions.'+k+'.schedule.'+i+'.pct','number')).join('')}</div>`).join('')}
  <p class="method-note">The property / trip add-in is folded into the base price. It is not a separate line. Defaults stay at $0.</p>
  ${lockedField('Minimum job charge ($)','settings.rates.minimumJob','number','Applied with the small-solid floor. The higher one wins. An owner-approved discount can go below it. Employees cannot.'+statusTag(E.FIGURE_STATUS.minimumJob),'min="0" step="1"')}
  ${lockedField('Small solid floor — under (sq ft)','settings.rates.smallSolidFloor.maxSqft','number','A solid-system job whose solid sq ft is under this size uses the floor below, in every tier. Count is the job total, not each area.')}
  ${lockedField('Small solid floor minimum ($)','settings.rates.smallSolidFloor.min','number','Default $2,750 under 500 sq ft. 1-car solid Option 1 ($2,600) becomes $2,750.')}
  </div></details>
  <details><summary>Optional extras ${owner?'':'🔒'}</summary><div class="detail-body">
  <p class="method-note">Selling prices for optional lines. Moisture primer and self-leveling stay on the rates above ($4/sq ft and $6/sq ft at 1/4 inch). Per-sq-ft extras above $40 are blocked.</p>
  <div class="fields three">
    ${lockedField('Crack repair flat ($)','settings.extras.crackRepair.flat','number')}
    ${lockedField('Crack repair included (ft)','settings.extras.crackRepair.includedLf','number')}
    ${lockedField('Crack repair after that ($/ft)','settings.extras.crackRepair.perLf','number')}
    ${lockedField('Coating removal ($/sq ft)','settings.extras.coatingRemoval.perSqft','number','$0–$40')}
    ${lockedField('Coating removal minimum ($)','settings.extras.coatingRemoval.min','number')}
    ${lockedField('Paint removal ($/sq ft)','settings.extras.paintRemoval.perSqft','number')}
    ${lockedField('Paint removal minimum ($)','settings.extras.paintRemoval.min','number')}
    ${lockedField('Adhesive removal ($/sq ft)','settings.extras.adhesiveRemoval.perSqft','number')}
    ${lockedField('Adhesive removal minimum ($)','settings.extras.adhesiveRemoval.min','number')}
    ${lockedField('Poor slab ($/sq ft)','settings.extras.poorSlab.perSqft','number')}
    ${lockedField('Poor slab minimum ($)','settings.extras.poorSlab.min','number')}
    ${lockedField('Stairs solid ($/step)','settings.extras.stairs.solid','number')}
    ${lockedField('Stairs flake ($/step)','settings.extras.stairs.flake','number')}
    ${lockedField('Stem wall / cove ($/ft)','settings.extras.stemWall.perLf','number')}
    ${lockedField('Countertop solid ($/sq ft)','settings.extras.countertop.solid','number')}
    ${lockedField('Countertop metallic ($/sq ft)','settings.extras.countertop.metallic','number')}
    ${lockedField('Countertop minimum ($)','settings.extras.countertop.min','number')}
    ${lockedField('Anti-slip ($/sq ft)','settings.extras.antiSlip.perSqft','number')}
    ${lockedField('Travel past 25 miles ($/mile)','settings.extras.travelBeyond.perMile','number')}
    ${lockedField('Moving ($/hour)','settings.extras.moving.perHour','number')}
    ${lockedField('Rush (%)','settings.extras.rush.pct','number')}
    ${lockedField('Weekend (%)','settings.extras.weekend.pct','number')}
    ${lockedField('Winter heat ($/day)','settings.extras.winterHeat.perDay','number')}
    ${lockedField('Consumables ($)','settings.extras.consumables.flat','number')}
    ${lockedField('Fuel and wear ($/mile)','settings.extras.fuelWear.perMile','number')}
    ${lockedField('Extra site visit ($)','settings.extras.extraVisit.flat','number')}
    ${lockedField('3-year warranty (%)','settings.extras.warranty.pct','number')}
  </div>
  </div></details>
  ${authMode()&&!owner?'<div class="info-banner es-costs-hidden"><b>Internal costs are owner-only.</b> Materials, labor, travel, equipment and overhead costs, markup, profit and margin are not sent to employee devices.</div>':`<details open><summary>Materials, labor, travel, equipment, overhead ${owner?'':'🔒'}</summary><div class="detail-body">${overheadPanelHTML()}
  <div class="fields three">${lockedCField('Loaded labor / person-hour ($)','labor','',E.FIGURE_STATUS.labor)}${lockedCField('Vehicle cost / mile ($)','mile','Fuel stays per job. Travel folds into internal overhead.',E.FIGURE_STATUS.mile)}${lockedCField('Material waste (%)','waste','',E.FIGURE_STATUS.waste)}${lockedCField('Materials purchase tax (%)','purchaseTax','Chicago 10.5% since Aug 1 2026. Customer sales tax on installed floors stays 0.',E.FIGURE_STATUS.purchaseTax)}${lockedCField('Setup / cleanup person-hrs per job','setupHours','',E.FIGURE_STATUS.setupHours)}${lockedCField('Billable person-hours / month','billableHoursPerMonth','4 people × about 112 hours. The per-hour rate is monthly overhead divided by this.',E.FIGURE_STATUS.billableHoursPerMonth)}${lockedCField('Contingency reserve (%)','contingency')}${lockedCField('Grind sq ft / person-hr','grindProduction','',E.FIGURE_STATUS.grindProduction)}${lockedCField('Base coat sq ft / person-hr','baseProduction','',E.FIGURE_STATUS.baseProduction)}${lockedCField('Flake broadcast sq ft / person-hr','flakeProduction','',E.FIGURE_STATUS.flakeProduction)}${lockedCField('Topcoat sq ft / person-hr','topProduction','',E.FIGURE_STATUS.topProduction)}${lockedCField('Metallic sq ft / person-hr','metallicProduction','',E.FIGURE_STATUS.metallicProduction)}${lockedCField('Solid material $ / sq ft','materialPerSqft.solid','Internal cost only.',E.FIGURE_STATUS.materialSolid)}${lockedCField('Flake material $ / sq ft','materialPerSqft.flake','Internal cost only.',E.FIGURE_STATUS.materialFlake)}${lockedCField('Metallic material $ / sq ft','materialPerSqft.metallic','Internal cost only.',E.FIGURE_STATUS.materialMetallic)}</div>
  ${owner?checkbox('Disposal and equipment are included in monthly overhead','settings.costs.allowancesInOverhead'):''}
  <p class="method-note">When that box is on, per-job grinder rental, tooling, supplies, dust, and disposal allowances are $0, and the old $1,000 flat overhead is $0. Fuel stays per job. Turn it off only if those allowances are not already inside the $15,000.</p>
  <div class="fields three">${lockedCField('Grinder + extractor / day ($)','rentalDay','Not charged while the overhead box is on.')}${lockedCField('Diamond tooling allowance ($)','tooling','Not charged while the overhead box is on.',E.FIGURE_STATUS.tooling)}${lockedCField('Supplies allowance ($)','supplies','Not charged while the overhead box is on.',E.FIGURE_STATUS.supplies)}${lockedCField('Dust bags / filters ($)','dust','Not charged while the overhead box is on.')}${lockedCField('Disposal allowance ($)','disposal','Not charged while the overhead box is on.')}</div>
  <p class="method-note">Product package sizes and coverages are planning allowances. Travel + equipment costs fold into internal overhead; customers never see separate equipment or mileage lines.</p>
  ${Object.entries(state.settings.products).map(([k,p])=>`<div class="product-edit"><div class="product-name">${escape(p.label)} ${owner?'':'🔒'}</div>${lockedField('Package size','settings.products.'+k+'.size','number')}${lockedField('Price / package ($)','settings.products.'+k+'.price','number')}${p.coverage?lockedField('Coverage','settings.products.'+k+'.coverage','number'):'<div class="field"><label>Coverage</label><small>From selection</small></div>'}</div>`).join('')}
  </div></details>`}
  <details><summary>Business wording ${owner?'':'🔒'}</summary><div class="detail-body"><div class="fields">${lockedField('Business name','settings.business.name')}${lockedField('Business phone','settings.business.phone')}${lockedField('Business address','settings.business.address')}${lockedField('Business email','settings.business.email','email')}${owner?textArea('Competitive pricing review wording','settings.notes'):`<div class="field locked"><label>Competitive pricing review wording <span class="lock-pill">OWNER ONLY</span></label><textarea disabled readonly>${escape(state.settings.notes||'')}</textarea></div>`}</div>${crewSettingsHTML()}</div></details>
  <details open><summary>Catalog packages — starting prices & adjustments ${owner?'':'🔒'}</summary><div class="detail-body">
  <div class="notice"><b>Garage packages</b> use the tier / system / size table. Overflow past 250 / 450 / 650 sq ft uses that tier’s rate for the system. The solid credit is kept for books with no table. A solid package under 500 sq ft is at least $2,750. Flatwork above 32 sq ft is quoted per sq ft.</div>
  <h4 style="margin:12px 0 6px;font-size:13px">Package price table</h4>
  ${[['opt1','Option 1'],['opt2','Option 2'],['regular','Regular']].map(([tier,label])=>`<h4 style="margin:10px 0 6px;font-size:13px">${label}</h4><div class="fields three">${['solid','flake','metallic'].map(sys=>['oneCar','1-car','twoCar','2-car','threeCar','3-car'].reduce((html,part,i,arr)=>{if(i%2)return html;return html+lockedField(sys+' '+arr[i+1]+' ($)','settings.garage.packages.'+tier+'.'+sys+'.'+part,'number');},'')).join('')}</div>`).join('')}
  <h4 style="margin:12px 0 6px;font-size:13px">Garage packages</h4>
  ${((state.settings.catalog&&state.settings.catalog.garage&&state.settings.catalog.garage.disclaimer)||'').trim()?`<div class="warn-banner"><b>Garage package baseline:</b> ${escape(String(state.settings.catalog.garage.disclaimer).trim())}</div>`:''}
  <div class="fields three">${lockedField('1-car typical sq ft','settings.catalog.garage.packageSqft.oneCar','number','Base fee uses this size × the flake tier rate.')}${lockedField('2-car typical sq ft','settings.catalog.garage.packageSqft.twoCar','number')}${lockedField('3-car typical sq ft','settings.catalog.garage.packageSqft.threeCar','number')}</div>
  <p class="method-note">>3-car must use measured sq ft (floor rate book). The stored package dollar starts are not the quote; the flake tier × typical size is.</p>
  <div class="fields three">${catalogAdjFields('Solid credit','settings.catalog.garage.materialAdj.solid')}${lockedField('Material adj · flake ($)','settings.catalog.garage.materialAdj.flake','number','0 means included in the base fee.','min="-10000" step="1"')}${lockedField('Material adj · metallic ($)','settings.catalog.garage.materialAdj.metallic','number','','min="-10000" step="1"')}${lockedField('Material adj · sealer ($)','settings.catalog.garage.materialAdj.sealer','number','','min="-10000" step="1"')}${lockedField('Material adj · custom ($)','settings.catalog.garage.materialAdj.custom','number','','min="-10000" step="1"')}${lockedField('Topcoat adj · premium ($)','settings.catalog.garage.topcoatAdj.premium','number','','min="-10000" step="1"')}</div>
  <div class="fields three">${lockedField('Condition · unknown ($)','settings.catalog.garage.conditionAdj.unknown','number','Do not leave blank if unknown jobs must price')}${lockedField('Condition · fair ($)','settings.catalog.garage.conditionAdj.fair','number')}${lockedField('Condition · poor ($)','settings.catalog.garage.conditionAdj.poor','number')}${lockedField('Condition · critical ($)','settings.catalog.garage.conditionAdj.critical','number')}${lockedField('Condition · paint ($)','settings.catalog.garage.conditionAdj.paint','number')}${lockedField('Condition · adhesive ($)','settings.catalog.garage.conditionAdj.adhesive','number')}</div>
  <div class="fields three">${lockedField('Prep · cracks ($)','settings.catalog.garage.prepAdj.cracks','number')}${lockedField('Prep · spalling ($)','settings.catalog.garage.prepAdj.spalling','number')}${lockedField('Prep · coating removal ($)','settings.catalog.garage.prepAdj.coatingRemoval','number')}${lockedField('Prep · patching ($)','settings.catalog.garage.prepAdj.patching','number')}${lockedField('Prep · leveling ($)','settings.catalog.garage.prepAdj.leveling','number')}${lockedField('Prep · moisture ($)','settings.catalog.garage.prepAdj.moisture','number')}</div>
  <h4 style="margin:16px 0 6px;font-size:13px">Flatwork (tables / countertops / bars) size bands</h4>
  ${(state.settings.catalog.flatwork.sizeBands||[]).map((b,i)=>`<div class="fields three">${lockedField(b.label+' · starting ($)','settings.catalog.flatwork.sizeBands.'+i+'.starting','number')}<div class="field"><label>Band id</label><input disabled value="${escape(b.id)}"></div><div class="field"><label>Max sq ft</label><input disabled value="${escape(b.maxSqft==null?'(open)':b.maxSqft)}"></div></div>`).join('')}
  <div class="fields">${lockedField('Largest flatwork item (sq ft)','settings.catalog.flatwork.maxItemSqft','number','Above this, measure and quote per sq ft on the floor flow, or set a custom starting price.')}</div>
  <div class="fields three">${lockedField('Flatwork material · solid ($)','settings.catalog.flatwork.materialAdj.solid','number')}${lockedField('Flatwork material · flake ($)','settings.catalog.flatwork.materialAdj.flake','number')}${lockedField('Flatwork material · metallic ($)','settings.catalog.flatwork.materialAdj.metallic','number')}${lockedField('Flatwork topcoat · premium ($)','settings.catalog.flatwork.topcoatAdj.premium','number')}${lockedField('Flatwork condition · unknown ($)','settings.catalog.flatwork.conditionAdj.unknown','number')}${lockedField('Flatwork condition · fair ($)','settings.catalog.flatwork.conditionAdj.fair','number')}${lockedField('Flatwork condition · poor ($)','settings.catalog.flatwork.conditionAdj.poor','number')}${lockedField('Flatwork condition · critical ($)','settings.catalog.flatwork.conditionAdj.critical','number')}</div>
  <h4 style="margin:16px 0 6px;font-size:13px">Seating (chairs / stools)</h4>
  <div class="fields three">${lockedField('Chair starting / item ($)','settings.catalog.seating.byType.chair','number')}${lockedField('Stool starting / item ($)','settings.catalog.seating.byType.stool','number')}${lockedField('Other seating / item ($)','settings.catalog.seating.byType.other','number')}</div>
  <div class="fields three">${lockedField('Seating material · solid ($)','settings.catalog.seating.materialAdj.solid','number')}${lockedField('Seating material · flake ($)','settings.catalog.seating.materialAdj.flake','number')}${lockedField('Seating material · metallic ($)','settings.catalog.seating.materialAdj.metallic','number')}${lockedField('Seating topcoat · premium ($)','settings.catalog.seating.topcoatAdj.premium','number')}${lockedField('Seating condition · unknown ($)','settings.catalog.seating.conditionAdj.unknown','number')}${lockedField('Seating condition · fair ($)','settings.catalog.seating.conditionAdj.fair','number')}${lockedField('Seating condition · poor ($)','settings.catalog.seating.conditionAdj.poor','number')}${lockedField('Seating condition · critical ($)','settings.catalog.seating.conditionAdj.critical','number')}</div>
  <p class="method-note">Protective topcoat / good / sound / none adjustments default to <b>$0</b> (configured zero). All other catalog starts/adjustments default unconfigured (blank).</p>
  </div></details>
    <details open><summary>Approved adjustment limit (employee discount cap) ${owner?'':'🔒'}</summary><div class="detail-body">
  <p class="method-note">Owner sets the maximum adjustment an employee may apply on <b>Regular</b> price. Default <b>$0</b> until explicitly set. Cap is never computed from profit or margin. Customer-facing wording uses “approved adjustment,” not profit language.</p>
  ${owner?`<div class="fields three">${select('Cap mode','settings.approvedAdjustment.mode',[['amount','Maximum $ amount'],['pct','Maximum % of pre-tax regular price']])}${field('Maximum amount ($)','settings.approvedAdjustment.amount','number','Default 0')}${field('Maximum percent (%)','settings.approvedAdjustment.pct','number','Used when mode is %')}</div>
  <p class="method-note">Current limit: <b>${approvedAdjustmentLabel()}</b></p>`
  :`<div class="fields three">${lockedField('Cap mode','settings.approvedAdjustment.mode')}${lockedField('Maximum amount ($)','settings.approvedAdjustment.amount','number')}${lockedField('Maximum percent (%)','settings.approvedAdjustment.pct','number')}</div>
  <p class="method-note">Current approved adjustment limit: <b>${approvedAdjustmentLabel()}</b> (locked for workers).</p>`}
  </div></details>
${owner?`<div class="inline-actions" style="margin-top:14px"><button class="button secondary" id="resetRates">${authMode()?'Reset draft to starting allowances':'Reset starting rates'}</button></div>`:`<p class="method-note">Reset rates is owner-only${authMode()?'':' in this preview'}.</p>`}`;
}
function tableHTML(headers,rows){return `<div class="table-wrap"><table><thead><tr>${headers.map((v,i)=>`<th class="${i?'num':''}">${v}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`}
function costRows(items){return items.map(x=>`<tr><td>${escape(x.label)}${x.volume!==undefined?`<small>${num(x.volume,2)} ${escape(x.volumeUnit)} purchased · ${num(x.demand,2)} ${escape(x.volumeUnit)} estimated need</small>`:''}</td><td class="num">${num(x.qty,2)} ${escape(x.unit)}</td><td class="num">${cash(x.unitPrice)}</td><td class="num">${cash(x.total)}</td></tr>`)}
function areaDimsHTML(a){
  if(a.sqftMode==='rect'&&Array.isArray(a.rectangles)){
    return a.rectangles.map((r,i)=>`Rect ${i+1}: ${num(r.length)}×${num(r.width)} ft`).join('; ')||'No rectangles';
  }
  return 'Manual sq ft entry';
}


function fmtBaselineMoney(v){
  if(v&&typeof v==='object'&&!Array.isArray(v))return ['oneCar','twoCar','threeCar'].filter(k=>k in v).map(k=>({oneCar:'1-car',twoCar:'2-car',threeCar:'3-car'}[k]||k)+' '+fmtBaselineMoney(v[k])).join(' · ');
  if(v===null||v===undefined||v==='')return 'Pending';
  const n=Number(v);
  if(!Number.isFinite(n))return 'Pending';
  return cash(n);
}
function baselineAdjRows(adj,labels){
  const a=adj||{};
  return Object.keys(labels).map(k=>`<tr><td>${escape(labels[k])}</td><td class="num">${fmtBaselineMoney(a[k])}</td></tr>`);
}
function baselineMoneyRows(pairs){
  return pairs.map(([a,b])=>`<tr><td>${escape(a)}</td><td class="num">${fmtBaselineMoney(b)}</td></tr>`);
}
/** Internal-only sheet: current price-book baseline for this job's business area (services, catalog, and owner cost/product rates). */
function baselineSheetHTML(j,s,owner,print){
  const type=E.projectTypeOf(j);
  const cat=Object.assign({},E.catalogDefaults||{},(s&&s.catalog)||{});
  cat.garage=Object.assign({},(E.catalogDefaults&&E.catalogDefaults.garage)||{},(s.catalog&&s.catalog.garage)||{});
  cat.flatwork=Object.assign({},(E.catalogDefaults&&E.catalogDefaults.flatwork)||{},(s.catalog&&s.catalog.flatwork)||{});
  cat.seating=Object.assign({},(E.catalogDefaults&&E.catalogDefaults.seating)||{},(s.catalog&&s.catalog.seating)||{});
  const rates=Object.assign({},(E.defaults&&E.defaults.rates)||{},(s&&s.rates)||{});
  const products=Object.assign({},(E.defaults&&E.defaults.products)||{},(s&&s.products)||{});
  const costs=Object.assign({},(E.defaults&&E.defaults.costs)||{},(s&&s.costs)||{});
  const areaLabel={floor:'Floors (measured)',garage:'Garage packages',flatwork:'Flatwork (tables / countertops / bars)',seating:'Seating (chairs / stools)'}[type]||type;
  let serviceBlocks='';
  let notes='';
  const floorRatePairs=[
    ['Solid epoxy / sq ft',rates.solid],
    ['Flake epoxy / sq ft',rates.flake],
    ['Metallic epoxy / sq ft',rates.metallic],
    ['Clear sealer / sq ft',rates.sealer],
    ['Leveling / sq ft (¼ in)',rates.level],
    ['Moisture-control primer / sq ft',rates.moisture],
    ['Extra coat / sq ft',rates.extraCoat],
    ['Medium flake extra / sq ft',rates.mediumFlakeExtra],
    ['Full flake extra / sq ft',rates.fullFlakeExtra],
    ['Coating removal / sq ft',rates.removal],
    ['Patch kit (ea)',rates.patch]
  ];
  if(type==='floor'||(type==='garage'&&E.garageUsesMeasured(j))){
    serviceBlocks+=tableHTML(['Service (selling)','Baseline'],baselineMoneyRows(floorRatePairs));
  }
  if(type==='garage'){
    notes=(cat.garage.disclaimer||'').trim()?`<div class="warn-banner"><b>Garage package baseline:</b> ${escape(String(cat.garage.disclaimer).trim())}</div>`:'';
    serviceBlocks+=`<h4 style="margin:12px 0 6px;font-size:13px">Package starting prices</h4>`+tableHTML(['Package','Baseline'],baselineMoneyRows([
      ['1-car starting',cat.garage.oneCarStarting],
      ['2-car starting',cat.garage.twoCarStarting],
      ['3-car starting',cat.garage.threeCarStarting]
    ]));
    serviceBlocks+=`<h4 style="margin:12px 0 6px;font-size:13px">Material adjustments</h4>`+tableHTML(['Adjustment','Baseline'],baselineAdjRows(cat.garage.materialAdj,{solid:'Solid',flake:'Flake',metallic:'Metallic',sealer:'Sealer',custom:'Custom'}));
    serviceBlocks+=`<h4 style="margin:12px 0 6px;font-size:13px">Topcoat adjustments</h4>`+tableHTML(['Adjustment','Baseline'],baselineAdjRows(cat.garage.topcoatAdj,{protective:'Protective',none:'None',premium:'Premium'}));
    serviceBlocks+=`<h4 style="margin:12px 0 6px;font-size:13px">Condition adjustments</h4>`+tableHTML(['Adjustment','Baseline'],baselineAdjRows(cat.garage.conditionAdj,{unknown:'Unknown',good:'Good',sound:'Sound',fair:'Fair',poor:'Poor',critical:'Critical',paint:'Paint / coating',adhesive:'Adhesive'}));
    serviceBlocks+=`<h4 style="margin:12px 0 6px;font-size:13px">Prep adjustments</h4>`+tableHTML(['Adjustment','Baseline'],baselineAdjRows(cat.garage.prepAdj,{cracks:'Cracks / joints',spalling:'Spalling',coatingRemoval:'Coating removal',patching:'Patching',leveling:'Leveling',moisture:'Moisture-control primer'}));
    if(!E.garageUsesMeasured(j)){
      serviceBlocks+=`<p class="method-note">&gt;3-car / measured garages use the floor per-sq-ft rate book below.</p>`+tableHTML(['Service (selling)','Baseline'],baselineMoneyRows([
        ['Solid / sq ft',rates.solid],['Flake / sq ft',rates.flake],['Metallic / sq ft',rates.metallic],['Sealer / sq ft',rates.sealer],['Level / sq ft',rates.level],['Moisture / sq ft',rates.moisture]
      ]));
    }
  } else if(type==='flatwork'){
    const bandRows=(cat.flatwork.sizeBands||[]).map(b=>`<tr><td>${escape(b.label||b.id)}</td><td class="num">${fmtBaselineMoney(b.starting)}</td></tr>`);
    bandRows.push(`<tr><td>Custom / override starting</td><td class="num">${E.isConfigured(cat.flatwork.customStarting)?fmtBaselineMoney(cat.flatwork.customStarting):'Optional — blank is not a missing price'}</td></tr>`);
    serviceBlocks+=`<h4 style="margin:12px 0 6px;font-size:13px">Size-band starting prices</h4>`+tableHTML(['Band','Baseline'],bandRows);
    serviceBlocks+=`<h4 style="margin:12px 0 6px;font-size:13px">Material adjustments</h4>`+tableHTML(['Adjustment','Baseline'],baselineAdjRows(cat.flatwork.materialAdj,{solid:'Solid',flake:'Flake',metallic:'Metallic',sealer:'Sealer',custom:'Custom'}));
    serviceBlocks+=`<h4 style="margin:12px 0 6px;font-size:13px">Topcoat adjustments</h4>`+tableHTML(['Adjustment','Baseline'],baselineAdjRows(cat.flatwork.topcoatAdj,{protective:'Protective',none:'None',premium:'Premium'}));
    serviceBlocks+=`<h4 style="margin:12px 0 6px;font-size:13px">Condition adjustments</h4>`+tableHTML(['Adjustment','Baseline'],baselineAdjRows(cat.flatwork.conditionAdj,{unknown:'Unknown',good:'Good',fair:'Fair',poor:'Poor',critical:'Critical'}));
  } else if(type==='seating'){
    const by=cat.seating.byType||{};
    serviceBlocks+=`<h4 style="margin:12px 0 6px;font-size:13px">Per-item starting prices</h4>`+tableHTML(['Item type','Baseline / item'],baselineMoneyRows([
      ['Chair',by.chair],['Stool',by.stool],['Other seating',by.other]
    ]));
    serviceBlocks+=`<h4 style="margin:12px 0 6px;font-size:13px">Material adjustments</h4>`+tableHTML(['Adjustment','Baseline'],baselineAdjRows(cat.seating.materialAdj,{solid:'Solid',flake:'Flake',metallic:'Metallic',sealer:'Sealer',custom:'Custom'}));
    serviceBlocks+=`<h4 style="margin:12px 0 6px;font-size:13px">Topcoat adjustments</h4>`+tableHTML(['Adjustment','Baseline'],baselineAdjRows(cat.seating.topcoatAdj,{protective:'Protective',none:'None',premium:'Premium'}));
    serviceBlocks+=`<h4 style="margin:12px 0 6px;font-size:13px">Condition adjustments</h4>`+tableHTML(['Adjustment','Baseline'],baselineAdjRows(cat.seating.conditionAdj,{unknown:'Unknown',good:'Good',fair:'Fair',poor:'Poor',critical:'Critical'}));
  }
  const productRows=Object.keys(products).map(k=>{
    const pr=products[k]||{};
    return `<tr><td>${escape(pr.label||k)}</td><td class="num">${fmtBaselineMoney(pr.price)}</td><td class="num">${escape(String(pr.size??'—'))} ${escape(pr.unit||'')}</td><td class="num">${pr.coverage?num(pr.coverage):'—'}</td></tr>`;
  });
  const costPairs=[
    ['Loaded labor / person-hour ($)',costs.labor],
    ['Vehicle cost / mile ($)',costs.mile],
    ['Material waste (%)',costs.waste],
    ['Business overhead / job ($)',costs.overhead],
    ['Contingency reserve (%)',costs.contingency],
    ['Grinder + extractor / day ($)',costs.rentalDay],
    ['Diamond tooling allowance ($)',costs.tooling],
    ['Supplies allowance ($)',costs.supplies],
    ['Dust bags / filters ($)',costs.dust],
    ['Disposal allowance ($)',costs.disposal],
    ['Prep production (sq ft / person-hr)',costs.prepProduction],
    ['Coat production (sq ft / person-hr)',costs.coatProduction],
    ['Level production (sq ft / person-hr)',costs.levelProduction],
    ['Removal production (sq ft / person-hr)',costs.removalProduction],
    ['Setup hours',costs.setupHours],
    ['Default markup (%)',costs.markup]
  ];
  const costRowsHtml=costPairs.map(([a,b])=>{
    const pctOrQty=/\(%\)|person-hr\)|Setup hours/.test(a);
    const shown=(b===null||b===undefined||b==='')?'Pending':(pctOrQty?num(b):fmtBaselineMoney(b));
    return `<tr><td>${escape(a)}</td><td class="num">${shown}</td></tr>`;
  });
  const sectionClass=print?'baseline-sheet':'card baseline-sheet';
  return `<section class="${sectionClass}" style="margin-top:16px"><h3>0. Current baseline — ${escape(areaLabel)}</h3>
  <p class="method-note">Live price-book baseline for this business area. Pending = unconfigured (blocks a finalized quote) and is not the same as an explicit $0. Selling figures are what staff quotes from; product package costs and internal cost rates are owner-only. Inactive draft proposals are not included in these figures.</p>
  ${notes}
  <h4 style="margin:12px 0 6px;font-size:13px">Services &amp; catalog (selling)</h4>
  ${serviceBlocks||'<p class="method-note">No service baselines for this area.</p>'}
  ${owner?`<h4 style="margin:12px 0 6px;font-size:13px">Product package costs (owner)</h4>${tableHTML(['Product','Package $','Size','Coverage'],productRows)}
  <h4 style="margin:12px 0 6px;font-size:13px">Internal cost rates (owner)</h4>${tableHTML(['Cost / rate','Baseline'],costRowsHtml)}
  <p class="method-note">Owner cost/product fields are separate from customer selling rates. Chicago Nov 2026 baseline loaded selling rates/catalog only unless you also saved owner costs.</p>`
  :`<div class="info-banner"><b>Product package costs and internal cost rates are owner-only.</b> Workers see the selling baseline for this area above.</div>`}
  </section>`;
}

function internalContent(print=false){
  const j=activeJob(),s=state.settings,x=calc();
  const owner=isOwner();
  const moist=moistureSelectedAreas(j);
  const equipNeeds=equipmentPlan(j,x);
  const ohItems=x.overheadItems||[];
  const areaBlocks=j.areas.map((a,i)=>{
    const sf=computeAreaSqft(a);
    const prepOn=PREP_ITEMS.filter(p=>a.prep&&a.prep[p.key]).map(p=>p.label);
    const photos=[...(a.photos||[]),...(a.conditionPhotos||[])];
    return `<section class="internal-area">
      <h4>${escape(a.name||('Area '+(i+1)))} · ${num(sf)} sq ft</h4>
      <ul class="internal-list">
        <li><b>Dimensions:</b> ${escape(areaDimsHTML(a))} (mode: ${escape(a.sqftMode||'manual')})</li>
        <li><b>System:</b> ${escape(E.describe(a))}</li>
        <li><b>Base color:</b> ${escape(resolveBaseColor(a))} ${a.colorKey?`(${escape(a.colorKey)})`:''}</li>
        <li><b>Flake blend:</b> ${a.style==='flake'?escape(resolveFlakeBlend(a)||'—'):'n/a (not flake)'}</li>
        <li><b>Moisture-control primer:</b> ${(a.moisture||(a.prep&&a.prep.moisture))?'ON for this area':'OFF (default)'} ${a.style==='level'?'· level-only (no moisture charge)':''}</li>
        <li><b>Condition rating:</b> ${escape(a.conditionRating||'unknown')}${a.conditionNotes?' — '+escape(a.conditionNotes):''}</li>
        <li><b>Prep selected:</b> ${prepOn.length?prepOn.map(escape).join(', '):'None'}</li>
        <li><b>Topcoat / grip / level:</b> topcoat=${escape(a.topcoat||'—')}; grip=${a.grip?'yes':'no'}; level=${(a.level||a.style==='level')?'yes @ '+num(a.depth)+' in':'no'}</li>
        <li><b>Photo references:</b> ${photos.length?photos.length+' on file (reference only — not diagnostic)': 'None attached'}</li>
      </ul>
    </section>`;
  }).join('');
  const warnList=(x.warnings||[]).map(w=>`<li>${escape(w)}</li>`).join('')||'<li>No engine warnings right now.</li>';
  const confirmList=[
    'Manufacturer product SKUs / system acceptance for selected finishes',
    'Exact color / flake blend sample approval before install',
    moist.items.length?'Moisture product and testing criteria for selected moistured area(s)':'Moisture testing if conditions change after estimate',
    'Coverage yields and package sizes vs supplier invoices',
    'Site access, power, water, and curing temperature assumptions',
    j.routeAddress?'Matched route addresses vs real site/shop pins':'Route not verified — enter or calculate miles/minutes',
    'Unknowns: structural movement, hidden moisture, deep repairs beyond allowance'
  ].map(t=>`<li>${escape(t)}</li>`).join('');
  const travelPanel=`<section class="${print?'':'card'} internal-travel" style="margin-top:16px">
    <h3>Travel & routing (internal advanced)</h3>
    <div class="warn-banner"><b>Estimated route — requires review.</b> Auto-route uses public Photon geocoding + OSRM. Results are approximate. Manual override allowed here only.${owner?` Mileage rate remains $${E.n(s.costs.mile).toFixed(2)}/mi.`:' Mileage $ rate is owner-only.'}</div>
    <div class="fields ${owner?'':'locked-block'}">
      ${field('Starting / shop address','job.origin')}
      ${field('Site visits / round trips','job.visits','number','','step="1"')}
      ${field('Vehicles per visit','job.vehicles','number','','step="1"')}
      ${owner?field('One-way distance (miles)','job.miles','number','Manual override / after route'):lockedField('One-way distance (miles)','job.miles','number','Owner override in demo')}
      ${owner?field('One-way drive time (minutes)','job.minutes','number'):lockedField('One-way drive time (minutes)','job.minutes','number')}
      ${owner?select('Crew size','job.crew',[[4,'4-person crew'],[3,'3-person crew (standard)'],[2,'2-person crew']],'Internal — multiplies drive time only. Travel crew can be 2, 3, or 4.'):`<div class="field locked"><label>Crew size <span class="lock-pill">OWNER ONLY</span></label><input disabled value="${escape(String(j.crew||3))}"></div>`}
      ${owner?field('Mileage rate ($ / vehicle mile)','settings.costs.mile','number','Existing $0.85'):''}
      ${owner?field('Equipment rental days','job.rentalDays','number','','step="1"'):lockedField('Equipment rental days','job.rentalDays','number')}
    </div>
    <div class="inline-actions" style="margin-top:12px">
      <button class="button secondary" id="calculateRoute" type="button">↗ Calculate estimated route</button>
      <button class="quiet" id="openMaps" type="button">Open directions</button>
    </div>
    <p class="route-disclosure">Calculate route shares shop + job addresses with Photon and OSRM. Prefer fictional/test addresses in demos. Live routing may be unavailable offline — then enter miles/minutes manually.</p>
    <div class="route-message" id="routeMessage">${escape(j.routeNote||'No route calculated. Enter miles and minutes or calculate an estimated route.')}</div>
    <div class="formula" id="travelFormula">${travelFormulaHTML(x)}</div>
    <p class="method-note">${owner?`${num(j.miles)} mi × 2 × ${num(j.visits)} visit(s) × ${num(j.vehicles)} vehicle(s) = <b>${num(x.travelMiles)}</b> vehicle miles × ${cash(x.travel.rate)}/mi = ${cash(x.travel.mileage)}. Crew travel (in overhead): ${cash(x.travel.crewTravel)}. Travel in customer quote (once, not itemized): ${cash(x.travelInQuote||0)}.`:`${num(j.miles)} mi × 2 × ${num(j.visits)} visit(s) × ${num(j.vehicles)} vehicle(s) = <b>${num(x.travelMiles)}</b> vehicle miles. Travel dollars are owner-only and folded into the approved quote.`}</p>
  </section>`;

  return `${print?`<div class="doc-top"><div><div class="doc-brand">${escape(s.business.name)}</div><div class="doc-contact">${escape(s.business.address)}<br/>${escape(s.business.phone)}</div></div><div class="doc-title"><h2>Internal job-cost & field plan</h2><p>${escape(j.number)} · ${escape(j.date)}</p></div></div><p>${escape(j.customer)} ${escape(j.company)}<br/>${escape(j.address)}</p>`:''}
  <div class="notice">INTERNAL USE ONLY — comprehensive job-cost + field plan. Not for customers or subcontractors. Estimated costs; confirm tax, freight, manufacturer acceptance, and site conditions.</div>
  ${print?'':roleBadgeHTML()}
  <div class="metrics">${(owner
    ?[['Job cost',cash(x.cost),'Direct + overhead + contingency'],['Customer revenue',cash(x.total),cash(x.perSqft)+'/sq ft blended'],['Potential profit',cash(x.profit),'Owner-only · before income tax'],['Margin',num(x.margin)+'%',num(x.personHours)+' person-hr · crew '+x.crew]]
    :[['Approved customer total',cash(x.total),cash(x.perSqft)+'/sq ft blended'],['Sq ft',num(x.sqft),j.areas.length+' area(s)'],['Person-hours (ops)',num(x.personHours),'Crew '+x.crew],(authMode()?['Server','ON',x._server?'Verified totals':'Price check pending']:['Cloud','OFF','Not configured'])]
  ).map(([a,b,c])=>`<div class="metric"><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('')}</div>
  ${owner?'':'<div class="info-banner"><b>Worker field plan:</b> operational quantities and checklist only. Expected profit, margin, and discount authority are owner-only (legal/compliance wording — employees do not see those figures in this preview).</div>'}
  ${baselineSheetHTML(j,s,owner,print)}

  <section class="${print?'':'card'}" style="margin-top:16px"><h3>1. Per-area field plan</h3>
  <p class="method-note">Moisture selected on ${moist.items.length} area(s): ${num(moist.sqft)} sq ft → ${cash(moist.total)}. Photos are references only.</p>
  ${areaBlocks||'<p>No areas yet.</p>'}
  </section>

  <section class="${print?'':'card'}" style="margin-top:16px"><h3>2. Material quantities ${owner?'& cost allowances':' (planning qty — $ owner-only)'}</h3>
  ${owner
    ? tableHTML(['Material','Qty','Unit cost','Total'],costRows(x.material).concat([`<tr class="total-row"><td colspan="3">Materials (raw cost)</td><td class="num">${cash(x.mat)}</td></tr>`]))+(x.tax?`<p class="method-note">Purchase tax on materials: ${cash(x.tax)}</p>`:'')
    : tableHTML(['Material','Qty (planning)'], (x.material||[]).map(m=>`<tr><td>${escape(m.label)}</td><td class="num">${num(m.qty,2)} ${escape(m.unit)}</td></tr>`))+`<p class="method-note">Supplier package prices are owner-only. See selling-price Materials total in the allocation summary.</p>`}
  </section>

  <section class="${print?'':'card'}" style="margin-top:16px"><h3>3. Labor ${owner?'cost breakdown':'planned hours'}</h3>
  <p class="method-note">Production person-hours only. Crew travel time is folded into overhead (not double-counted here).</p>
  ${owner
    ? tableHTML(['Work','Person-hours','Hourly','Total'],costRows(x.hours).concat([`<tr class="total-row"><td colspan="3">Labor (raw cost)</td><td class="num">${cash(x.labor)}</td></tr>`]))
    : tableHTML(['Work','Planned person-hours'], (x.hours||[]).map(h=>`<tr><td>${escape(h.label)}</td><td class="num">${num(h.qty,2)}</td></tr>`))+`<p class="method-note">Crew pay rates are owner-only. See selling-price Labor total in the allocation summary.</p>`}
  </section>

  <section class="${print?'':'card'}" style="margin-top:16px"><h3>4. Equipment checklist ${owner?'& cost lines':''}</h3>
  <p class="method-note">Derived needs from prep/system/areas (checklist). ${owner?'Dollar lines are internal overhead — never separate customer charges.':'Equipment dollar costs are owner-only.'}</p>
  <ul class="internal-list">${equipNeeds.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>
  ${owner?tableHTML(['Equipment expense','Qty','Unit','Total'],costRows(x.equipment).concat([`<tr class="total-row"><td colspan="3">Equipment subtotal (in overhead)</td><td class="num">${cash(x.equip)}</td></tr>`])):'<p class="method-note">Raw equipment $ hidden in worker preview.</p>'}
  </section>

  ${travelPanel}

  ${owner?`<section class="${print?'':'card'}" style="margin-top:16px"><h3>6. Overhead subtotal (includes travel + equipment) — OWNER ONLY</h3>
  ${tableHTML(['Overhead component','Qty','Unit','Total'],costRows(ohItems).concat([`<tr class="total-row"><td colspan="3">Overhead total</td><td class="num">${cash(x.overhead)}</td></tr>`]))}
  <p class="method-note">Base overhead ${cash(x.overheadBase||0)} + travel ${cash(x.travelCost||0)} + equipment ${cash(x.equip)} = ${cash(x.overhead)}.</p>
  </section>`:`<section class="${print?'':'card'}" style="margin-top:16px"><h3>6. Mobilization notes</h3>
  <p class="method-note">Travel and equipment are included in the approved quote’s “Other included” selling-price allocation. Raw overhead dollars are owner-only.</p>
  </section>`}

  ${owner?`<section class="${print?'':'card'}" style="margin-top:16px"><h3>7. Reconciliation — raw cost vs charged allocation & profit (OWNER ONLY)</h3>
  ${(()=>{const q=quoteAllocation(x);return tableHTML(['Component','Amount'],[
    ['RAW materials cost (+ purchase tax)',x.mat+E.n(x.tax)],
    ['RAW production labor cost',x.labor],
    ['RAW overhead (base + travel + equipment)',x.overhead],
    ['RAW contingency',x.contingency],
    ['TOTAL INTERNAL JOB COST (raw)',x.cost],
    ['CHARGED Materials (selling-price allocation)',q.materials],
    ['CHARGED Labor (selling-price allocation)',q.labor],
    ['CHARGED Other included (selling-price allocation)',q.other],
    ['Customer subtotal (revenue before tax)',x.subtotal],
    ['Sales tax (customer)',x.salesTax],
    ['Customer total (revenue)',x.total],
    ['Approved adjustment applied',E.n(x.discount)],
    ['Approved adjustment limit (employee cap)',approvedAdjustmentCap(x)],
    ['Potential profit (subtotal − cost)',x.profit],
    ['Margin %',null]
  ].map(([a,b])=>b===null?`<tr><td>Estimated margin</td><td class="num">${num(x.margin)}%</td></tr>`:`<tr><td>${a}</td><td class="num">${cash(b)}</td></tr>`));})()}
  <p class="method-note">Selected price: ${escape(x.selected.label)}. Charged Materials/Labor/Other are planning allocations of the approved quote (markup included) and sum to subtotal. Raw rows are true estimated costs — owner-only. Cap is never derived from profit.</p>
  </section>`:`<section class="${print?'':'card'}" style="margin-top:16px"><h3>7. Approved selling-price allocation (no raw cost / no margin)</h3>
  ${quoteAllocationHTML(x)}
  <p class="method-note">Selected approved option: <b>${escape(x.selected.label)}</b>. Approved adjustment limit: <b>${approvedAdjustmentLabel()}</b> · applied ${cash(E.n(j.discount))}. Profit, margin, raw supplier cost, and hourly pay are owner-only — not shown here.</p>
  </section>`}

  <section class="${print?'':'card'}" style="margin-top:16px"><h3>8. Warnings, assumptions & confirm-with-manufacturer</h3>
  <h4>Engine warnings</h4><ul class="internal-list">${warnList}</ul>
  <h4>Confirm / unknowns</h4><ul class="internal-list">${confirmList}</ul>
  ${j.jobConcerns?`<p><b>Job concerns:</b> ${escape(j.jobConcerns)}</p>`:''}
  ${j.notes?`<p><b>Project notes:</b> ${escape(j.notes)}</p>`:''}
  </section>`;
}
function internalView(){const owner=isOwner();return heading('PRIVATE',owner?'Internal job-cost & field plan.':'Field plan (ops).',owner?'Per-area plan · materials · labor · travel · equipment · overhead · margin (owner).':'Per-area plan · materials · labor · travel · equipment checklist — profit/margin owner-only.',owner?'<div class="inline-actions"><button class="button secondary" id="costCSV2">↓ CSV</button><button class="button" data-print="internal">Print / save PDF ↗</button></div>':'<div class="inline-actions"><button class="button" data-print="internal">Print / save PDF ↗</button></div>')+roleBadgeHTML()+internalContent()}

function docOptionsHTML(x){
  return `<div class="doc-terms"><h4>Pricing & payment options</h4><p>Alternative options, not combined charges. Property add-in is the same under every option. Travel and equipment stay in internal overhead — not separate customer lines.</p></div>`
    +tableHTML(['Option','Finish','Full total','Compared with regular / payments'],Object.values(x.choices).map(c=>{
      const b=c.breakdown||{};
      const extraBits=(b.extras||[]).map(e=>escape(e.label)+' '+cash(e.amount)).join('<br/>');
      const pays=(c.payments||[]).map(p=>cash(p.amount)+' '+escape(p.label)).join('<br/>');
      return `<tr class="${x.selected.key===c.key?'selected':''}"><td><b>${escape(c.label)}</b>${x.selected.key===c.key?'<small>Selected</small>':''}</td><td class="num">${cash(b.finishRate)} / sq ft × ${num(b.finishQty)} = ${cash(b.finishAmount)}</td><td class="num">${cash(c.total)}</td><td class="num">${c.key==='regular'?'Full total used as the comparison':cash(c.savings)+' below the regular full total ('+num(c.savingsPct)+'% of that total)'}${extraBits?'<small>'+extraBits+'</small>':''}${pays?'<small>'+pays+'</small>':''}</td></tr>`;
    })).replace('<table>','<table class="doc-options">');
}
function jobSelectionFlags(j){
  const areas=j.areas||[];
  const has=k=>areas.some(a=>a.prep&&a.prep[k]);
  return{
    moisture:(j.areas||[]).some(a=>a.moisture||(a.prep&&a.prep.moisture)),
    cracks:has('cracks'),
    patching:has('patching')||has('spalling')||E.n(j.patchKits)>0,
    leveling:areas.some(a=>a.level||a.style==='level'||(a.prep&&a.prep.leveling)),
    removal:has('coatingRemoval')||has('adhesive')||j.condition==='paint'||j.condition==='adhesive',
    flake:areas.some(a=>a.style==='flake'),
    solid:areas.some(a=>a.style==='solid'),
    metallic:areas.some(a=>a.style==='metallic'),
    sealer:areas.some(a=>a.style==='sealer'),
    grip:areas.some(a=>a.grip),
    topcoat:areas.some(a=>a.style!=='level'&&a.topcoat!=='none'),
    finished:areas.some(a=>a.style!=='level'&&E.n(computeAreaSqft(a))>0)
  };
}
function customerGuideDocument(){
  const j=activeJob(),s=state.settings,x=calc(),b=s.business,f=jobSelectionFlags(j);
  const systems=[];
  if(f.solid)systems.push('solid-color epoxy');
  if(f.flake)systems.push('decorative flake epoxy');
  if(f.metallic)systems.push('metallic epoxy');
  if(f.sealer)systems.push('clear sealer system');
  if(f.leveling&&!f.finished)systems.push('self-leveling preparation');
  const systemLabel=systems.length?systems.join(', '):'the selected coating system';
  const step=function(n,title,body,included){
    return `<section class="guide-step ${included?'included':'baseline'}"><div class="guide-n">${n}</div><div><h4>${title}${included?' <span class="guide-tag">In your scope</span>':' <span class="guide-tag muted">Standard process</span>'}</h4><p>${body}</p></div></section>`;
  };
  let n=1;const blocks=[];
  blocks.push(step(String(n++).padStart(2,'0'),'Surface evaluation & moisture awareness',
    'Before coating, Exotic Splash evaluates the slab condition and discusses moisture risk. Where moisture testing is appropriate for the site or required by the manufacturer system, testing is performed or reviewed and results inform whether a moisture-control primer / barrier belongs in scope. Photos taken during estimating are references only — they do not diagnose moisture, structure, or plumbing issues by themselves.',
    true));
  blocks.push(step(String(n++).padStart(2,'0'),'Grinding, profile & cleaning',
    'Concrete is mechanically prepared (typically diamond grinding) to open the surface, remove laitance/contaminants as practical, and create a profile suited to the selected system. Dust extraction and cleaning help the primer and coatings bond. Exact profile and prep depth follow the approved system for your floor.',
    true));
  if(f.removal){
    blocks.push(step(String(n++).padStart(2,'0'),'Existing coating or residue removal',
      'Where existing paint, coating, or adhesive residue is in scope, additional removal work is performed so the new system can bond to a suitable substrate. Heavy or unexpected layers beyond the allowance may require a written change order.',
      true));
  }
  if(f.cracks||f.patching){
    blocks.push(step(String(n++).padStart(2,'0'),'Crack attention, patching & repairs in scope',
      'Selected crack, spall, or patch work is addressed with compatible repair materials so the surface is more uniform before coating. Moving structural cracks, deep structural repairs, or conditions outside the listed allowance are not implied and need separate approval if discovered.',
      true));
  }
  if(f.leveling){
    blocks.push(step(String(n++).padStart(2,'0'),'Self-leveling (where selected)',
      'Where leveling is selected, a cementitious self-leveler (with its primer as required) is applied over the prepared areas at the average depth listed on the estimate. Leveling improves flatness for the finish; it is not a structural repair. Average depth—not the deepest spot—drives material planning.',
      true));
  }
  const moistAreas=(j.areas||[]).filter(a=>a.moisture||(a.prep&&a.prep.moisture));
  if(moistAreas.length){
    const names=moistAreas.map(a=> (a.name||'Area')+' ('+num(computeAreaSqft(a))+' sq ft)').join('; ');
    blocks.push(step(String(n++).padStart(2,'0'),'Moisture-control primer / barrier (selected areas only)',
      'Moisture-control primer / barrier is included only on these selected area(s): '+escape(names)+'. Other areas on this estimate use the standard primer approach unless later changed in writing. On selected areas, a moisture-oriented primer or barrier is planned to help manage vapor transmission risk for a compatible system when testing, site inspection, or manufacturer requirements call for it. It is not a cure-all, not a substitute for diagnosing source issues, and not inferred from photos alone. Exact product and acceptance criteria must be confirmed before installation.',
      true));
  }else{
    blocks.push(step(String(n++).padStart(2,'0'),'Standard primer (no moisture barrier on selected areas)',
      'This estimate does not include a moisture-control primer / barrier on any listed area. Finished areas are planned with the standard compatible primer / base approach unless testing or manufacturer requirements later show a moisture-control product is needed on specific areas — that would be a separate written change to scope and price for those areas only.',
      false));
  }
  if(f.finished){
    blocks.push(step(String(n++).padStart(2,'0'),'Base coat / color system ('+escape(systemLabel)+')',
      'The selected base or color system is applied to prepared areas. Solid systems may use one or more base coats as listed; flake systems receive broadcast of decorative flakes at the selected density; metallic and sealer systems follow their selected build. Colors and blends should be confirmed from physical samples when possible.',
      true));
  }
  if(f.flake){
    blocks.push(step(String(n++).padStart(2,'0'),'Broadcast (flake)',
      'Decorative flakes are broadcast into the wet coating at the coverage selected on the estimate (spot, medium, or full). Excess flake is removed after cure as required by the system before topcoat.',
      true));
  }
  if(f.topcoat&&f.finished){
    blocks.push(step(String(n++).padStart(2,'0'),'Protective topcoat',
      'A protective topcoat allowance is included for finished areas (unless an area is marked without separate topcoat). Topcoat helps guard the decorative layer against wear and staining under normal use. Exact product and number of topcoat passes follow the approved manufacturer system.',
      true));
  }
  if(f.grip){
    blocks.push(step(String(n++).padStart(2,'0'),'Slip-resistant texture (selected)',
      'A slip-resistant texture additive or finish approach is included where selected. Texture can improve traction under many conditions but is not a guarantee against slipping. Keep floors clean and dry as practical; standing water and contaminants still increase slip risk.',
      true));
  }
  blocks.push(step(String(n++).padStart(2,'0'),'Cure & return-to-service',
    'Coatings need uninterrupted cure time before foot traffic, vehicle traffic, washing, or placing heavy items. Product-specific cure and return-to-service schedules must be confirmed for the approved system and site conditions (temperature, humidity, thickness). As a general planning range only—not a promise—many epoxy floor systems are often planned for light foot traffic in roughly 12–24 hours and fuller service over several days, but your project’s schedule will be stated for the products actually used.',
    true));
  blocks.push(step(String(n++).padStart(2,'0'),'Care, cleaning & protecting your floor',
    'Routine cleaning with a soft broom/dust mop and a manufacturer-compatible neutral cleaner helps preserve appearance. Avoid harsh solvents, abrasive powders, acidic cleaners, and prolonged standing water unless the installed system is specifically approved for those exposures. Use walk-off mats, felt pads under furniture, and promptly wipe chemical spills. Sharp impacts, metal-wheel loads, and dragging heavy equipment can damage any coating.',
    true));
  return `<article class="document guide-doc" id="customerGuideDoc">${j.isSample?'<div class="sample-banner"><b>ILLUSTRATIVE SAMPLE DATA</b></div>':''}
  <div class="doc-top"><div><div class="doc-brand">${escape(b.name)}</div><div class="doc-contact">${escape(b.address)}<br/>${escape(b.phone)}${b.email?'<br/>'+escape(b.email):''}</div></div><div class="doc-title"><h2>How we prepare &amp; install your floor</h2><p>Customer information · ${escape(j.number)}<br/>${escape(j.date)}</p></div></div>
  <div class="doc-client"><div><span class="doc-caption">Prepared for</span><b>${escape(j.customer||j.company||'Customer to be confirmed')}</b><br/>${escape(j.address||'Address to be confirmed')}</div><div><span class="doc-caption">Selected system summary</span>${escape(systemLabel)}<br/>${num(x.sqft)} sq ft total on estimate</div></div>
  <div class="notice"><b>Why this guide:</b> so you know what happens on site, why each step matters, and how to care for the floor afterward. Content below reflects the prep and system selections on <b>this</b> estimate.</div>
  ${blocks.join('')}
  <div class="doc-terms">
    <h4>Expected service life vs warranty</h4>
    <p><b>Expected service life</b> is a planning concept: how long a well-installed floor may continue to perform under normal use when cared for as recommended. It depends on traffic, UV/chemical exposure, moisture conditions, maintenance, and the specific products installed. Exotic Splash does not state a single universal year count in this guide because product systems and sites differ.</p>
    <p><b>Warranty coverage</b> is separate. Any warranty is defined only by the written warranty terms provided for your project (and any manufacturer warranties that apply). Service-life expectations are not the same as warranty length, and nothing in this guide expands, creates, or replaces warranty terms.</p>
    <h4>Important caveats</h4>
    <ul>
      <li>Manufacturer product data sheets and site conditions govern film build, recoat windows, moisture limits, and cure — confirm the approved system before work.</li>
      <li>This guide does not invent product-specific cure times, moisture thresholds, yields, service-life years, or warranty text.</li>
      <li>Moisture-control primer / barrier appears above only for area(s) where it was deliberately checked; it is optional per area and not auto-included on the whole job.</li>
      <li>Photos and walkthrough notes support scoping; they are not a standalone diagnosis.</li>
    </ul>
    <p class="method-note">Open product confirmations for Owner / manufacturer: exact primer/barrier product name, approved moisture test method &amp; thresholds, project cure/return schedule, any desired service-life planning range, exact care sheet, and warranty document linkage.</p>
  </div>
  </article>`;
}
function customerDocument(){
  const j=activeJob(),s=state.settings,x=calc(),b=s.business;
  const vis=customerVisibleLines(x);
  const catalog=isCatalogJob(j);
  const prepNotes=j.areas.filter(a=>(a.conditionRating&&a.conditionRating!=='unknown')||(a.prep&&Object.values(a.prep).some(v=>v===true))).map(a=>{
    const items=PREP_ITEMS.filter(p=>a.prep&&a.prep[p.key]).map(p=>p.label);
    return `• ${escape(a.name)}: condition ${escape(a.conditionRating||'unknown')}${items.length?' — '+items.map(escape).join(', '):''}${a.conditionNotes?' — '+escape(a.conditionNotes):''}`;
  }).join('<br/>');
  const blockedDoc=(x.blockingIssues||[]).length>0;
  const totalBlock=x.quoteReady
    ?`<div class="doc-total">${x.selected.breakdown?`<div><span>Finish</span><span>${cash(x.selected.breakdown.finishAmount)}</span></div><div><span>Separate extras</span><span>${cash(x.selected.breakdown.extrasAmount)}</span></div>`:''}${x.minimum?`<div><span>${escape(x.minimumLabel||'Minimum project adjustment')}</span><span>${cash(x.minimum)}</span></div>`:''}${x.discount?`<div><span>Approved extra discount</span><span>−${cash(x.discount)}</span></div>`:''}${x.salesTax?`<div><span>Sales tax (${num(j.tax)}%)</span><span>${cash(x.salesTax)}</span></div>`:''}<div class="grand"><span>Total ${j.docType==='invoice'?'price':'estimate'}</span><span>${cash(x.total)}</span></div><p class="method-note">A previously saved customer quote is not changed by opening this screen.</p>${x.sqft?`<div><span>Blended installed rate*</span><span>${cash(x.perSqft)} / sq ft</span></div>`:''}${x.selected.key!=='regular'?`<div><span>Below the regular full total</span><span>${cash(x.selected.savings)} (${num(x.selected.savingsPct)}% of that full total)</span></div>`:''}</div>`
    :blockedDoc
      ?`<div class="doc-total"><div class="grand"><span>Total ${j.docType==='invoice'?'price':'estimate'}</span><span class="pending-total">Needs fixing</span></div><div><span>Status</span><span>Not issued</span></div></div>`
      :`<div class="doc-total"><div class="grand"><span>Total ${j.docType==='invoice'?'price':'estimate'}</span><span class="pending-total">Pending — starting price needed</span></div><div><span>Status</span><span>Incomplete / not finalized</span></div></div>`;
  return `<article class="document">${j.isSample?'<div class="sample-banner"><b>ILLUSTRATIVE SAMPLE DATA</b></div>':''}
  ${blockedDoc?priceNeededBanner(x):(!x.quoteReady?`<div class="warn-banner"><b>Starting price needed</b> — this document is not a finalized customer quote. Required price-book inputs are unconfigured.</div>`:'')}
  <div class="doc-top"><div><div class="doc-brand">${escape(b.name)}</div><div class="doc-contact">${escape(b.address)}<br/>${escape(b.phone)}${b.email?'<br/>'+escape(b.email):''}</div></div><div class="doc-title"><h2>${j.docType==='invoice'?'Invoice':'Estimate'}${x.quoteReady?'':' (pending)'}</h2><p>${escape(j.number)}<br/>${escape(j.date)}</p></div></div>
  <div class="doc-client"><div><span class="doc-caption">Prepared for</span><b>${escape(j.customer||j.company||'Customer to be confirmed')}</b>${j.customer&&j.company?'<br/>'+escape(j.company):''}${j.email?'<br/>'+escape(j.email):''}${j.phone?'<br/>'+escape(j.phone):''}</div><div><span class="doc-caption">Project location</span>${escape(j.address||'Address to be confirmed')}<br/><b>${catalog?(j.projectType+' · '+(j.garagePackage||((j.catalogItems||[]).length+' item(s)'))):(num(x.sqft)+' sq ft total')}</b></div></div>
  ${catalog?catalogBreakdownDocHTML(x):(x.selected&&x.selected.breakdown?tableHTML(['Work / scope','Quantity','Rate','Amount'],[
    `<tr><td><b>Finish · ${escape(x.selected.short)}</b><small>This rate × quantity is the finish portion of the total below.</small></td><td class="num">${num(x.selected.breakdown.finishQty)} sq ft</td><td class="num">${cash(x.selected.breakdown.finishRate)}</td><td class="num">${cash(x.selected.breakdown.finishAmount)}</td></tr>`,
    ...(x.selected.breakdown.extras||[]).map(e=>`<tr><td><b>${escape(e.label)}</b><small>Separate from the finish rate. Not a material surcharge.</small></td><td class="num">${num(e.qty)} ${escape(e.unit||'')}</td><td class="num">${cash(e.rate)}</td><td class="num">${cash(e.amount)}</td></tr>`)
  ]):tableHTML(['Work / scope','Quantity','Rate','Amount'],vis.map(a=>`<tr><td><b>${escape(a.label)}</b><small>${escape(a.description)}</small></td><td class="num">${num(a.qty)} ${escape(a.unit)}</td><td class="num">${cash(a.rate)}</td><td class="num">${cash(a.total)}</td></tr>`)))}
  ${totalBlock}
  ${x.quoteReady?quoteAllocationHTML(x,{customer:true}):''}
  ${(j.showOptions||x.selected.key!=='regular')&&x.sqft&&x.quoteReady?docOptionsHTML(x):''}
  <div class="doc-terms"><h4>Included scope</h4>${j.areas.filter(a=>E.n(computeAreaSqft(a))).map(a=>`<div>• ${escape(a.name)}: ${num(computeAreaSqft(a))} sq ft - ${escape(E.describe(a))}${a.grip?' (slip-resistant texture requested)':''}${a.topcoat&&a.topcoat!=='none'?' · protective topcoat allowance':''}.</div>`).join('')}
  ${x.addOn.included?`<div>• ${escape(x.addOn.label)}: ${cash(x.addOn.rate)} / sq ft on ${num(x.sqft)} sq ft.</div>`:''}
  <p>Standard mechanical preparation and cleanup are included. Finished areas receive a compatible primer / base system and protective topcoat as specified.</p>
  ${prepNotes?`<h4>Observed conditions & prep (from walkthrough)</h4><p>${prepNotes}<br/><i>Photos are reference only; final scope requires on-site confirmation. This is not a photo-only diagnosis.</i></p>`:''}
  <h4>Site conditions & exclusions</h4><p>Pricing assumes stated measurements, cleared access and described surface condition. Products, colors, coverage, texture, slab moisture and coating compatibility must be confirmed before installation. Structural repairs, moving cracks, deeper leveling, moisture remediation unless listed, heavy removal beyond selected allowance, cove base, vertical surfaces, furniture moving and temporary heating are excluded.</p>
  ${s.notes?'<h4>Competitive pricing review</h4><p>'+escape(s.notes)+'</p>':''}
  <h4>Schedule & payment</h4>${x.selected.key!=='regular'?`<p><b>${escape(x.selected.label)}</b> — total ${cash(x.total)}:</p><ul>${x.selected.payments.map(p=>`<li>${cash(p.amount)} (${num(p.pct)}%) — ${escape(p.label)}</li>`).join('')}</ul>`:''}<p>${escape(j.terms).replaceAll('\n','<br/>')}</p>
  ${j.notes?'<h4>Project notes</h4><p>'+escape(j.notes).replaceAll('\n','<br/>')+'</p>':''}
  <p>*Blended rate is rounded; the total governs. Slip-resistant texture is not a guarantee against slipping. ${j.docType==='estimate'?'This is an estimate for proposed work, not a receipt.':'This invoice does not represent proof of payment.'}</p>
  ${j.includeInternalInCustomer?`<div class="warn-banner"><b>WARNING:</b> Internal cost figures were explicitly enabled for this export.<br/>Estimated internal cost ${cash(x.cost)} · potential remainder ${cash(x.profit)} · margin ${num(x.margin)}%.</div>`:''}
  </div><div class="signature"><div>Customer signature / date</div><div>Contractor signature / date</div></div></article>`;
}
function subcontractorDocument(){
  const j=activeJob(),s=state.settings,x=calc(),b=s.business;
  const showContact=!!j.includeCustomerContactInSub;
  const showPrice=!!j.includeCustomerPriceInSub;
  return `<article class="document">${j.isSample?'<div class="sample-banner"><b>ILLUSTRATIVE SAMPLE DATA</b></div>':''}
  <div class="doc-top"><div><div class="doc-brand">${escape(b.name)}</div><div class="doc-contact">${escape(b.address)}<br/>${escape(b.phone)}</div></div><div class="doc-title"><h2>Subcontractor scope</h2><p>${escape(j.number)}<br/>${escape(j.date)}</p></div></div>
  <div class="doc-client"><div><span class="doc-caption">Job site</span>${escape(j.address||'Address to be confirmed')}<br/><b>${num(x.sqft)} sq ft</b> total</div>
  <div><span class="doc-caption">Crew / visits</span>${x.crew}-person crew · ${num(j.visits)} site visit(s)<br/>${showContact?`Customer: ${escape(j.customer||j.company||'—')}${j.phone?' · '+escape(j.phone):''}`:'Customer contact withheld (default)'}</div></div>
  <div class="notice">For field execution. Internal costs, margins and ${showPrice?'':'customer prices '}are omitted unless explicitly enabled above.</div>
  <h3 style="margin:18px 0 8px">Areas & measurements</h3>
  ${tableHTML(['Area','Sq ft','System / finish','Notes'],j.areas.map(a=>`<tr><td><b>${escape(a.name)}</b><small>${(a.photos||[]).length} photo ref(s)</small></td><td class="num">${num(computeAreaSqft(a))}</td><td>${escape(E.describe(a))}${a.grip?' · slip-resistant':''}</td><td>${escape(a.textureNote||a.conditionNotes||'—')}</td></tr>`))}
  <h3 style="margin:18px 0 8px">Prep checklist</h3>
  ${tableHTML(['Area','Condition','Prep items'],j.areas.map(a=>`<tr><td>${escape(a.name)}</td><td>${escape(a.conditionRating||'unknown')}</td><td>${PREP_ITEMS.filter(p=>a.prep&&a.prep[p.key]).map(p=>escape(p.label)).join(', ')||'None selected / not inspected'}</td></tr>`))}
  <h3 style="margin:18px 0 8px">Schedule assumptions</h3>
  <p class="method-note">${escape(j.terms)} ${j.jobConcerns?'Concerns: '+escape(j.jobConcerns):''}</p>
  ${showPrice?`<h3 style="margin:18px 0 8px">Customer pricing (explicitly included)</h3><p>Selected ${escape(x.selected.label)} · total ${cash(x.total)}</p>`:''}
  <p class="route-disclosure">Photo references are not a substitute for site verification. Do not treat this local file as a hosted share link.</p>
  </article>`;
}
function customerView(){return heading('CUSTOMER DOCUMENT','Clear scope. One price.','Estimate + install guide. No internal costs or margins.','<div class="inline-actions"><button class="button" data-print="customer">Print estimate + guide ↗</button><button class="button secondary" data-print="guide">Print guide only ↗</button></div>')+`<div class="doc-tools"><p>Use the browser print dialog → Save as PDF. The install guide is included with the customer package by default.</p><button class="quiet" data-view="guide">Open guide view</button> <button class="quiet" data-view="guided">← Guided workflow</button></div>`+customerDocument()+`<div class="divider"></div><h3 style="margin:18px 8px 8px">Included: How we prepare & install your floor</h3>`+customerGuideDocument()}
function guideView(){return heading('CUSTOMER INSTALL GUIDE','How we prepare & install.','Dynamic to your selections · printable on mobile.','<button class="button" data-print="guide">Print / save PDF ↗</button>')+`<div class="doc-tools"><button class="quiet" data-view="customer">← Customer estimate</button> <button class="quiet" data-export-html="guide">Download guide HTML</button></div>`+customerGuideDocument()}
function subView(){return heading('SUBCONTRACTOR PACK','Scope for the crew.','Privacy defaults on.','<button class="button" data-print="subcontractor">Print / save PDF ↗</button>')+`<div class="doc-tools"><button class="quiet" data-view="guided">← Guided workflow</button></div>`+subcontractorDocument()}
/* JOB_BOARD_START */
let jobBoardFilters=null;
let jobBoardSelected=new Set();
let pendingDeleteIds=[];
const LIVE_BOARD={jobBoardQuery:'q',jobBoardPriceMin:'priceMin',jobBoardPriceMax:'priceMax',jobBoardDateFrom:'dateFrom',jobBoardDateTo:'dateTo'};
function boardFilters(){
  if(!jobBoardFilters){
    jobBoardFilters=window.EsJobBoard?window.EsJobBoard.loadFilters(localStorage):{q:'',status:'',type:'',system:'',tier:'',garageSize:'',city:'',zip:'',crew:'',estimator:'',dateField:'updated',dateFrom:'',dateTo:'',priceMin:'',priceMax:'',sort:'updated-desc',group:'none',showArchived:false};
  }
  return jobBoardFilters;
}
function persistBoardFilters(){if(window.EsJobBoard)window.EsJobBoard.saveFilters(localStorage,boardFilters())}
function boardStatus(j){return window.EsJobBoard?window.EsJobBoard.statusOf(j):String(j&&j._status||'draft')}
function estimatorLabel(j){
  if(j&&j._estimatorName)return String(j._estimatorName);
  const id=j&&j._createdBy;
  const dir=runtime.estimatorDirectory||{};
  if(id&&dir[id])return String(dir[id]);
  if(!authMode())return 'Offline demo';
  return id?'Staff':'Unknown';
}
function customerPrice(j){
  try{
    const x=E.calculate(j,state.settings);
    if(!x||!x.quoteReady)return {ready:false,total:null};
    const total=Number(x.total);
    return {ready:true,total:Number.isFinite(total)?total:null};
  }catch(e){return {ready:false,total:null}}
}
function jobRecord(j){
  const price=customerPrice(j);
  return {
    id:j.id,customer:j.customer||'',company:j.company||'',address:j.address||'',city:j.city||'',zip:j.zip||'',
    phone:j.phone||'',number:j.number||'',projectType:j.projectType||'floor',garageStyle:j.garageStyle||'',
    garagePackage:j.garagePackage||'',areas:(j.areas||[]).map(a=>({style:a&&a.style||''})),
    catalogItems:(j.catalogItems||[]).map(it=>({style:it&&it.style||''})),
    priceOption:j.priceOption||'regular',assignedCrew:j.assignedCrew||'',estimatorName:estimatorLabel(j),
    createdAt:j.createdAt||'',updatedAt:j._updatedAt||j.updatedAt||'',date:j.date||'',_status:j._status||'',
    draftMark:j.draftMark||'',customerTotal:price.ready?price.total:null,isSample:!!j.isSample
  };
}
function boardRecords(){return (state.jobs||[]).map(jobRecord)}
function boardView(){return window.EsJobBoard.apply(boardRecords(),boardFilters())}
function crewNames(){
  const raw=state.settings&&state.settings.business&&state.settings.business.crews;
  const list=Array.isArray(raw)?raw:[];
  const out=[];
  for(const name of list){const s=String(name||'').trim();if(s&&out.indexOf(s)<0)out.push(s)}
  return out;
}
function crewSettingsHTML(){
  if(!isOwner())return '';
  const business=state.settings.business||(state.settings.business={});
  if(!Array.isArray(business.crews))business.crews=[];
  const rows=business.crews.map((name,i)=>`<div class="inline-actions crew-row"><input data-crew-name="${i}" type="text" maxlength="80" value="${escape(name)}" aria-label="Crew name ${i+1}"><button type="button" class="quiet" data-crew-remove="${i}">Remove</button></div>`).join('');
  const note=authMode()?'Save the price book to keep this list for every signed-in account.':'This list stays in this browser with your other settings.';
  return `<div class="crew-settings"><h4>Crew names</h4><p class="method-note">Names you can assign on a job. ${note} Employees can pick a name. They cannot edit this list.</p>${rows}<button type="button" class="quiet" id="addCrewName">+ Add crew</button></div>`;
}
function crewSelectHTML(record){
  const names=crewNames();
  const current=String(record.assignedCrew||'');
  if(current&&names.indexOf(current)<0)names.unshift(current);
  const opts=['<option value="">Unassigned</option>'].concat(names.map(n=>`<option value="${escape(n)}"${n===current?' selected':''}>${escape(n)}</option>`));
  return `<select data-job-crew="${escape(record.id)}" aria-label="Assigned crew">${opts.join('')}</select>`;
}
function jobBoardCard(record){
  const owner=isOwner();
  const B=window.EsJobBoard;
  const status=B.statusOf(record);
  const systems=Array.from(B.systemsOf(record)).filter(s=>B.LABELS.system[s]).map(s=>B.LABELS.system[s]);
  const type=B.LABELS.type[record.projectType]||record.projectType||'Job';
  const tier=B.LABELS.tier[record.priceOption||'regular']||record.priceOption||'Regular';
  const size=record.projectType==='garage'?(B.LABELS.garageSize[record.garagePackage]||''):'';
  const total=record.customerTotal==null?'Pending':cash(record.customerTotal);
  const ownerTools=owner?`<div class="inline-actions job-card-actions"><button type="button" class="quiet" data-job-archive="${escape(record.id)}">${status==='archived'?'Unarchive':'Archive'}</button><button type="button" class="quiet" data-job-delete="${escape(record.id)}">Delete</button></div>`:'';
  return `<article class="job-card${record.id===state.activeJobId?' active':''}">
    <div class="job-card-top">${owner?`<label class="check-label job-pick"><input type="checkbox" data-job-select="${escape(record.id)}" ${jobBoardSelected.has(record.id)?'checked':''} aria-label="Select job"></label>`:''}
      <button type="button" class="job-card-open" data-switch-job="${escape(record.id)}"><b>${escape(record.customer||record.company||'Untitled lead')}${record.isSample?' · ILLUSTRATIVE SAMPLE':''}</b><small>${escape(record.address||'No address')} · ${escape(record.number)} · updated ${escape(String(record.updatedAt||'').slice(0,10))}</small></button>
      <span class="pill">${escape(B.LABELS.status[status]||status)}</span></div>
    <dl class="job-card-meta">
      <div><dt>Type</dt><dd>${escape(type)}</dd></div>
      <div><dt>System</dt><dd>${escape(systems.join(', ')||'—')}</dd></div>
      <div><dt>Tier</dt><dd>${escape(tier)}</dd></div>
      ${size?`<div><dt>Garage size</dt><dd>${escape(size)}</dd></div>`:''}
      <div><dt>City</dt><dd>${escape(B.cityOf(record)||'—')}</dd></div>
      <div><dt>Customer total</dt><dd>${total}</dd></div>
      <div><dt>Estimator</dt><dd>${escape(record.estimatorName||'Unknown')}</dd></div>
      <div><dt>Crew</dt><dd>${crewSelectHTML(record)}</dd></div>
    </dl>${ownerTools}</article>`;
}
function jobBoardResultsHTML(){
  if(!window.EsJobBoard)return jobListHTML();
  const view=boardView();
  if(!view.jobs.length)return '<p class="empty">No jobs match these filters.</p>';
  const group=boardFilters().group;
  if(!group||group==='none')return `<div class="job-board-list">${view.jobs.map(jobBoardCard).join('')}</div>`;
  return view.groups.map(g=>`<h3 class="job-group-label">${escape(g.label)}</h3><div class="job-board-list">${g.jobs.map(jobBoardCard).join('')}</div>`).join('');
}
function jobBoardCountText(){
  if(!window.EsJobBoard)return '';
  const shown=boardView().jobs.length;
  const hidden=(state.jobs||[]).filter(j=>boardStatus(j)==='archived'&&!boardFilters().showArchived).length;
  return shown+' shown'+(hidden?' · '+hidden+' archived hidden':'');
}
function boardChoice(key,label,pairs){
  const current=String(boardFilters()[key]||'');
  return `<div class="field"><label for="board-${escape(key)}">${escape(label)}</label><select id="board-${escape(key)}" data-board-filter="${escape(key)}">${pairs.map(([v,t])=>`<option value="${escape(v)}"${current===String(v)?' selected':''}>${escape(t)}</option>`).join('')}</select></div>`;
}
function jobsDataBanner(){
  const employee=!isOwner();
  const who=employee?'Employee preview. Search, sort, and filter only. No delete or archive.':'Owner preview.';
  if(!authMode())return '<div class="sample-banner" data-demo-banner="offline"><b>OFFLINE DEMO DATA.</b> These jobs stay in this browser. They are not loaded from the server.</div>';
  const id=runtime.profile&&runtime.profile.id||'';
  if(String(id).indexOf('preview-')===0)return '<div class="sample-banner" data-demo-banner="preview"><b>OFFLINE DEMO DATA.</b> '+who+' Illustrative jobs, not loaded from the server.</div>';
  return '';
}
function jobBoardHTML(){
  if(!window.EsJobBoard)return `<section class="card">${jobListHTML()}</section>`;
  const B=window.EsJobBoard;
  const f=boardFilters();
  const owner=isOwner();
  const records=boardRecords();
  const cities=B.distinct(records,j=>B.cityOf(j));
  const zips=B.distinct(records,j=>B.zipOf(j));
  const crews=crewNames().slice();
  records.forEach(r=>{if(r.assignedCrew&&crews.indexOf(r.assignedCrew)<0)crews.push(r.assignedCrew)});
  const estimators=B.distinct(records,j=>j.estimatorName);
  const L=B.LABELS;
  const filters=`<div class="fields job-board-filters">
    ${boardChoice('status','Status',[['', 'Any status']].concat(B.STATUSES.map(s=>[s,L.status[s]])))}
    ${boardChoice('type','Job type',[['', 'Any type'],['floor',L.type.floor],['garage',L.type.garage],['flatwork',L.type.flatwork],['seating',L.type.seating]])}
    ${boardChoice('system','System',[['', 'Any system'],['solid',L.system.solid],['flake',L.system.flake],['metallic',L.system.metallic]])}
    ${boardChoice('tier','Tier',[['', 'Any tier'],['regular',L.tier.regular],['opt1',L.tier.opt1],['opt2',L.tier.opt2]])}
    ${boardChoice('garageSize','Garage size',[['', 'Any garage size'],['1car',L.garageSize['1car']],['2car',L.garageSize['2car']],['3car',L.garageSize['3car']],['measured',L.garageSize.measured]])}
    ${boardChoice('city','City',[['', 'Any city']].concat(cities.map(c=>[c,c])))}
    ${boardChoice('zip','ZIP',[['', 'Any ZIP']].concat(zips.map(z=>[z,z])))}
    ${boardChoice('crew','Crew',[['', 'Any crew'],['__unassigned__','Unassigned']].concat(crews.map(c=>[c,c])))}
    ${boardChoice('estimator','Who took the estimate',[['', 'Anyone']].concat(estimators.map(n=>[n,n])))}
    ${boardChoice('dateField','Date field',[['updated',L.dateField.updated],['created',L.dateField.created],['job',L.dateField.job]])}
    <div class="field"><label for="jobBoardDateFrom">From</label><input id="jobBoardDateFrom" type="date" value="${escape(f.dateFrom)}"></div>
    <div class="field"><label for="jobBoardDateTo">To</label><input id="jobBoardDateTo" type="date" value="${escape(f.dateTo)}"></div>
    <div class="field"><label for="jobBoardPriceMin">Customer total min</label><input id="jobBoardPriceMin" type="number" min="0" step="0.01" inputmode="decimal" value="${escape(f.priceMin)}"></div>
    <div class="field"><label for="jobBoardPriceMax">Customer total max</label><input id="jobBoardPriceMax" type="number" min="0" step="0.01" inputmode="decimal" value="${escape(f.priceMax)}"></div>
    ${boardChoice('sort','Sort',B.SORTS.map(s=>[s,L.sort[s]]))}
    ${boardChoice('group','Group',B.GROUPS.map(s=>[s,L.group[s]]))}
  </div>`;
  const bulk=owner?`<div class="inline-actions"><button type="button" class="button danger" id="jobBoardDeleteSelected">Delete selected</button></div>`:'';
  return `<section class="card job-board" data-jobs-role="${owner?'owner':'employee'}">${jobsDataBanner()}
    <div class="field"><label for="jobBoardQuery">Search</label><input id="jobBoardQuery" type="search" value="${escape(f.q)}" placeholder="Customer, company, address, city, ZIP, job number, or phone" autocomplete="off"></div>
    <p class="method-note" id="jobBoardCount">${escape(jobBoardCountText())}</p>
    ${filters}
    <div class="inline-actions"><label class="check-label"><input id="jobBoardShowArchived" data-board-filter="showArchived" type="checkbox" ${f.showArchived?'checked':''}> Show archived</label><button type="button" class="quiet" id="jobBoardReset">Reset filters</button></div>
    <div id="jobBoardResults">${jobBoardResultsHTML()}</div>
    ${bulk}
    <div class="inline-actions"><button class="button" id="newJobKeep2">+ New job</button><button class="button secondary" id="backup2">${authMode()?'Download my jobs (JSON)':'Backup all JSON'}</button></div>
    ${authMode()?'':`<div class="cloud-badge off">CLOUD SYNC OFF — not configured</div><p class="route-disclosure">Deleting site data clears jobs. Photos inflate storage — export backups before clearing.</p>`}
  </section>`;
}
function ensureDeleteDialog(){
  if(document.getElementById('jobDeleteDialog'))return;
  const d=document.createElement('dialog');
  d.id='jobDeleteDialog';
  d.innerHTML='<h2 id="jobDeleteTitle">Delete job</h2><p id="jobDeleteCopy"></p><label class="field">Type <b id="jobDeleteExpect"></b> to confirm<input id="jobDeleteInput" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false"></label><div class="inline-actions"><button type="button" class="button secondary" id="jobDeleteCancel">Cancel</button><button type="button" class="button danger" id="jobDeleteConfirm" disabled>Delete</button></div>';
  document.body.appendChild(d);
}
function openJobDelete(ids){
  if(!isOwner()){toast('Only the owner can delete jobs.');return}
  const jobs=(ids||[]).map(id=>state.jobs.find(j=>j.id===id)).filter(Boolean);
  if(!jobs.length){toast('Select at least one job.');return}
  const phrase=window.EsJobBoard.expectedDeletePhrase(jobs);
  if(!phrase){toast('That job has no number to confirm.');return}
  ensureDeleteDialog();
  pendingDeleteIds=jobs.map(j=>j.id);
  $('jobDeleteTitle').textContent=jobs.length===1?'Delete job':'Delete '+jobs.length+' jobs';
  $('jobDeleteExpect').textContent=phrase;
  $('jobDeleteCopy').textContent=jobs.length===1
    ?'This permanently deletes '+jobs[0].number+' ('+(jobs[0].customer||jobs[0].company||'untitled')+'), its photos, its discount approvals, and an acceptance only when this job number is unique. This cannot be undone.'
    :'This permanently deletes '+jobs.length+' jobs, their photos, their discount approvals, and acceptances linked by a unique job number. This cannot be undone.';
  $('jobDeleteInput').value='';
  $('jobDeleteConfirm').disabled=true;
  $('jobDeleteDialog').showModal();
}
async function deleteJobsByIds(ids){
  if(!isOwner()){toast('Only the owner can delete jobs.');return}
  const jobs=(ids||[]).map(id=>state.jobs.find(j=>j.id===id)).filter(Boolean);
  if(!jobs.length)return;
  if(authMode()&&runtime.deleteJobs){
    const server=jobs.map(j=>j._serverId).filter(Boolean);
    if(server.length){
      try{await runtime.deleteJobs(server)}
      catch(e){toast(e.message||'Not deleted.');return}
    }
  }
  const drop=new Set(jobs.map(j=>j.id));
  state.jobs=state.jobs.filter(j=>!drop.has(j.id));
  if(!state.jobs.some(j=>j.id===state.activeJobId))state.activeJobId=(state.jobs[0]&&state.jobs[0].id)||null;
  jobs.forEach(j=>jobBoardSelected.delete(j.id));
  if(!authMode())save();
  render();
  toast(jobs.length===1?'Job deleted.':jobs.length+' jobs deleted.');
}
async function toggleArchive(id){
  if(!isOwner()){toast('Only the owner can archive or un-archive jobs.');return}
  const j=state.jobs.find(x=>x.id===id);
  if(!j)return;
  const status=boardStatus(j);
  const next=status==='archived'?(j.archivedFrom&&['draft','quoted','issued'].indexOf(j.archivedFrom)>=0?j.archivedFrom:'draft'):'archived';
  if(next==='archived')j.archivedFrom=status;else delete j.archivedFrom;
  j._status=next;
  if(authMode()){
    const preview=String(runtime.profile&&runtime.profile.id||'').indexOf('preview-')===0;
    if(!j._serverId&&!preview){j._status=status;toast('Save the job before archiving.');return}
    if(runtime.setJobStatus){
      try{await runtime.setJobStatus(j)}
      catch(e){j._status=status;toast(e.message||'Not changed.');return}
    }
  }
  if(!authMode())save();
  render();
  toast(next==='archived'?'Archived.':'Restored.');
}
function handleJobBoardClick(t){
  if(t.dataset.jobDelete){
    if(!isOwner()){toast('Only the owner can delete jobs.');return true}
    openJobDelete([t.dataset.jobDelete]);
    return true;
  }
  if(t.dataset.jobArchive){
    if(!isOwner()){toast('Only the owner can archive or un-archive jobs.');return true}
    toggleArchive(t.dataset.jobArchive);
    return true;
  }
  if(t.id==='jobBoardDeleteSelected'){
    if(!isOwner()){toast('Only the owner can delete jobs.');return true}
    const visible=new Set((window.EsJobBoard?boardView().jobs:[]).map(j=>j.id));
    openJobDelete(Array.from(jobBoardSelected).filter(id=>visible.has(id)));
    return true;
  }
  if(t.id==='jobDeleteCancel'){const d=$('jobDeleteDialog');if(d&&d.open)d.close();return true}
  if(t.id==='jobDeleteConfirm'){
    if(!isOwner()){toast('Only the owner can delete jobs.');return true}
    const phrase=($('jobDeleteExpect')&&$('jobDeleteExpect').textContent)||'';
    const typed=($('jobDeleteInput')&&$('jobDeleteInput').value)||'';
    if(!window.EsJobBoard.phraseMatches(typed,phrase)){toast('Type the confirmation exactly.');return true}
    const ids=pendingDeleteIds.slice();
    const d=$('jobDeleteDialog');if(d&&d.open)d.close();
    deleteJobsByIds(ids);
    return true;
  }
  if(t.id==='addCrewName'){
    if(!isOwner()){toast('Only the owner can edit the crew list.');return true}
    const business=state.settings.business||(state.settings.business={});
    if(!Array.isArray(business.crews))business.crews=[];
    business.crews.push('');
    render();
    return true;
  }
  if(t.dataset.crewRemove!==undefined){
    if(!isOwner()){toast('Only the owner can edit the crew list.');return true}
    const crews=state.settings.business&&state.settings.business.crews;
    if(Array.isArray(crews))crews.splice(Number(t.dataset.crewRemove),1);
    if(!authMode())save({silent:true});
    render();
    return true;
  }
  if(t.id==='jobBoardReset'){
    jobBoardFilters=window.EsJobBoard.defaultFilters();
    persistBoardFilters();
    render();
    return true;
  }
  return false;
}
function jobsView(){
  const owner=isOwner();
  const preview=authMode()&&runtime.profile&&String(runtime.profile.id||'').indexOf('preview-')===0;
  const sub=preview?(owner?'Offline demo data. Not loaded from the server.':'Offline demo data for an employee. Not loaded from the server. Search, sort, and filter only the sample jobs on this screen.')
    :(authMode()?(owner?'Search and filter every company job. Archive and delete stay on this account.':'Search, sort, and filter the jobs this account can already open. Customer totals only.')
    :'Search and filter jobs kept in this browser.');
  const head=authMode()?heading(owner?'JOBS':'YOUR JOBS',owner?'Jobs.':'Your jobs.',sub,''):heading('LOCAL JOBS',owner?'Jobs.':'Your jobs.',owner?'Offline demo. Nothing here is loaded from a server.':'Offline demo for a worker. Search and sort stay. Delete and archive do not.','');
  const extra=authMode()&&runtime.jobsExtraHTML?runtime.jobsExtraHTML():'';
  return head+extra+jobBoardHTML();
}
/* JOB_BOARD_END */


async function getJSON(url){
  const controller=new AbortController(),t=setTimeout(()=>controller.abort(),18000);
  try{
    const r=await fetch(url,{signal:controller.signal});
    if(!r.ok)throw Error('Routing service unavailable ('+r.status+')');
    return await r.json();
  }finally{clearTimeout(t)}
}
async function geocode(address){
  const d=await getJSON('https://photon.komoot.io/api/?q='+encodeURIComponent(address)+'&limit=3&lang=en');
  const features=d.features||[];
  const expectedNumber=address.match(/^\s*(\d+[A-Za-z]?(?:-\d+)?)\b/)?.[1]?.toLowerCase();
  const candidates=features.filter(f=>String(f.properties.countrycode||'').toLowerCase()==='us');
  const f=expectedNumber?candidates.find(f=>String(f.properties.housenumber||'').toLowerCase()===expectedNumber):candidates[0];
  if(!f)throw Error(expectedNumber?'No exact street-number match for '+expectedNumber+'. Check the address in directions.':'Address not found');
  const p=f.properties;
  return {coord:f.geometry.coordinates,label:[p.housenumber,p.street||p.name,p.city||p.county,p.state,p.postcode,p.country].filter(Boolean).join(' ')};
}
let routeBusy=false;
async function calculateRoute(){
  if(routeBusy)return;
  const j=activeJob();
  if(!String(j.origin||'').trim()||!String(j.address||'').trim()){toast('Enter shop origin and job address first.');return}
  routeBusy=true;
  const origin=j.origin,address=j.address;
  const b=$('calculateRoute');
  if(b){b.disabled=true;b.textContent='Calculating…'}
  if($('routeMessage'))$('routeMessage').textContent='Finding addresses and a driving route (estimated)…';
  try{
    const [a,z]=await Promise.all([geocode(origin),geocode(address)]);
    const d=await getJSON('https://router.project-osrm.org/route/v1/driving/'+a.coord.join(',')+';'+z.coord.join(',')+'?overview=false');
    if(d.code!=='Ok'||!d.routes||!d.routes.length)throw Error('No driving route found');
    if(activeJob()!==j||j.origin!==origin||j.address!==address)throw Error('The address changed; calculate again');
    j.miles=Math.round(d.routes[0].distance/1609.344*10)/10;
    j.minutes=Math.ceil(d.routes[0].duration/60);
    j.routeNote='ESTIMATED route (review required): '+j.miles+' mi / '+j.minutes+' min one-way. Matched origin: '+a.label+'. Matched job: '+z.label+'. Verify before quoting. Live Photon+OSRM response.';
    j.routeAddress=address;j.routeOrigin=origin;j.routeSource='live';
    render();toast('Estimated route added — review matched addresses.');
  }catch(err){
    j.routeNote='Automatic route unavailable (fallback). Enter one-way miles and minutes manually under Internal. '+(err&&err.name==='AbortError'?'Service timed out.':(err&&err.message)||'');
    j.routeSource='fallback';
    if($('routeMessage'))$('routeMessage').textContent=j.routeNote;
    save();toast('Route fallback — enter mileage manually or retry.');
  }finally{
    routeBusy=false;
    if($('calculateRoute')){$('calculateRoute').disabled=false;$('calculateRoute').textContent='↗ Calculate estimated route'}
  }
}
function openMapsDirections(){
  const j=activeJob();
  const o=encodeURIComponent(j.origin||''),d=encodeURIComponent(j.address||'');
  if(!o||!d){toast('Need origin and job address.');return}
  window.open('https://www.google.com/maps/dir/?api=1&origin='+o+'&destination='+d,'_blank','noopener');
}

function render(){
  ensureJob();
  const v=['guided','rates','customer','guide','subcontractor','internal','jobs'].concat(authMode()?['approvals']:[]).concat(authMode()&&isOwner()?['staff']:[]).includes(state.view)?state.view:'guided';
  state.view=v;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  $('breadcrumb').textContent='Guided / '+({guided:'Field workflow',rates:'Costs & pricing',customer:'Customer document',guide:'Install guide',subcontractor:'Subcontractor',internal:'Internal job-cost',jobs:'Job list',staff:'Staff access',approvals:'Discount approvals'}[v]);
  const map={guided:guidedView,rates:ratesView,customer:customerView,guide:guideView,subcontractor:subView,internal:internalView,jobs:jobsView,staff:()=>runtime.staffViewHTML?runtime.staffViewHTML():'',approvals:()=>runtime.approvalsViewHTML?runtime.approvalsViewHTML():''};
  const openFlags=window.EsMobileUX&&window.EsMobileUX.captureOpen?window.EsMobileUX.captureOpen():null;
  $('main').innerHTML=map[v]();
  updateLive();
  save({silent:true});
  if(window.EsMobileUX&&window.EsMobileUX.afterRender)window.EsMobileUX.afterRender(openFlags);
}
function updateLive(){
  const x=calc();
  if($('liveSummary'))$('liveSummary').innerHTML=summaryHTML();
  if($('optionCards'))$('optionCards').innerHTML=optionCardsHTML(x);
  if($('travelFormula'))$('travelFormula').innerHTML=travelFormulaHTML(x);
}
function go(v){state.view=v;render();window.scrollTo({top:0,behavior:'smooth'})}
function goStep(id){const j=activeJob();if(!STEPS.some(s=>s.id===id))return;j.step=id;state.view='guided';render();window.scrollTo({top:0,behavior:'smooth'})}
function maybeCreateJobRecord(){
  const j=activeJob();
  if(!j)return;
  if(contactSufficient(j) && !j._contactCommitted){
    j._contactCommitted=true;
    pushHistory(j,'job','Local customer/job record created',j.customer||j.company);
    toast('Local job saved: '+(j.customer||j.company||j.id));
  }
}
function download(content,name,mime){
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function backupObject(){
  if(authMode()){ // employee export never carries the price book; owner export carries the draft for owner records only
    return {version:APP_VERSION,exportedAt:nowISO(),settings:isOwner()?state.settings:null,jobs:state.jobs.map(j=>{const c=clone(j);for(const k of Object.keys(c))if(k.charAt(0)==='_')delete c[k];if(!isOwner())delete c.markup;return c}),activeJobId:state.activeJobId,cloud:{enabled:true,note:'Export of server jobs. Restore is only available in the offline demo.'},exportedBy:isOwner()?'owner':'employee'};
  }
  return {version:APP_VERSION,exportedAt:nowISO(),settings:state.settings,jobs:state.jobs,activeJobId:state.activeJobId,cloud:{enabled:false,note:'Cloud sync was OFF at export. This file is a local backup only.'}};
}
function doBackup(){download(JSON.stringify(backupObject(),null,2),'Exotic-Splash-guided-backup-'+new Date().toISOString().slice(0,10)+'.json','application/json');toast('JSON backup downloaded (local only).')}
async function shareBackup(){
  const blob=new Blob([JSON.stringify(backupObject(),null,2)],{type:'application/json'});
  const file=new File([blob],'Exotic-Splash-guided-backup.json',{type:'application/json'});
  if(navigator.canShare&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file],title:'Exotic Splash job backup',text:'Local estimator backup (cloud OFF).'});return;}catch(e){if(e&&e.name==='AbortError')return;}
  }
  doBackup();toast('Web Share unavailable — downloaded file instead.');
}
function validateBackup(o){
  if(!o||![1,2,3,4,5,6,7].includes(o.version))throw Error('Use an Exotic Splash estimator backup.');
  if(o.version>=3){if(!Array.isArray(o.jobs))throw Error('Invalid multi-job backup.');if(!o.settings?.products&&o.exportedBy!=='employee')throw Error('Invalid multi-job backup.');}
  else{if(!o.settings?.products||!o.job||!Array.isArray(o.job.areas))throw Error('Invalid legacy backup.');}
}
function restoreObject(obj){
  validateBackup(obj);
  if(authMode())throw Error('Restore is disabled while signed in. Use Import offline jobs.');
  if(obj.settings)state.settings=deepMergeSettings(obj.settings);
  if(obj.version>=3){state.jobs=(obj.jobs||[]).map(guidedJob);state.activeJobId=obj.activeJobId||(state.jobs[0]&&state.jobs[0].id);}
  else{state.jobs=[guidedJob(obj.job)];state.activeJobId=state.jobs[0].id;}
  state.cloud={enabled:false,status:'OFF — not configured'};
  ensureJob();
}
function loadIllustrativeSample(){
  const j=guidedJob();
  Object.assign(j,{
    isSample:true,sampleLabel:'ILLUSTRATIVE SAMPLE — Berwyn-style demo',
    customer:'Alex Rivera',company:'Rivera Auto Care (sample)',email:'sample.customer@example.com',phone:'555-010-2026',
    address:'6309 W 26th St, Berwyn, IL 60402',
    origin:'211 W. Wacker Drive, Ste 120, Chicago, IL 60606',
    patchKits:4,method:'agreed',agreedTotal:21450,addOnIncluded:false,
    moisture:false,moistureBarrier:false,
    miles:0,minutes:0,visits:3,vehicles:1,crew:3,rentalDays:3,
    notes:'ILLUSTRATIVE SAMPLE. Self-leveling allowance: 600 sq ft at 1/4-inch average depth. Moisture-control primer only where area-checked. Final products and colors to be confirmed.',
    jobConcerns:'Sample only — not a real lead.',
    _contactCommitted:true
  });
  j.areas=[
    guidedArea({name:'Clear sealed area',sqft:1000,style:'sealer',sqftMode:'manual',colorKey:'light-gray',moisture:false}),
    guidedArea({name:'Spot-flake area',sqft:600,style:'flake',level:true,sqftMode:'manual',colorKey:'charcoal',flakeBlend:'neutral-gray',flake:'light',prep:{leveling:true,levelDepth:0.25,cracks:false,spalling:false,moisture:false,coatingRemoval:false,patching:false,patchKits:0,removalSqft:null,adhesive:false},moisture:false}),
    guidedArea({name:'White slip-resistant area',sqft:1200,style:'solid',colorKey:'white',color:'White',coats:2,grip:true,sqftMode:'manual',moisture:false})
  ];
  pushHistory(j,'sample','Illustrative sample loaded','Berwyn-style agreed $21,450 — fictional contact details');
  state.jobs.push(j);state.activeJobId=j.id;j.step='review';
  render();toast('Illustrative sample loaded (labeled). Agreed $21,450; add-in off; moisture OFF per area.');
}
function csvCell(x){let s=String(x??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
function exportCosts(){
  const j=activeJob(),x=calc();
  const rows=[['INTERNAL ESTIMATED COSTS - NOT FOR CUSTOMER/SUB'],['Job',j.number],['Customer',j.customer,j.company],['Category','Item','Quantity','Unit','Unit cost','Total']];
  for(const [g,items]of[['Materials',x.material],['Labor',x.hours],['Equipment / travel',x.equipment]])for(const a of items)rows.push([g,a.label,a.qty,a.unit,a.unitPrice,a.total]);
  rows.push(['TOTAL INTERNAL COST','','','','',x.cost],['Customer total','','','','',x.total],['Potential remainder','','','','',x.profit]);
  download('\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),j.number+'-Internal-Costs.csv','text/csv;charset=utf-8');
}
function printDocument(type){
  const j=activeJob(),x=calc();
  if(type==='customer'&&(x.blockingIssues||[]).length){toast(x.blockingIssues[0].message);return}
  if(type!=='guide'&&!x.sqft){toast('Add square footage before printing.');return}
  if((type==='customer'||type==='guide')&&(!j.customer&&!j.company||!j.address)){toast('Add customer and address before printing.');return}
  if(type==='customer'&&x.total<=0){toast('Set a customer price before printing.');return}
  let html;
  if(type==='customer'){
    html=customerDocument()+(j.includeGuideWithEstimate!==false?('<div class="page-break"></div>'+customerGuideDocument()):'');
  }else if(type==='guide'){html=customerGuideDocument();}
  else if(type==='subcontractor'){html=subcontractorDocument();}
  else{html=`<article class="document internal-print">${internalContent(true)}</article>`;}
  $('printHost').innerHTML=html;
  const old=document.title;document.title=j.number+'-'+type;setTimeout(()=>{window.print();document.title=old},80);
}
function exportHTML(type){
  const j=activeJob();
  const priced=calc();
  if((type==='customer')&&(priced.blockingIssues||[]).length){toast(priced.blockingIssues[0].message);return}
  let body;
  if(type==='customer'){body=customerDocument()+(j.includeGuideWithEstimate!==false?('<hr/>'+customerGuideDocument()):'');}
  else if(type==='guide'){body=customerGuideDocument();}
  else if(type==='subcontractor'){body=subcontractorDocument();}
  else{body=`<article class="document internal-print">${internalContent(true)}</article>`;}
  const doc=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escape(j.number)}-${type}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#192e2b}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}td.num,th.num{text-align:right}.notice,.sample-banner,.warn-banner{padding:12px;border:1px solid #ccc;margin:12px 0}</style></head><body>${body}<p style="font-size:11px;color:#666">Exported from Exotic Splash Guided Estimator (local). Cloud sync OFF. Not a hosted link.</p></body></html>`;
  download(doc,j.number+'-'+type+'.html','text/html');toast('HTML downloaded locally.');
}
function readPhotoFile(file, areaId, bucket){
  if(!file||!file.type.startsWith('image/')){toast('Choose an image file.');return}
  const reader=new FileReader();
  reader.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      const max=1600;let w=img.width,h=img.height;
      if(w>max||h>max){const s=Math.min(max/w,max/h);w=Math.round(w*s);h=Math.round(h*s)}
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      let quality=0.72;let dataUrl=canvas.toDataURL('image/jpeg',quality);
      while(dataUrl.length>PHOTO_MAX_BYTES && quality>0.4){quality-=0.1;dataUrl=canvas.toDataURL('image/jpeg',quality)}
      if(dataUrl.length>PHOTO_MAX_BYTES){toast('Photo too large even after compression ('+bytesLabel(dataUrl.length)+'). Not saved — use a smaller image.');return}
      const j=activeJob();const area=j.areas.find(a=>a.id===areaId);if(!area)return;
      const list=area[bucket]||(area[bucket]=[]);
      if(!authMode()){
        const probe=JSON.stringify(state).length+dataUrl.length;
        if(probe>STORE_SOFT_LIMIT){toast('Saving this photo would exceed browser storage budget. Export a backup and remove older photos first. Photo NOT saved.');return}
      }
      list.push({id:photoUid(),name:file.name||'photo.jpg',dataUrl,size:dataUrl.length,addedAt:nowISO(),note:'Photo reference only'});
      pushHistory(j,'photo','Photo added to '+area.name+' ('+bucket+')',file.name||'');
      render();toast(authMode()?'Photo attached ('+bytesLabel(dataUrl.length)+') — uploads to Storage with the next save.':'Photo saved locally ('+bytesLabel(dataUrl.length)+').');
    };
    img.onerror=()=>toast('Could not read image.');
    img.src=reader.result;
  };
  reader.onerror=()=>toast('Could not read file.');
  reader.readAsDataURL(file);
}
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='jobDeleteInput'){
    const btn=$('jobDeleteConfirm');
    const expect=($('jobDeleteExpect')&&$('jobDeleteExpect').textContent)||'';
    if(btn)btn.disabled=!(window.EsJobBoard&&window.EsJobBoard.phraseMatches(t.value,expect));
    return;
  }
  if(t.dataset.crewName!==undefined){
    if(!isOwner()){toast('Only the owner can edit the crew list.');render();return}
    const crews=state.settings.business&&state.settings.business.crews;
    if(Array.isArray(crews))crews[Number(t.dataset.crewName)]=String(t.value||'').slice(0,80);
    if(!authMode())save({silent:true});
    return;
  }
  if(t.id&&LIVE_BOARD[t.id]){
    boardFilters()[LIVE_BOARD[t.id]]=t.value;
    persistBoardFilters();
    const host=$('jobBoardResults');
    if(host)host.innerHTML=jobBoardResultsHTML();
    const count=$('jobBoardCount');
    if(count)count.textContent=jobBoardCountText();
    return;
  }
  if(t.dataset.marginInput){
    const margin=t.value===''?0:Number(t.value);
    activeJob().markup=E.marginToMarkup(margin);
    save();updateLive();return;
  }
  if(!t.dataset.path)return;
  const path=String(t.dataset.path);
  // Worker preview: block rate-book / cost / product / business pricing edits (UX lock only — not security)
  if(!isOwner()&&(path.startsWith('settings.rates')||path.startsWith('settings.costs')||path.startsWith('settings.products')||path.startsWith('settings.pricingOptions')||path.startsWith('settings.addOn')||path.startsWith('settings.catalog')||path.startsWith('settings.business')||path.startsWith('settings.approvedAdjustment')||path.startsWith('settings.garage')||path.startsWith('settings.extras')||path==='settings.notes'||path==='settings.costs.mile')){
    toast('Owner-only in this preview. Rate book is locked for workers.');
    render();return;
  }
  if(!isOwner()&&(path==='job.miles'||path==='job.minutes'||path==='job.crew'||path==='job.rentalDays')&&state.view==='internal'){
    // allow workers to see but not change advanced travel overrides in demo lock — origin/visits still editable for job entry
    toast('Travel overrides are owner-only in this preview. Use Calculate route or ask owner.');
    render();return;
  }
  if(!isOwner()&&(path==='job.markup'||path==='job.agreedTotal'||path==='job.includeInternalInCustomer')){
    toast('Owner-only in this preview.');
    render();return;
  }
  if(!isOwner()&&(path.startsWith('settings.approvedAdjustment'))){
    toast('Approved adjustment limit is owner-only. You can apply within the current cap on Pricing.');
    render();return;
  }
  if(path==='job.discount'){
    // allow entry; clamp to owner-set cap (default $0). Never derived from profit.
    let valNum=t.type==='checkbox'?t.checked:(t.value===''?0:Number(t.value));
    setPath(path, valNum);
    const xNow=calc();
    const cap=approvedAdjustmentCap(xNow);
    if(E.n(activeJob().discount)>cap){
      activeJob().discount=cap;
      toast(cap?('Approved adjustment capped at '+cash(cap)+'.'):'Approved adjustment limit is $0 (owner has not set a higher cap).');
      save();render();return;
    }
    if(activeJob().priceOption&&activeJob().priceOption!=='regular'&&E.n(valNum)){
      toast('Manual adjustment is ignored while a family pricing option is selected.');
    }
    save();updateLive();render();return;
  }
  let val=t.type==='checkbox'?t.checked:t.value;
  if(t.type==='number')val=t.value===''?'':Number(t.value);
  const prev=getPath(path);
  setPath(path,val);
  if(path.includes('job.areas')&&(path.endsWith('.length')||path.endsWith('.width')||path.endsWith('.sqftMode'))){
    const m=path.match(/job\.areas\.(\d+)/);
    if(m){
      const area=activeJob().areas[Number(m[1])];
      syncAreaSqft(area);
      const row=t.closest&&t.closest('.rect-row');
      if(row){
        const len=row.querySelector('[data-path$=".length"]');
        const wid=row.querySelector('[data-path$=".width"]');
        const prod=row.querySelector('.rect-prod');
        if(prod)prod.textContent=num((Number(len&&len.value)||0)*(Number(wid&&wid.value)||0),1)+' sq ft';
      }
      const block=t.closest&&t.closest('.measure-block');
      const note=block&&block.querySelector('.method-note');
      if(note)note.innerHTML='Area total: <b>'+num(area.sqft,2)+' sq ft</b>';
    }
  }
  if(path.includes('job.catalogItems')&&(path.endsWith('.length')||path.endsWith('.width'))){
    const m=path.match(/job\.catalogItems\.(\d+)/);
    if(m){const it=activeJob().catalogItems[Number(m[1])];const sf=E.n(it.length)*E.n(it.width);if(sf&&!E.n(it.sqft)){/* leave sqft override blank; engine uses L×W */}}
  }
  if(path==='job.projectType'||path==='job.garagePackage'){render();return;}
  if(path.includes('job.areas')&&(path.endsWith('.customColor')||path.endsWith('.color')||path.endsWith('.customFlakeBlend'))){
    const m=path.match(/job\.areas\.(\d+)/);if(m)applyColorFields(activeJob().areas[Number(m[1])]);
  }
  if(['job.customer','job.company','job.phone','job.email','job.address'].includes(path))maybeCreateJobRecord();
  if(path.endsWith('.moisture')&&path.includes('job.areas')){
    const m=path.match(/job\.areas\.(\d+)/);
    if(m){const a=activeJob().areas[Number(m[1])];a.prep=a.prep||{};a.prep.moisture=!!val;a.moisture=!!val;pushHistory(activeJob(),'moisture',a.name+': moisture '+(val?'ON':'OFF'));}
  }
  if(path==='job.jobConcerns'&&val&&val!==prev){pushHistory(activeJob(),'concern','Job concern updated',String(val).slice(0,120))}
  save();updateLive();
  if(t.type==='checkbox'||t.tagName==='SELECT'||path.includes('sqftMode')||path.includes('.prep.')||path.endsWith('.moisture')||path.endsWith('.colorKey')||path.endsWith('.flakeBlend'))render();
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.boardFilter){
    const key=t.dataset.boardFilter;
    if(key==='showArchived')boardFilters().showArchived=!!t.checked;
    else boardFilters()[key]=t.value;
    persistBoardFilters();
    render();
    return;
  }
  if(t.dataset.jobCrew){
    const j=state.jobs.find(x=>x.id===t.dataset.jobCrew);
    if(j){
      j.assignedCrew=String(t.value||'').trim().slice(0,80);
      save();
      const host=$('jobBoardResults');
      if(host)host.innerHTML=jobBoardResultsHTML();
    }
    return;
  }
  if(t.dataset.jobSelect!==undefined){
    if(!isOwner()){t.checked=false;return}
    if(t.checked)jobBoardSelected.add(t.dataset.jobSelect);
    else jobBoardSelected.delete(t.dataset.jobSelect);
    return;
  }
  if(t.matches('[data-add-photo]')){const f=t.files&&t.files[0];readPhotoFile(f,t.dataset.area,t.dataset.bucket);t.value='';return}
  if(t.id==='restore'||t.id==='restoreInline'){
    if(authMode()){toast('Restore is disabled while signed in.');t.value='';return}
    const f=t.files&&t.files[0];if(!f)return;
    f.text().then(txt=>{const obj=JSON.parse(txt);if(!confirm('Restore backup? Replaces jobs/settings in this browser.'))return;restoreObject(obj);render();toast('Backup restored (cloud still OFF).')}).catch(err=>toast('Restore failed: '+err.message)).finally(()=>{t.value=''});
  }
});
document.addEventListener('click',e=>{
  const t=e.target.closest('button,label.photo-add');if(!t)return;
  if(authMode()&&runtime.onClick&&runtime.onClick(t,e)===true)return;
  if(handleJobBoardClick(t))return;
  if(t.dataset.view)go(t.dataset.view);
  if(t.dataset.step)goStep(t.dataset.step);
  if(t.dataset.print)printDocument(t.dataset.print);
  if(t.dataset.exportHtml)exportHTML(t.dataset.exportHtml);
  if(t.dataset.option){const j=activeJob();j.priceOption=t.dataset.option;j.discountApproval=null;render()}
  if(t.dataset.style){const a=activeJob().areas[Number(t.dataset.index)];a.style=t.dataset.style;a.rate=null;render()}
  if(t.dataset.rating){const a=activeJob().areas[Number(t.dataset.areaIndex)];a.conditionRating=t.dataset.rating;pushHistory(activeJob(),'condition',a.name+' rated '+t.dataset.rating);render()}
  if(t.dataset.removeArea!==undefined){activeJob().areas.splice(Number(t.dataset.removeArea),1);render()}
  if(t.dataset.addRect!==undefined){activeJob().areas[Number(t.dataset.addRect)].rectangles.push({length:0,width:0});render()}
  if(t.dataset.delRect!==undefined){const a=activeJob().areas[Number(t.dataset.areaIndex)];a.rectangles.splice(Number(t.dataset.delRect),1);if(!a.rectangles.length)a.rectangles.push({length:0,width:0});syncAreaSqft(a);render()}
  if(t.dataset.delPhoto){const area=activeJob().areas.find(a=>a.id===t.dataset.area);if(area){const gone=(area[t.dataset.bucket]||[]).filter(p=>p.id===t.dataset.delPhoto);area[t.dataset.bucket]=(area[t.dataset.bucket]||[]).filter(p=>p.id!==t.dataset.delPhoto);if(authMode()&&runtime.photoRemoved)gone.forEach(runtime.photoRemoved);render()}}
  if(t.dataset.switchJob){state.activeJobId=t.dataset.switchJob;if(state.view==='jobs'&&t.classList.contains('job-card-open')){go('guided');toast('Opened job')}else{render();toast('Switched job')}}
  if(t.dataset.colorKey!==undefined){const a=activeJob().areas[Number(t.dataset.areaIndex)];a.colorKey=t.dataset.colorKey;applyColorFields(a);render()}
  if(t.dataset.flakeBlend!==undefined){const a=activeJob().areas[Number(t.dataset.areaIndex)];a.flakeBlend=t.dataset.flakeBlend;applyColorFields(a);render()}
  if(t.dataset.projectType){
    const j=activeJob();j.projectType=t.dataset.projectType;
    if(j.projectType==='flatwork'&&!(j.catalogItems||[]).length)j.catalogItems=[E.newFlatItem()];
    if(j.projectType==='seating'&&!(j.catalogItems||[]).length)j.catalogItems=[E.newSeatItem()];
    if(j.projectType==='garage'&&!j.garagePackage)j.garagePackage='2car';
    pushHistory(j,'projectType','Project type → '+j.projectType);render();return;
  }
  if(t.dataset.garagePackage){activeJob().garagePackage=t.dataset.garagePackage;render();return}
  if(t.dataset.removeCatalog!==undefined){activeJob().catalogItems.splice(Number(t.dataset.removeCatalog),1);render();return}
  switch(t.id){
    case'addArea':activeJob().areas.push(guidedArea({sqftMode:'rectangles'}));render();break;
    case'addFlatItem':activeJob().catalogItems.push(E.newFlatItem());render();break;
    case'addSeatItem':activeJob().catalogItems.push(E.newSeatItem());render();break;
    case'newJob':case'newJobKeep':case'newJobKeep2':{
      const j=guidedJob();if(authMode())j._local=true;j.origin=state.settings.business.address;
      for(const a of j.areas)if(!(Number(a.sqft)>0))a.sqftMode='rectangles';
      state.jobs.push(j);state.activeJobId=j.id;goStep('contact');toast(authMode()?'New job started. It is saved on the server after a name and a phone, email, or address.':'New job started. Previous jobs stay on this device.');break;}
    case'sampleIllustrative':case'sampleIllustrativeTop':loadIllustrativeSample();break;
    case'backup':case'backup2':doBackup();break;
    case'shareBackup':shareBackup();break;
    case'costCSV':case'costCSV2':if(!isOwner()){toast('Cost CSV is owner-only in this preview.');break;}exportCosts();break;
    case'resetRates':
      if(!isOwner()){toast('Owner-only in this preview.');break;}
      if(confirm(authMode()?'Reset the DRAFT to starting allowances? Nothing changes for employees until you save the price book.':'Reset cost settings to starting allowances? Jobs stay.')){state.settings=clone(E.defaults);render()}
      break;
    case'calculateRoute':calculateRoute();break;
    case'openMaps':openMapsDirections();break;
    case'roleOwner':if(authMode())break;state.role='owner';render();toast('Owner preview — rates editable in this demo. Not secure auth.');break;
    case'roleWorker':if(authMode())break;state.role='worker';render();toast('Worker preview — rate book locked. Not secure auth.');break;
    case'helpBtn':$('helpDialog').showModal();break;
    case'sanityContinue':{
      if(!isOwner()){toast('Only the owner can confirm a price warning.');break;}
      const job=activeJob();
      const priced=E.calculate(job,state.settings);
      if((priced.blockingIssues||[]).length){toast(priced.blockingIssues[0].message);break;}
      job.sanityAck={role:'owner',fingerprint:warnFingerprint((priced.sanity&&priced.sanity.warnings)||[]),at:nowISO()};
      save();render();toast('Confirmed. You can issue or share this quote.');break;}
    case'ackPerSqft':if(!isOwner()){toast('Only the owner can confirm a rate.');break;}ackPerSqft();render();break;
    case'saveAsIssued':save({issue:true});render();break;
    case'requestExtraDiscount':requestExtraDiscount();break;
    case'approveExtraDiscount':decideExtraDiscount('approve');break;
    case'rejectExtraDiscount':decideExtraDiscount('reject');break;
  }
  if(t.classList.contains('dialog-close'))$('helpDialog').close();
});
window.GuidedApp={get state(){return state},calc,ensureJob,guidedJob,nextJobNumber,guidedArea,computeAreaSqft,syncPrepIntoEngineFields,contactSufficient,backupObject,restoreObject,loadIllustrativeSample,STORAGE_KEY,STEPS,PREP_ITEMS,BASE_COLORS,FLAKE_BLENDS,E,save,render,activeJob,pushHistory,customerDocument,customerGuideDocument,customerVisibleLines,quoteAllocation,approvedAdjustmentCap,approvedAdjustmentLabel,clampJobDiscountToCap,jobSelectionFlags,moisturePriceEstimate,moistureSelectedAreas,subcontractorDocument,internalContent,equipmentPlan,calculateRoute,geocode,isOwner,go,goStep,APP_VERSION,resolveBaseColor,resolveFlakeBlend,applyColorFields,isCatalogJob,priceNeededBanner,catalogBreakdownDocHTML,requestExtraDiscount,decideExtraDiscount,issueGate,perSqftAcked,ackPerSqft,
  calcLocal,updateLive,authMode,quoteKey,quoteInput,setServerQuote,serverQuotes,stripCosts,overlayServer,LEGACY_KEYS,toast,
  get runtime(){return runtime},boot};
/** v7: the page decides the mode. demo -> local storage (NOT SECURE). auth -> rt.profile/settings/jobs from server. */
function boot(rt){
  runtime=rt||{mode:'demo'};
  ensureDeleteDialog();
  if(authMode()){
    state.settings=deepMergeSettings(rt.settings||{});if(rt.settings&&rt.settings._redacted)state.settings._redacted=true;
    state.jobs=(rt.jobs||[]).map(guidedJob);
    state.activeJobId=(state.jobs[0]&&state.jobs[0].id)||null;
    state.view='guided';
    state.role=isOwner()?'owner':'worker';
    state.cloud={enabled:true,status:'server'};
    ensureJob();
  } else {
    loadState();
  }
  render();
}
})();
