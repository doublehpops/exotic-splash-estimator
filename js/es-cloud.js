/* Exotic Splash v7 — Supabase data adapter (browser + Node tests with a mock client).
 * Uses ONLY the public anon/publishable key + the signed-in user's JWT. Every
 * permission decision is made by Postgres RLS / SECURITY DEFINER RPCs or the
 * quote-job Edge Function — nothing here is trusted for security. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EsCloud=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const JOB_COLS='id,client_ref,job_number,customer_label,job_data,status,version,created_by,assigned_staff,updated_at,discount_amount';
const PHOTO_BUCKET='job-photos';
class CloudError extends Error{constructor(code,message,cause){super(message);this.code=code;this.cause=cause}}
function friendly(err){
  const m=String(err&&(err.message||err.error_description||err)||'');
  if(/exceeds the owner-approved adjustment limit/i.test(m))return new CloudError('discount_over_cap','Discount exceeds the owner-approved adjustment limit.',err);
  if(/Only the owner can change job status/i.test(m))return new CloudError('forbidden','Only the owner can change job status.',err);
  if(/Only the owner/i.test(m))return new CloudError('forbidden','Only the owner can do that.',err);
  if(/disabled or not yet approved|row-level security|permission denied|Not allowed/i.test(m))return new CloudError('forbidden','Not allowed for this account (disabled, not approved, or not your job).',err);
  if(/changed since|version/i.test(m)&&/changed/i.test(m))return new CloudError('conflict','Changed by someone else — reload and retry.',err);
  if(/Failed to fetch|NetworkError|network/i.test(m))return new CloudError('network','Network unavailable — changes kept on this device; will retry.',err);
  return new CloudError('error',m||'Request failed',err);
}
function unwrap(res){if(res&&res.error)throw friendly(res.error);return res?res.data:null}
function create(client,opts){
  opts=opts||{};
  if(!client||!client.auth)throw new Error('Supabase client required');
  const api={
    client,
    /* ---------- auth (email + password only; NO sign-up anywhere) ---------- */
    async getSession(){const r=await client.auth.getSession();return unwrap(r)&&r.data.session||null},
    onAuthChange(cb){const r=client.auth.onAuthStateChange((ev,session)=>cb(ev,session));return r&&r.data&&r.data.subscription},
    async signIn(email,password){
      email=String(email||'').trim();if(!email||!password)throw new CloudError('input','Email and password are required.');
      const r=await client.auth.signInWithPassword({email,password});
      if(r.error)throw new CloudError('auth','Sign-in failed. Check email and password, or ask the owner whether your account is approved.',r.error);
      if(!r.data||!r.data.session)throw new CloudError('auth','Sign-in did not return a session.');
      return r.data.session;
    },
    async requestPasswordReset(email,redirectTo){
      email=String(email||'').trim();if(!email)throw new CloudError('input','Enter your email.');
      const r=await client.auth.resetPasswordForEmail(email,redirectTo?{redirectTo}:undefined);
      // Neutral result: never reveal whether the email exists.
      if(r&&r.error&&/rate|too many/i.test(r.error.message||''))throw new CloudError('rate','Too many requests — wait a minute and try again.',r.error);
      return true;
    },
    async setNewPassword(password){
      if(!password||String(password).length<10)throw new CloudError('input','Use at least 10 characters.');
      const r=await client.auth.updateUser({password});if(r.error)throw new CloudError('auth',r.error.message,r.error);return true;
    },
    async signOut(){await client.auth.signOut();},
    /* ---------- profile ---------- */
    async getProfile(){const d=unwrap(await client.rpc('get_my_profile'));return Array.isArray(d)?(d[0]||null):d},
    /* ---------- price book ---------- */
    async loadStaffPriceBook(){return unwrap(await client.from('price_book').select('staff_settings,version,updated_at').eq('id',1).maybeSingle())},
    async loadOwnerPriceBook(){const d=unwrap(await client.rpc('owner_get_price_book'));return Array.isArray(d)?d[0]:d},
    async savePriceBook(staff,owner,expectedVersion,reason){
      if(!String(reason||'').trim())throw new CloudError('input','Enter a reason for the price change (kept in the audit log).');
      return unwrap(await client.rpc('owner_update_price_book',{p_staff_settings:staff,p_owner_settings:owner,p_expected_version:expectedVersion,p_reason:String(reason).trim()}));
    },
    async priceAudit(limit){return unwrap(await client.rpc('owner_price_book_audit',{p_limit:limit||50}))||[]},
    /* ---------- jobs ---------- */
    async listJobs(opts){
      let q=client.from('jobs').select(JOB_COLS);
      if(!(opts&&opts.includeArchived))q=q.neq('status','archived');
      return unwrap(await q.order('updated_at',{ascending:false}))||[];
    },
    async setJobStatus(id,expectedVersion,status,jobData){
      const allowed=['draft','quoted','issued','archived'];
      if(!allowed.includes(status))throw new CloudError('input','Unknown job status.');
      const patch={status:status};
      if(jobData)patch.job_data=jobData;
      const rows=unwrap(await client.from('jobs').update(patch).eq('id',id).eq('version',expectedVersion).select(JOB_COLS));
      if(!rows||!rows.length)throw new CloudError('conflict','Job was changed elsewhere, or your access changed. Reload jobs before trying again.');
      return rows[0];
    },
    /* List every object in the job-photos folder <jobId>/ and remove those paths
     * through the Storage API. Never delete from storage.objects in SQL:
     * protect_objects_delete rejects that and rolls the job delete back. */
    async removeJobPhotos(jobId){
      const folder=String(jobId||'').replace(/^\/+|\/+$/g,'');
      if(!folder)throw new CloudError('input','Job id is required to remove photos.');
      const paths=[];
      const limit=100;
      for(let offset=0;offset<=10000;offset+=limit){
        const r=await client.storage.from(PHOTO_BUCKET).list(folder,{limit,offset,sortBy:{column:'name',order:'asc'}});
        if(r.error)throw friendly(r.error);
        const rows=r.data||[];
        for(const row of rows){
          if(!row||!row.name||row.name==='.emptyFolderPlaceholder')continue;
          if(row.id==null&&row.metadata==null)continue;
          paths.push(folder+'/'+row.name);
        }
        if(rows.length<limit)break;
      }
      for(let i=0;i<paths.length;i+=100){
        const chunk=paths.slice(i,i+100);
        const r=await client.storage.from(PHOTO_BUCKET).remove(chunk);
        if(r.error)throw friendly(r.error);
      }
      return paths;
    },
    async deleteJobs(ids){
      const list=[];
      for(const id of (Array.isArray(ids)?ids:[])){
        const s=String(id||'');
        if(s&&list.indexOf(s)<0)list.push(s);
      }
      if(!list.length)throw new CloudError('input','Choose at least one job.');
      for(const id of list){
        try{await api.removeJobPhotos(id)}
        catch(err){
          const detail=err&&err.message?err.message:'Storage request failed';
          throw new CloudError(err&&err.code||'error','Photos could not be removed, so the job was not deleted. '+detail,err);
        }
      }
      return unwrap(await client.rpc('owner_delete_jobs',{p_job_ids:list}));
    },
    async staffDirectory(){return unwrap(await client.rpc('staff_directory'))||[]},
    /* Names only. Used when staff_directory is missing. RLS still decides who can read profiles. */
    async listProfileNames(){
      const rows=unwrap(await client.from('profiles').select('id,full_name'))||[];
      return rows.filter(p=>p&&p.id).map(p=>({id:p.id,displayName:String(p.full_name||'').trim()||'Staff'}));
    },
    async insertJob(clientRef,jobData){return unwrap(await client.from('jobs').insert({client_ref:clientRef,job_data:jobData}).select(JOB_COLS).single())},
    async updateJob(id,expectedVersion,jobData){
      const rows=unwrap(await client.from('jobs').update({job_data:jobData}).eq('id',id).eq('version',expectedVersion).select(JOB_COLS));
      if(!rows||!rows.length)throw new CloudError('conflict','Job was changed elsewhere, or your access changed. Reload jobs before saving again.');
      return rows[0];
    },
    async archiveJob(id){return unwrap(await client.from('jobs').update({status:'archived'}).eq('id',id).select('id'))},
    async getJobMarkup(id){const d=unwrap(await client.from('job_owner_pricing').select('markup_pct').eq('job_id',id).maybeSingle());return d?Number(d.markup_pct):null},
    async listJobMarkups(){return unwrap(await client.from('job_owner_pricing').select('job_id,markup_pct'))||[]},
    async setJobMarkup(id,pct){return unwrap(await client.rpc('owner_set_job_markup',{p_job_id:id,p_markup_pct:pct}))},
    /* ---------- server-authoritative quote ---------- */
    async quote(mode,jobId,jobData,extra){
      const body=Object.assign({mode},extra||{});if(jobId)body.job_id=jobId;if(mode==='preview'||mode==='discount-request')body.job_data=jobData;
      const r=await client.functions.invoke(opts.quoteFunction||'quote-job',{body});
      if(r.error){
        let detail=null;try{detail=r.error.context&&typeof r.error.context.json==='function'?await r.error.context.json():null}catch{}
        if(detail&&detail.code==='discount_over_cap')throw new CloudError('discount_over_cap','Discount exceeds the owner-approved adjustment limit.');
        if(detail&&detail.code==='forbidden')throw new CloudError('forbidden','Account is not active staff.');
        if(detail&&detail.code==='conflict'&&/version mismatch/i.test(String(detail.error||'')))throw new CloudError('stale_book',String(detail.error));
        if(detail&&detail.code==='conflict')throw new CloudError('conflict','Job or price book changed — retry.');
        throw friendly(detail&&detail.error?{message:detail.error}:r.error);
      }
      if(!r.data||r.data.ok!==true)throw new CloudError('error',(r.data&&r.data.error)||'Quote failed');
      return r.data;
    },
    /* ---------- customer shares ---------- */
    async createShare(jobId,days){const d=unwrap(await client.rpc('create_estimate_share',{p_job_id:jobId,p_valid_days:days||30}));return Array.isArray(d)?d[0]:d},
    async listShares(jobId){return unwrap(await client.rpc('list_estimate_shares',{p_job_id:jobId}))||[]},
    async revokeShare(shareId){return unwrap(await client.rpc('revoke_estimate_share',{p_share_id:shareId}))},
    async getSharedEstimate(token){return unwrap(await client.rpc('get_shared_estimate',{p_token:token}))},
    /* ---------- staff (owner) ---------- */
    async listStaff(){return unwrap(await client.rpc('owner_list_staff'))||[]},
    async setStaffAccess(userId,role,active,reason){return unwrap(await client.rpc('owner_set_staff_access',{p_user_id:userId,p_role:role,p_active:active,p_reason:reason||''}))},
    /* ---------- discount request inbox (read-only; decisions go through quote()) ---------- */
    async listDiscountRequests(status){return unwrap(await client.rpc('owner_list_discount_requests',{p_status:status||'pending'}))||[]},
    async listMyDiscountRequests(){return unwrap(await client.rpc('staff_list_my_discount_requests'))||[]},
    /* ---------- customer acceptance (anon on the share page; staff list) ---------- */
    async acceptSharedEstimate(token,name,note){return unwrap(await client.rpc('accept_shared_estimate',{p_token:token,p_name:name,p_note:note||''}))},
    async getEstimateAcceptance(token){return unwrap(await client.rpc('get_estimate_acceptance',{p_token:token}))},
    async listAcceptances(){return unwrap(await client.rpc('staff_list_estimate_acceptances'))||[]},
    /* ---------- job photos: private Storage bucket, path <job uuid>/<photo id>.jpg ---------- */
    photoPath(jobId,photoId){return String(jobId)+'/'+String(photoId||'').replace(/[^A-Za-z0-9_-]/g,'')+'.jpg'},
    async uploadPhoto(jobId,photoId,blob){
      const path=api.photoPath(jobId,photoId);
      const r=await client.storage.from(PHOTO_BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:true});
      if(r.error)throw friendly(r.error);
      return path;
    },
    async signedPhotoUrl(path,seconds){
      const r=await client.storage.from(PHOTO_BUCKET).createSignedUrl(path,seconds||3600);
      if(r.error)throw friendly(r.error);
      return r.data.signedUrl;
    },
    async deletePhoto(path){const r=await client.storage.from(PHOTO_BUCKET).remove([path]);if(r.error)throw friendly(r.error);return true}
  };
  return api;
}
function shareUrl(base,token){
  const u=String(base||'').replace(/[#?].*$/,'').replace(/[^/]*$/,'')+'estimate.html';
  return u+'#t='+encodeURIComponent(token);
}
/** One reload and one re-price when quote-job reports a stale price book. A second mismatch is returned to the caller. */
async function quoteWithPriceBookReload(quote,reload){
  try{
    return await quote();
  }catch(err){
    if(!err||err.code!=='stale_book')throw err;
    await reload();
    return await quote();
  }
}
return{create,CloudError,friendly,shareUrl,quoteWithPriceBookReload,JOB_COLS,PHOTO_BUCKET};
});
