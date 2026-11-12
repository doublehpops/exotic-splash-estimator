'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const F=require('../js/followup-core');

const tests=[];
function check(name,fn){tests.push({name,fn});}
const GSM7="@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
function assertGsm7(text){
  for(const ch of text)assert.ok(GSM7.includes(ch),'not GSM-7: '+JSON.stringify(ch)+' in '+text.slice(0,80));
  assert.ok(!text.includes('—')&&!text.includes('–'));
}
function assertSigned(text){
  assert.ok(text.includes('- Exotic Splash Epoxy LLC'),text);
  assert.ok(!/ashley/i.test(text),text);
  assert.ok(!text.includes('—')&&!text.includes('–'));
}
function at(year,month,day,hour,minute){return F.zonedTimeToUtc(year,month,day,hour,minute);}
function fullEvent(over){
  return Object.assign({
    at:at(2026,11,12,15,0),
    outcome:'undecided',
    consent:true,
    phone:'3125550199',
    customer:'TEST Bea',
    projectSummary:'flake floor',
    quoteTotal:4800,
    visitAt:at(2026,11,18,14,0),
    address:'100 Test Lane, Chicago, IL',
    installDate:'',
    quoteAt:at(2026,11,12,15,0),
    quoteDone:true
  },over||{});
}
function step(plan,id){
  const found=plan.steps.find(s=>s.row.step===id);
  assert.ok(found,id);
  return found.row;
}
function textFor(row,extra){
  const built=F.sequenceSms(row.step,Object.assign({
    firstName:row.firstName,
    projectSummary:row.projectSummary,
    quoteTotal:row.stepVars.quoteTotal,
    visitAt:row.stepVars.visitAt,
    address:row.stepVars.address,
    installDate:row.stepVars.installDate,
    surveyUrl:'https://doublehpops.github.io/exotic-splash-estimator/survey.html#t=sAAAAAAAAAAAAAAA',
    includeStop:row.includeStop===true,
    scheduledFor:row.scheduledFor
  },extra||{}));
  assert.strictEqual(built.ok,true,built.reason||row.step);
  return built.text;
}

check('legacy post-quote text signs with the business and has no Ashley',()=>{
  const text=F.followupSms({firstName:'Bea',outcome:'undecided',projectSummary:'flake floor',surveyUrl:'https://example.test/survey.html#t=sAAAAAAAAAAAAAAA'});
  assertSigned(text);
  assert.ok(text.includes('this is Exotic Splash Epoxy LLC.'));
  assert.ok(text.includes('\n- Exotic Splash Epoxy LLC\nReply STOP to opt out.'));
  assert.ok(!/\$/.test(text));
  assertGsm7(text);
  assert.ok(!fs.readFileSync(path.join(__dirname,'..','js/followup-core.js'),'utf8').includes('Ashley'));
});

check('all seven texts use the business sign-off, the company phone, and no Ashley',()=>{
  const plan=F.planSequence([],fullEvent());
  const phone='312-584-2873';
  const confirm=textFor(step(plan,'visit_confirm'));
  assert.ok(confirm.startsWith('Hi TEST, this is Exotic Splash Epoxy LLC. Your free on-site estimate is set for Wednesday, November 18 at 2:00 PM at 100 Test Lane, Chicago, IL.'));
  assert.ok(confirm.includes(phone));
  assert.ok(confirm.includes('\n- Exotic Splash Epoxy LLC\nReply STOP to opt out.'));
  const reminder=textFor(step(plan,'visit_reminder'));
  assert.ok(reminder.includes("we'll see you tomorrow, November 18, at 2:00 PM"));
  assert.ok(reminder.includes('Reply YES to confirm'));
  assert.ok(!reminder.includes('Reply STOP'));
  const thanks=textFor(step(plan,'quote_thanks'));
  assert.ok(thanks.includes('Thanks for having us out today, TEST.'));
  assert.ok(thanks.includes('Your estimate for flake floor comes to $4,800.'));
  assert.ok(!thanks.includes('Reply STOP'));
  const review=textFor(step(plan,'review'));
  assert.ok(review.includes('survey.html#t='));
  assert.ok(review.includes('how your estimate visit went'));
  const undecided=textFor(step(plan,'undecided_check'));
  assert.ok(undecided.includes('written quote'));
  assert.ok(undecided.includes('match it or beat it'));
  assert.ok(undecided.includes('was $4,800'));
  const last=textFor(step(plan,'last_check'));
  assert.ok(last.includes('last check-in'));
  const bookedPlan=F.planSequence([],fullEvent({outcome:'booked',installDate:'2026-11-24'}));
  const booked=textFor(step(bookedPlan,'booked_install'));
  assert.ok(booked.includes('Thank you, TEST!'));
  assert.ok(booked.includes('Tuesday, November 24'));
  assert.ok(booked.includes(phone));
  for(const text of [confirm,reminder,thanks,review,undecided,last,booked]){
    assertSigned(text);
    assertGsm7(text);
    assert.ok(text.indexOf('- Exotic Splash Epoxy LLC')<text.length);
  }
  const other=F.sequenceSms('quote_thanks',{firstName:'Bea',projectSummary:'flake floor',quoteTotal:5100,includeStop:false});
  assert.ok(other.text.includes('$5,100'));
  assert.ok(!other.text.includes('$4,800'));
  assert.ok(!/per sq|\/sq|\$\d+\s*\/\s*sq/i.test(other.text));
});

check('scheduling, the send window, and Sunday to Monday 10 AM',()=>{
  const plan=F.planSequence([],fullEvent());
  assert.strictEqual(step(plan,'visit_confirm').status,'scheduled');
  assert.strictEqual(new Date(step(plan,'visit_confirm').scheduledFor).toISOString(),at(2026,11,12,15,0).toISOString());
  assert.strictEqual(new Date(step(plan,'visit_reminder').scheduledFor).toISOString(),at(2026,11,17,10,0).toISOString());
  assert.strictEqual(new Date(step(plan,'quote_thanks').scheduledFor).toISOString(),at(2026,11,12,15,0).toISOString());
  assert.strictEqual(step(plan,'visit_confirm').includeStop,true);
  assert.strictEqual(step(plan,'quote_thanks').includeStop,false);
  assert.ok(!plan.steps.some(s=>s.row.step==='booked_install'));

  const late=F.planSequence([],fullEvent({at:at(2026,11,12,21,30),quoteAt:at(2026,11,12,21,30)}));
  assert.strictEqual(new Date(step(late,'quote_thanks').scheduledFor).toISOString(),at(2026,11,13,9,0).toISOString());

  const sundayQuote=F.planSequence([],fullEvent({
    at:at(2026,11,15,14,0),
    quoteAt:at(2026,11,15,14,0),
    visitAt:at(2026,11,18,14,0)
  }));
  assert.strictEqual(new Date(step(sundayQuote,'quote_thanks').scheduledFor).toISOString(),at(2026,11,16,10,0).toISOString());

  const saturdayNight=F.planSequence([],fullEvent({
    at:at(2026,11,14,21,0),
    quoteAt:at(2026,11,14,21,0)
  }));
  assert.strictEqual(new Date(step(saturdayNight,'quote_thanks').scheduledFor).toISOString(),at(2026,11,16,10,0).toISOString());

  const mondayVisit=F.planSequence([],fullEvent({visitAt:at(2026,11,16,14,0)}));
  assert.strictEqual(step(mondayVisit,'visit_reminder').status,'scheduled');
  assert.strictEqual(new Date(step(mondayVisit,'visit_reminder').scheduledFor).toISOString(),at(2026,11,16,10,0).toISOString());
  const earlyMonday=F.planSequence([],fullEvent({visitAt:at(2026,11,16,9,0)}));
  assert.strictEqual(step(earlyMonday,'visit_reminder').status,'skipped');
  assert.strictEqual(step(earlyMonday,'visit_reminder').reason,'window_after_visit');

  const twoDay=F.planSequence([],fullEvent({quoteAt:at(2026,11,12,10,0)}));
  assert.strictEqual(new Date(step(twoDay,'undecided_check').scheduledFor).toISOString(),at(2026,11,14,10,0).toISOString());
  const evening=F.planSequence([],fullEvent({quoteAt:at(2026,11,12,15,0)}));
  assert.strictEqual(new Date(step(evening,'undecided_check').scheduledFor).toISOString(),at(2026,11,16,10,0).toISOString());
  assert.strictEqual(new Date(step(evening,'last_check').scheduledFor).toISOString(),at(2026,11,19,10,0).toISOString());
});

check('booked and declined cancel the undecided texts, and STOP cancels the sequence',()=>{
  const booked=F.planSequence([],fullEvent({outcome:'booked',installDate:'2026-11-24'}));
  assert.strictEqual(step(booked,'booked_install').status,'scheduled');
  assert.strictEqual(step(booked,'undecided_check').status,'skipped');
  assert.strictEqual(step(booked,'undecided_check').reason,'booked');
  assert.strictEqual(step(booked,'last_check').reason,'booked');
  const noDate=F.planSequence([],fullEvent({outcome:'booked',installDate:''}));
  assert.strictEqual(step(noDate,'booked_install').status,'skipped');
  assert.strictEqual(step(noDate,'booked_install').reason,'missing_install');
  const declined=F.planSequence([],fullEvent({outcome:'declined'}));
  assert.strictEqual(step(declined,'undecided_check').reason,'declined');
  assert.strictEqual(step(declined,'last_check').reason,'declined');
  assert.ok(!declined.steps.some(s=>s.row.step==='booked_install'&&s.row.status==='scheduled'));
  const stopped=F.planSequence([],fullEvent({optedOut:true}));
  for(const s of stopped.steps){
    assert.strictEqual(s.row.status,'opted_out');
    assert.strictEqual(s.row.reason,'opted_out');
  }
  assert.strictEqual(F.isYesConfirm('YES'),true);
  assert.strictEqual(F.isYesConfirm('Yes!'),true);
  assert.strictEqual(F.isYesConfirm('yes please'),false);
  const item={status:'scheduled',inboundReplies:[],jobOutcome:'undecided'};
  const yes=F.recordInbound(item,{id:'m-yes',body:'YES',from:'+13125550199',at:'2026-11-17T16:00:00.000Z'});
  assert.ok(item.visitConfirmedAt);
  assert.notStrictEqual(item.status,'opted_out');
  assert.strictEqual(yes.optedOut,false);
});

check('missing quote, visit, or address is skipped and does not render a blank',()=>{
  const missingMoney=F.planSequence([],fullEvent({quoteTotal:null}));
  assert.strictEqual(step(missingMoney,'quote_thanks').status,'skipped');
  assert.strictEqual(step(missingMoney,'quote_thanks').reason,'missing_quote');
  assert.strictEqual(step(missingMoney,'undecided_check').reason,'missing_quote');
  assert.strictEqual(step(missingMoney,'last_check').status,'scheduled');
  const blank=F.sequenceSms('quote_thanks',{firstName:'Bea',projectSummary:'flake floor',quoteTotal:null,includeStop:true});
  assert.strictEqual(blank.ok,false);
  assert.strictEqual(blank.text,'');
  const noVisit=F.planSequence([],fullEvent({visitAt:null,address:''}));
  assert.ok(!noVisit.steps.some(s=>s.row.step==='visit_confirm'));
  assert.ok(!noVisit.steps.some(s=>s.row.step==='visit_reminder'));
  assert.ok(!noVisit.steps.some(s=>s.row.step==='review'));
  const noAddress=F.planSequence([],fullEvent({address:''}));
  assert.ok(!noAddress.steps.some(s=>s.row.step==='visit_confirm'));
  assert.strictEqual(step(noAddress,'visit_reminder').status,'scheduled');
  const noConsent=F.planSequence([],fullEvent({consent:false}));
  assert.strictEqual(step(noConsent,'visit_confirm').status,'skipped');
  assert.strictEqual(step(noConsent,'visit_confirm').reason,'no_consent');
});

check('sequence steps stay off and a disabled step does not call the provider',async()=>{
  const flags=F.normalizeFlags({});
  for(const id of F.STEP_IDS)assert.strictEqual(flags.steps[id],false);
  assert.strictEqual(flags.enabled,false);
  assert.strictEqual(flags.dryRun,true);
  let calls=0;
  const row={
    id:'step-1',status:'scheduled',channel:'sms',consent:true,phoneE164:'+13125550199',
    scheduledFor:'2026-11-12T21:00:00.000Z',attemptCount:0,maxAttempts:3,step:'quote_thanks',
    firstName:'Bea',projectSummary:'flake floor',stepVars:{quoteTotal:4800,includeStop:true}
  };
  const held=await F.runDispatch({
    rows:[row],
    settings:{enabled:true,dryRun:false,voiceEnabled:false,steps:{}},
    env:{FOLLOWUP_SMS_PROVIDER:'twilio',TWILIO_ACCOUNT_SID:'ACtest',TWILIO_AUTH_TOKEN:'token'},
    now:new Date('2026-11-13T16:00:00.000Z'),
    fetchImpl(){calls++;return {ok:true,providerRef:'SM1'};}
  });
  assert.strictEqual(held.results[0].reason,'step_disabled');
  assert.strictEqual(calls,0);
  assert.strictEqual(row.status,'scheduled');
});

check('survey accepts the five new answers and rejects a partial form',()=>{
  const good=F.validateSurveyAnswers({on_time:'yes',explained:'5',professional:4,likely:'Yes',improve:'Wave when you arrive'});
  assert.strictEqual(good.ok,true);
  assert.strictEqual(good.answers.explained,5);
  assert.strictEqual(good.answers.likely,'yes');
  assert.strictEqual(F.validateSurveyAnswers({on_time:'yes',explained:3,professional:3,likely:'maybe'}).ok,true);
  assert.strictEqual(F.validateSurveyAnswers({on_time:'yes'}).ok,false);
  assert.strictEqual(F.validateSurveyAnswers({on_time:'yes',explained:9,professional:3,likely:'no'}).ok,false);
  assert.strictEqual(F.validateSurveyAnswers({on_time:'yes',explained:3,professional:3,likely:'no',price:12}).code,'invalid');
  const ui=fs.readFileSync(path.join(__dirname,'..','js/followup-ui.js'),'utf8');
  assert.ok(!ui.includes('Ashley'));
  assert.ok(!ui.includes('Signer:'));
  const app=fs.readFileSync(path.join(__dirname,'..','js/guided-app.js'),'utf8');
  assert.ok(app.includes("field('Estimate visit date','job.visitDate'"));
  assert.ok(app.includes("field('Estimate visit time','job.visitTime'"));
  assert.ok(app.includes("field('Visit address','job.visitAddress'"));
  assert.ok(app.includes("field('Install date','job.installDate'"));
});

check('new migrations stay off, keep old survey data, and contain no secrets',()=>{
  const root=path.join(__dirname,'..');
  const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
  assert.strictEqual(read('js/followup-core.js'),read('supabase/functions/_shared/followup-core.js'));
  const files=[
    'supabase/migrations/20261112220000_followup_sequence_steps.sql',
    'supabase/migrations/20261112221500_followup_survey_v2.sql'
  ];
  for(const file of files){
    const sql=read(file);
    assert.ok(file.slice(file.lastIndexOf('/')+1,file.lastIndexOf('/')+15)>'20261112211500',file);
    assert.ok(!/sb_secret_|sb_publishable_|eyJ[A-Za-z0-9_-]{20,}/.test(sql),file);
    assert.ok(!/\bdrop\s+column\b/i.test(sql),file);
    assert.ok(!/\bdrop\s+table\b/i.test(sql),file);
    assert.ok(!/\bdelete\s+from\b/i.test(sql),file);
    assert.ok(!/ashley/i.test(sql),file);
  }
  const steps=read(files[0]);
  const survey=read(files[1]);
  assert.ok(steps.includes("'enabled', false")||steps.includes("'enabled', coalesce"));
  assert.ok(steps.includes('visit_confirm'));
  assert.ok(steps.includes('step_disabled'));
  assert.ok(steps.includes('missing_quote'));
  assert.ok(steps.includes('America/Chicago'));
  assert.ok(steps.includes("time '10:00'"));
  assert.ok(steps.includes('customerQuoteTotal'));
  assert.ok(steps.includes('job_quotes'));
  assert.ok(!steps.includes('staff_snapshot'));
  assert.ok(survey.includes('Did your estimator show up on time?'));
  assert.ok(survey.includes('How likely are you to book with us?'));
  assert.ok(survey.includes('survey_used_at is null'));
  assert.ok(survey.includes('Old survey_answers'));
  const dispatch=read('supabase/functions/followup-dispatch/index.ts');
  assert.ok(dispatch.includes('sequenceSms'));
  assert.ok(dispatch.includes('step_disabled'));
  const inbound=read('supabase/functions/followup-inbound/index.ts');
  assert.ok(inbound.includes('isYesConfirm'));
  assert.ok(inbound.includes('visit_confirmed_at'));
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
  console.log('all sequence checks passed');
})();
