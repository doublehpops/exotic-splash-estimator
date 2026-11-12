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
const DEFAULT_FROM='+13125842873';
const SURVEY_BASE='https://doublehpops.github.io/exotic-splash-estimator/survey.html';
const MAX_ATTEMPTS=3;
const TOKEN_RE=/^svy_[0-9a-f]{64}$/;
const STOP_WORDS=['stop','stopall','unsubscribe','cancel','end','quit'];
const TERMINAL=['sent','completed','skipped','opted_out','dry_run','sms_not_configured'];
const SURVEY_QUESTIONS=[
  {id:'on_time',prompt:'Was the estimator on time?',type:'yes_no'},
  {id:'professional',prompt:'Was the estimator professional?',type:'yes_no'},
  {id:'explained',prompt:'Was everything explained right?',type:'yes_no'},
  {id:'experience',prompt:'How did you like the experience?',type:'scale_1_5'},
  {id:'improve',prompt:'What should we improve?',type:'text'},
  {id:'booked',prompt:'Did you book with us?',type:'yes_no'},
  {id:'why_not',prompt:'If not, why?',type:'text'}
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
/** Next calendar day at 10:00 America/Chicago, then rolled into 9:00–20:00. */
function nextFollowupAt(from){
  const p=chicagoParts(from instanceof Date?from:new Date(from));
  const next=addCalendarDays(p.year,p.month,p.day,1);
  return rollIntoWindow(atChicago(next.year,next.month,next.day,10,0));
}
/** Keep the instant when it is inside [9:00, 20:00). Otherwise roll to 9:00. */
function rollIntoWindow(instant){
  const date=instant instanceof Date?instant:new Date(instant);
  const p=chicagoParts(date);
  const minutes=p.hour*60+p.minute;
  if(minutes>=WINDOW_START_MIN&&minutes<WINDOW_END_MIN)return new Date(date.getTime());
  if(minutes<WINDOW_START_MIN)return atChicago(p.year,p.month,p.day,9,0);
  const next=addCalendarDays(p.year,p.month,p.day,1);
  return atChicago(next.year,next.month,next.day,9,0);
}
function inWindow(instant){
  const p=chicagoParts(instant instanceof Date?instant:new Date(instant));
  const minutes=p.hour*60+p.minute;
  return minutes>=WINDOW_START_MIN&&minutes<WINDOW_END_MIN;
}
function normalizeFlags(settings){
  const src=settings&&settings.followups?settings.followups:settings||{};
  return {
    enabled:src.enabled===true,
    dryRun:src.dryRun!==false,
    voiceEnabled:src.voiceEnabled===true
  };
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
function projectSummary(job){
  job=job||{};
  const type=String(job.projectType||'floor');
  if(type==='garage'){
    const size={ '1car':'1-car','2car':'2-car','3car':'3-car',measured:'measured' }[job.garagePackage]||'garage';
    const style=plainWords(job.garageStyle||'epoxy')||'epoxy';
    const label=size==='garage'?'garage':size+' garage';
    return plainWords(label+', '+style);
  }
  if(type==='flatwork')return 'countertop';
  if(type==='seating')return 'seating';
  const styles=[];
  for(const area of job.areas||[]){
    const style=plainWords(area&&area.style||'');
    if(style&&styles.indexOf(style)<0)styles.push(style);
  }
  if(!styles.length)return 'floor';
  return plainWords(styles.join(' and ')+' floor');
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
  const company=input.companyName||COMPANY_NAME;
  const project=plainWords(input.projectSummary||'');
  let text=name+'this is Ashley with '+company+'. Thanks for letting us come out';
  if(project)text+=' about your '+project;
  text+='.';
  if(input.outcome==='booked'){
    text+=' Thanks for choosing us. We will confirm the next steps with you.';
  }else{
    text+=' If something held you back, reply and tell us — we read every reply.';
  }
  text+=' A short survey: '+input.surveyUrl;
  text+=' Reply STOP to opt out.';
  return text;
}
function dynamicVariables(input){
  return {
    call_type:'followup',
    customer_first_name:String(input.firstName||''),
    job_outcome:jobOutcome(input.outcome),
    project_summary:plainWords(input.projectSummary||''),
    survey_url:String(input.surveyUrl||''),
    company_name:COMPANY_NAME
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
function isStopMessage(body){
  const s=String(body||'').trim().toLowerCase().replace(/[^a-z]/g,'');
  return STOP_WORDS.indexOf(s)>=0;
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
  }
  return {row:row,duplicate:false,optedOut:opted};
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
    professional:yesNo(src.professional),
    explained:yesNo(src.explained),
    experience:Number(src.experience),
    improve:cleanText(src.improve),
    booked:yesNo(src.booked),
    why_not:cleanText(src.why_not)
  };
  if(!answers.on_time||!answers.professional||!answers.explained||!answers.booked){
    return {ok:false,code:'invalid',error:'Please answer each question'};
  }
  if(!Number.isInteger(answers.experience)||answers.experience<1||answers.experience>5){
    return {ok:false,code:'invalid',error:'Please rate the experience from 1 to 5'};
  }
  if(answers.booked==='no'&&!answers.why_not){
    return {ok:false,code:'invalid',error:'Please tell us what held you back'};
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

return {
  TZ:TZ,WINDOW_START_MIN:WINDOW_START_MIN,WINDOW_END_MIN:WINDOW_END_MIN,
  COMPANY_NAME:COMPANY_NAME,DEFAULT_FROM:DEFAULT_FROM,SURVEY_BASE:SURVEY_BASE,
  MAX_ATTEMPTS:MAX_ATTEMPTS,TOKEN_RE:TOKEN_RE,SURVEY_QUESTIONS:SURVEY_QUESTIONS,
  chicagoParts:chicagoParts,zonedTimeToUtc:zonedTimeToUtc,nextFollowupAt:nextFollowupAt,
  rollIntoWindow:rollIntoWindow,inWindow:inWindow,normalizeFlags:normalizeFlags,
  toE164:toE164,firstName:firstName,plainWords:plainWords,projectSummary:projectSummary,
  jobOutcome:jobOutcome,quoteIsDone:quoteIsDone,consentGiven:consentGiven,
  surveyUrl:surveyUrl,followupSms:followupSms,dynamicVariables:dynamicVariables,
  smsProvider:smsProvider,providerReady:providerReady,buildRetellSms:buildRetellSms,
  buildTwilioSms:buildTwilioSms,buildVoiceRequest:buildVoiceRequest,redactLog:redactLog,
  decideDispatch:decideDispatch,claimFollowup:claimFollowup,planSchedule:planSchedule,
  runDispatch:runDispatch,verifyRetellSignature:verifyRetellSignature,
  parseRetellSignature:parseRetellSignature,verifyTwilioSignature:verifyTwilioSignature,
  isStopMessage:isStopMessage,recordInbound:recordInbound,retellEvents:retellEvents,
  validateSurveyAnswers:validateSurveyAnswers,sha256Hex:sha256Hex,tokenFromHash:tokenFromHash,
  consumeSurvey:consumeSurvey,openSurvey:openSurvey,textNowAt:textNowAt,fromNumber:fromNumber
};
});
