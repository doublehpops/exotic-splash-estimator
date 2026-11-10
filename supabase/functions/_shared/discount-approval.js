/* Extra-discount approvals. Role comes from the server profile, never from the request body.
 * Pending and rejected requests do not change the customer total. */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.EsDiscountApproval=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function r2(v){return Math.round(n(v)*100)/100}
function hash(text){
  let h=2166136261;
  const s=String(text);
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return (h>>>0).toString(16);
}
function revisionOf(job,beforeTotal){
  const areas=(job.areas||[]).map(a=>({
    id:a.id||'',sqft:n(a.sqft),style:a.style||'',coats:n(a.coats),flake:a.flake||'',
    rate:a.rate==null?'':a.rate,moisture:!!a.moisture,level:!!a.level,grip:!!a.grip
  }));
  const items=(job.catalogItems||[]).map(it=>({
    id:it.id||'',qty:n(it.qty),seatType:it.seatType||'',sizeBand:it.sizeBand||'',
    style:it.style||'',condition:it.condition||'',customStarting:it.customStarting==null?'':it.customStarting
  }));
  return hash(JSON.stringify({
    areas,items,condition:job.condition||'',patchKits:n(job.patchKits),tax:n(job.tax),
    addOn:!!job.addOnIncluded,addOnTier:job.addOnTier||'',miles:n(job.miles),minutes:n(job.minutes),
    tier:job.priceOption||'regular',method:job.method||'rates',beforeCents:Math.round(n(beforeTotal)*100)
  }));
}
function fail(status,code,error){return {ok:false,status,code,error}}
function publicView(row){
  if(!row)return null;
  return {
    id:row.id,estimateId:row.estimateId,revision:row.revision,tier:row.tier,
    beforeTotal:row.beforeTotal,afterTotal:row.afterTotal,amount:row.amount,
    percent:row.percent,reason:row.reason,requesterId:row.requesterId,requestedAt:row.requestedAt,
    status:row.status,decidedAt:row.decidedAt,appliedAt:row.appliedAt,lowMarginException:!!row.lowMarginException
  };
}
function createStore(opts){
  const rows=[];
  let seq=1;
  const nextId=opts&&opts.idFactory?opts.idFactory:function(){seq+=1;return 'local-'+seq};
  function find(id){return rows.find(r=>r.id===id)||null}
  function request(actor,input){
    input=input||{};
    if(!actor||(actor.role!=='employee'&&actor.role!=='owner')||!actor.id)return fail(403,'forbidden','Active staff profile is required');
    if(input.role||input.actorRole)return fail(400,'bad_request','Role is taken from the signed-in profile, not the request');
    const estimateId=String(input.estimateId||'');
    const revision=String(input.revision||'');
    const tier=String(input.tier||'');
    const beforeTotal=r2(input.beforeTotal);
    const reason=String(input.reason||'').trim();
    if(!estimateId||!revision||!tier)return fail(400,'bad_request','Estimate, revision, and selected tier are required');
    if(!(beforeTotal>0))return fail(400,'bad_request','A positive selling total is required before an extra discount');
    if(!reason)return fail(400,'bad_request','A reason is required');
    const hasAmount=input.amount!=null&&input.amount!=='';
    const hasPercent=input.percent!=null&&input.percent!=='';
    if(hasAmount===hasPercent)return fail(400,'bad_request','Send either an amount or a percent, not both and not neither');
    let amount,percent=null;
    if(hasPercent){
      percent=n(input.percent);
      if(!(percent>0)||percent>=100)return fail(400,'invalid_reduction','Percent must be greater than 0 and less than 100');
      amount=r2(beforeTotal*percent/100);
    }else{
      amount=r2(input.amount);
    }
    if(!(amount>0)||amount>=beforeTotal)return fail(400,'invalid_reduction','Reduction must be positive and leave a selling total above zero');
    const row={
      id:nextId(),estimateId,revision,tier,beforeTotal,amount,percent,reason,
      afterTotal:r2(beforeTotal-amount),requesterId:actor.id,requestedAt:input.now||new Date().toISOString(),
      status:'pending',ownerId:null,decidedAt:null,appliedAt:null,ownerNote:null,lowMarginException:false
    };
    rows.push(row);
    return {ok:true,status:201,request:publicView(row)};
  }
  function decide(actor,input){
    input=input||{};
    if(!actor||actor.role!=='owner'||!actor.id)return fail(403,'forbidden','Only the owner can approve or reject an extra discount');
    if(input.role||input.actorRole)return fail(400,'bad_request','Role is taken from the signed-in profile, not the request');
    const row=find(input.id);
    if(!row)return fail(404,'not_found','Approval request was not found');
    if(row.status!=='pending')return fail(409,'conflict','This request is no longer pending');
    if(input.amount!=null&&r2(input.amount)!==row.amount)return fail(409,'tamper','The approved amount cannot be changed');
    if(input.percent!=null&&input.percent!==''&&r2(input.percent)!==r2(row.percent))return fail(409,'tamper','The approved percent cannot be changed');
    if(input.estimateId&&String(input.estimateId)!==row.estimateId)return fail(409,'cross_estimate','This approval belongs to a different estimate');
    const decision=input.decision;
    if(decision!=='approve'&&decision!=='reject')return fail(400,'bad_request','Decision must be approve or reject');
    row.status=decision==='approve'?'approved':'rejected';
    row.ownerId=actor.id;
    row.decidedAt=input.now||new Date().toISOString();
    row.ownerNote=input.ownerNote?String(input.ownerNote).slice(0,500):null;
    row.lowMarginException=decision==='approve'&&input.lowMarginException===true;
    return {ok:true,status:200,request:publicView(row)};
  }
  function matches(row,input,markStale){
    if(String(input.estimateId||'')!==row.estimateId)return fail(409,'cross_estimate','This approval belongs to a different estimate');
    if(String(input.tier||'')!==row.tier)return fail(409,'stale_approval','The selected price tier changed after approval');
    if(String(input.revision||'')!==row.revision){
      if(markStale&&row.status==='approved')row.status='stale';
      return fail(409,'stale_approval','The estimate changed after approval');
    }
    if(Math.abs(r2(input.beforeTotal)-row.beforeTotal)>0.009){
      if(markStale&&row.status==='approved')row.status='stale';
      return fail(409,'stale_approval','The selling total changed after approval');
    }
    return null;
  }
  function check(input){
    input=input||{};
    const row=find(input.id);
    if(!row)return fail(404,'not_found','Approval request was not found');
    if(row.status==='pending')return fail(409,'pending','A pending request does not reduce the customer price');
    if(row.status==='rejected')return fail(409,'rejected','A rejected request does not reduce the customer price');
    if(row.status==='stale')return fail(409,'stale_approval','This approval is stale');
    if(row.status==='consumed')return fail(409,'replay','This approval was already applied');
    if(row.status!=='approved')return fail(409,'conflict','This approval cannot be applied');
    const mismatch=matches(row,input,!!input.markStale);
    if(mismatch)return mismatch;
    return {ok:true,status:200,amount:row.amount,beforeTotal:row.beforeTotal,afterTotal:row.afterTotal,id:row.id,request:publicView(row)};
  }
  function consume(actor,input){
    if(!actor||(actor.role!=='employee'&&actor.role!=='owner')||!actor.id)return fail(403,'forbidden','Active staff profile is required');
    const gate=check(Object.assign({},input,{markStale:true}));
    if(!gate.ok)return gate;
    const row=find(input.id);
    if(row.status!=='approved')return fail(409,'replay','This approval was already applied');
    row.status='consumed';
    row.appliedAt=input.now||new Date().toISOString();
    return {ok:true,status:200,amount:row.amount,request:publicView(row)};
  }
  return {request,decide,check,consume,get:id=>publicView(find(id)),ownerGet:id=>{const row=find(id);return row?Object.assign(publicView(row),{ownerNote:row.ownerNote}):null}};
}
return {createStore,revisionOf,publicView};
});
