'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

const root=path.join(__dirname,'..');
const migDir=path.join(root,'supabase/migrations');
const files=fs.readdirSync(migDir).filter(f=>f.endsWith('.sql')).sort();

// Versions recorded in the live project's migration history on 2026-11-12.
const LIVE=['20261110011912','20261110012040','20261110014129','20261110085927','20261111225042','20261111225059',
  '20261111225105','20261111225110','20261112034714','20261112074520','20261112074535','20261112074537','20261112080433'];
const OLD=['20261110120000','20261110143000','20261110160000','20261111090000','20261111090100','20261111090200',
  '20261111090300','20261112053000','20261112110000','20261112113000','20261112120000','20261112143000'];

check('migration files are named <14-digit version>_<name>.sql',()=>{
  for(const f of files) assert.ok(/^\d{14}_[a-z0-9_]+\.sql$/.test(f),f);
});
check('migration versions are unique',()=>{
  const v=files.map(f=>f.slice(0,14));
  assert.strictEqual(new Set(v).size,v.length);
});
check('every live history version has a file',()=>{
  const v=new Set(files.map(f=>f.slice(0,14)));
  for(const x of LIVE) assert.ok(v.has(x),'missing '+x);
});
check('old pre-rename versions are gone',()=>{
  const v=new Set(files.map(f=>f.slice(0,14)));
  for(const x of OLD) assert.ok(!v.has(x),'old version still present '+x);
});
check('baseline is reference only and outside migrations',()=>{
  assert.ok(!files.some(f=>/baseline/i.test(f)),'baseline must not be in supabase/migrations');
  const s=fs.readFileSync(path.join(root,'supabase/baseline/schema.sql'),'utf8');
  assert.ok(s.startsWith('-- REFERENCE ONLY. NOT A MIGRATION.'));
  assert.ok(!/\binsert\s+into\s+public\.price_book(_owner)?\b/i.test(s),'no price book seed');
  assert.ok(!/\bcopy\s+\S+\s+from\b/i.test(s),'no data copy');
});
check('baseline has no secrets, emails or ids',()=>{
  const s=fs.readFileSync(path.join(root,'supabase/baseline/schema.sql'),'utf8');
  assert.ok(!/sb_secret_|sb_publishable_|eyJ[A-Za-z0-9_-]{20,}/.test(s),'key-like text');
  assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(s),'email address');
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(s),'uuid literal');
});

if(failed){console.error(failed+' failed');process.exit(1);}
