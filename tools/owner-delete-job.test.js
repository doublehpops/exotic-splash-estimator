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

check('hard delete removes non-cascaded approvals, photos, and linkable acceptances',()=>{
  assert.ok(sql.includes('delete from public.discount_approvals d where d.estimate_id = v_id'));
  assert.ok(sql.includes("o.bucket_id = 'job-photos'"));
  assert.ok(sql.includes("o.name like v_id::text || '/%'"));
  assert.ok(sql.includes('delete from public.estimate_acceptances a where a.estimate_number = v_number'));
  assert.ok(sql.includes('if v_one = 1 then'));
  assert.ok(sql.includes('delete from public.jobs j where j.id = v_id'));
  assert.ok(sql.includes('public.owner_delete_jobs(p_job_ids uuid[])'));
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
  assert.ok(cloud.includes("client.rpc('owner_delete_jobs',{p_job_ids:ids})"));
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

if(failed){console.error(failed+' failed');process.exit(1)}
console.log('owner-delete-job tests passed');
