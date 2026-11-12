/* Follow-up panel and public survey markup. No prices, costs, or margins. */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.EsFollowupUI=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function core(){return (typeof globalThis!=='undefined'&&globalThis.EsFollowup)||null;}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function when(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  try{
    return new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'}).format(d)+' CT';
  }catch(e){return d.toISOString();}
}
function statusLabel(status){
  const map={
    scheduled:'Scheduled',sending:'Sending',sent:'Sent',failed:'Failed',completed:'Completed',
    skipped:'Skipped',sms_not_configured:'Texting not configured',opted_out:'Opted out',dry_run:'Dry run'
  };
  return map[status]||status||'';
}
function flagsOf(settings){
  const F=core();
  if(F)return F.normalizeFlags(settings);
  return {enabled:false,dryRun:true,voiceEnabled:false};
}
function renderPanel(input){
  const owner=!!(input&&input.owner);
  const flags=flagsOf(input&&input.settings);
  const rows=input&&input.rows;
  const head='<div class="page-head"><div><span class="eyebrow">'+(owner?'OWNER':'YOUR JOBS')+'</span><h1>Follow-ups.</h1><p>'+(owner
    ?'A thank-you text the day after a quote is finished, inside 9 AM–8 PM Chicago time. Survey answers stay on this account.'
    :'Status of the follow-up on jobs this account can open. Survey answers stay with the owner.')+'</p></div></div>';
  const banner='<div class="info-banner"><b>Text only.</b> Voice calls stay off'
    +(flags.voiceEnabled?'':' (voice switch is off and nothing is scheduled to call)')
    +'. Real texts also need A2P 10DLC registration on +1 312-584-2873. The switches ship off, and dry run logs the message instead of sending it.</div>';
  const switches=owner?`<section class="card"><h3>Switches <span class="lock-pill owner-pill">OWNER</span></h3>
    <label class="check-label"><input id="fuEnabled" type="checkbox" ${flags.enabled?'checked':''}> Follow-ups enabled</label>
    <label class="check-label"><input id="fuDryRun" type="checkbox" ${flags.dryRun?'checked':''}> Dry run — log the text, do not send it</label>
    <label class="check-label"><input id="fuVoice" type="checkbox" ${flags.voiceEnabled?'checked':''}> Voice calls (kept in code, not scheduled while this is off)</label>
    <div class="inline-actions"><button type="button" class="button" id="fuSaveSettings">Save follow-up switches</button><button type="button" class="quiet" id="fuReload">Reload</button></div>
    <p class="method-note">Enabled is off and dry run is on until you change them here. Employees cannot change these.</p>
  </section>`:'';
  let body;
  if(!rows)body='<p class="method-note">Loading…</p>';
  else if(!rows.length)body='<p class="method-note">No follow-ups yet. One is scheduled after a quote is finalized, sent, booked, or declined, and only when the customer agreed to a follow-up text.</p>';
  else if(owner)body=ownerTable(rows);
  else body=employeeTable(rows);
  return head+banner+switches+'<section class="card">'+body+'</section>';
}
function ownerTable(rows){
  const tr=rows.map(function(r){
    const id=esc(r.id);
    const answers=r.surveyAnswers||r.survey_answers;
    const score=answers&&answers.experience!=null?esc(answers.experience)+' / 5':'';
    const why=esc(r.outcomeReason||r.outcome_reason||(answers&&answers.why_not)||'');
    const replies=Array.isArray(r.inboundReplies||r.inbound_replies)?(r.inboundReplies||r.inbound_replies):[];
    const replyText=replies.map(function(m){return esc(m.body||'');}).filter(Boolean).join(' · ');
    const actions='<button type="button" class="button small" data-followup-action="text_now" data-followup-id="'+id+'">Text now</button> '
      +'<button type="button" class="quiet" data-followup-action="skip" data-followup-id="'+id+'">Skip</button> '
      +'<input id="fu-when-'+id+'" type="datetime-local" aria-label="Reschedule '+esc(r.jobNumber||'')+' Chicago time"> '
      +'<button type="button" class="quiet" data-followup-action="reschedule" data-followup-id="'+id+'">Reschedule</button>';
    return '<tr><td>'+esc(r.jobNumber||'')+'<small>'+esc(r.customerFirstName||r.customer_first_name||'')+'</small></td>'
      +'<td>'+esc(statusLabel(r.status))+'<small>'+esc(r.channel||'sms')+'</small></td>'
      +'<td>'+esc(r.jobOutcome||r.job_outcome||'')+'</td>'
      +'<td>'+esc(when(r.scheduledFor||r.scheduled_for))+'<small>'+(r.sentAt||r.sent_at?'Sent '+esc(when(r.sentAt||r.sent_at)):'')+'</small></td>'
      +'<td>'+score+'</td>'
      +'<td>'+why+'</td>'
      +'<td>'+replyText+'</td>'
      +'<td>'+actions+'<small>Reschedule uses Chicago time.</small></td></tr>';
  }).join('');
  return '<div class="table-wrap"><table><thead><tr><th>Job</th><th>Status</th><th>Outcome</th><th>When</th><th>Experience</th><th>If not, why</th><th>Replies</th><th></th></tr></thead><tbody>'
    +(tr||'<tr><td colspan="8">Nothing here.</td></tr>')+'</tbody></table></div>'
    +'<p class="method-note">Text now sends only inside 9 AM–8 PM Chicago. Outside that window it waits until 9 AM. No prices are shown here.</p>';
}
function employeeTable(rows){
  const tr=rows.map(function(r){
    return '<tr><td>'+esc(r.jobNumber||'')+'<small>'+esc(r.customerFirstName||r.customer_first_name||'')+'</small></td>'
      +'<td>'+esc(statusLabel(r.status))+'</td>'
      +'<td>'+esc(when(r.scheduledFor||r.scheduled_for))+'</td>'
      +'<td>'+esc(when(r.sentAt||r.sent_at))+'</td></tr>';
  }).join('');
  return '<div class="table-wrap"><table><thead><tr><th>Job</th><th>Status</th><th>Scheduled</th><th>Sent</th></tr></thead><tbody>'
    +(tr||'<tr><td colspan="4">Nothing here.</td></tr>')+'</tbody></table></div>';
}
function surveyForm(questions){
  const blocks=(questions||[]).map(function(q){
    if(q.type==='yes_no'){
      return '<fieldset><legend>'+esc(q.prompt)+'</legend>'
        +'<label><input type="radio" name="'+esc(q.id)+'" value="yes"> Yes</label> '
        +'<label><input type="radio" name="'+esc(q.id)+'" value="no"> No</label></fieldset>';
    }
    if(q.type==='scale_1_5'){
      const opts=[1,2,3,4,5].map(function(n){
        return '<label><input type="radio" name="'+esc(q.id)+'" value="'+n+'"> '+n+'</label>';
      }).join(' ');
      return '<fieldset><legend>'+esc(q.prompt)+'</legend><div class="scale">'+opts+'</div><p>1 is poor and 5 is great.</p></fieldset>';
    }
    return '<label>'+esc(q.prompt)+'<textarea name="'+esc(q.id)+'" maxlength="1000"></textarea></label>';
  }).join('');
  return '<form id="surveyForm">'+blocks+'<button type="submit" id="surveySubmit">Send answers</button><p id="surveyMsg"></p></form>';
}
return {renderPanel:renderPanel,surveyForm:surveyForm,statusLabel:statusLabel,esc:esc};
});
