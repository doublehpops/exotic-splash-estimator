/* Exotic Splash v7 — read-only customer estimate renderer (customer-safe snapshot -> HTML). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EsEstimateView=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash=n=>(Number(n)||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
const num=(n,d=0)=>(Number(n)||0).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
function fmtDate(s){if(!s)return '';const d=new Date(s);return isNaN(d)?esc(s):d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}
function lineRows(lines){return (lines||[]).map(l=>`<tr><td>${esc(l.label)}${l.description?`<small>${esc(l.description)}</small>`:''}</td><td class="num">${l.qty?num(l.qty,2)+' '+esc(l.unit||''):''}</td><td class="num">${l.pending?'Pending':cash(l.total)}</td></tr>`).join('')}
/** Acceptance block for a ready estimate: the accepted banner, or the accept form. */
function acceptanceHTML(docName,ready,acceptance){
  if(!ready)return '';
  if(acceptance&&acceptance.accepted_name){
    return `<div class="est-accepted" role="status"><b>Accepted</b> by ${esc(acceptance.accepted_name)}${acceptance.accepted_at?' on '+fmtDate(acceptance.accepted_at):''}. Thank you — Exotic Splash will be in touch to schedule.</div>`;
  }
  return `<form id="acceptForm" class="est-accept noprint" novalidate>
  <h2>Accept this ${esc(docName.toLowerCase())}</h2>
  <p>Type your name to accept the scope and price shown above. This records your acceptance with Exotic Splash; scheduling and payment details follow in writing.</p>
  <label>Your name<input id="acceptName" type="text" maxlength="120" autocomplete="name" required></label>
  <label>Note for us (optional)<textarea id="acceptNote" maxlength="1000" rows="3"></textarea></label>
  <button type="submit" id="acceptBtn">Accept ${esc(docName.toLowerCase())}</button>
  <div id="acceptMsg" class="est-accept-msg" role="alert"></div>
  </form>`;
}
function render(payload,acceptance){
  if(!payload||!payload.estimate)return `<section class="est-card"><h1>Estimate not available</h1><p>This link is invalid, expired, or was withdrawn by Exotic Splash. Please contact us for a current estimate.</p></section>`;
  payload={estimate:payload.estimate,issued_at:payload.issued_at,expires_at:payload.expires_at};
  const e=payload.estimate,b=e.business||{},c=e.customer||{},d=e.document||{},t=e.totals||{},sel=e.selected||{};
  const ready=!!e.quoteReady;
  const docName=d.type==='invoice'?'Invoice':'Estimate';
  const rows=e.project&&e.project.catalog?lineRows(e.catalogStarting)+lineRows(e.catalogAdjustments):lineRows(e.lines);
  const scope=(e.scope||[]).map(a=>`<li><b>${esc(a.name)}</b> — ${num(a.sqft)} sq ft · ${esc(a.description)}${a.color?' · color: '+esc(a.color):''}${a.flakeBlend?' · flake: '+esc(a.flakeBlend):''}${a.moisture?' · moisture-control primer':''}</li>`).join('');
  const pays=(sel.payments||[]).map(p=>`<tr><td>${esc(p.label)} (${num(p.pct)}%)</td><td class="num">${cash(p.amount)}</td></tr>`).join('');
  const opts=e.showOptions?(e.options||[]).map(o=>`<div class="opt ${o.key===sel.key?'sel':''}"><b>${esc(o.label)}</b><span>${cash(o.total)}</span>${o.savings?`<small>Save ${cash(o.savings)}</small>`:''}</div>`).join(''):'';
  return `<section class="est-card">
  <header class="est-head"><div><div class="est-brand">${esc(b.name)}</div><div class="est-contact">${esc(b.address)}<br/>${esc(b.phone)}${b.email?' · '+esc(b.email):''}</div></div>
  <div class="est-title"><h1>${docName}</h1><p>${esc(d.number)}${d.date?' · '+esc(d.date):''}</p></div></header>
  <p class="est-cust"><b>Prepared for:</b> ${esc(c.name)}${c.company?' · '+esc(c.company):''}<br/>${esc(c.address)}</p>
  ${ready?'':`<div class="est-pending" role="alert"><b>Pricing pending.</b> This ${docName.toLowerCase()} is not finalized. ${(e.pendingReasons||[]).map(esc).join(' · ')}</div>`}
  ${scope?`<h2>Scope</h2><ul class="est-scope">${scope}</ul>`:''}
  ${(e.prepNotes||[]).length?`<h2>Surface preparation</h2><ul>${e.prepNotes.map(p=>'<li>'+esc(p)+'</li>').join('')}</ul>`:''}
  <h2>Pricing</h2>
  <table class="est-table"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead><tbody>${rows||'<tr><td colspan="3">See total</td></tr>'}</tbody></table>
  <table class="est-totals"><tbody>
    ${t.minimum?`<tr><td>Minimum job adjustment</td><td class="num">${cash(t.minimum)}</td></tr>`:''}
    ${t.discount?`<tr><td>Approved adjustment</td><td class="num">−${cash(t.discount)}</td></tr>`:''}
    <tr><td>Subtotal</td><td class="num">${ready?cash(t.subtotal):'Pending'}</td></tr>
    ${t.salesTax?`<tr><td>Sales tax (${num(t.taxPct,2)}%)</td><td class="num">${cash(t.salesTax)}</td></tr>`:''}
    <tr class="grand"><td>Total${sel.label?' · '+esc(sel.label):''}</td><td class="num">${ready?cash(t.total):'Pending'}</td></tr>
  </tbody></table>
  ${opts?`<h2>Payment options</h2><div class="est-opts">${opts}</div>`:''}
  ${pays&&ready?`<h2>Payment schedule</h2><table class="est-table"><tbody>${pays}</tbody></table>`:''}
  ${e.addOn&&e.addOn.included?`<p class="est-note">Includes ${esc(e.addOn.label)}.</p>`:''}
  ${e.terms?`<h2>Terms</h2><p class="est-pre">${esc(e.terms)}</p>`:''}
  ${e.jobNotes?`<h2>Notes &amp; exclusions</h2><p class="est-pre">${esc(e.jobNotes)}</p>`:''}
  ${e.priceNotes?`<p class="est-note">${esc(e.priceNotes)}</p>`:''}
  ${acceptanceHTML(docName,ready,acceptance)}
  <footer class="est-foot">Read-only ${docName.toLowerCase()} shared by ${esc(b.name||'Exotic Splash')}${payload.issued_at?' on '+fmtDate(payload.issued_at):''}${payload.expires_at?' · link valid until '+fmtDate(payload.expires_at):''}. Contact us to accept or ask questions.</footer>
  </section>`;
}
function tokenFromHash(hash){const m=/(?:^#|&)t=(est_[0-9a-f]{64})(?:&|$)/.exec(String(hash||''));return m?m[1]:null}
return{render,acceptanceHTML,tokenFromHash,esc};
});
