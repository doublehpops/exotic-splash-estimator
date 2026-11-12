'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const F=require('../js/followup-core');
const UI=require('../js/followup-ui');

const tests=[];
function check(name,fn){tests.push({name,fn});}
function chicago(iso){return F.chicagoParts(new Date(iso));}
function row(over){
  return Object.assign({
    id:'fu-1',
    jobId:'job-1',
    status:'scheduled',
    channel:'sms',
    consent:true,
    optedOut:false,
    phoneE164:'+13125550148',
    scheduledFor:'2026-11-13T16:00:00.000Z',
    attemptCount:0,
    maxAttempts:3,
    providerRef:'',
    firstName:'Alex',
    outcome:'undecided',
    projectSummary:'2-car garage, metallic',
    surveyUrl:'https://doublehpops.github.io/exotic-splash-estimator/survey.html#t=svy_abc',
    smsBody:''
  },over||{});
}
function token(){
  return 's'+crypto.randomBytes(12).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
const GSM7="@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
function assertGsm7(text){
  for(const ch of text){
    assert.ok(GSM7.includes(ch),'not GSM-7: '+JSON.stringify(ch));
  }
  assert.ok(!text.includes(';'));
  assert.ok(!text.includes('—'));
  assert.ok(!text.includes('–'));
}

check('next day 10:00 Chicago, including across midnight and daylight saving',()=>{
  const afternoon=F.nextFollowupAt(new Date('2026-11-12T21:00:00.000Z'));
  let parts=chicago(afternoon.toISOString());
  assert.strictEqual(parts.year,2026);
  assert.strictEqual(parts.month,11);
  assert.strictEqual(parts.day,13);
  assert.strictEqual(parts.hour,10);
  assert.strictEqual(parts.minute,0);
  assert.strictEqual(afternoon.toISOString(),'2026-11-13T16:00:00.000Z');

  const beforeMidnight=F.nextFollowupAt(new Date('2026-11-13T05:30:00.000Z'));
  parts=chicago(beforeMidnight.toISOString());
  assert.strictEqual(parts.day,13);
  assert.strictEqual(parts.hour,10);
  const afterMidnight=F.nextFollowupAt(new Date('2026-11-13T06:30:00.000Z'));
  parts=chicago(afterMidnight.toISOString());
  assert.strictEqual(parts.day,14);
  assert.strictEqual(parts.hour,10);
  assert.strictEqual(afterMidnight.toISOString(),'2026-11-14T16:00:00.000Z');

  const summer=F.nextFollowupAt(new Date('2026-07-15T20:00:00.000Z'));
  parts=chicago(summer.toISOString());
  assert.strictEqual(parts.month,7);
  assert.strictEqual(parts.day,16);
  assert.strictEqual(parts.hour,10);
  assert.strictEqual(summer.toISOString(),'2026-07-16T15:00:00.000Z');

  const afterSpring=F.nextFollowupAt(new Date('2026-03-08T20:00:00.000Z'));
  parts=chicago(afterSpring.toISOString());
  assert.strictEqual(parts.month,3);
  assert.strictEqual(parts.day,9);
  assert.strictEqual(parts.hour,10);
  assert.strictEqual(afterSpring.toISOString(),'2026-03-09T15:00:00.000Z');
});

check('Sunday waits until Monday and Saturday still sends, including daylight saving',()=>{
  const friday=F.nextFollowupAt(new Date('2026-11-13T21:00:00.000Z'));
  assert.strictEqual(friday.toISOString(),'2026-11-14T16:00:00.000Z');
  const saturdayQuote=F.nextFollowupAt(new Date('2026-11-14T20:00:00.000Z'));
  assert.strictEqual(saturdayQuote.toISOString(),'2026-11-16T16:00:00.000Z');
  const sundayNow=F.rollIntoWindow(new Date('2026-11-15T16:00:00.000Z'));
  assert.strictEqual(sundayNow.toISOString(),'2026-11-16T15:00:00.000Z');
  const saturdayNight=F.rollIntoWindow(new Date('2026-11-15T03:00:00.000Z'));
  assert.strictEqual(saturdayNight.toISOString(),'2026-11-16T15:00:00.000Z');
  const saturdayMorning=F.rollIntoWindow(new Date('2026-11-14T16:00:00.000Z'));
  assert.strictEqual(saturdayMorning.toISOString(),'2026-11-14T16:00:00.000Z');
  const spring=F.nextFollowupAt(new Date('2027-03-13T21:00:00.000Z'));
  assert.strictEqual(spring.toISOString(),'2027-03-15T15:00:00.000Z');
  const fall=F.nextFollowupAt(new Date('2027-11-06T20:00:00.000Z'));
  assert.strictEqual(fall.toISOString(),'2027-11-08T16:00:00.000Z');
});

check('texting outside 9 AM-8 PM Chicago rolls to the next open window',()=>{
  const night=F.rollIntoWindow(new Date('2026-11-13T03:30:00.000Z'));
  assert.strictEqual(chicago(night.toISOString()).hour,9);
  assert.strictEqual(night.toISOString(),'2026-11-13T15:00:00.000Z');
  const early=F.rollIntoWindow(new Date('2026-11-13T13:15:00.000Z'));
  assert.strictEqual(early.toISOString(),'2026-11-13T15:00:00.000Z');
  const ok=F.rollIntoWindow(new Date('2026-11-13T16:05:00.000Z'));
  assert.strictEqual(ok.toISOString(),'2026-11-13T16:05:00.000Z');
  const closing=F.rollIntoWindow(new Date('2026-11-14T02:00:00.000Z'));
  assert.strictEqual(closing.toISOString(),'2026-11-14T15:00:00.000Z');
  assert.strictEqual(F.inWindow(new Date('2026-11-13T15:00:00.000Z')),true);
  assert.strictEqual(F.inWindow(new Date('2026-11-14T01:59:00.000Z')),true);
  assert.strictEqual(F.inWindow(new Date('2026-11-14T02:00:00.000Z')),false);
});

check('schedule keeps one sms row and does not move a time that is already set',()=>{
  const at=new Date('2026-11-12T21:00:00.000Z');
  const job={projectType:'garage',garagePackage:'2car',garageStyle:'metallic',customer:'Alex Rivera',phone:'312-555-0148',total:5200,cost:100,margin:40};
  const first=F.planSchedule(null,{
    at,outcome:'undecided',consent:true,phone:job.phone,customer:job.customer,projectSummary:F.projectSummary(job)
  });
  assert.strictEqual(first.action,'insert');
  assert.strictEqual(first.row.channel,'sms');
  assert.strictEqual(first.row.status,'scheduled');
  assert.strictEqual(first.row.projectSummary,'metallic 2-car garage floor');
  assert.strictEqual(F.projectSummary({
    projectType:'garage',garagePackage:'2car',garageStyle:'flake',
    sections:[{projectType:'flatwork',catalogItems:[{kind:'bar',name:'Bar'}]}]
  }),'garage and bar projects');
  assert.ok(!/\$|\bcost\b|\bmargin\b/.test(JSON.stringify(first.row.projectSummary)));
  const again=F.planSchedule(first.row,{
    at:new Date('2026-11-13T18:00:00.000Z'),outcome:'booked',consent:true,phone:job.phone,customer:job.customer,projectSummary:first.row.projectSummary
  });
  assert.strictEqual(again.action,'update');
  assert.strictEqual(new Date(again.row.scheduledFor).toISOString(),new Date(first.row.scheduledFor).toISOString());
  assert.strictEqual(again.row.jobOutcome,'booked');
  assert.strictEqual(again.row.channel,'sms');
  const frozen=F.planSchedule(Object.assign({},first.row,{status:'dry_run'}),{
    at,outcome:'declined',consent:true,phone:job.phone,customer:job.customer,projectSummary:first.row.projectSummary
  });
  assert.strictEqual(frozen.action,'leave');
  assert.strictEqual(frozen.row.status,'dry_run');
});

check('consent, opt-out, and a missing phone block a sendable follow-up',()=>{
  const at=new Date('2026-11-12T21:00:00.000Z');
  const noConsent=F.planSchedule(null,{at,outcome:'undecided',consent:false,phone:'3125550148',customer:'Alex'});
  assert.strictEqual(noConsent.row.status,'skipped');
  assert.strictEqual(noConsent.row.reason,'no_consent');
  assert.strictEqual(F.consentGiven({followupConsent:false}),false);
  assert.strictEqual(F.consentGiven({followupConsent:'yes'}),false);
  assert.strictEqual(F.consentGiven({}),false);
  assert.strictEqual(F.consentGiven({followupConsent:true}),true);
  const later=F.planSchedule(noConsent.row,{at,outcome:'declined',consent:true,phone:'3125550148',customer:'Alex'});
  assert.strictEqual(later.row.status,'scheduled');
  assert.strictEqual(later.row.jobOutcome,'declined');
  const opted=F.planSchedule(null,{at,outcome:'undecided',consent:true,phone:'3125550148',optedOut:true});
  assert.strictEqual(opted.row.status,'opted_out');
  const nophone=F.planSchedule(null,{at,outcome:'booked',consent:true,phone:'call me'});
  assert.strictEqual(nophone.row.reason,'no_phone');
});

check('switches default off, dry run does not call the provider, and voice is not sent',async()=>{
  const flags=F.normalizeFlags({});
  assert.strictEqual(flags.enabled,false);
  assert.strictEqual(flags.dryRun,true);
  assert.strictEqual(flags.voiceEnabled,false);
  assert.strictEqual(F.normalizeFlags({enabled:true}).dryRun,true);
  let calls=0;
  const fetchImpl=()=>{calls++;throw new Error('provider was called');};
  const held=await F.runDispatch({
    rows:[row()],
    settings:{},
    env:{FOLLOWUP_SMS_PROVIDER:'twilio',TWILIO_ACCOUNT_SID:'ACtest',TWILIO_AUTH_TOKEN:'token'},
    now:new Date('2026-11-13T16:00:00.000Z'),
    fetchImpl
  });
  assert.strictEqual(held.results[0].reason,'disabled');
  assert.strictEqual(calls,0);

  const sample=row();
  sample.smsBody=F.followupSms(sample);
  const dry=await F.runDispatch({
    rows:[sample],
    settings:{enabled:true,dryRun:true,voiceEnabled:false},
    env:{FOLLOWUP_SMS_PROVIDER:'retell',RETELL_API_KEY:'test-key',RETELL_FOLLOWUP_AGENT_ID:'agent_text'},
    now:new Date('2026-11-13T16:00:00.000Z'),
    fetchImpl
  });
  assert.strictEqual(dry.results[0].action,'dry_run');
  assert.strictEqual(calls,0);
  assert.ok(dry.logs[0].smsBody.includes('Thanks for having us out'));
  assert.ok(!dry.logs[0].authorization);
  assert.ok(!JSON.stringify(dry.logs[0]).includes('test-key'));
  const again=await F.runDispatch({
    rows:[sample],
    settings:{enabled:true,dryRun:true,voiceEnabled:false},
    env:{FOLLOWUP_SMS_PROVIDER:'retell',RETELL_API_KEY:'test-key',RETELL_FOLLOWUP_AGENT_ID:'agent_text'},
    now:new Date('2026-11-13T16:00:00.000Z'),
    fetchImpl
  });
  assert.strictEqual(again.results[0].reason,'already_handled');
  assert.strictEqual(calls,0);

  const voice=row({channel:'voice'});
  const skipped=await F.runDispatch({
    rows:[voice],
    settings:{enabled:true,dryRun:false,voiceEnabled:false},
    env:{RETELL_API_KEY:'test-key',RETELL_VOICE_AGENT_ID:'agent_voice',FOLLOWUP_SMS_PROVIDER:'retell',RETELL_FOLLOWUP_AGENT_ID:'agent_text'},
    now:new Date('2026-11-13T16:00:00.000Z'),
    fetchImpl
  });
  assert.strictEqual(skipped.results[0].reason,'voice_disabled');
  assert.strictEqual(calls,0);
  const built=F.buildVoiceRequest(row({channel:'voice',attemptCount:1}),{RETELL_FROM_NUMBER:'+13125842873',RETELL_VOICE_AGENT_ID:'agent_voice'});
  assert.strictEqual(built.url,'https://api.retellai.com/v2/create-phone-call');
  assert.strictEqual(built.json.retell_llm_dynamic_variables.call_type,'followup');
});

check('a second claim does not send again, and retries stop at the limit',()=>{
  const item=row();
  const now=new Date('2026-11-13T16:00:00.000Z');
  const first=F.claimFollowup(item,now,{voiceEnabled:false});
  assert.strictEqual(first.ok,true);
  assert.strictEqual(first.idempotencyKey,'fu-1:1');
  const second=F.claimFollowup(item,now,{voiceEnabled:false});
  assert.strictEqual(second.ok,false);
  assert.strictEqual(second.reason,'in_flight');
  const exhausted=row({attemptCount:3,status:'failed'});
  assert.strictEqual(F.claimFollowup(exhausted,now,{voiceEnabled:false}).reason,'retries_exhausted');
  const sent=row({status:'sent',providerRef:'chat_1'});
  assert.strictEqual(F.claimFollowup(sent,now,{voiceEnabled:false}).reason,'already_handled');
  const blocked=row({consent:false});
  assert.strictEqual(F.claimFollowup(blocked,now,{voiceEnabled:false}).reason,'no_consent');
  assert.strictEqual(blocked.status,'scheduled');
});

check('missing provider is sms_not_configured and does not throw',async()=>{
  const item=row();
  item.smsBody=F.followupSms(item);
  let calls=0;
  const out=await F.runDispatch({
    rows:[item],
    settings:{enabled:true,dryRun:false,voiceEnabled:false},
    env:{},
    now:new Date('2026-11-13T16:00:00.000Z'),
    fetchImpl(){calls++;return {ok:true,providerRef:'nope'};}
  });
  assert.strictEqual(out.results[0].action,'sms_not_configured');
  assert.strictEqual(item.status,'sms_not_configured');
  assert.strictEqual(calls,0);
});

check('thank-you text has the survey link and no prices',()=>{
  const url='https://example.test/survey.html#t=sAAAAAAAAAAAAAAA';
  const booked=F.followupSms({firstName:'Alex',outcome:'booked',projectSummary:'metallic 2-car garage floor',surveyUrl:url});
  assert.ok(booked.includes('Thanks for having us out to look at your metallic 2-car garage floor.'));
  assert.ok(booked.includes("Thanks for choosing us. We'll reach out to confirm next steps."));
  assert.ok(booked.includes(url));
  assert.ok(booked.includes('- Ashley, Exotic Splash'));
  assert.ok(booked.endsWith('Reply STOP to opt out.'));
  assert.ok(!/\$/.test(booked));
  const declined=F.followupSms({firstName:'',outcome:'declined',projectSummary:'flake floor',surveyUrl:url});
  assert.ok(declined.includes('If something held you back, just reply and let us know. We read every reply.'));
  assert.ok(!declined.includes('choosing us'));
  const undecided=F.followupSms({firstName:'Una',outcome:'undecided',projectSummary:'metallic and solid floor',surveyUrl:url});
  assert.ok(undecided.includes('If you have any questions about the quote, just reply here.'));
  const sample=row({attemptCount:1,surveyUrl:url,projectSummary:'flake floor',firstName:'Dan',outcome:'declined'});
  sample.smsBody=F.followupSms(sample);
  const sms=F.buildRetellSms(sample,{RETELL_FOLLOWUP_AGENT_ID:'agent_text',RETELL_FROM_NUMBER:'+13125842873'});
  assert.strictEqual(sms.url,'https://api.retellai.com/create-sms-chat');
  assert.strictEqual(sms.json.retell_llm_dynamic_variables.call_type,'followup');
  assert.strictEqual(sms.json.retell_llm_dynamic_variables.sms_body,sample.smsBody);
  assert.strictEqual(sms.json.from_number,'+13125842873');
  assert.ok(!sms.json.headers);
});

check('every follow-up template is GSM-7 and under 320 characters besides the link',()=>{
  const url='https://doublehpops.github.io/exotic-splash-estimator/survey.html#t=sAAAAAAAAAAAAAAA';
  assert.ok(url.length<90);
  for(const outcome of ['booked','declined','undecided']){
    const text=F.followupSms({firstName:'Alexandra',outcome,projectSummary:'metallic 2-car garage floor',surveyUrl:url});
    assertGsm7(text);
    const bare=text.split(url).join('');
    assert.ok(bare.length<=320,outcome+' '+bare.length);
  }
  const ui=fs.readFileSync(path.join(__dirname,'..','js/followup-ui.js'),'utf8');
  const prompt=fs.readFileSync(path.join(__dirname,'..','docs/followup-ashley-text-prompt.md'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'..','js/guided-app.js'),'utf8');
  assert.ok(app.includes('OK to text me about this quote'));
  assert.ok(!ui.includes('—')&&!ui.includes('–'));
  assert.ok(!prompt.includes('—')&&!prompt.includes('–')&&!prompt.includes(';'));
  const panel=UI.renderPanel({owner:true,rows:[],settings:{enabled:false,dryRun:true,voiceEnabled:false}});
  assertGsm7(panel.replace(/<[^>]+>/g,' '));
});

check('Retell webhook signature accepts the raw body and rejects tampering and stale timestamps',()=>{
  const body='{"event":"chat_ended","chat":{"chat_id":"chat_1"}}';
  const apiKey='test_key_not_a_real_secret';
  const ts=1763000000000;
  const digest=crypto.createHmac('sha256',apiKey).update(body+String(ts)).digest('hex');
  const signature='v='+ts+',d='+digest;
  assert.strictEqual(F.verifyRetellSignature(body,apiKey,signature,ts),true);
  assert.strictEqual(F.verifyRetellSignature(body+' ',apiKey,signature,ts),false);
  assert.strictEqual(F.verifyRetellSignature(body,'other_key',signature,ts),false);
  assert.strictEqual(F.verifyRetellSignature(body,apiKey,signature,ts+5*60*1000+1),false);
  assert.strictEqual(F.verifyRetellSignature(body,apiKey,'',ts),false);
  assert.strictEqual(F.verifyRetellSignature(body,apiKey,'v='+ts+',d='+digest.slice(0,-1)+'0',ts),false);
});

check('Twilio signature and STOP replies are stored once',()=>{
  const params={From:'+13125550148',Body:'STOP',MessageSid:'SM123'};
  const url='https://example.test/functions/v1/followup-inbound';
  const token='twilio_token_test';
  let data=url;
  for(const k of Object.keys(params).sort())data+=k+params[k];
  const sig=crypto.createHmac('sha1',token).update(data).digest('base64');
  assert.strictEqual(F.verifyTwilioSignature(url,params,token,sig),true);
  assert.strictEqual(F.verifyTwilioSignature(url,params,token,'nope'),false);
  assert.strictEqual(F.isStopMessage('Stop'),true);
  assert.strictEqual(F.isStopMessage('STOPALL.'),true);
  assert.strictEqual(F.isStopMessage('stop please'),true);
  assert.strictEqual(F.isStopMessage('OPT OUT'),true);
  assert.strictEqual(F.isStopMessage('revoke'),true);
  assert.strictEqual(F.isStopMessage('thanks'),false);
  assert.strictEqual(F.isStopMessage('Please stop texting me'),false);
  const item=row();
  const first=F.recordInbound(item,{id:'SM123',body:'STOP',from:'+13125550148',provider:'twilio',at:'2026-11-13T16:00:00.000Z'});
  assert.strictEqual(first.optedOut,true);
  assert.strictEqual(item.status,'opted_out');
  assert.strictEqual(item.inboundReplies.length,1);
  const dup=F.recordInbound(item,{id:'SM123',body:'STOP',from:'+13125550148',provider:'twilio'});
  assert.strictEqual(dup.duplicate,true);
  assert.strictEqual(item.inboundReplies.length,1);
  const reason=row({jobOutcome:'declined'});
  F.recordInbound(reason,{id:'m1',body:'We went with another company',analysis:{why_not:'Went with another company'}});
  assert.strictEqual(reason.outcomeReason,'Went with another company');
  assert.strictEqual(F.ownerMayChange({status:'sent',consent:true},'text_now').ok,false);
  assert.strictEqual(F.ownerMayChange({status:'completed',consent:true},'reschedule').ok,false);
  assert.strictEqual(F.ownerMayChange({status:'scheduled',optedOutAt:'2026-11-13T00:00:00Z',consent:true},'reschedule').reason,'opted_out');
  assert.strictEqual(F.ownerMayChange({status:'scheduled',consent:true},'text_now').ok,true);
});

check('a survey token can be used once and the page has no prices',()=>{
  const raw=token();
  const record={tokenHash:F.sha256Hex(raw),usedAt:null,answers:null,token:raw};
  const opened=F.openSurvey(record,raw);
  assert.strictEqual(opened.ok,true);
  assert.ok(opened.questions.some(q=>q.id==='why_not'));
  assert.ok(!JSON.stringify(opened).includes('$'));
  assert.ok(!JSON.stringify(opened).match(/cost|margin|price/i));
  const bad=F.consumeSurvey(record,raw,{on_time:'yes'});
  assert.strictEqual(bad.ok,false);
  const answers={on_time:'yes',professional:'yes',explained:'yes',experience:4,improve:'Arrive with booties',booked:'no',why_not:'We are waiting on the budget'};
  const saved=F.consumeSurvey(record,raw,answers);
  assert.strictEqual(saved.ok,true);
  assert.strictEqual(record.token,null);
  assert.ok(record.usedAt);
  const second=F.consumeSurvey(record,raw,answers);
  assert.strictEqual(second.code,'used');
  const other=F.openSurvey(record,token());
  assert.strictEqual(other.code,'not_found');
  assert.strictEqual(F.tokenFromHash('#t='+encodeURIComponent(raw)),raw);
});

check('employees see status only and the owner sees text actions',()=>{
  const rich={
    id:'fu-1',jobNumber:'ES-20261101-01',customerFirstName:'Alex',status:'scheduled',
    scheduledFor:'2026-11-13T16:00:00.000Z',sentAt:null,channel:'sms',jobOutcome:'undecided',
    surveyAnswers:{experience:5,why_not:'too expensive'},outcomeReason:'too expensive',
    inboundReplies:[{body:'STOP'}],customerTotal:5200,cost:100,margin:80
  };
  const employee=UI.renderPanel({owner:false,rows:[rich],settings:{enabled:false,dryRun:true,voiceEnabled:false}});
  assert.ok(employee.includes('Scheduled'));
  assert.ok(!employee.includes('Text now'));
  assert.ok(!employee.includes('too expensive'));
  assert.ok(!employee.includes('STOP'));
  assert.ok(!employee.includes('5 / 5'));
  assert.ok(!employee.includes('5200'));
  assert.ok(!employee.includes('A2P'));
  assert.ok(!/\$/.test(employee));
  const sent=UI.renderPanel({owner:true,rows:[Object.assign({},rich,{id:'fu-sent',status:'sent'})],settings:{}});
  assert.ok(!sent.includes('data-followup-action'));
  const opted=UI.renderPanel({owner:true,rows:[Object.assign({},rich,{id:'fu-out',status:'opted_out'})],settings:{}});
  assert.ok(!opted.includes('data-followup-action'));
  const owner=UI.renderPanel({owner:true,rows:[rich],settings:{}});
  assert.ok(owner.includes('Text now'));
  assert.ok(owner.includes('Skip'));
  assert.ok(owner.includes('Reschedule'));
  assert.ok(owner.includes('5 / 5'));
  assert.ok(!owner.includes('5200'));
  assert.ok(owner.includes('A2P 10DLC'));
  assert.ok(owner.includes('Follow-ups enabled')&&!owner.includes('checked> Follow-ups enabled')||owner.includes('id="fuEnabled"'));
  const form=UI.surveyForm(F.SURVEY_QUESTIONS);
  assert.ok(form.includes('Did you book with us?'));
  assert.ok(!/\$/.test(form));
});

check('migrations are newer than 20261112183000 and contain no secrets',()=>{
  const root=path.join(__dirname,'..');
  const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
  assert.strictEqual(read('js/followup-core.js'),read('supabase/functions/_shared/followup-core.js'));
  for(const name of ['epoxy-engine.js','quote-core.js','price-sanity.js','discount-approval.js']){
    assert.strictEqual(read('js/'+name),read('supabase/functions/_shared/'+name),name);
  }
  const files=['supabase/migrations/20261112203000_job_followups.sql','supabase/migrations/20261112204500_followup_dispatch_cron.sql'];
  for(const file of files){
    assert.ok(file.slice(file.lastIndexOf('/')+1,file.lastIndexOf('/')+15)>'20261112183000',file);
    const sql=read(file);
    assert.ok(!/sb_secret_|sb_publishable_|eyJ[A-Za-z0-9_-]{20,}/.test(sql),file);
    assert.ok(!/RETELL_API_KEY\s*=\s*['"][^'"]+/.test(sql),file);
    assert.ok(!/\bdelete\s+from\b/i.test(sql),file);
  }
  const schema=read(files[0]);
  const cron=read(files[1]);
  assert.ok(schema.includes("'enabled', false"));
  assert.ok(schema.includes("'dryRun', true"));
  assert.ok(schema.includes("'voiceEnabled', false"));
  assert.ok(schema.includes('no_consent'));
  assert.ok(schema.includes("channel = 'sms'"));
  assert.ok(schema.includes('survey_used_at is null'));
  assert.ok(schema.includes('America/Chicago'));
  assert.ok(schema.includes('extract(dow from v_target) = 0'));
  assert.ok(schema.includes("v.status in ('sent', 'completed', 'opted_out')"));
  assert.ok(schema.includes('new.id::text'));
  assert.ok(schema.includes('s[A-Za-z0-9_-]{16}'));
  assert.ok(cron.includes("interval '1 day'"));
  assert.ok(schema.includes('enable row level security'));
  assert.ok(schema.includes('force row level security'));
  assert.ok(cron.includes("'*/15 * * * *'"));
  assert.ok(cron.includes('followup-dispatch'));
  assert.ok(cron.includes('project_url'));
  assert.ok(cron.includes('followup_dispatch_bearer'));
  const dispatch=read('supabase/functions/followup-dispatch/index.ts');
  assert.ok(dispatch.includes('https://api.retellai.com/create-sms-chat')||read('js/followup-core.js').includes('https://api.retellai.com/create-sms-chat'));
  assert.ok(dispatch.includes('voiceEnabled'));
  assert.ok(!/key_[A-Za-z0-9]{16,}/.test(dispatch));
  const inbound=read('supabase/functions/followup-inbound/index.ts');
  assert.ok(inbound.includes('verifyRetellSignature'));
  assert.ok(inbound.includes('x-retell-signature'));
});

(async function(){
  let failed=0;
  for(const t of tests){
    try{
      await t.fn();
      console.log('ok',t.name);
    }catch(e){
      failed++;
      console.error('FAIL',t.name,e&&e.stack||e);
    }
  }
  if(failed){console.error(failed+' failed');process.exit(1);}
  console.log('all follow-up checks passed');
})();
