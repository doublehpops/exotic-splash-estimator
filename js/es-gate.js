/* Exotic Splash v7 — login gate + signed-in runtime for the guided estimator.
 * Security model: the browser is untrusted. Postgres RLS / RPCs and the quote-job
 * Edge Function decide what each account can read or change. This file only
 * renders screens and calls those server APIs with the user's own session. */
(function(){
'use strict';
const W=window,D=document;
const DEMO_FLAG='es-v7-offline-demo';
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>D.getElementById(id);
const Q=()=>W.EsQuoteCore,E=()=>W.EpoxyEngine,G=()=>W.GuidedApp;

/* Capture auth redirect type BEFORE the Supabase client consumes the URL hash. */
const initialHash=String(W.location.hash||'');
const hashParams=new URLSearchParams(initialHash.replace(/^#/,''));
const redirectType=hashParams.get('type');                 // 'recovery' | 'invite' | 'signup' | 'magiclink'
const redirectError=hashParams.get('error_description');
const setPasswordFlow=redirectType==='recovery'||redirectType==='invite';

const cfg=W.EsConfig.validate(W.ES_PUBLIC_CONFIG);
let cloud=null,rt=null,sub=null;

/* ------------------------------------------------------------------ screens */
function gateShell(inner){
  const g=$('gate');g.hidden=false;$('appRoot').hidden=true;
  g.innerHTML=`<div class="gate-card" role="main"><div class="gate-brand"><span class="brand-mark">es<span>↗</span></span><div><b>EXOTIC SPLASH</b><small>Guided estimator v7 · staff sign-in</small></div></div>${inner}</div>`;
}
function demoButton(){return `<button type="button" class="gate-demo" id="gateDemo">Open offline demo (NOT SECURE)</button><p class="gate-small">Offline demo stores jobs only in this browser. Anyone using this device can switch to owner view. Not for real pricing.</p>`}
function showUnconfigured(){
  gateShell(`<h1 data-gate-state="unconfigured">Sign-in is not configured yet</h1>
  <p>This copy of the estimator has no Supabase project connected, so staff sign-in is unavailable. Nothing is sent anywhere.</p>
  <ol class="gate-steps"><li>Owner (Double): follow <b>SUPABASE_SETUP.md</b> to create the project and run the migrations.</li><li>Put the project URL and the public <b>anon / publishable</b> key in <code>public-config.js</code> (never the service_role / secret key).</li><li>Reload this page to see the login screen.</li></ol>
  ${demoButton()}`);
}
function showInvalid(errors){
  gateShell(`<h1 data-gate-state="invalid-config">Configuration problem</h1>
  <div class="gate-error" role="alert"><b>public-config.js was rejected:</b><ul>${errors.map(e=>'<li>'+esc(e)+'</li>').join('')}</ul></div>
  <p>Fix <code>public-config.js</code> and reload. Sign-in stays disabled until the configuration is valid.</p>${demoButton()}`);
}
function showLogin(msg,kind){
  gateShell(`<h1 data-gate-state="login">Staff sign-in</h1>
  ${msg?`<div class="${kind==='ok'?'gate-ok':'gate-error'}" role="${kind==='ok'?'status':'alert'}">${esc(msg)}</div>`:''}
  <form id="loginForm" class="gate-form" novalidate>
    <label>Email<input id="loginEmail" type="email" autocomplete="username" required></label>
    <label>Password<input id="loginPassword" type="password" autocomplete="current-password" required></label>
    <button type="submit" class="button" id="loginSubmit">Sign in</button>
  </form>
  <p class="gate-links"><button type="button" class="text-button" id="gateForgot">Forgot password?</button></p>
  <p class="gate-small" id="noSignup">No public sign-up. Accounts are created by invitation from the owner; new accounts stay disabled until the owner approves them.</p>
  ${cfg.allowOfflineDemo?demoButton():''}`);
}
function showForgot(msg){
  gateShell(`<h1 data-gate-state="forgot">Reset password</h1>
  ${msg?`<div class="gate-ok" role="status">${esc(msg)}</div>`:'<p>Enter your staff email. If it belongs to an account, you will get a reset link.</p>'}
  <form id="forgotForm" class="gate-form" novalidate><label>Email<input id="forgotEmail" type="email" autocomplete="username" required></label>
  <button type="submit" class="button" id="forgotSubmit">Send reset link</button></form>
  <p class="gate-links"><button type="button" class="text-button" id="gateBack">← Back to sign-in</button></p>`);
}
function showSetPassword(kind,msg){
  gateShell(`<h1 data-gate-state="set-password">${kind==='invite'?'Welcome — choose your password':'Choose a new password'}</h1>
  ${msg?`<div class="gate-error" role="alert">${esc(msg)}</div>`:''}
  <form id="pwForm" class="gate-form" novalidate><label>New password (10+ characters)<input id="pw1" type="password" autocomplete="new-password" minlength="10" required></label>
  <label>Repeat password<input id="pw2" type="password" autocomplete="new-password" minlength="10" required></label>
  <button type="submit" class="button" id="pwSubmit">Save password</button></form>`);
}
function showBlocked(profile){
  gateShell(`<h1 data-gate-state="blocked">Account not active</h1>
  <p>${profile?`Signed in as <b>${esc(profile.email)}</b>, but this account is ${profile.active?'not a staff role':'disabled or waiting for owner approval'}.`:'This account has no staff profile.'}</p>
  <p>Ask the owner to enable your account. No job or price data is loaded.</p>
  <button type="button" class="button secondary" id="gateSignOut">Sign out</button>`);
}
function showError(msg){
  gateShell(`<h1 data-gate-state="error">Could not load your workspace</h1><div class="gate-error" role="alert">${esc(msg)}</div>
  <p class="gate-links"><button type="button" class="button secondary" id="gateRetry">Retry</button> <button type="button" class="text-button" id="gateSignOut">Sign out</button></p>`);
}
function showLoading(t){gateShell(`<p data-gate-state="loading" class="gate-loading">${esc(t||'Loading…')}</p>`)}

/* ------------------------------------------------------------------ demo */
function demoAllowed(){return cfg.state!=='ok'||cfg.allowOfflineDemo}
function startDemo(){
  try{W.sessionStorage.setItem(DEMO_FLAG,'1')}catch{}
  $('gate').hidden=true;$('appRoot').hidden=false;
  D.body.classList.add('mode-demo');D.body.classList.remove('mode-auth');
  $('modeBanner').innerHTML=`<b>OFFLINE DEMO — NOT SECURE.</b> Local preview only: jobs stay in this browser, the Owner/Worker switch is not access control, and nothing is checked by a server. <button type="button" id="esExitDemo" class="text-button">Exit demo</button>`;
  $('modeBanner').hidden=false;
  G().boot({mode:'demo'});
}
function exitDemo(){try{W.sessionStorage.removeItem(DEMO_FLAG)}catch{}W.location.reload()}

/* ------------------------------------------------------------------ auth */
async function initAuth(){
  const client=W.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  cloud=W.EsCloud.create(client);
  sub=cloud.onAuthChange((ev)=>{
    if(ev==='PASSWORD_RECOVERY')showSetPassword('recovery');
    if(ev==='SIGNED_OUT'&&rt){rt=null;W.location.reload()}
  });
  showLoading('Checking sign-in…');
  let session=null;
  try{session=await cloud.getSession()}catch(e){showLogin('Could not reach the sign-in service. Check your connection and try again.');return}
  if(redirectError&&!session){showLogin('That link is invalid or has expired. Ask the owner for a new invitation, or use “Forgot password?”.');return}
  if(session&&setPasswordFlow){showSetPassword(redirectType);return}
  if(!session){showLogin();return}
  await enterApp();
}
async function enterApp(){
  showLoading('Loading your workspace…');
  let profile;
  try{profile=await cloud.getProfile()}catch(e){showError(e.message);return}
  if(!profile||!profile.active||(profile.role!=='owner'&&profile.role!=='employee')){showBlocked(profile);return}
  const owner=profile.role==='owner';
  try{
    let pb,settings;
    if(owner){pb=await cloud.loadOwnerPriceBook();settings=Q().buildSettings(E(),pb&&pb.staff_settings,pb&&pb.owner_settings)}
    else{pb=await cloud.loadStaffPriceBook();settings=Q().redactedStaffSettings(E(),pb&&pb.staff_settings)}
    const rows=await cloud.listJobs();
    const markups={};
    if(owner){for(const m of await cloud.listJobMarkups())markups[m.job_id]=Number(m.markup_pct)}
    const jobs=rows.map(r=>rowToJob(r,owner?markups[r.id]:undefined,settings));
    applyOutbox(profile.id,jobs);
    rt={mode:'auth',profile,settings,jobs,priceBook:{version:pb?pb.version:null,updatedAt:pb?pb.updated_at:null,ownerEmpty:owner?isEmptyBook(pb):null,sig:owner?bookSig(settings):null},
      syncStatus:'connected',onSave,requestPreview,discountCall,onClick,priceBookPanelHTML,sharePanelHTML,staffViewHTML,jobsExtraHTML,approvalsViewHTML,photoSrc,photoRemoved,
      shares:{},newShare:null,staffList:null,audit:null,localScan:null,approvals:null,approvalFilter:'pending',approvalsPending:0,acceptances:null};
    $('gate').hidden=true;$('appRoot').hidden=false;
    D.body.classList.add('mode-auth');D.body.classList.remove('mode-demo');
    decorateShell();
    G().boot(rt);
    for(const j of G().state.jobs)j._savedSig=j._savedSig||jobSig(j);
    if(outboxIds.size){for(const id of outboxIds)dirty.add(id);scheduleFlush(200)}
    refreshApprovalBadge();loadAcceptances();
    if(!badgeTimer)badgeTimer=setInterval(()=>{if(rt)refreshApprovalBadge()},120000);
  }catch(e){showError(e.message||String(e))}
}
function isEmptyBook(pb){return !pb||!pb.owner_settings||!Object.keys(pb.owner_settings).length}
function bookSig(settings){const s=Q().splitSettings(settings);return JSON.stringify(s)}
function rowToJob(r,markup,settings){
  const d=Object.assign({},r.job_data||{});
  d.id=d.id||r.client_ref||r.id;
  if(r.job_number)d.number=r.job_number; // server-assigned ES-YYYYMMDD-NN wins over the client's provisional number
  d._serverId=r.id;d._version=r.version;d._status=r.status;d._createdBy=r.created_by;d._clientRef=r.client_ref;d._updatedAt=r.updated_at;
  if(markup!==undefined){d.markup=markup;d._markup=markup}
  else if(settings&&settings.costs&&!settings._redacted){d.markup=Number(settings.costs.markup)||0;d._markup=null}
  return d;
}
function decorateShell(){
  const p=rt.profile,owner=p.role==='owner';
  $('modeBanner').hidden=true;
  $('saveStatus').textContent='Signed in · server sync';
  $('sideNote').innerHTML=`Signed in as <b>${esc(p.email)}</b> (${owner?'owner':'employee'}).<br/>Role and prices are enforced by the server.`;
  $('sideCloud').className='cloud-badge on';$('sideCloud').textContent='SERVER SYNC ON';
  $('restoreLabel').hidden=true;
  $('signOutTop').hidden=false;
  if(!D.querySelector('#nav [data-view="approvals"]')){const b=D.createElement('button');b.dataset.view='approvals';b.innerHTML='✓ <span>Approvals</span><span class="nav-badge" id="esApprovalBadge" hidden></span>';$('nav').appendChild(b)}
  if(owner&&!D.querySelector('#nav [data-view="staff"]')){const b=D.createElement('button');b.dataset.view='staff';b.innerHTML='👥 <span>Staff access</span>';$('nav').appendChild(b)}
  $('footMode').textContent='v7 · signed in · server-verified pricing';
}
async function doSignOut(){
  if(dirty.size||inflight){if(!W.confirm('Some changes have not reached the server yet. They stay queued on this device for your next sign-in. Sign out anyway?'))return}
  if(dirty.size)writeOutbox();
  const tmp=rt;rt=null;
  try{await cloud.signOut()}catch{}
  void tmp;W.location.reload();
}

/* ------------------------------------------------------------------ job sync */
const dirty=new Set();let inflight=false,flushTimer=null;const outboxIds=new Set();
function jobPayload(j){
  const c=JSON.parse(JSON.stringify(j));
  for(const k of Object.keys(c))if(k.charAt(0)==='_')delete c[k];
  delete c.markup; // owner markup lives in job_owner_pricing, never in job_data
  delete c.updatedAt;
  // photos that reached Storage are referenced by path only; the base64 copy stays on this device
  for(const a of c.areas||[])for(const b of PHOTO_BUCKETS)if(Array.isArray(a[b]))a[b]=a[b].map(p=>p&&p.storagePath?Object.assign({},p,{dataUrl:undefined}):p);
  return c;
}
function jobSig(j){const c=jobPayload(j);return JSON.stringify(c)}
function applyRow(j,row){
  if(!row)return;
  j._serverId=row.id;j._version=row.version;j._status=row.status;j._clientRef=row.client_ref;j._createdBy=row.created_by;delete j._local;
  if(row.job_number)j.number=row.job_number;
}

/* ------------------------------------------------------------------ photos (Storage) */
const PHOTO_BUCKETS=['photos','conditionPhotos'];
const photoCache=new Map();const photoPending=new Set();let photoRefreshTimer=null,photoUploadWarned=false;
function dataUrlToBlob(dataUrl){
  const m=/^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl||''));
  if(!m)throw new Error('Not a data URL');
  const mime=m[1]||'image/jpeg';
  if(!m[2])return new Blob([decodeURIComponent(m[3])],{type:mime});
  const bin=W.atob(m[3]);const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}
/** Upload every photo that is still base64-only on a saved job. Returns how many moved. */
async function migratePhotos(j){
  if(!j||!j._serverId||!cloud||!cloud.uploadPhoto)return 0;
  let moved=0;
  for(const a of j.areas||[])for(const b of PHOTO_BUCKETS)for(const p of a[b]||[]){
    if(!p||p.storagePath||!p.dataUrl)continue;
    try{
      const path=await cloud.uploadPhoto(j._serverId,p.id,dataUrlToBlob(p.dataUrl));
      photoCache.set(path,p.dataUrl);
      p.storagePath=path;delete p.dataUrl;moved++;
    }catch(e){
      if(e&&e.code==='network')throw e;
      if(!photoUploadWarned){photoUploadWarned=true;toast('Photo upload to Storage failed ('+(e&&e.message||e)+'). Photos stay inside the job record until it works.')}
    }
  }
  return moved;
}
/** src for an <img>: base64 if we have it, else a cached signed URL, else '' while one is fetched. */
function photoSrc(p){
  if(!p)return '';
  if(p.dataUrl)return p.dataUrl;
  if(!p.storagePath||!cloud)return '';
  const hit=photoCache.get(p.storagePath);if(hit)return hit;
  if(!photoPending.has(p.storagePath)){
    photoPending.add(p.storagePath);
    cloud.signedPhotoUrl(p.storagePath,3600).then(u=>{
      photoCache.set(p.storagePath,u);
      setTimeout(()=>{if(photoCache.get(p.storagePath)===u)photoCache.delete(p.storagePath)},50*60*1000);
      clearTimeout(photoRefreshTimer);photoRefreshTimer=setTimeout(refreshView,150);
    }).catch(()=>{}).finally(()=>photoPending.delete(p.storagePath));
  }
  return '';
}
function photoRemoved(p){if(p&&p.storagePath&&cloud&&cloud.deletePhoto){photoCache.delete(p.storagePath);cloud.deletePhoto(p.storagePath).catch(()=>{})}}
function outboxKey(){return 'es-v7-outbox:'+(rt?rt.profile.id:'')}
function writeOutbox(){
  if(!rt)return;
  const jobs=G().state.jobs.filter(j=>dirty.has(j.id)).map(j=>({id:j.id,serverId:j._serverId||null,version:j._version||null,data:jobPayload(j),at:new Date().toISOString()}));
  try{if(jobs.length)W.localStorage.setItem(outboxKey(),JSON.stringify(jobs));else W.localStorage.removeItem(outboxKey())}catch{}
}
function applyOutbox(uid,jobs){
  let box=[];try{box=JSON.parse(W.localStorage.getItem('es-v7-outbox:'+uid)||'[]')}catch{}
  for(const o of box){
    const j=jobs.find(x=>x.id===o.id||(o.serverId&&x._serverId===o.serverId));
    if(j){if(o.version===j._version){Object.assign(j,o.data);outboxIds.add(j.id)}}
    else if(!o.serverId){jobs.unshift(Object.assign({},o.data,{id:o.id,_local:true}));outboxIds.add(o.id)}
  }
}
function setSync(s){if(!rt)return;rt.syncStatus=s;const el=$('saveStatus');if(el)el.textContent='Server: '+s;const pill=$('savePill');if(pill)pill.textContent=s}
function onSave(j){
  if(!j||!rt)return;
  const sig=jobSig(j);
  if(j._savedSig===undefined){j._savedSig=j._serverId?sig:null}
  if(sig!==j._savedSig||(G().state.jobs.find(x=>x.id===j.id)&&rt.profile.role==='owner'&&j._serverId&&j._markup!==undefined&&Number(j.markup)!==Number(j._markup))){dirty.add(j.id);setSync('saving…');scheduleFlush(1200)}
}
function scheduleFlush(ms){clearTimeout(flushTimer);flushTimer=setTimeout(flush,ms)}
async function flush(){
  if(!rt||inflight)return;inflight=true;
  try{
    for(const id of Array.from(dirty)){
      const j=G().state.jobs.find(x=>x.id===id);if(!j){dirty.delete(id);continue}
      try{
        if(!j._serverId){applyRow(j,await cloud.insertJob(j._clientRef||j.id,jobPayload(j)));j._savedSig=jobSig(j)}
        await migratePhotos(j); // needs the server id; changes the payload when photos move to Storage
        const sig=jobSig(j);
        if(sig!==j._savedSig){applyRow(j,await cloud.updateJob(j._serverId,j._version,jobPayload(j)));j._savedSig=sig}
        if(rt.profile.role==='owner'&&j._serverId&&Number(j.markup)!==Number(j._markup)){await cloud.setJobMarkup(j._serverId,Number(j.markup)||0);j._markup=Number(j.markup)||0}
        dirty.delete(id);
      }catch(e){
        if(e.code==='network'){writeOutbox();setSync('offline — changes queued on this device');scheduleFlush(15000);return}
        dirty.delete(id);
        if(e.code==='conflict'){setSync('conflict');toast('“'+(j.customer||j.number)+'” was changed elsewhere. Use Jobs → Reload from server; your edits stay on screen until then.')}
        else if(e.code==='discount_over_cap'){setSync('not saved');toast('Not saved: the adjustment is over the owner-approved limit.')}
        else if(/duplicate|unique/i.test(e.message||'')){setSync('not saved');toast('This job was already saved/imported from this account.')}
        else{setSync('not saved');toast('Not saved: '+e.message)}
        return;
      }
    }
    writeOutbox();
    setSync('saved '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));
  }finally{inflight=false;if(dirty.size&&rt&&rt.syncStatus.indexOf('saving')===0)scheduleFlush(800)}
}
function toast(m){const g=G();if(g&&g.toast)g.toast(m);else W.alert(m)}

/* ------------------------------------------------------------------ server quote preview (employees) */
let previewTimer=null,previewKey=null,previewBusy=false,lastPreviewError=null;
async function discountCall(body){
  body=body||{};
  return cloud.quote(body.mode,body.job_id,body.job_data,{amount:body.amount,percent:body.percent,reason:body.reason,id:body.id,decision:body.decision,estimateId:body.estimateId||body.job_id});
}
function requestPreview(j,key,force){
  if(!rt||(!force&&previewKey===key))return;
  previewKey=key;clearTimeout(previewTimer);
  previewTimer=setTimeout(()=>runPreview(j.id,key),600);
}
async function runPreview(jobId,key){
  if(previewBusy){previewTimer=setTimeout(()=>runPreview(jobId,key),400);return}
  const j=G().state.jobs.find(x=>x.id===jobId);if(!j)return;
  if(G().quoteKey(j)!==key){previewKey=null;return}
  previewBusy=true;
  try{
    const res=await cloud.quote('preview',j._serverId||null,G().quoteInput(j));
    G().setServerQuote(jobId,key,res.staff);
    if(res.discountOverCap)toast('Adjustment is over the owner-approved limit — the server will refuse to finalize this quote.');
    lastPreviewError=null;refreshView();
  }catch(e){
    previewKey=null;
    if(lastPreviewError!==e.message){lastPreviewError=e.message;toast('Server price check failed: '+e.message)}
  }finally{previewBusy=false}
}
function refreshView(){
  const a=D.activeElement;
  if(a&&$('main').contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)){
    G().updateLive();
    a.addEventListener('blur',()=>setTimeout(()=>{if(!$('main').contains(D.activeElement)||!/^(INPUT|TEXTAREA|SELECT)$/.test(D.activeElement.tagName))G().render()},0),{once:true});
  }else G().render();
}

/* ------------------------------------------------------------------ price book (owner) */
function priceBookPanelHTML(){
  const pb=rt.priceBook,owner=rt.profile.role==='owner';
  if(!owner)return `<div class="info-banner es-pb-info"><b>Price book v${esc(pb.version)}</b> — set by the owner. Your account cannot change prices, rates, costs, markup or discount limits (enforced by the server).</div>`;
  const draftDirty=bookSig(G().state.settings)!==pb.sig;
  return `<section class="card es-pb-panel" id="esPricePanel"><h3>Server price book <span class="lock-pill owner-pill">OWNER</span></h3>
  ${pb.ownerEmpty?'<div class="warn-banner"><b>Starting allowances in use.</b> The server price book has no saved owner costs yet, so quotes use the built-in starting allowances. Enter your real costs below and save. (See PRICE_INPUTS_REQUIRED.md.)</div>':''}
  <p class="method-note">Saved version <b>v${esc(pb.version)}</b>${pb.updatedAt?' · '+esc(new Date(pb.updatedAt).toLocaleString()):''}. ${draftDirty?'<b class="es-draft">Unsaved draft changes on this screen.</b>':'No unsaved changes.'}</p>
  <div class="fields"><div class="field"><label for="esPriceReason">Reason for change (kept in the audit log)</label><input id="esPriceReason" type="text" maxlength="300" placeholder="e.g. Supplier price update Nov 2026"></div></div>
  <div class="inline-actions"><button type="button" class="button" id="esSavePriceBook">Save price book to server</button><button type="button" class="quiet" id="esReloadPriceBook">Discard draft / reload</button><button type="button" class="quiet" id="esShowAudit">Price change history</button></div>
  ${rt.audit?`<div class="table-wrap"><table><thead><tr><th>When</th><th>Section</th><th>Version</th><th>Reason</th></tr></thead><tbody>${rt.audit.map(a=>`<tr><td>${esc(new Date(a.changed_at).toLocaleString())}</td><td>${esc(a.book+' · '+a.section)}</td><td>${esc(a.price_book_version)}</td><td>${esc(a.reason||'')}</td></tr>`).join('')||'<tr><td colspan="4">No changes yet.</td></tr>'}</tbody></table></div>`:''}
  </section>`;
}
async function savePriceBook(){
  const S=W.EsPriceSanity;
  if(S){
    const found=S.bookIssues(G().state.settings);
    if(found.blocks.length){toast(found.blocks[0].message);return}
    if(found.warnings.length&&!G().perSqftAcked()){toast(found.warnings[0].message+' Tap Looks right, continue before saving.');return}
  }
  const reason=($('esPriceReason')||{}).value||'';
  const split=Q().splitSettings(G().state.settings);
  try{
    const v=await cloud.savePriceBook(split.staff,split.owner,rt.priceBook.version,reason);
    rt.priceBook.version=v;rt.priceBook.updatedAt=new Date().toISOString();rt.priceBook.sig=bookSig(G().state.settings);rt.priceBook.ownerEmpty=false;rt.audit=null;
    for(const k of Object.keys(G().serverQuotes))delete G().serverQuotes[k];
    toast('Price book saved (v'+v+'). Employees get it on their next load.');G().render();
  }catch(e){toast(e.code==='conflict'?'Price book was changed elsewhere — reload, then re-apply your edits.':e.message)}
}
async function reloadPriceBook(){
  if(bookSig(G().state.settings)!==rt.priceBook.sig&&!W.confirm('Discard unsaved price-book changes?'))return;
  const pb=await cloud.loadOwnerPriceBook();
  G().state.settings=Q().buildSettings(E(),pb.staff_settings,pb.owner_settings);
  rt.priceBook={version:pb.version,updatedAt:pb.updated_at,ownerEmpty:isEmptyBook(pb),sig:bookSig(G().state.settings)};
  G().render();toast('Price book reloaded (v'+pb.version+').');
}

/* ------------------------------------------------------------------ discount request inbox */
const money=v=>(Number(v)||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
let badgeTimer=null;
const APPROVAL_FILTERS=[['pending','Pending'],['approved','Approved'],['rejected','Rejected'],['stale','Stale'],['consumed','Applied'],['','All']];
function approvalsViewHTML(){
  const owner=rt.profile.role==='owner';const list=rt.approvals;
  const rows=(list||[]).map(r=>`<tr>
    <td>${esc(r.jobNumber||'')}<small>${esc(r.customer||'')}</small></td>
    ${owner?`<td>${esc(r.requesterName||r.requesterEmail||'')}<small>${esc(new Date(r.requestedAt).toLocaleString())}</small></td>`:`<td>${esc(new Date(r.requestedAt).toLocaleString())}</td>`}
    <td>${esc(r.tier||'')}</td>
    <td class="num">${money(r.beforeTotal)}<small>−${money(r.amount)}${r.percent!=null?' ('+esc(r.percent)+'%)':''} → ${money(r.afterTotal)}</small></td>
    <td>${esc(r.reason||'')}</td>
    <td>${esc(r.status||'')}${r.decidedAt?'<small>'+esc(new Date(r.decidedAt).toLocaleString())+'</small>':''}</td>
    <td>${owner&&r.status==='pending'?`<button type="button" class="button small" data-approve-id="${esc(r.id)}" data-estimate-id="${esc(r.estimateId)}">Approve</button> <button type="button" class="quiet" data-reject-id="${esc(r.id)}" data-estimate-id="${esc(r.estimateId)}">Reject</button>`:''}</td>
  </tr>`).join('');
  return `<div class="view-heading"><span class="eyebrow">${owner?'OWNER':'MY REQUESTS'}</span><h1>Extra-discount approvals.</h1><p>${owner?'Requests from staff for a reduction below the approved price. Approving binds the reduction to that estimate revision and price tier; the customer total only changes once the server applies it.':'Your extra-discount requests and what the owner decided. Pending and rejected requests leave every total unchanged.'}</p></div>
  <section class="card es-approvals">
  <div class="inline-actions">${owner?`<label class="es-inline">Show <select id="esApprovalFilter">${APPROVAL_FILTERS.map(([v,l])=>`<option value="${v}" ${v===(rt.approvalFilter||'')?'selected':''}>${l}</option>`).join('')}</select></label>`:''}<button type="button" class="quiet" id="esReloadApprovals">Reload</button></div>
  ${list?`<div class="table-wrap"><table><thead><tr><th>Job</th><th>${owner?'Requested by':'Requested'}</th><th>Tier</th><th class="num">Before → after</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="7">Nothing here.</td></tr>'}</tbody></table></div>`:'<p class="method-note">Loading…</p>'}
  </section>`;
}
async function loadApprovals(){
  if(!rt)return;
  try{rt.approvals=rt.profile.role==='owner'?await cloud.listDiscountRequests(rt.approvalFilter||''):await cloud.listMyDiscountRequests()}
  catch(e){rt.approvals=[];toast(e.message)}
  if(G().state.view==='approvals')G().render();
}
async function refreshApprovalBadge(){
  if(!rt||rt.profile.role!=='owner')return;
  try{rt.approvalsPending=(await cloud.listDiscountRequests('pending')).length}catch{return}
  const b=$('esApprovalBadge');if(b){b.textContent=String(rt.approvalsPending);b.hidden=!rt.approvalsPending}
}
async function decideFromInbox(id,estimateId,decision){
  if(decision==='reject'&&!W.confirm('Reject this discount request? The customer total stays unchanged.'))return;
  try{
    const res=await cloud.quote('discount-decide',estimateId,null,{id,decision,estimateId});
    const j=G().state.jobs.find(x=>x._serverId===estimateId);
    if(j){j.discountServerStatus=(res.request&&res.request.status)||(decision==='approve'?'approved':'rejected');delete G().serverQuotes[j.id];onSave(j)}
    toast(decision==='approve'?'Approved. The reduction applies to that estimate revision and tier.':'Rejected.');
    await loadApprovals();refreshApprovalBadge();
  }catch(e){toast(e.code==='conflict'?'That request is no longer pending — reloading.':e.message);loadApprovals()}
}

/* ------------------------------------------------------------------ customer acceptances */
async function loadAcceptances(){
  if(!rt)return;
  try{rt.acceptances=await cloud.listAcceptances()}catch(e){rt.acceptances=[]}
  if(G().state.view==='jobs'||G().state.view==='guided')refreshView();
}
function acceptanceFor(j){return (rt.acceptances||[]).find(a=>a.estimateNumber&&j&&a.estimateNumber===j.number)||null}
function acceptanceBannerHTML(a){
  if(!a)return '';
  return `<div class="gate-ok es-accepted" role="status"><b>Accepted by ${esc(a.acceptedName)}</b> on ${esc(new Date(a.acceptedAt).toLocaleString())}${a.total!=null?' · total '+esc(money(a.total)):''}${a.acceptedNote?'<br/><small>“'+esc(a.acceptedNote)+'”</small>':''}</div>`;
}

/* ------------------------------------------------------------------ customer share */
function sharePanelHTML(j,x){
  const shares=rt.shares[j._serverId]||null;
  const ns=rt.newShare&&rt.newShare.jobId===j._serverId?rt.newShare:null;
  if(!j._serverId)return `<section class="card es-share" style="margin-top:14px"><h3>Customer link</h3><p class="method-note">Saving this job to the server… a customer link is available once it is saved.</p></section>`;
  return `<section class="card es-share" style="margin-top:14px"><h3>Customer link (read-only estimate)</h3>
  ${acceptanceBannerHTML(acceptanceFor(j))}
  <p class="method-note">Customers never sign in. A link shows only the customer-safe estimate (scope, approved prices, payments, terms) — no costs, markup, profit, margin, pay, or internal notes. The server recomputes the price before issuing it. The customer can accept the estimate from the link; acceptances show here and under Jobs.</p>
  ${x.quoteReady?'':'<div class="warn-banner"><b>Pending quote.</b> Links can only be issued after all required prices are configured and the server confirms the total.</div>'}
  <div class="inline-actions"><label class="es-inline">Valid for <select id="esShareDays"><option value="14">14 days</option><option value="30" selected>30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></label>
  <button type="button" class="button" id="esCreateShare" ${x.quoteReady?'':'disabled'}>Verify with server &amp; create link</button>
  <button type="button" class="quiet" id="esListShares">Show issued links</button></div>
  ${ns?`<div class="gate-ok es-newlink" role="status"><b>New link (shown once — copy it now):</b><input id="esShareUrl" readonly value="${esc(ns.url)}"><button type="button" class="quiet" id="esCopyShare">Copy</button><small>Expires ${esc(new Date(ns.expires).toLocaleDateString())}. Server total ${esc(ns.total)}.</small></div>`:''}
  ${shares?`<div class="table-wrap"><table><thead><tr><th>Link</th><th>Created</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>${shares.map(s=>`<tr><td>…${esc(s.token_hint)}</td><td>${esc(new Date(s.created_at).toLocaleDateString())}</td><td>${esc(new Date(s.expires_at).toLocaleDateString())}</td><td>${s.revoked_at?'Revoked':(new Date(s.expires_at)<new Date()?'Expired':'Active')}</td><td>${s.revoked_at?'':`<button type="button" class="quiet" data-revoke-share="${esc(s.share_id)}">Revoke</button>`}</td></tr>`).join('')||'<tr><td colspan="5">No links issued.</td></tr>'}</tbody></table></div>`:''}
  </section>`;
}
async function createShare(){
  const j=G().activeJob();if(!j._serverId){toast('Job not saved yet.');return}
  const gate=G().issueGate?G().issueGate(j):{ok:true,acked:false};
  if(!gate.ok){toast(gate.message);return}
  dirty.add(j.id);await flush();
  if(dirty.has(j.id)){toast('Save the job first (see status).');return}
  try{
    const rec=await cloud.quote('record',j._serverId,null,{sanityContinue:!!gate.acked});
    if(!rec.customer||!rec.customer.quoteReady){toast('Server says the quote is still Pending — link not created.');return}
    const days=Number(($('esShareDays')||{}).value)||30;
    const s=await cloud.createShare(j._serverId,days);
    const base=cfg.siteUrl||W.location.href;
    rt.newShare={jobId:j._serverId,url:W.EsCloud.shareUrl(base,s.token),expires:s.expires_at,total:(rec.customer.totals&&rec.customer.totals.total||0).toLocaleString('en-US',{style:'currency',currency:'USD'})};
    rt.shares[j._serverId]=await cloud.listShares(j._serverId);
    G().render();
  }catch(e){toast(e.code==='discount_over_cap'?'Link refused: the adjustment is over the owner-approved limit.':'Link not created: '+e.message)}
}

/* ------------------------------------------------------------------ staff (owner) */
function staffViewHTML(){
  const list=rt.staffList;
  return `<div class="view-heading"><span class="eyebrow">OWNER</span><h1>Staff access.</h1><p>Approve, disable, or change roles. Disabled accounts lose access to jobs and prices immediately (server-enforced).</p></div>
  <section class="card"><div class="info-banner"><b>Adding an employee:</b> Supabase Dashboard → Authentication → Users → <b>Invite user</b> (their email). They set a password from the invite email. New accounts start <b>disabled</b> — enable them here. There is no public sign-up.</div>
  ${list?`<div class="table-wrap"><table><thead><tr><th>Name / email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${list.map(s=>{const me=s.id===rt.profile.id;return `<tr data-staff-row="${esc(s.id)}"><td>${esc(s.full_name||'')}<small>${esc(s.email)}</small></td><td>${esc(s.role)}</td><td>${s.active?'Active':'Disabled'}${s.disabled_reason?'<small>'+esc(s.disabled_reason)+'</small>':''}</td><td>${me?'<small>You</small>':`<button type="button" class="quiet" data-staff-id="${esc(s.id)}" data-staff-action="${s.active?'disable':'enable'}">${s.active?'Disable':'Enable'}</button> <button type="button" class="quiet" data-staff-id="${esc(s.id)}" data-staff-action="${s.role==='owner'?'make-employee':'make-owner'}">${s.role==='owner'?'Make employee':'Make owner'}</button>`}</td></tr>`}).join('')}</tbody></table></div>`:'<p class="method-note">Loading staff…</p>'}
  <div class="inline-actions"><button type="button" class="quiet" id="esReloadStaff">Reload</button></div></section>`;
}
async function loadStaff(){try{rt.staffList=await cloud.listStaff()}catch(e){rt.staffList=[];toast(e.message)}if(G().state.view==='staff')G().render()}
async function staffAction(id,action){
  const s=(rt.staffList||[]).find(x=>x.id===id);if(!s)return;
  let role=s.role,active=s.active,reason='';
  if(action==='disable'){reason=W.prompt('Reason for disabling '+s.email+' (optional):','')||'';active=false}
  if(action==='enable')active=true;
  if(action==='make-owner'){if(!W.confirm('Give '+s.email+' full owner access (prices, costs, staff)?'))return;role='owner'}
  if(action==='make-employee')role='employee';
  try{await cloud.setStaffAccess(id,role,active,reason);toast('Updated '+s.email+'.');await loadStaff()}catch(e){toast(e.message)}
}

/* ------------------------------------------------------------------ jobs extra: reload + explicit offline import */
function jobsExtraHTML(){
  const scan=rt.localScan;
  return `<section class="card es-jobs-extra"><div class="inline-actions"><span class="cloud-badge on">SERVER · ${esc(rt.syncStatus)}</span><button type="button" class="quiet" id="esReloadJobs">Reload from server</button><button type="button" class="quiet" id="esScanLocal">Find offline jobs on this device</button></div>
  ${scan?(scan.length?`<div class="es-import"><p class="method-note">Offline/demo jobs found in this browser. Nothing is uploaded until you tick jobs and press <b>Import selected</b>. Local copies are never deleted. Prices are recalculated with the server price book.</p>
  ${scan.map((s,i)=>`<label class="check es-import-row"><input type="checkbox" data-import-index="${i}"> ${esc(s.label)} <small>${esc(s.source)}</small></label>`).join('')}
  <button type="button" class="button secondary" id="esImportLocal">Import selected</button></div>`:'<p class="method-note">No offline jobs found in this browser.</p>'):''}</section>
  <section class="card es-acceptances"><h3>Customer acceptances</h3>
  <p class="method-note">Estimates accepted by customers from their share link. Matched to jobs by document number.</p>
  <div class="inline-actions"><button type="button" class="quiet" id="esReloadAcceptances">Reload</button></div>
  ${rt.acceptances?`<div class="table-wrap"><table><thead><tr><th>Estimate</th><th>Customer</th><th>Accepted by</th><th>When</th><th class="num">Total</th></tr></thead><tbody>${(rt.acceptances||[]).slice(0,50).map(a=>`<tr><td>${esc(a.estimateNumber||'')}</td><td>${esc(a.customerName||'')}</td><td>${esc(a.acceptedName||'')}${a.acceptedNote?'<small>'+esc(a.acceptedNote)+'</small>':''}</td><td>${esc(new Date(a.acceptedAt).toLocaleString())}</td><td class="num">${a.total!=null?esc(money(a.total)):''}</td></tr>`).join('')||'<tr><td colspan="5">No acceptances yet.</td></tr>'}</tbody></table></div>`:'<p class="method-note">Loading…</p>'}
  </section>`;
}
function scanLocal(){
  const keys=['exotic-splash-estimator-v7'].concat(G().LEGACY_KEYS);const out=[];const seen=new Set(G().state.jobs.map(j=>j.id));
  for(const k of keys){let raw=null;try{raw=JSON.parse(W.localStorage.getItem(k)||'null')}catch{}
    if(!raw)continue;const jobs=Array.isArray(raw.jobs)?raw.jobs:(raw.job?[raw.job]:[]);
    for(const j of jobs){if(!j||seen.has(j.id))continue;out.push({key:k,job:j,source:k.replace('exotic-splash-estimator-','local ')+(j.isSample?' · sample':''),label:(j.customer||j.company||'(no name)')+' · '+(j.number||'')})}}
  rt.localScan=out;G().render();
}
function importLocal(){
  const picks=Array.from(D.querySelectorAll('[data-import-index]:checked')).map(el=>rt.localScan[Number(el.dataset.importIndex)]).filter(Boolean);
  if(!picks.length){toast('Tick at least one job to import.');return}
  for(const p of picks){const j=G().guidedJob(JSON.parse(JSON.stringify(p.job)));
    for(const k of Object.keys(j))if(k.charAt(0)==='_')delete j[k];
    if(rt.profile.role!=='owner'){delete j.markup;j.method='rates';j.agreedTotal=0;for(const a of j.areas||[])a.rate=null}
    j._local=true;G().state.jobs.unshift(j);dirty.add(j.id)}
  rt.localScan=null;setSync('saving…');scheduleFlush(100);G().render();toast(picks.length+' job(s) queued for upload. Local copies kept.');
}
async function reloadJobs(){
  if(dirty.size&&!W.confirm('Unsaved changes will be replaced by the server copy. Continue?'))return;
  dirty.clear();const owner=rt.profile.role==='owner';
  const rows=await cloud.listJobs();const mk={};if(owner)for(const m of await cloud.listJobMarkups())mk[m.job_id]=Number(m.markup_pct);
  G().state.jobs=rows.map(r=>G().guidedJob(rowToJob(r,owner?mk[r.id]:undefined,G().state.settings)));
  for(const j of G().state.jobs)j._savedSig=jobSig(j);
  G().state.activeJobId=(G().state.jobs[0]||{}).id||null;
  for(const k of Object.keys(G().serverQuotes))delete G().serverQuotes[k];
  setSync('reloaded');G().render();
}

/* ------------------------------------------------------------------ click router (auth mode) */
function onClick(t){
  if(!rt)return false;
  if(t.dataset.view==='staff'){G().go('staff');loadStaff();return true}
  if(t.dataset.view==='approvals'){G().go('approvals');loadApprovals();refreshApprovalBadge();return true}
  if(t.dataset.approveId){decideFromInbox(t.dataset.approveId,t.dataset.estimateId,'approve');return true}
  if(t.dataset.rejectId){decideFromInbox(t.dataset.rejectId,t.dataset.estimateId,'reject');return true}
  if(t.dataset.revokeShare){revoke(t.dataset.revokeShare);return true}
  if(t.dataset.staffId){staffAction(t.dataset.staffId,t.dataset.staffAction);return true}
  switch(t.id){
    case 'esSavePriceBook':savePriceBook();return true;
    case 'esReloadPriceBook':reloadPriceBook().catch(e=>toast(e.message));return true;
    case 'esShowAudit':cloud.priceAudit(50).then(a=>{rt.audit=a;G().render()}).catch(e=>toast(e.message));return true;
    case 'esCreateShare':createShare();return true;
    case 'esListShares':{const j=G().activeJob();if(j._serverId)cloud.listShares(j._serverId).then(s=>{rt.shares[j._serverId]=s;G().render()}).catch(e=>toast(e.message));return true}
    case 'esCopyShare':{const i=$('esShareUrl');if(i){i.select();try{W.navigator.clipboard.writeText(i.value);toast('Link copied.')}catch{D.execCommand('copy')}}return true}
    case 'esReloadJobs':reloadJobs().catch(e=>toast(e.message));return true;
    case 'esScanLocal':scanLocal();return true;
    case 'esImportLocal':importLocal();return true;
    case 'esReloadStaff':loadStaff();return true;
    case 'esReloadApprovals':loadApprovals();refreshApprovalBadge();return true;
    case 'esReloadAcceptances':loadAcceptances();return true;
    case 'restore':case 'restoreInline':toast('Restore is disabled while signed in.');return true;
  }
  return false;
}
async function revoke(id){
  if(!W.confirm('Revoke this customer link? It stops working immediately.'))return;
  try{await cloud.revokeShare(id);const j=G().activeJob();rt.shares[j._serverId]=await cloud.listShares(j._serverId);if(rt.newShare)rt.newShare=null;G().render();toast('Link revoked.')}catch(e){toast(e.message)}
}

/* ------------------------------------------------------------------ gate events */
D.addEventListener('submit',async ev=>{
  const f=ev.target;if(!f||!f.id)return;ev.preventDefault();
  if(f.id==='loginForm'){
    const btn=$('loginSubmit');btn.disabled=true;btn.textContent='Signing in…';
    try{await cloud.signIn($('loginEmail').value,$('loginPassword').value);await enterApp()}
    catch(e){showLogin(e.message)}
  }
  if(f.id==='forgotForm'){
    const btn=$('forgotSubmit');btn.disabled=true;
    const redirect=(cfg.siteUrl||W.location.href.replace(/[#?].*$/,''));
    try{await cloud.requestPasswordReset($('forgotEmail').value,redirect);showForgot('If that email belongs to a staff account, a reset link is on its way. Check your inbox (and spam).')}
    catch(e){if(e.code==='input'||e.code==='rate')showForgot(e.message);else showForgot('If that email belongs to a staff account, a reset link is on its way. Check your inbox (and spam).')}
  }
  if(f.id==='pwForm'){
    const a=$('pw1').value,b=$('pw2').value;
    if(a!==b){showSetPassword(redirectType,'Passwords do not match.');return}
    try{await cloud.setNewPassword(a);try{W.history.replaceState(null,'',W.location.pathname+W.location.search)}catch{}await enterApp()}
    catch(e){showSetPassword(redirectType,e.message)}
  }
});
D.addEventListener('click',ev=>{
  const t=ev.target.closest('button');if(!t)return;
  switch(t.id){
    case 'gateDemo':if(demoAllowed())startDemo();break;
    case 'esExitDemo':exitDemo();break;
    case 'gateForgot':showForgot();break;
    case 'gateBack':showLogin();break;
    case 'gateSignOut':case 'signOutTop':if(rt)doSignOut();else if(cloud)cloud.signOut().finally(()=>W.location.reload());break;
    case 'gateRetry':enterApp();break;
  }
});
D.addEventListener('change',ev=>{
  const t=ev.target;
  if(t&&t.id==='esApprovalFilter'&&rt){rt.approvalFilter=t.value;loadApprovals()}
});
W.addEventListener('beforeunload',e=>{if(rt&&(dirty.size||inflight)){writeOutbox();e.preventDefault();e.returnValue=''}});

/* ------------------------------------------------------------------ start */
function start(){
  let demoFlag=false;try{demoFlag=W.sessionStorage.getItem(DEMO_FLAG)==='1'}catch{}
  if(demoFlag&&demoAllowed()){startDemo();return}
  if(cfg.state==='unconfigured'){showUnconfigured();return}
  if(cfg.state==='invalid'){showInvalid(cfg.errors);return}
  if(!W.supabase||typeof W.supabase.createClient!=='function'){showError('Sign-in library failed to load (vendor/supabase-js). Check that all files were uploaded.');return}
  initAuth().catch(e=>showError(e.message||String(e)));
}
W.EsGate={get runtime(){return rt},get config(){return cfg},flush,get dirtyCount(){return dirty.size}};
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',start);else start();
})();
