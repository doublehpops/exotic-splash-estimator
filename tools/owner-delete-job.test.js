'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const sql=read('supabase/migrations/20261112160000_jobs_board.sql');
const cloud=read('js/es-cloud.js');
const app=read('js/guided-app.js');
const gate=read('js/es-gate.js');

function sliceBetween(text,start,end){
  const a=text.indexOf(start);
  const b=text.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,start+' .. '+end);
  return text.slice(a,b);
}

check('migration is present, unapplied, and owner-only before any delete',()=>{
  assert.ok(sql.includes('Not applied by the pull request that adds this file'));
  assert.ok(/security definer/i.test(sql));
  assert.ok(sql.includes("set search_path = ''"));
  const ownerAt=sql.indexOf('if not private.is_owner()');
  const deleteAt=sql.search(/\bdelete\s+from\b/i);
  assert.ok(ownerAt>0&&deleteAt>ownerAt);
  assert.ok(sql.includes("raise exception 'Only the owner can delete jobs'"));
  assert.ok(!/grant execute on function public\.owner_delete_jobs\(uuid\[\]\) to anon/i.test(sql));
  assert.ok(sql.includes('revoke all on function public.owner_delete_jobs(uuid[]) from public, anon, service_role'));
  assert.ok(sql.includes('grant execute on function public.owner_delete_jobs(uuid[]) to authenticated'));
});

check('hard delete removes non-cascaded approvals and linkable acceptances',()=>{
  assert.ok(sql.includes('delete from public.discount_approvals d where d.estimate_id = v_id'));
  assert.ok(sql.includes('delete from public.estimate_acceptances a where a.estimate_number = v_number'));
  assert.ok(sql.includes('if v_one = 1 then'));
  assert.ok(sql.includes('delete from public.jobs j where j.id = v_id'));
  assert.ok(sql.includes('public.owner_delete_jobs(p_job_ids uuid[])'));
  assert.ok(!/delete\s+from\s+storage\.objects/i.test(sql));
});

function stripSqlComments(text){
  return text.replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\n]*/g,'');
}

check('no migration function deletes from storage.objects',()=>{
  const dir=path.join(root,'supabase/migrations');
  const names=fs.readdirSync(dir).filter(name=>name.endsWith('.sql'));
  assert.ok(names.length>0);
  for(const name of names){
    const body=stripSqlComments(fs.readFileSync(path.join(dir,name),'utf8'));
    assert.ok(!/delete\s+from\s+storage\.objects/i.test(body),name+' deletes from storage.objects');
  }
});

check('directory and crew list stay free of emails and owner costs',()=>{
  const directory=sliceBetween(sql,'create or replace function public.staff_directory()','create or replace function public.owner_delete_jobs');
  assert.ok(directory.includes('private.is_active_staff()'));
  assert.ok(directory.includes("'displayName'"));
  assert.ok(!/email/i.test(directory));
  assert.ok(!/markup|margin|profit|owner_settings|cost/i.test(directory));
  assert.ok(sql.indexOf("'{business}'")<sql.indexOf("'{business,crews}'"));
  assert.ok(sql.includes("jsonb_set(v_staff, '{business}', v_business, true)"));
  assert.ok(sql.includes("jsonb_set(v_staff, '{business,crews}', '[]'::jsonb, true)"));
  assert.ok(sql.includes('jsonb_typeof(v_staff #> \'{business,crews}\') is distinct from \'array\''));
  assert.ok(sql.includes("set_config('es.price_book_version_assigned', 'on', true)"));
  assert.ok(!/markup|margin|profit/i.test(sql));
});

check('client calls the owner RPC and can include archived rows',()=>{
  assert.ok(cloud.includes("client.rpc('owner_delete_jobs',{p_job_ids:list})"));
  assert.ok(cloud.includes('removeJobPhotos'));
  assert.ok(cloud.includes("client.rpc('staff_directory')"));
  assert.ok(cloud.includes('includeArchived'));
  assert.ok(cloud.includes(".neq('status','archived')"));
  assert.ok(gate.includes('includeArchived:true'));
  assert.ok(gate.includes('Only the owner can delete jobs.'));
  assert.ok(gate.includes('Only the owner can archive or un-archive jobs.'));
});

check('jobs updated_at index is if-not-exists and unapplied',()=>{
  const idx=read('supabase/migrations/20261112170000_jobs_updated_at_id_desc_idx.sql');
  assert.ok(idx.includes('Not applied by the pull request that adds this file'));
  assert.ok(idx.includes('Live schema_migrations version this file should map to: 20261112170000'));
  assert.ok(/create index if not exists jobs_updated_at_id_desc_idx/i.test(idx));
  assert.ok(/on public\.jobs \(updated_at desc, id desc\)/i.test(idx));
  assert.ok(!/\bdrop\s+index\b/i.test(idx));
  assert.ok(!/\bdelete\s+from\b/i.test(idx));
  assert.ok(!read('supabase/migrations/20261112160000_jobs_board.sql').includes('jobs_updated_at_id_desc_idx'));
});

check('job cards hide delete and archive unless the viewer is the owner',()=>{
  const board=sliceBetween(app,'/* JOB_BOARD_START */','/* JOB_BOARD_END */');
  assert.ok(board.includes('data-job-delete'));
  assert.ok(board.includes('data-job-archive'));
  assert.ok(board.includes('isOwner()'));
  assert.ok(board.includes('owner?`'));
  assert.ok(!/margin|markup|profit/i.test(board));
  assert.ok(board.includes('Customer total'));
  assert.ok(app.includes("if(!isOwner()){toast('Only the owner can delete jobs.');return true}"));
  assert.ok(app.includes("if(!isOwner()){toast('Only the owner can archive or un-archive jobs.');return true}"));
  assert.ok(app.includes('settings.business.crews'));
  assert.ok(app.includes('assignedCrew'));
});

function mockClient(hooks){
  const calls=[];
  const storage={
    list:async(folder,opts)=>{calls.push({op:'list',folder,opts});return hooks.list?hooks.list(folder,opts):{data:[],error:null}},
    remove:async(paths)=>{calls.push({op:'remove',paths});return hooks.remove?hooks.remove(paths):{data:paths,error:null}}
  };
  return {
    calls,
    client:{
      auth:{},
      storage:{from(bucket){calls.push({op:'bucket',bucket});return storage}},
      rpc:async(name,args)=>{calls.push({op:'rpc',name,args});if(hooks.rpc)return hooks.rpc(name,args);return {data:{ok:true},error:null}}
    }
  };
}

async function checkAsync(name,fn){try{await fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

(async()=>{
  const Cloud=require('../js/es-cloud');
  const jobId='11111111-1111-4111-8111-111111111111';
  await checkAsync('photos are removed with the Storage API before the delete RPC',async()=>{
    const mock=mockClient({
      list:async()=>({data:[{name:'p.jpg',id:'obj-1',metadata:{size:10}},{name:'.emptyFolderPlaceholder',id:null,metadata:null}],error:null})
    });
    const api=Cloud.create(mock.client);
    const result=await api.deleteJobs([jobId,jobId]);
    assert.strictEqual(result.ok,true);
    const ops=mock.calls.map(c=>c.op);
    assert.deepStrictEqual(ops,['bucket','list','bucket','remove','rpc']);
    assert.ok(ops.indexOf('remove')<ops.indexOf('rpc'));
    const removed=mock.calls.find(c=>c.op==='remove');
    assert.deepStrictEqual(removed.paths,[jobId+'/p.jpg']);
    const rpc=mock.calls.find(c=>c.op==='rpc');
    assert.strictEqual(rpc.name,'owner_delete_jobs');
    assert.deepStrictEqual(rpc.args.p_job_ids,[jobId]);
  });
  await checkAsync('a photo removal failure does not call the delete RPC',async()=>{
    const mock=mockClient({
      list:async()=>({data:[{name:'p.jpg',id:'obj-1',metadata:{size:4}}],error:null}),
      remove:async()=>({data:null,error:{message:'storage down'}})
    });
    const api=Cloud.create(mock.client);
    await assert.rejects(()=>api.deleteJobs([jobId]),err=>err&&/not deleted/i.test(err.message));
    assert.ok(mock.calls.some(c=>c.op==='remove'));
    assert.ok(!mock.calls.some(c=>c.op==='rpc'));
  });
  await checkAsync('a photo list failure does not call the delete RPC',async()=>{
    const mock=mockClient({list:async()=>({data:null,error:{message:'list failed'}})});
    const api=Cloud.create(mock.client);
    await assert.rejects(()=>api.deleteJobs([jobId]),err=>err&&/not deleted/i.test(err.message));
    assert.ok(!mock.calls.some(c=>c.op==='remove'));
    assert.ok(!mock.calls.some(c=>c.op==='rpc'));
  });
  if(failed){console.error(failed+' failed');process.exit(1)}
  console.log('owner-delete-job tests passed');
})();
