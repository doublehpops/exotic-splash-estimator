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
  const steps={};
  for(const id of ['visit_confirm','visit_reminder','quote_thanks','booked_install','undecided_check','last_check','review'])steps[id]=false;
  return {enabled:false,dryRun:true,voiceEnabled:false,steps:steps};
}
const STEP_LABELS={
  visit_confirm:'Visit confirmation',
  visit_reminder:'Day-before reminder',
  quote_thanks:'Quote thank-you',
  booked_install:'Booked install',
  undecided_check:'Undecided check-in',
  last_check:'Last check-in',
  review:'Review request',
  post_quote:'Quote follow-up'
};
function stepLabel(step){return STEP_LABELS[step]||stepLabel('post_quote');}
function reasonLabel(reason){
  const map={
    missing_quote:'Missing quote total. Not sent.',
    missing_project:'Missing project name. Not sent.',
    missing_visit:'Missing visit date or time. Not sent.',
    missing_address:'Missing address. Not sent.',
    missing_install:'Missing install date. Not sent.',
    missing_survey:'Missing survey link. Not sent.',
    no_consent:'No text consent.',
    no_phone:'Missing phone number.',
    opted_out:'Opted out.',
    booked:'Cancelled because the job was booked.',
    declined:'Cancelled because the job was declined.',
    not_booked:'Waiting until the job is booked.',
    visit_passed:'Visit time already passed.',
    window_after_visit:'Send window is after the visit.',
    step_disabled:'This step is off.'
  };
  return map[reason]||reason||'';
}
function surveySummary(answers){
  if(!answers||typeof answers!=='object')return '';
  const parts=[];
  if(answers.on_time)parts.push('On time '+answers.on_time);
  if(answers.explained!=null&&answers.explained!=='')parts.push('Explained '+answers.explained+' / 5');
  if(typeof answers.professional==='number')parts.push('Professional '+answers.professional+' / 5');
  else if(answers.professional)parts.push('Professional '+answers.professional);
  if(answers.likely)parts.push('Likely '+answers.likely);
  if(answers.improve)parts.push(answers.improve);
  if(answers.experience!=null&&answers.experience!=='')parts.push(answers.experience+' / 5');
  if(answers.why_not)parts.push(answers.why_not);
  if(answers.booked)parts.push('Booked '+answers.booked);
  return parts.join('. ');
}
function smsPreview(row){
  const F=core();
  if(!F||!F.sequenceSms||!F.isSequenceStep||!F.isSequenceStep(row.step))return '';
  const vars=row.stepVars||row.step_vars||{};
  const built=F.sequenceSms(row.step,{
    greetingName:row.greetingName||'',
    firstName:row.firstName||row.customerFirstName||row.customer_first_name||'',
    projectSummary:row.projectSummary||row.project_summary||vars.project||'',
    quoteTotal:vars.quoteTotal,
    visitAt:vars.visitAt,
    address:vars.address,
    installDate:vars.installDate,
    surveyUrl:row.surveyUrl||vars.surveyUrl||'',
    includeStop:row.includeStop===true||vars.includeStop===true
  });
  if(!built.ok)return '';
  return built.text;
}
function renderPanel(input){
  const owner=!!(input&&input.owner);
  const flags=flagsOf(input&&input.settings);
  const rows=input&&input.rows;
  const head='<div class="page-head"><div><span class="eyebrow">'+(owner?'OWNER':'YOUR JOBS')+'</span><h1>Follow-ups.</h1><p>'+(owner
    ?'Texts for a booked visit, the quote, and later check-ins. Sends stay inside 9 AM-8 PM Chicago time. Sunday moves to Monday at 10 AM. Saturday still sends. Survey answers stay on this account.'
    :'Status of the follow-up on jobs this account can open.')+'</p></div></div>';
  const banner=owner?'<div class="info-banner"><b>Text only.</b> Voice calls stay off'
    +(flags.voiceEnabled?'':' (voice switch is off and nothing is scheduled to call)')
    +'. Real texts also need A2P 10DLC registration on +1 312-584-2873. The switches ship off, and dry run logs the message instead of sending it. Each sequence step stays off until you turn that step on.</div>':'';
  const stepBoxes=owner?['visit_confirm','visit_reminder','quote_thanks','booked_install','undecided_check','last_check','review'].map(function(id){
    const on=flags.steps&&flags.steps[id]===true;
    return '<label class="check-label"><input id="fuStep_'+id+'" type="checkbox" '+(on?'checked':'')+'> '+esc(stepLabel(id))+'</label>';
  }).join(''):'';
  const switches=owner?`<section class="card"><h3>Switches <span class="lock-pill owner-pill">OWNER</span></h3>
    <label class="check-label"><input id="fuEnabled" type="checkbox" ${flags.enabled?'checked':''}> Follow-ups enabled</label>
    <label class="check-label"><input id="fuDryRun" type="checkbox" ${flags.dryRun?'checked':''}> Dry run. Log the text and do not send it</label>
    <label class="check-label"><input id="fuVoice" type="checkbox" ${flags.voiceEnabled?'checked':''}> Voice calls (kept in code, not scheduled while this is off)</label>
    <h4>Sequence steps</h4>
    ${stepBoxes}
    <div class="inline-actions"><button type="button" class="button" id="fuSaveSettings">Save follow-up switches</button><button type="button" class="quiet" id="fuReload">Reload</button></div>
    <p class="method-note">Enabled is off and dry run is on until you change them here. Every sequence step is off until you turn it on. Employees cannot change these.</p>
  </section>`:'';
  let body;
  if(!rows)body='<p class="method-note">Loading…</p>';
  else if(!rows.length)body='<p class="method-note">No follow-ups yet. Steps are added after a visit is booked or a quote is finalized, and only when the customer agreed to a follow-up text.</p>';
  else if(owner)body=ownerTable(rows);
  else body=employeeTable(rows);
  return head+banner+switches+'<section class="card">'+body+'</section>';
}
function ownerTable(rows){
  const tr=rows.map(function(r){
    const id=esc(r.id);
    const answers=r.surveyAnswers||r.survey_answers;
    const survey=esc(surveySummary(answers));
    const flag=esc(reasonLabel(r.reason||r.lastError||r.last_error||''));
    const confirmed=(r.visitConfirmedAt||r.visit_confirmed_at)?'<small>Visit confirmed</small>':'';
    const replies=Array.isArray(r.inboundReplies||r.inbound_replies)?(r.inboundReplies||r.inbound_replies):[];
    const replyText=replies.map(function(m){return esc(m.body||'');}).filter(Boolean).join(' / ');
    const preview=esc(smsPreview(r));
    const locked=['sent','completed','opted_out'].indexOf(r.status)>=0||r.optedOutAt||r.opted_out_at;
    const actions=locked?'':('<button type="button" class="button small" data-followup-action="text_now" data-followup-id="'+id+'">Text now</button> '
      +'<button type="button" class="quiet" data-followup-action="skip" data-followup-id="'+id+'">Skip</button> '
      +'<input id="fu-when-'+id+'" type="datetime-local" aria-label="Reschedule '+esc(r.jobNumber||'')+' Chicago time"> '
      +'<button type="button" class="quiet" data-followup-action="reschedule" data-followup-id="'+id+'">Reschedule</button>');
    return '<tr><td>'+esc(r.jobNumber||'')+'<small>'+esc(r.customerFirstName||r.customer_first_name||'')+'</small></td>'
      +'<td>'+esc(stepLabel(r.step||'post_quote'))+'</td>'
      +'<td>'+esc(statusLabel(r.status))+'<small>'+esc(r.channel||'sms')+'</small>'+confirmed+'</td>'
      +'<td>'+esc(r.jobOutcome||r.job_outcome||'')+'</td>'
      +'<td>'+esc(when(r.scheduledFor||r.scheduled_for))+'<small>'+(r.sentAt||r.sent_at?'Sent '+esc(when(r.sentAt||r.sent_at)):'')+'</small></td>'
      +'<td>'+flag+'</td>'
      +'<td>'+survey+'</td>'
      +'<td>'+replyText+'</td>'
      +'<td>'+(preview?'<small>'+preview+'</small>':'')+'</td>'
      +'<td>'+actions+'<small>Reschedule uses Chicago time.</small></td></tr>';
  }).join('');
  return '<div class="table-wrap"><table><thead><tr><th>Job</th><th>Step</th><th>Status</th><th>Outcome</th><th>When</th><th>Flag</th><th>Survey</th><th>Replies</th><th>Preview</th><th></th></tr></thead><tbody>'
    +(tr||'<tr><td colspan="10">Nothing here.</td></tr>')+'</tbody></table></div>'
    +'<p class="method-note">Text now, Skip, and Reschedule apply to that one message. Text now sends only inside 9 AM-8 PM Chicago, and never on Sunday. Outside that window it waits until 9 AM, or Monday if that would be Sunday. A missing price or date is flagged here and that message is not sent. Sent, completed, and opted-out rows stay as they are.</p>';
}
function employeeTable(rows){
  const tr=rows.map(function(r){
    return '<tr><td>'+esc(r.jobNumber||'')+'<small>'+esc(r.customerFirstName||r.customer_first_name||'')+'</small></td>'
      +'<td>'+esc(stepLabel(r.step||'post_quote'))+'</td>'
      +'<td>'+esc(statusLabel(r.status))+'</td>'
      +'<td>'+esc(when(r.scheduledFor||r.scheduled_for))+'</td>'
      +'<td>'+esc(when(r.sentAt||r.sent_at))+'</td></tr>';
  }).join('');
  return '<div class="table-wrap"><table><thead><tr><th>Job</th><th>Step</th><th>Status</th><th>Scheduled</th><th>Sent</th></tr></thead><tbody>'
    +(tr||'<tr><td colspan="5">Nothing here.</td></tr>')+'</tbody></table></div>';
}
function surveyForm(questions){
  const blocks=(questions||[]).map(function(q){
    if(q.type==='yes_no'){
      return '<fieldset><legend>'+esc(q.prompt)+'</legend>'
        +'<label><input type="radio" name="'+esc(q.id)+'" value="yes"> Yes</label> '
        +'<label><input type="radio" name="'+esc(q.id)+'" value="no"> No</label></fieldset>';
    }
    if(q.type==='yes_maybe_no'){
      return '<fieldset><legend>'+esc(q.prompt)+'</legend>'
        +'<label><input type="radio" name="'+esc(q.id)+'" value="yes"> Yes</label> '
        +'<label><input type="radio" name="'+esc(q.id)+'" value="maybe"> Maybe</label> '
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
return {renderPanel:renderPanel,surveyForm:surveyForm,statusLabel:statusLabel,surveySummary:surveySummary,stepLabel:stepLabel,esc:esc};
});
