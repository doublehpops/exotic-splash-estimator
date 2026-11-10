/* Browser transport for extra-discount approvals.
 * A signed-in session talks only to quote-job. A local da_ id is not an approval. */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.EsDiscountClient=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isServerApprovalId(id){return UUID.test(String(id||''))}
function fail(code,error){return {ok:false,code,error,id:null}}
async function requestDiscount(transport,input){
  input=input||{};
  if(typeof transport!=='function')return fail('not_configured','Server approval is not available. The price was not changed.');
  if(!input.serverId)return fail('unsaved','Save the estimate to the server before requesting a discount. The price was not changed.');
  let res;
  try{
    res=await transport({mode:'discount-request',job_id:input.serverId,job_data:input.jobData,amount:input.amount,percent:input.percent,reason:input.reason});
  }catch(e){
    return fail('bad_request',(e&&e.message)||'The approval request failed. The price was not changed.');
  }
  const id=res&&res.request&&res.request.id;
  if(!res||res.ok!==true||!isServerApprovalId(id))return fail('invalid_approval_id','The server did not return an approval record. The price was not changed.');
  return {ok:true,id,status:res.request.status||'pending',tier:res.tier||res.request.tier||null,beforeTotal:res.beforeTotal,request:res.request};
}
async function decideDiscount(transport,input){
  input=input||{};
  if(typeof transport!=='function')return fail('not_configured','Server approval is not available. The price was not changed.');
  if(!isServerApprovalId(input.id))return fail('invalid_approval_id','This is not a server approval. The price was not changed.');
  let res;
  try{
    res=await transport({mode:'discount-decide',job_id:input.serverId,id:input.id,decision:input.decision,estimateId:input.serverId});
  }catch(e){
    return fail('bad_request',(e&&e.message)||'The decision failed. The price was not changed.');
  }
  if(!res||res.ok!==true||!res.request)return fail((res&&res.code)||'bad_request',(res&&res.error)||'The decision failed. The price was not changed.');
  return {ok:true,id:input.id,status:res.request.status,request:res.request};
}
return {isServerApprovalId,requestDiscount,decideDiscount};
});
