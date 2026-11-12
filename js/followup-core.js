/* Exotic Splash post-quote follow-up rules (UMD).
 * Byte-identical copy: supabase/functions/_shared/followup-core.js
 * No secrets and no prices. The dispatcher reads flags from the price book.
 * Ships off: enabled false, dryRun true, voiceEnabled false.
 */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.EsFollowup=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TZ='America/Chicago';
const WINDOW_START_MIN=9*60;
const WINDOW_END_MIN=20*60;
const COMPANY_NAME='Exotic Splash Epoxy';
const COMPANY_PHONE='312-584-2873';
const SIGN_OFF='- Exotic Splash Epoxy LLC';
const DEFAULT_FROM='+13125842873';
const SURVEY_BASE='https://doublehpops.github.io/exotic-splash-estimator/survey.html';
const MAX_ATTEMPTS=3;
const TOKEN_RE=/^s[A-Za-z0-9_-]{16}$/;
const STOP_WORDS=['stop','stopall','unsubscribe','cancel','end','quit','optout','revoke'];
const TERMINAL=['sent','completed','skipped','opted_out','dry_run','sms_not_configured'];
const STEP_IDS=['visit_confirm','visit_reminder','quote_thanks','booked_install','undecided_check','last_check','review'];
const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const SURVEY_QUESTIONS=[
  {id:'on_time',prompt:'Did your estimator show up on time?',type:'yes_no'},
  {id:'explained',prompt:'Did they clearly explain your options and pricing?',type:'scale_1_5'},
  {id:'professional',prompt:'Were they professional and respectful of your home or business?',type:'scale_1_5'},
  {id:'likely',prompt:'How likely are you to book with us?',type:'yes_maybe_no'},
  {id:'improve',prompt:'Anything we could do better?',type:'text'}
];

function nodeCrypto(){
  if(typeof require!=='function')return null;
  try{return require('crypto');}catch(e){return null;}
}
function pad(n){return String(n).padStart(2,'0');}
function chicagoParts(date){
  const dtf=new Intl.DateTimeFormat('en-US',{
    timeZone:TZ,hourCycle:'h23',
    year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit'
  });
  const map={};
  for(const p of dtf.formatToParts(date))map[p.type]=p.value;
  let hour=Number(map.hour);
  if(hour===24)hour=0;
  return {year:Number(map.year),month:Number(map.month),day:Number(map.day),hour:hour,minute:Number(map.minute),second:Number(map.second)};
}
function zoneOffsetMs(instant){
  const p=chicagoParts(instant);
  const asUtc=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
  return asUtc-instant.getTime();
}
function zonedTimeToUtc(year,month,day,hour,minute){
  const guess=new Date(Date.UTC(year,month-1,day,hour,minute,0));
  const once=new Date(guess.getTime()-zoneOffsetMs(guess));
  return new Date(guess.getTime()-zoneOffsetMs(once));
}
function addCalendarDays(year,month,day,n){
  const t=new Date(Date.UTC(year,month-1,day+n));
  return {year:t.getUTCFullYear(),month:t.getUTCMonth()+1,day:t.getUTCDate()};
}
function atChicago(year,month,day,hour,minute){
  return zonedTimeToUtc(year,month,day,hour,minute);
}
function chicagoWeekday(date){
  const d=date instanceof Date?date:new Date(date);
  return new Intl.DateTimeFormat('en-US',{timeZone:TZ,weekday:'short'}).format(d);
}
function skipSunday(instant,hour){
  if(chicagoWeekday(instant)!=='Sun')return instant;
  const p=chicagoParts(instant);
  const mon=addCalendarDays(p.year,p.month,p.day,1);
  return atChicago(mon.year,mon.month,mon.day,hour,0);
}
/** Next calendar day at 10:00 America/Chicago. A Sunday moves to Monday 10:00. */
function nextFollowupAt(from){
  const p=chicagoParts(from instanceof Date?from:new Date(from));
  const next=addCalendarDays(p.year,p.month,p.day,1);
  return skipSunday(atChicago(next.year,next.month,next.day,10,0),10);
}
/** Keep the instant when it is inside [9:00, 20:00). Otherwise roll to 9:00. Sunday waits until Monday 9:00. */
function rollIntoWindow(instant){
  const date=instant instanceof Date?instant:new Date(instant);
  const p=chicagoParts(date);
  const minutes=p.hour*60+p.minute;
  let at;
  if(minutes>=WINDOW_START_MIN&&minutes<WINDOW_END_MIN)at=new Date(date.getTime());
  else if(minutes<WINDOW_START_MIN)at=atChicago(p.year,p.month,p.day,9,0);
  else{
    const next=addCalendarDays(p.year,p.month,p.day,1);
    at=atChicago(next.year,next.month,next.day,9,0);
  }
  return skipSunday(at,9);
}
function inWindow(instant){
  const p=chicagoParts(instant instanceof Date?instant:new Date(instant));
  const minutes=p.hour*60+p.minute;
  return minutes>=WINDOW_START_MIN&&minutes<WINDOW_END_MIN;
}
function stepFlags(src){
  const raw=src&&src.steps&&typeof src.steps==='object'?src.steps:{};
  const steps={};
  for(const id of STEP_IDS)steps[id]=raw[id]===true;
  return steps;
}
function normalizeFlags(settings){
  const src=settings&&settings.followups?settings.followups:settings||{};
  return {
    enabled:src.enabled===true,
    dryRun:src.dryRun!==false,
    voiceEnabled:src.voiceEnabled===true,
    steps:stepFlags(src)
  };
}
function isSequenceStep(step){
  return STEP_IDS.indexOf(step)>=0;
}
function toE164(phone){
  const raw=String(phone||'').trim();
  const digits=raw.replace(/\D/g,'');
  if(digits.length===10)return '+1'+digits;
  if(digits.length===11&&digits.charAt(0)==='1')return '+'+digits;
  if(raw.charAt(0)==='+'&&digits.length>=10&&digits.length<=15)return '+'+digits;
  return '';
}
function firstName(customer){
  const s=String(customer||'').trim();
  if(!s)return '';
  return s.split(/\s+/)[0].slice(0,40);
}
function plainWords(text){
  return String(text||'')
    .replace(/\$[\d,]+(?:\.\d+)?/g,'')
    .replace(/\b(?:cost|margin|markup|profit|price)\b/ig,'')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,160);
}
function joinAnd(parts){
  const list=parts.filter(Boolean);
  if(list.length<=1)return list[0]||'';
  if(list.length===2)return list[0]+' and '+list[1];
  return list.slice(0,-1).join(', ')+' and '+list[list.length-1];
}
function styleWord(style){
  const s=plainWords(style||'').toLowerCase();
  if(!s||s==='epoxy')return '';
  return s;
}
function garagePhrase(section){
  const size={'1car':'1-car','2car':'2-car','3car':'3-car'}[section&&section.garagePackage]||'';
  const style=styleWord(section&&section.garageStyle);
  const bits=[];
  if(style)bits.push(style);
  if(size)bits.push(size);
  bits.push('garage floor');
  return bits.join(' ');
}
function floorPhrase(section){
  const styles=[];
  for(const area of (section&&section.areas)||[]){
    const style=styleWord(area&&area.style);
    if(style&&styles.indexOf(style)<0)styles.push(style);
  }
  if(!styles.length)return 'floor';
  return joinAnd(styles)+' floor';
}
function isBar(section){
  for(const item of (section&&section.catalogItems)||[]){
    const kind=String(item&&(item.kind||item.name)||'').toLowerCase();
    if(kind.indexOf('bar')>=0)return true;
  }
  return false;
}
function shortProject(section){
  const type=String(section&&section.projectType||'floor');
  if(type==='garage')return 'garage';
  if(type==='seating')return 'seating';
  if(type==='flatwork')return isBar(section)?'bar':'counter';
  return 'floor';
}
function onePhrase(section){
  const type=String(section&&section.projectType||'floor');
  if(type==='garage')return garagePhrase(section);
  if(type==='flatwork')return isBar(section)?'bar':'countertop';
  if(type==='seating')return 'seating';
  return floorPhrase(section);
}
function projectSummary(job){
  job=job||{};
  const extras=(Array.isArray(job.sections)?job.sections:[]).filter(function(s){return s&&typeof s==='object'&&!Array.isArray(s);});
  if(!extras.length)return onePhrase(job);
  const names=[];
  const all=[job].concat(extras);
  for(const section of all){
    const name=shortProject(section);
    if(name&&names.indexOf(name)<0)names.push(name);
  }
  if(names.length<=1)return onePhrase(job);
  return joinAnd(names)+' projects';
}
function jobOutcome(decision){
  const d=String(decision||'').trim().toLowerCase();
  if(d==='booked'||d==='accepted')return 'booked';
  if(d==='declined')return 'declined';
  return 'undecided';
}
function quoteIsDone(job){
  const status=String(job&&(job.status||job._status)||'');
  const decision=String(job&&(job.quoteDecision||(job.job_data&&job.job_data.quoteDecision))||'');
  if(status==='quoted'||status==='issued')return true;
  return ['booked','accepted','declined','undecided'].indexOf(decision.trim().toLowerCase())>=0;
}
function consentGiven(job){
  if(!job)return false;
  if(job.followupConsent===true)return true;
  if(job.followup_consent===true)return true;
  const data=job.job_data||job;
  return data.followupConsent===true;
}
function surveyUrl(base,token){
  const b=String(base||SURVEY_BASE).replace(/[#?].*$/,'');
  return b+'#t='+encodeURIComponent(token);
}
function followupSms(input){
  const name=input.firstName?('Hi '+input.firstName+', '):'Hi, ';
  const project=plainWords(input.projectSummary||'')||'project';
  let text=name+'this is Exotic Splash Epoxy LLC. Thanks for having us out to look at your '+project+'.';
  if(input.outcome==='booked'){
    text+=" Thanks for choosing us. We'll reach out to confirm next steps.";
  }else if(input.outcome==='declined'){
    text+=' If something held you back, just reply and let us know. We read every reply.';
  }else{
    text+=' If you have any questions about the quote, just reply here.';
  }
  text+=' Got a minute? Tell us how we did: '+(input.surveyUrl||'');
  text+='\n'+SIGN_OFF+'\nReply STOP to opt out.';
  return text;
}
function dynamicVariables(input){
  const sms=input.smsBody||followupSms(input);
  return {
    call_type:'followup',
    customer_first_name:String(input.firstName||''),
    job_outcome:jobOutcome(input.outcome),
    project_summary:plainWords(input.projectSummary||''),
    survey_url:String(input.surveyUrl||''),
    company_name:COMPANY_NAME,
    sms_body:sms
  };
}
function fromNumber(env){
  const n=toE164(env&&(env.RETELL_FROM_NUMBER||env.TWILIO_FROM_NUMBER));
  return n||DEFAULT_FROM;
}
function smsProvider(env){
  const p=String(env&&env.FOLLOWUP_SMS_PROVIDER||'').trim().toLowerCase();
  if(p==='retell'||p==='twilio')return p;
  return '';
}
function providerReady(env){
  const p=smsProvider(env);
  if(p==='retell')return !!(env.RETELL_API_KEY&&(env.RETELL_FOLLOWUP_AGENT_ID||env.RETELL_SMS_AGENT_ID));
  if(p==='twilio')return !!(env.TWILIO_ACCOUNT_SID&&env.TWILIO_AUTH_TOKEN);
  return false;
}
function buildRetellSms(row,env){
  const agent=String(env.RETELL_FOLLOWUP_AGENT_ID||env.RETELL_SMS_AGENT_ID||'');
  return {
    url:'https://api.retellai.com/create-sms-chat',
    method:'POST',
    bodyEncoding:'json',
    json:{
      from_number:fromNumber(env),
      to_number:row.phoneE164,
      override_agent_id:agent,
      metadata:{followup_id:String(row.id||''),job_id:String(row.jobId||''),attempt:String(row.attemptCount||1)},
      retell_llm_dynamic_variables:dynamicVariables(row)
    }
  };
}
function buildTwilioSms(row,env){
  const sid=String(env.TWILIO_ACCOUNT_SID||'');
  const params=new URLSearchParams();
  params.set('From',fromNumber(env));
  params.set('To',row.phoneE164);
  params.set('Body',row.smsBody||'');
  return {
    url:'https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(sid)+'/Messages.json',
    method:'POST',
    bodyEncoding:'form',
    form:params.toString(),
    accountSid:sid
  };
}
function buildVoiceRequest(row,env){
  const agent=String(env.RETELL_VOICE_AGENT_ID||'');
  return {
    url:'https://api.retellai.com/v2/create-phone-call',
    method:'POST',
    bodyEncoding:'json',
    json:{
      from_number:fromNumber(env),
      to_number:row.phoneE164,
      override_agent_id:agent,
      metadata:{followup_id:String(row.id||''),job_id:String(row.jobId||''),channel:'voice'},
      retell_llm_dynamic_variables:dynamicVariables(row)
    }
  };
}
function redactLog(value){
  const src=value&&typeof value==='object'?JSON.parse(JSON.stringify(value)):value;
  if(!src||typeof src!=='object')return src;
  const drop=/authorization|api[_-]?key|auth[_-]?token|secret|password/i;
  function walk(node){
    if(!node||typeof node!=='object')return node;
    if(Array.isArray(node))return node.map(walk);
    const out={};
    for(const k of Object.keys(node)){
      if(drop.test(k))continue;
      out[k]=walk(node[k]);
    }
    return out;
  }
  return walk(src);
}
function decideDispatch(input){
  const flags=normalizeFlags(input.settings);
  const row=input.row||{};
  const env=input.env||{};
  if(!flags.enabled)return {action:'hold',reason:'disabled'};
  if(row.consent!==true)return {action:'skip',status:'skipped',reason:'no_consent'};
  if(row.optedOut===true||row.optedOutAt)return {action:'skip',status:'opted_out',reason:'opted_out'};
  if(row.channel==='voice'&&!flags.voiceEnabled)return {action:'skip',reason:'voice_disabled'};
  const channel=row.channel==='voice'&&flags.voiceEnabled?'voice':'sms';
  const provider=channel==='voice'?'retell':smsProvider(env);
  const payload={
    channel:channel,
    provider:provider|| (channel==='voice'?'retell':''),
    to:row.phoneE164||'',
    from:fromNumber(env),
    smsBody:row.smsBody||'',
    variables:dynamicVariables(row),
    idempotencyKey:row.idempotencyKey||''
  };
  if(flags.dryRun){
    return {action:'dry_run',status:'dry_run',log:redactLog(payload)};
  }
  if(channel==='sms'&&!providerReady(env)){
    return {action:'sms_not_configured',status:'sms_not_configured',reason:'sms_not_configured',log:redactLog(payload)};
  }
  if(channel==='voice'&&!(env.RETELL_API_KEY&&env.RETELL_VOICE_AGENT_ID)){
    return {action:'skip',reason:'voice_not_configured'};
  }
  const request=channel==='voice'?buildVoiceRequest(row,env):(provider==='twilio'?buildTwilioSms(row,env):buildRetellSms(row,env));
  return {action:'send',status:'sent',channel:channel,request:request,log:redactLog(payload)};
}
function claimFollowup(row,now,opts){
  opts=opts||{};
  if(!row)return {ok:false,reason:'missing'};
  if(row.consent!==true)return {ok:false,reason:'no_consent'};
  if(row.optedOut===true||row.optedOutAt)return {ok:false,reason:'opted_out'};
  if(row.channel==='voice'&&opts.voiceEnabled!==true)return {ok:false,reason:'voice_disabled'};
  if(row.status==='sending')return {ok:false,reason:'in_flight'};
  if(TERMINAL.indexOf(row.status)>=0)return {ok:false,reason:'already_handled'};
  if(row.status!=='scheduled'&&row.status!=='failed')return {ok:false,reason:'not_sendable'};
  const max=row.maxAttempts||MAX_ATTEMPTS;
  if((row.attemptCount||0)>=max)return {ok:false,reason:'retries_exhausted'};
  if(row.providerRef)return {ok:false,reason:'already_sent'};
  const due=new Date(row.scheduledFor).getTime();
  const at=now instanceof Date?now.getTime():new Date(now).getTime();
  if(!(due<=at))return {ok:false,reason:'not_due'};
  const attempt=(row.attemptCount||0)+1;
  row.status='sending';
  row.attemptCount=attempt;
  row.idempotencyKey=String(row.id)+':'+attempt;
  return {ok:true,row:row,idempotencyKey:row.idempotencyKey};
}
function planSchedule(existing,event){
  const at=event.at instanceof Date?event.at:new Date(event.at);
  const outcome=jobOutcome(event.outcome);
  const phone=toE164(event.phone);
  const base={
    channel:'sms',
    jobOutcome:outcome,
    consent:event.consent===true,
    phoneE164:phone,
    projectSummary:plainWords(event.projectSummary||''),
    firstName:firstName(event.firstName||event.customer),
    attemptCount:existing?existing.attemptCount||0:0,
    maxAttempts:MAX_ATTEMPTS
  };
  const frozen=['sent','completed','sending','dry_run','failed','sms_not_configured','opted_out'];
  if(existing&&frozen.indexOf(existing.status)>=0){
    return {action:'leave',row:existing};
  }
  if(event.optedOut===true){
    return {action:existing?'update':'insert',row:Object.assign({},existing,base,{status:'opted_out',channel:'sms',scheduledFor:(existing&&existing.scheduledFor)||nextFollowupAt(at),reason:'opted_out'})};
  }
  if(event.consent!==true){
    return {action:existing?'update':'insert',row:Object.assign({},existing,base,{status:'skipped',channel:'sms',scheduledFor:(existing&&existing.scheduledFor)||nextFollowupAt(at),reason:'no_consent'})};
  }
  if(!phone){
    return {action:existing?'update':'insert',row:Object.assign({},existing,base,{status:'skipped',channel:'sms',scheduledFor:(existing&&existing.scheduledFor)||nextFollowupAt(at),reason:'no_phone'})};
  }
  if(existing&&existing.status==='scheduled'){
    return {action:'update',row:Object.assign({},existing,base,{status:'scheduled',channel:'sms',scheduledFor:existing.scheduledFor,reason:''})};
  }
  const when=nextFollowupAt(at);
  return {action:existing?'update':'insert',row:Object.assign({},existing,base,{status:'scheduled',channel:'sms',scheduledFor:when,reason:''})};
}
async function runDispatch(opts){
  opts=opts||{};
  const now=opts.now?new Date(opts.now):new Date();
  const flags=normalizeFlags(opts.settings);
  const results=[];
  const logs=[];
  for(const row of opts.rows||[]){
    if(!flags.enabled){
      results.push({id:row.id,action:'hold',reason:'disabled'});
      continue;
    }
    if(isSequenceStep(row.step)&&!flags.steps[row.step]){
      results.push({id:row.id,action:'hold',reason:'step_disabled'});
      continue;
    }
    const claimed=claimFollowup(row,now,{voiceEnabled:flags.voiceEnabled});
    if(!claimed.ok){
      results.push({id:row.id,action:'skip',reason:claimed.reason});
      continue;
    }
    const decision=decideDispatch({settings:flags,row:claimed.row,env:opts.env||{},now:now});
    if(decision.log)logs.push(decision.log);
    if(decision.action==='dry_run'){
      row.status='dry_run';
      results.push({id:row.id,action:'dry_run',status:'dry_run',log:decision.log,patch:{status:'dry_run',dry_run:true,sms_body:row.smsBody||'',last_error:null}});
      continue;
    }
    if(decision.action!=='send'){
      const status=decision.status||row.status;
      if(decision.status)row.status=decision.status;
      results.push({id:row.id,action:decision.action,status:status,reason:decision.reason,patch:decision.status?{status:decision.status,last_error:decision.reason||null}:null});
      continue;
    }
    if(typeof opts.fetchImpl!=='function'){
      row.status='failed';
      results.push({id:row.id,action:'failed',status:'failed',reason:'no_fetch'});
      continue;
    }
    let res;
    try{
      res=await opts.fetchImpl(decision.request.url,{
        method:decision.request.method,
        headers:decision.request.headers||{},
        body:decision.request.bodyEncoding==='form'?decision.request.form:JSON.stringify(decision.request.json)
      });
    }catch(err){
      row.status='failed';
      results.push({id:row.id,action:'failed',status:'failed',reason:'network',error:String(err&&err.message||err),patch:{status:'failed',last_error:'network'}});
      continue;
    }
    if(res&&res.ok){
      row.status='sent';
      row.providerRef=res.providerRef||'';
      results.push({id:row.id,action:'sent',status:'sent',providerRef:row.providerRef,patch:{status:'sent',provider_ref:row.providerRef,sent_at:now.toISOString(),last_error:null,sms_body:row.smsBody||''}});
    }else{
      row.status='failed';
      results.push({id:row.id,action:'failed',status:'failed',reason:'provider',error:res&&res.error||'',patch:{status:'failed',last_error:String(res&&res.error||'provider').slice(0,500)}});
    }
  }
  return {results:results,logs:logs};
}
function timingSafeEqualText(a,b){
  const x=String(a||'');
  const y=String(b||'');
  const n=Math.max(x.length,y.length);
  let diff=x.length===y.length?0:1;
  for(let i=0;i<n;i++){
    diff|=(x.charCodeAt(i)||0)^(y.charCodeAt(i)||0);
  }
  return diff===0;
}
function parseRetellSignature(signature){
  const m=/^v=(\d+),d=([0-9a-fA-F]+)$/.exec(String(signature||'').trim());
  if(!m)return null;
  return {timestamp:Number(m[1]),digest:m[2].toLowerCase()};
}
function verifyRetellSignature(rawBody,apiKey,signature,nowMs,hmacHex){
  const parsed=parseRetellSignature(signature);
  if(!parsed||!apiKey)return false;
  const now=nowMs==null?Date.now():Number(nowMs);
  if(Math.abs(now-parsed.timestamp)>5*60*1000)return false;
  const mac=hmacHex||function(key,data){
    const c=nodeCrypto();
    if(!c)return '';
    return c.createHmac('sha256',key).update(data).digest('hex');
  };
  const expected=String(mac(apiKey,String(rawBody)+String(parsed.timestamp))||'').toLowerCase();
  if(!expected)return false;
  return timingSafeEqualText(expected,parsed.digest);
}
function verifyTwilioSignature(url,params,authToken,signature,hmacB64){
  if(!url||!authToken||!signature)return false;
  const keys=Object.keys(params||{}).sort();
  let data=String(url);
  for(const k of keys)data+=k+String(params[k]);
  const mac=hmacB64||function(token,payload){
    const c=nodeCrypto();
    if(!c)return '';
    return c.createHmac('sha1',token).update(payload).digest('base64');
  };
  const expected=mac(authToken,data);
  if(!expected)return false;
  return timingSafeEqualText(expected,signature);
}
function stopWords(body){
  return String(body||'').toLowerCase().replace(/[^a-z]+/g,' ').trim().split(' ').filter(Boolean);
}
function isStopMessage(body){
  const words=stopWords(body);
  if(!words.length)return false;
  const first=words[0];
  if(STOP_WORDS.indexOf(first)>=0)return true;
  if(first==='opt'&&words[1]==='out')return true;
  if(first==='stop'&&words[1]==='all')return true;
  const whole=words.join(' ');
  if(whole==='opt out'||whole==='stop all')return true;
  if(words.length===1&&STOP_WORDS.indexOf(whole.replace(/ /g,''))>=0)return true;
  return false;
}
function replyWhyNot(message,outcome,analysis){
  if(isStopMessage(message&&message.body))return '';
  const fromAnalysis=analysis&&(analysis.why_not||analysis.whyNot);
  if(fromAnalysis&&String(fromAnalysis).trim())return String(fromAnalysis).trim().slice(0,1000);
  if(outcome==='booked')return '';
  const body=String(message&&message.body||'').trim();
  if(body.length<8)return '';
  return body.slice(0,1000);
}
function ownerMayChange(row,action){
  row=row||{};
  if(row.status==='sent'||row.status==='completed'||row.status==='opted_out')return {ok:false,reason:'finished'};
  if(row.optedOut===true||row.optedOutAt||row.opted_out_at)return {ok:false,reason:'opted_out'};
  if(row.sentAt||row.sent_at)return {ok:false,reason:'finished'};
  if(action==='text_now'&&row.consent===false)return {ok:false,reason:'no_consent'};
  return {ok:true};
}
function recordInbound(row,message){
  const replies=Array.isArray(row.inboundReplies)?row.inboundReplies.slice():[];
  if(message.id&&replies.some(function(r){return r.id===message.id;})){
    return {row:row,duplicate:true,optedOut:row.optedOut===true};
  }
  replies.push({
    at:message.at||new Date().toISOString(),
    from:String(message.from||''),
    body:String(message.body||'').slice(0,2000),
    provider:message.provider||'',
    id:message.id||''
  });
  row.inboundReplies=replies.slice(-50);
  let opted=row.optedOut===true;
  if(isStopMessage(message.body)){
    opted=true;
    row.optedOut=true;
    row.optedOutAt=message.at||new Date().toISOString();
    if(['scheduled','failed','sending','dry_run'].indexOf(row.status)>=0)row.status='opted_out';
  }else if(isYesConfirm(message.body)){
    row.visitConfirmedAt=message.at||new Date().toISOString();
  }else if(!row.outcomeReason){
    const why=replyWhyNot(message,row.jobOutcome||row.outcome,message.analysis);
    if(why)row.outcomeReason=why;
  }
  return {row:row,duplicate:false,optedOut:opted,whyNot:row.outcomeReason||''};
}
function retellEvents(payload){
  const body=payload||{};
  const chat=body.chat||body.call||null;
  const event=String(body.event||'');
  if(!chat)return {event:event,followupId:'',phones:[],messages:[],callStatus:'',transcriptSummary:'',analysis:null};
  const meta=chat.metadata||{};
  const phones=[];
  if(chat.to_number)phones.push(toE164(chat.to_number));
  if(chat.from_number)phones.push(toE164(chat.from_number));
  const messages=[];
  const list=chat.message_with_tool_calls||chat.transcript_object||[];
  if(Array.isArray(list)){
    for(const item of list){
      const role=String(item.role||item.sender||'').toLowerCase();
      if(role!=='user'&&role!=='customer')continue;
      const text=String(item.content||item.text||'');
      messages.push({
        id:String(item.message_id||item.id||((chat.chat_id||chat.call_id||'')+':'+text.slice(0,24))),
        body:text,
        from:toE164(chat.to_number||chat.from_number||''),
        provider:'retell'
      });
    }
  }
  if(!messages.length&&typeof chat.transcript==='string'){
    for(const line of chat.transcript.split('\n')){
      const m=/^(user|customer)\s*:\s*(.+)$/i.exec(line.trim());
      if(m)messages.push({id:'',body:m[2],from:phones[0]||'',provider:'retell'});
    }
  }
  const analysis=(chat.call_analysis&&chat.call_analysis.custom_analysis_data)
    ||(chat.chat_analysis&&chat.chat_analysis.custom_analysis_data)
    ||null;
  const summary=(chat.call_analysis&&chat.call_analysis.call_summary)
    ||(chat.chat_analysis&&chat.chat_analysis.chat_summary)
    ||'';
  return {
    event:event,
    followupId:String(meta.followup_id||''),
    phones:phones.filter(Boolean),
    messages:messages,
    callStatus:String(chat.call_status||chat.chat_status||''),
    transcriptSummary:String(summary||'').slice(0,4000),
    analysis:analysis
  };
}
function yesNo(value){
  const s=String(value==null?'':value).trim().toLowerCase();
  if(s==='yes'||s==='y'||s==='true')return 'yes';
  if(s==='no'||s==='n'||s==='false')return 'no';
  return '';
}
function cleanText(value){
  return String(value==null?'':value).replace(/\u0000/g,'').trim().slice(0,1000);
}
function scale15(value){
  if(typeof value==='boolean')return null;
  const n=Number(value);
  if(!Number.isInteger(n)||n<1||n>5)return null;
  return n;
}
function likelyAnswer(value){
  const s=String(value==null?'':value).trim().toLowerCase();
  if(s==='yes'||s==='y')return 'yes';
  if(s==='no'||s==='n')return 'no';
  if(s==='maybe'||s==='m')return 'maybe';
  return '';
}
function validateSurveyAnswers(input){
  const src=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  const allowed={};
  for(const q of SURVEY_QUESTIONS)allowed[q.id]=true;
  for(const k of Object.keys(src)){
    if(!allowed[k])return {ok:false,code:'invalid',error:'Unknown answer'};
    if(/price|cost|margin|markup|profit|total/i.test(k))return {ok:false,code:'invalid',error:'Unknown answer'};
  }
  const answers={
    on_time:yesNo(src.on_time),
    explained:scale15(src.explained),
    professional:scale15(src.professional),
    likely:likelyAnswer(src.likely),
    improve:cleanText(src.improve)
  };
  if(!answers.on_time||!answers.likely){
    return {ok:false,code:'invalid',error:'Please answer each question'};
  }
  if(answers.explained==null){
    return {ok:false,code:'invalid',error:'Please rate the explanation from 1 to 5'};
  }
  if(answers.professional==null){
    return {ok:false,code:'invalid',error:'Please rate professionalism from 1 to 5'};
  }
  return {ok:true,answers:answers};
}
function sha256Hex(text){
  const c=nodeCrypto();
  if(!c)throw new Error('sha256 unavailable');
  return c.createHash('sha256').update(String(text),'utf8').digest('hex');
}
function tokenFromHash(hash){
  const m=/#t=([^&]+)/.exec(String(hash||''));
  if(!m)return '';
  try{return decodeURIComponent(m[1]);}catch(e){return m[1];}
}
function consumeSurvey(record,token,answers){
  if(!record||!TOKEN_RE.test(String(token||'')))return {ok:false,code:'not_found'};
  let hash='';
  try{hash=sha256Hex(token);}catch(e){return {ok:false,code:'not_found'};}
  if(hash!==record.tokenHash)return {ok:false,code:'not_found'};
  if(record.usedAt)return {ok:false,code:'used'};
  const valid=validateSurveyAnswers(answers);
  if(!valid.ok)return valid;
  record.usedAt=new Date().toISOString();
  record.answers=valid.answers;
  record.token=null;
  return {ok:true,answers:valid.answers};
}
function openSurvey(record,token){
  if(!record||!TOKEN_RE.test(String(token||'')))return {ok:false,code:'not_found'};
  let hash='';
  try{hash=sha256Hex(token);}catch(e){return {ok:false,code:'not_found'};}
  if(hash!==record.tokenHash)return {ok:false,code:'not_found'};
  if(record.usedAt)return {ok:false,code:'used'};
  return {ok:true,questions:SURVEY_QUESTIONS.map(function(q){return {id:q.id,prompt:q.prompt,type:q.type};})};
}
function textNowAt(now){
  return rollIntoWindow(now instanceof Date?now:new Date(now));
}
function isYesConfirm(body){
  const words=stopWords(body);
  return words.length===1&&(words[0]==='yes'||words[0]==='y');
}
function weekdayIndex(date){
  const map={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  return map[chicagoWeekday(date)];
}
function formatDayDate(date){
  const p=chicagoParts(date);
  return WEEKDAYS[weekdayIndex(date)]+', '+MONTHS[p.month-1]+' '+p.day;
}
function formatDateLabel(date){
  const p=chicagoParts(date);
  return MONTHS[p.month-1]+' '+p.day;
}
function chicagoDateKey(date){
  const p=chicagoParts(date instanceof Date?date:new Date(date));
  return p.year+'-'+pad(p.month)+'-'+pad(p.day);
}
function previousDateKey(date){
  const p=chicagoParts(date instanceof Date?date:new Date(date));
  const prev=addCalendarDays(p.year,p.month,p.day,-1);
  return prev.year+'-'+pad(prev.month)+'-'+pad(prev.day);
}
function formatTimeLabel(date){
  const p=chicagoParts(date);
  let h=p.hour;
  const suffix=h>=12?'PM':'AM';
  h=h%12;
  if(h===0)h=12;
  return h+':'+pad(p.minute)+' '+suffix;
}
function formatMoney(amount){
  const n=Number(amount);
  if(!Number.isFinite(n)||n<=0)return '';
  const cents=Math.round(n*100);
  const dollars=Math.floor(cents/100);
  const rem=cents%100;
  const withCommas=String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  if(rem===0)return '$'+withCommas;
  return '$'+withCommas+'.'+String(rem).padStart(2,'0');
}
function moneyValue(amount){
  const n=Number(amount);
  if(!Number.isFinite(n)||n<=0)return null;
  return Math.round(n*100)/100;
}
function parseDateOnly(value){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||'').trim());
  if(!m)return null;
  const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
  if(month<1||month>12||day<1||day>31)return null;
  return atChicago(year,month,day,12,0);
}
function placeInSendWindow(instant){
  const date=instant instanceof Date?instant:new Date(instant);
  const p=chicagoParts(date);
  const minutes=p.hour*60+p.minute;
  if(chicagoWeekday(date)==='Sun'){
    const mon=addCalendarDays(p.year,p.month,p.day,1);
    return atChicago(mon.year,mon.month,mon.day,10,0);
  }
  if(minutes>=WINDOW_START_MIN&&minutes<WINDOW_END_MIN)return new Date(date.getTime());
  if(minutes<WINDOW_START_MIN){
    const at=atChicago(p.year,p.month,p.day,9,0);
    if(chicagoWeekday(at)==='Sun'){
      const mon=addCalendarDays(p.year,p.month,p.day,1);
      return atChicago(mon.year,mon.month,mon.day,10,0);
    }
    return at;
  }
  const next=addCalendarDays(p.year,p.month,p.day,1);
  const at=atChicago(next.year,next.month,next.day,9,0);
  if(chicagoWeekday(at)==='Sun'){
    const mon=addCalendarDays(next.year,next.month,next.day,1);
    return atChicago(mon.year,mon.month,mon.day,10,0);
  }
  return at;
}
function daysAfterAt10(from,days){
  const p=chicagoParts(from instanceof Date?from:new Date(from));
  const d=addCalendarDays(p.year,p.month,p.day,days);
  let at=atChicago(d.year,d.month,d.day,10,0);
  if(chicagoWeekday(at)==='Sun'){
    const mon=addCalendarDays(d.year,d.month,d.day,1);
    at=atChicago(mon.year,mon.month,mon.day,10,0);
  }
  return at;
}
function undecidedWhen(quoteAt){
  const from=quoteAt instanceof Date?quoteAt:new Date(quoteAt);
  let at=daysAfterAt10(from,2);
  if(at.getTime()<from.getTime()+48*60*60*1000)at=daysAfterAt10(from,3);
  return at;
}
function reminderWhen(visitAt){
  const p=chicagoParts(visitAt);
  const prev=addCalendarDays(p.year,p.month,p.day,-1);
  let at=atChicago(prev.year,prev.month,prev.day,10,0);
  if(chicagoWeekday(at)==='Sun'){
    const mon=addCalendarDays(prev.year,prev.month,prev.day,1);
    at=atChicago(mon.year,mon.month,mon.day,10,0);
  }
  return at;
}
function reviewWhen(visitAt){
  return placeInSendWindow(new Date(visitAt.getTime()+2*60*60*1000));
}
function withSignoff(body,includeStop){
  let text=String(body||'').replace(/\s+$/,'')+'\n'+SIGN_OFF;
  if(includeStop)text+='\nReply STOP to opt out.';
  return text;
}
function greetingName(input){
  const explicit=String(input&&input.greetingName||'').trim();
  if(explicit)return explicit.slice(0,40);
  return firstName(input&&(input.firstName||input.customer));
}
function sequenceSms(step,input){
  input=input||{};
  const name=greetingName(input);
  const hi=name?('Hi '+name+', '):'Hi, ';
  const project=plainWords(input.projectSummary||'');
  const total=formatMoney(input.quoteTotal);
  const visit=input.visitAt?new Date(input.visitAt):null;
  const visitOk=visit&&!Number.isNaN(visit.getTime());
  const address=String(input.address||'').replace(/\s+/g,' ').trim();
  const install=input.installAt?new Date(input.installAt):(input.installDate?parseDateOnly(input.installDate):null);
  const installOk=install&&!Number.isNaN(install.getTime());
  const survey=String(input.surveyUrl||'').trim();
  let body='';
  let missing='';
  if(step==='visit_confirm'){
    if(!visitOk)missing='missing_visit';
    else if(!address)missing='missing_address';
    else body=hi+'this is Exotic Splash Epoxy LLC. Your free on-site estimate is set for '+formatDayDate(visit)+' at '+formatTimeLabel(visit)+' at '+address+". We'll measure the space, look at the slab, and give you a real number. Need to change the time? Call or text "+COMPANY_PHONE+'.';
  }else if(step==='visit_reminder'){
    if(!visitOk)missing='missing_visit';
    else{
      let dayWord='tomorrow, '+formatDateLabel(visit);
      if(input.scheduledFor){
        const send=new Date(input.scheduledFor);
        const sendKey=chicagoDateKey(send);
        if(sendKey===chicagoDateKey(visit))dayWord='today, '+formatDateLabel(visit);
        else if(sendKey!==previousDateKey(visit))dayWord='on '+formatDateLabel(visit);
      }
      body=hi+"just a reminder that we'll see you "+dayWord+', at '+formatTimeLabel(visit)+' for your free epoxy estimate. Reply YES to confirm, or text us if you need a different time.';
    }
  }else if(step==='quote_thanks'){
    if(!project)missing='missing_project';
    else if(!total)missing='missing_quote';
    else{
      const who=name?(', '+name):'';
      body='Thanks for having us out today'+who+'. Your estimate for '+project+' comes to '+total+'. Any questions at all, just text me back. We can usually start within a week.';
    }
  }else if(step==='booked_install'){
    if(!installOk)missing='missing_install';
    else{
      const who=name?(', '+name):'';
      body='Thank you'+who+"! We're excited to get started. Your install is set for "+formatDayDate(install)+". We'll text you before we head over. If you have any questions before then, call or text "+COMPANY_PHONE+'.';
    }
  }else if(step==='undecided_check'){
    if(!project)missing='missing_project';
    else if(!total)missing='missing_quote';
    else body=hi+"just checking in on your floor estimate. If price is what's holding you back, send us any written quote you got and we'll match it or beat it. Your quote for "+project+' was '+total+', and every floor comes with our lifetime warranty. Want me to save you a start date?';
  }else if(step==='last_check'){
    body=hi+"I don't want to keep bugging you, so this is my last check-in. If you still want the floor done, just reply and we'll get you on the schedule. If now's not the right time, no problem. We're here whenever you're ready.";
  }else if(step==='review'){
    if(!survey)missing='missing_survey';
    else{
      const who=name?(', '+name):'';
      body='Thanks again for meeting with us'+who+'. Could you take 1 minute to tell us how your estimate visit went? It helps us train our team: '+survey;
    }
  }else missing='unknown_step';
  if(missing)return {ok:false,reason:missing,text:''};
  return {ok:true,reason:'',text:withSignoff(body,input.includeStop===true)};
}
function planSequence(existingList,event){
  event=event||{};
  const existing={};
  for(const row of existingList||[]){
    if(row&&row.step)existing[row.step]=row;
  }
  const at=event.at instanceof Date?event.at:new Date(event.at||Date.now());
  const outcome=jobOutcome(event.outcome);
  const phone=toE164(event.phone);
  const consent=event.consent===true;
  const name=firstName(event.firstName||event.customer);
  const project=plainWords(event.projectSummary||'');
  const quoteTotal=moneyValue(event.quoteTotal);
  const visitAt=event.visitAt?new Date(event.visitAt):null;
  const visitOk=visitAt&&!Number.isNaN(visitAt.getTime());
  const address=String(event.address||'').replace(/\s+/g,' ').trim();
  const installDate=String(event.installDate||'').trim();
  const installAt=installDate?parseDateOnly(installDate):null;
  const quoteAt=event.quoteAt?new Date(event.quoteAt):(event.quoteDone?at:null);
  const quoteOk=quoteAt&&!Number.isNaN(quoteAt.getTime());
  const frozen=['sent','completed','sending','dry_run','failed','sms_not_configured','opted_out'];
  const plans=[];
  function finish(step,prev,row){
    if(!row){
      if(prev)plans.push({action:'leave',row:prev});
      return;
    }
    plans.push({action:prev?'update':'insert',row:row});
  }
  function blocked(row,prev){
    const when=(prev&&prev.scheduledFor)||row.scheduledFor;
    if(event.optedOut===true)return Object.assign(row,{status:'opted_out',reason:'opted_out',scheduledFor:when});
    if(!consent)return Object.assign(row,{status:'skipped',reason:'no_consent',scheduledFor:when});
    if(!phone)return Object.assign(row,{status:'skipped',reason:'no_phone',scheduledFor:when});
    return row;
  }
  function keepWhen(prev,when,anchor){
    if(prev&&prev.status==='scheduled'&&prev.anchor===anchor&&prev.scheduledFor)return prev.scheduledFor;
    return when;
  }
  function put(step,spec){
    const prev=existing[step]||null;
    if(prev&&frozen.indexOf(prev.status)>=0){
      plans.push({action:'leave',row:prev});
      return;
    }
    if(!spec){
      finish(step,prev,null);
      return;
    }
    const anchor=spec.anchor||'';
    const when=keepWhen(prev,spec.scheduledFor,anchor);
    const vars={
      quoteTotal:quoteTotal,
      project:project,
      visitAt:visitOk?visitAt.toISOString():'',
      address:address,
      installDate:installDate,
      anchor:anchor
    };
    let row=Object.assign({},prev,{
      step:step,
      channel:'sms',
      jobOutcome:outcome,
      consent:consent,
      phoneE164:phone,
      projectSummary:project,
      firstName:name,
      attemptCount:prev?prev.attemptCount||0:0,
      maxAttempts:MAX_ATTEMPTS,
      status:spec.status,
      reason:spec.reason||'',
      scheduledFor:when,
      anchor:anchor,
      stepVars:vars,
      includeStop:false
    });
    if(event.optedOut===true){
      row.status='opted_out';
      row.reason='opted_out';
    }else if(row.status==='scheduled'){
      row=blocked(row,prev);
    }
    finish(step,prev,row);
  }
  if(visitOk&&address){
    const when=placeInSendWindow(at);
    const late=when.getTime()>=visitAt.getTime();
    put('visit_confirm',{
      status:late?'skipped':'scheduled',
      reason:late?'visit_passed':'',
      scheduledFor:when,
      anchor:'visit:'+visitAt.toISOString()+'|'+address
    });
  }else put('visit_confirm',null);
  if(visitOk){
    const when=reminderWhen(visitAt);
    const late=when.getTime()>=visitAt.getTime();
    put('visit_reminder',{
      status:late?'skipped':'scheduled',
      reason:late?'window_after_visit':'',
      scheduledFor:when,
      anchor:'visit:'+visitAt.toISOString()
    });
  }else put('visit_reminder',null);
  if(quoteOk){
    const missing=!project?'missing_project':(!quoteTotal?'missing_quote':'');
    put('quote_thanks',{
      status:missing?'skipped':'scheduled',
      reason:missing,
      scheduledFor:placeInSendWindow(quoteAt),
      anchor:'quote:'+quoteAt.toISOString()+'|'+project+'|'+String(quoteTotal||'')
    });
  }else put('quote_thanks',null);
  if(outcome==='booked'){
    put('booked_install',{
      status:installAt?'scheduled':'skipped',
      reason:installAt?'':'missing_install',
      scheduledFor:placeInSendWindow(at),
      anchor:'install:'+installDate
    });
  }else if(existing.booked_install){
    put('booked_install',{status:'skipped',reason:'not_booked',scheduledFor:placeInSendWindow(at),anchor:'install:'+installDate});
  }else put('booked_install',null);
  if(quoteOk){
    const cancel=outcome==='booked'?'booked':(outcome==='declined'?'declined':'');
    const missing=!project?'missing_project':(!quoteTotal?'missing_quote':'');
    put('undecided_check',{
      status:cancel||missing?'skipped':'scheduled',
      reason:cancel||missing,
      scheduledFor:undecidedWhen(quoteAt),
      anchor:'quote:'+quoteAt.toISOString()+'|'+outcome+'|'+String(quoteTotal||'')
    });
    put('last_check',{
      status:cancel?'skipped':'scheduled',
      reason:cancel,
      scheduledFor:daysAfterAt10(quoteAt,7),
      anchor:'quote:'+quoteAt.toISOString()+'|'+outcome
    });
  }else{
    put('undecided_check',null);
    put('last_check',null);
  }
  if(visitOk){
    put('review',{
      status:'scheduled',
      reason:'',
      scheduledFor:reviewWhen(visitAt),
      anchor:'visit:'+visitAt.toISOString()
    });
  }else put('review',null);
  const sendable=plans.filter(function(p){
    return p.row&&(p.row.status==='scheduled'||p.row.status==='failed')&&p.action!=='leave';
  }).sort(function(a,b){
    const ta=new Date(a.row.scheduledFor).getTime();
    const tb=new Date(b.row.scheduledFor).getTime();
    if(ta!==tb)return ta-tb;
    return STEP_IDS.indexOf(a.row.step)-STEP_IDS.indexOf(b.row.step);
  });
  if(event.alreadyTexted!==true&&sendable.length){
    sendable[0].row.includeStop=true;
    if(sendable[0].row.stepVars)sendable[0].row.stepVars.includeStop=true;
  }
  return {steps:plans.filter(function(p){return p.row;})};
}

return {
  TZ:TZ,WINDOW_START_MIN:WINDOW_START_MIN,WINDOW_END_MIN:WINDOW_END_MIN,
  COMPANY_NAME:COMPANY_NAME,COMPANY_PHONE:COMPANY_PHONE,SIGN_OFF:SIGN_OFF,
  DEFAULT_FROM:DEFAULT_FROM,SURVEY_BASE:SURVEY_BASE,
  MAX_ATTEMPTS:MAX_ATTEMPTS,TOKEN_RE:TOKEN_RE,SURVEY_QUESTIONS:SURVEY_QUESTIONS,
  STEP_IDS:STEP_IDS,
  chicagoParts:chicagoParts,zonedTimeToUtc:zonedTimeToUtc,nextFollowupAt:nextFollowupAt,
  rollIntoWindow:rollIntoWindow,inWindow:inWindow,normalizeFlags:normalizeFlags,
  toE164:toE164,firstName:firstName,plainWords:plainWords,projectSummary:projectSummary,
  jobOutcome:jobOutcome,quoteIsDone:quoteIsDone,consentGiven:consentGiven,
  surveyUrl:surveyUrl,followupSms:followupSms,sequenceSms:sequenceSms,planSequence:planSequence,
  placeInSendWindow:placeInSendWindow,undecidedWhen:undecidedWhen,reminderWhen:reminderWhen,
  formatMoney:formatMoney,formatDayDate:formatDayDate,formatTimeLabel:formatTimeLabel,
  dynamicVariables:dynamicVariables,isSequenceStep:isSequenceStep,isYesConfirm:isYesConfirm,
  smsProvider:smsProvider,providerReady:providerReady,buildRetellSms:buildRetellSms,
  buildTwilioSms:buildTwilioSms,buildVoiceRequest:buildVoiceRequest,redactLog:redactLog,
  decideDispatch:decideDispatch,claimFollowup:claimFollowup,planSchedule:planSchedule,
  runDispatch:runDispatch,verifyRetellSignature:verifyRetellSignature,
  parseRetellSignature:parseRetellSignature,verifyTwilioSignature:verifyTwilioSignature,
  isStopMessage:isStopMessage,replyWhyNot:replyWhyNot,ownerMayChange:ownerMayChange,recordInbound:recordInbound,retellEvents:retellEvents,
  validateSurveyAnswers:validateSurveyAnswers,sha256Hex:sha256Hex,tokenFromHash:tokenFromHash,
  consumeSurvey:consumeSurvey,openSurvey:openSurvey,textNowAt:textNowAt,fromNumber:fromNumber
};
});
