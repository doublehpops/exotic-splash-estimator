'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

const dir=path.join(__dirname,'..','supabase/migrations');
function sql(name){return fs.readFileSync(path.join(dir,name),'utf8');}
function fillsNull(text,accessor,literal){
  const cond="coalesce(jsonb_typeof("+accessor+"),'null') = 'null'";
  const at=text.indexOf(cond);
  assert.ok(at>=0,cond);
  assert.ok(text.slice(at,at+500).includes("'"+literal+"'::jsonb"),accessor);
  assert.ok(!text.includes(accessor+' is null'),accessor+' still uses is null');
}
function clone(v){return JSON.parse(JSON.stringify(v));}
function stable(v){
  if(Array.isArray(v))return v.map(stable);
  if(v&&typeof v==='object'){
    const o={};
    for(const k of Object.keys(v).sort())o[k]=stable(v[k]);
    return o;
  }
  return v;
}
function same(a,b){return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
/* Missing key and JSON null are both unset. A stored number, including 0, is kept. */
function unset(row,key){return !row||typeof row!=='object'||!Object.prototype.hasOwnProperty.call(row,key)||row[key]===null;}
function commit(book,next){
  if(same(book.staff_settings,next))return;
  book.staff_settings=next;
  book.version+=1;
}

function applyFloor(book){
  const text=sql('20261112180000_mid_solid_floor_band.sql');
  fillsNull(text,"v_floor->'min'",'2750');
  fillsNull(text,"v_floor->'maxSqft'",'500');
  assert.ok(text.includes("coalesce(jsonb_typeof(v_band->'min'),'null') = 'null'"));
  assert.ok(text.includes("coalesce(jsonb_typeof(v_band->'amount'),'null') = 'null'"));
  const staff=clone(book.staff_settings||{});
  staff.rates=obj(staff.rates);
  const floor=obj(staff.rates.smallSolidFloor);
  if(unset(floor,'min'))floor.min=2750;
  let removed=false;
  if(Array.isArray(floor.bands)){
    const kept=[];
    for(const band of floor.bands){
      const source=band&&band.source!=null?String(band.source):'';
      const system=band&&band.system!=null?String(band.system):'solid';
      const sizeRaw=band&&(band.size!=null?band.size:band.packageSize);
      const size=sizeRaw!=null?String(sizeRaw):'2';
      const minSqft=band&&band.minSqft!=null?String(band.minSqft):'';
      const maxSqft=band&&band.maxSqft!=null?String(band.maxSqft):'';
      if(['package','garagePackage'].includes(source)&&system==='solid'&&['2','2car','twoCar'].includes(size)&&unset(band,'min')&&unset(band,'amount')&&minSqft==='400'&&maxSqft==='500'){
        removed=true;
        continue;
      }
      kept.push(band);
    }
    floor.bands=kept;
  }
  if(unset(floor,'maxSqft')||(removed&&String(floor.maxSqft)==='400'))floor.maxSqft=500;
  staff.rates.smallSolidFloor=floor;
  commit(book,staff);
}
function applyPoly(book){
  const text=sql('20261112181500_polyaspartic_topcoat_rate.sql');
  fillsNull(text,"v_top->'premium'",'1.00');
  const staff=clone(book.staff_settings||{});
  staff.catalog=obj(staff.catalog);
  staff.catalog.garage=obj(staff.catalog.garage);
  staff.catalog.garage.topcoatAdj=obj(staff.catalog.garage.topcoatAdj);
  const top=staff.catalog.garage.topcoatAdj;
  if(unset(top,'premium'))top.premium=1;
  commit(book,staff);
}
function applyColors(book){
  const text=sql('20261112183000_multi_color_rates.sql');
  fillsNull(text,"v_color->'metallicPerSqft'",'1.50');
  fillsNull(text,"v_color->'customFlakePerSqft'",'1.00');
  const staff=clone(book.staff_settings||{});
  staff.extras=obj(staff.extras);
  staff.extras.multiColor=obj(staff.extras.multiColor);
  const color=staff.extras.multiColor;
  if(unset(color,'metallicPerSqft'))color.metallicPerSqft=1.5;
  if(unset(color,'customFlakePerSqft'))color.customFlakePerSqft=1;
  commit(book,staff);
}
function applyAll(book){applyFloor(book);applyPoly(book);applyColors(book);}

/* Live shape: the polyaspartic key is present and holds JSON null. */
function liveBook(){
  return {version:11,staff_settings:{
    rates:{smallSolidFloor:{maxSqft:500,min:2750}},
    catalog:{garage:{topcoatAdj:{protective:0,none:0,premium:null}}},
    extras:{multiColor:{metallicPerSqft:null,customFlakePerSqft:null}}
  }};
}

check('a JSON null polyaspartic rate becomes 1.00 and the two color rates fill, v11 to v13',()=>{
  const book=liveBook();
  applyFloor(book);
  assert.strictEqual(book.version,11);
  assert.strictEqual(book.staff_settings.catalog.garage.topcoatAdj.premium,null);
  applyPoly(book);
  assert.strictEqual(book.version,12);
  assert.strictEqual(book.staff_settings.catalog.garage.topcoatAdj.premium,1);
  applyColors(book);
  assert.strictEqual(book.version,13);
  assert.strictEqual(book.staff_settings.extras.multiColor.metallicPerSqft,1.5);
  assert.strictEqual(book.staff_settings.extras.multiColor.customFlakePerSqft,1);
  applyAll(book);
  assert.strictEqual(book.version,13);
  assert.strictEqual(book.staff_settings.catalog.garage.topcoatAdj.premium,1);
});

check('missing keys fill once, and a saved rate is kept without a bump',()=>{
  const missing={version:11,staff_settings:{rates:{smallSolidFloor:{maxSqft:500,min:2750}},catalog:{garage:{topcoatAdj:{}}},extras:{}}};
  applyAll(missing);
  assert.strictEqual(missing.version,13);
  assert.strictEqual(missing.staff_settings.catalog.garage.topcoatAdj.premium,1);
  assert.strictEqual(missing.staff_settings.extras.multiColor.metallicPerSqft,1.5);
  assert.strictEqual(missing.staff_settings.extras.multiColor.customFlakePerSqft,1);
  const saved={version:11,staff_settings:{
    rates:{smallSolidFloor:{maxSqft:500,min:2750}},
    catalog:{garage:{topcoatAdj:{premium:2}}},
    extras:{multiColor:{metallicPerSqft:1.5,customFlakePerSqft:1}}
  }};
  applyAll(saved);
  assert.strictEqual(saved.version,11);
  assert.strictEqual(saved.staff_settings.catalog.garage.topcoatAdj.premium,2);
});

check('a JSON null small-solid minimum is filled, and the live ceiling is a no-op',()=>{
  const blank={version:11,staff_settings:{rates:{smallSolidFloor:{min:null,maxSqft:null}}}};
  applyFloor(blank);
  assert.strictEqual(blank.version,12);
  assert.strictEqual(blank.staff_settings.rates.smallSolidFloor.min,2750);
  assert.strictEqual(blank.staff_settings.rates.smallSolidFloor.maxSqft,500);
  const live=liveBook();
  applyFloor(live);
  assert.strictEqual(live.version,11);
});

if(failed){console.error(failed+' failed');process.exit(1)}
console.log('all json-null rate checks passed');
