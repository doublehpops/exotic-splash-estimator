/* Phone shell for the guided estimator: menu, save-pill visibility, first-run
   walkthrough, and stacked tables. Does not price jobs or call the server. */
(function(){
'use strict';
const KEY='es-v7-walkthrough-seen';
const CARDS=[
  {title:'Start with the customer',body:'Enter a name and a phone, email, or the job address. That is what creates the job. Then tap Next at the bottom.'},
  {title:'One step at a time',body:'The bar names the step you are on, such as Step 2 of 6 · Areas. Measure the floor, check the slab, pick the system, then choose a price. Back and Next stay on screen.'},
  {title:'Choose a price, then export',body:'Pricing starts with Regular, bank transfer, and scheduled payments. A lower price that needs the owner’s OK sits under those choices. Cost and margin stay in Owner view.'}
];
let card=0, offered=false, dialog=null;

function seen(){try{return localStorage.getItem(KEY)==='1'}catch(e){return false}}
function mark(){try{localStorage.setItem(KEY,'1')}catch(e){}}

function ensureDialog(){
  if(dialog)return dialog;
  dialog=document.createElement('dialog');
  dialog.id='walkthrough';
  dialog.className='walkthrough';
  dialog.innerHTML='<div class="walk-card" role="document"><p class="eyebrow" id="walkEyebrow"></p><h2 id="walkTitle"></h2><p id="walkBody"></p><div class="walk-actions"><button type="button" class="button secondary" id="walkBack">Back</button><button type="button" class="button" id="walkNext">Next</button></div></div>';
  document.body.appendChild(dialog);
  dialog.addEventListener('click',function(e){
    const t=e.target.closest('button');if(!t)return;
    if(t.id==='walkBack'){if(card===0){mark();dialog.close()}else{card-=1;paint()}}
    if(t.id==='walkNext'){if(card>=CARDS.length-1){mark();dialog.close()}else{card+=1;paint()}}
  });
  dialog.addEventListener('cancel',function(){mark()});
  return dialog;
}
function paint(){
  const c=CARDS[card];
  document.getElementById('walkEyebrow').textContent=(card+1)+' of '+CARDS.length;
  document.getElementById('walkTitle').textContent=c.title;
  document.getElementById('walkBody').textContent=c.body;
  const back=document.getElementById('walkBack');
  const next=document.getElementById('walkNext');
  back.textContent=card===0?'Skip':'Back';
  next.textContent=card>=CARDS.length-1?'Start':'Next';
}
function openTour(fromStart){
  card=0;
  const d=ensureDialog();
  paint();
  if(!d.open)d.showModal();
  if(fromStart)offered=true;
}
function maybeTour(){
  const app=document.getElementById('appRoot');
  if(!app||app.hidden||seen()||offered)return;
  openTour(true);
}
function pinHeader(){
  const banner=document.getElementById('modeBanner');
  const h=banner&&!banner.hidden?banner.offsetHeight:0;
  document.documentElement.style.setProperty('--banner-h',h+'px');
  const side=document.querySelector('.sidebar-top')||document.querySelector('.sidebar');
  const sh=side?side.offsetHeight:56;
  document.documentElement.style.setProperty('--side-h',sh+'px');
  const narrow=window.matchMedia('(max-width:900px)').matches;
  const foot=document.getElementById('savePill');
  const head=document.getElementById('savePillHeader');
  if(foot)foot.setAttribute('aria-hidden',narrow?'true':'false');
  if(head)head.setAttribute('aria-hidden',narrow?'false':'true');
}
function closeNav(){
  document.body.classList.remove('nav-open');
  const b=document.getElementById('menuToggle');
  if(b)b.setAttribute('aria-expanded','false');
}
function stackTables(){
  document.querySelectorAll('#main table').forEach(function(table){
    const wrap=table.closest('.table-wrap')||table.parentElement;
    if(wrap)wrap.classList.add('stack-cards');
    const heads=[].map.call(table.querySelectorAll('thead th'),function(th){return th.textContent.replace(/\s+/g,' ').trim()});
    table.querySelectorAll('tbody tr').forEach(function(tr){
      const cells=[].slice.call(tr.children);
      cells.forEach(function(td,i){
        const label=heads[i]||'';
        if(cells.length===1||!label)td.removeAttribute('data-label');
        else td.setAttribute('data-label',label);
      });
    });
  });
}
function captureOpen(){
  return [].map.call(document.querySelectorAll('#main details'),function(d){return d.open});
}
function preferTapeMeasure(){
  if(preferTapeMeasure.done)return;
  preferTapeMeasure.done=true;
  const G=window.GuidedApp;
  if(!G||typeof G.activeJob!=='function')return;
  const j=G.activeJob();if(!j||!j.areas)return;
  let changed=false;
  j.areas.forEach(function(a){
    const empty=!(Number(a.sqft)>0)&&!(a.rectangles||[]).some(function(r){return Number(r.length)||Number(r.width)});
    if(empty&&a.sqftMode!=='rectangles'){a.sqftMode='rectangles';changed=true}
  });
  if(changed)G.render();
}
function afterRender(flags){
  preferTapeMeasure();
  if(flags&&flags.length){
    const all=document.querySelectorAll('#main details');
    flags.forEach(function(open,i){if(open&&all[i])all[i].open=true});
  }
  stackTables();
  pinHeader();
  const q=new URLSearchParams(location.search);
  if(q.get('owner')==='1'){const d=document.querySelector('#main details.owner-view');if(d)d.open=true}
  maybeTour();
}
document.addEventListener('click',function(e){
  const toggle=e.target.closest&&e.target.closest('#menuToggle');
  if(toggle){
    const open=document.body.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded',open?'true':'false');
    return;
  }
  if(e.target.closest&&e.target.closest('#replayWalkthrough')){openTour(false);return}
  if(!document.body.classList.contains('nav-open'))return;
  if(e.target.closest&&e.target.closest('#nav button')){closeNav();return}
  if(!(e.target.closest&&(e.target.closest('#nav')||e.target.closest('.sidebar-top'))))closeNav();
});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeNav()});
window.addEventListener('resize',pinHeader);
window.EsMobileUX={captureOpen:captureOpen,afterRender:afterRender,openTour:openTour};
})();
