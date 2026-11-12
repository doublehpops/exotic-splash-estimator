'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');
const V=require('../js/es-estimate-view');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}
async function checkAsync(name,fn){try{await fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

const RATES={opt1:5,opt2:6,regular:7};
const PKG={opt1:3500,opt2:3800,regular:4450};
const SIZES=[['1car',250],['2car',450],['3car',650]];
const STYLES=['solid','flake','metallic'];
const TIERS=['opt1','opt2','regular'];
const TABLE={
  opt1:{solid:[2600,3500,4400],flake:[3100,4400,5750],metallic:[3500,5200,6850]},
  opt2:{solid:[2850,3800,4800],flake:[3500,4950,6450],metallic:[4150,6150,8100]},
  regular:{solid:[3300,4450,5600],flake:[3900,5500,7200],metallic:[4750,7100,9350]}
};
const COST_KEYS=/^(cost|profit|margin|markup|markupPct|grossProfit|grossMargin|operatingProfit|operatingMargin|unitPrice|contingency|overhead|overheadBase|mat|tax|payRate|wage|laborRate)$/;

function floor(sqft,style,tier){
  const j=E.newJob();
  j.customer='Synthetic';j.tax=0;j.miles=0;j.minutes=0;j.discount=0;
  j.priceOption=tier||'regular';
  j.areas[0].sqft=sqft;j.areas[0].style=style||'solid';j.areas[0].coats=1;j.areas[0].flake='light';
  j.areas[0].level=false;j.areas[0].moisture=false;j.areas[0].grip=false;
  return j;
}
function garage(pkg,style,tier,sqft){
  const j=E.newJob();
  Object.assign(j,{customer:'Pat',projectType:'garage',garagePackage:pkg,garageStyle:style,garageTopcoat:'protective',garageCondition:'good',priceOption:tier||'regular',miles:0,minutes:0,tax:0});
  if(sqft)j.areas[0].sqft=sqft;
  return j;
}
function expectedSolid(sqft,tier){
  const rate=sqft*RATES[tier];
  let floorMin=0;
  if(sqft<400)floorMin=2750;
  else if(sqft<500)floorMin=PKG[tier];
  return Math.max(rate,floorMin,2000);
}
function badKeys(value,at,hits){
  if(Array.isArray(value)){value.forEach((v,i)=>badKeys(v,at+'['+i+']',hits));return;}
  if(!value||typeof value!=='object')return;
  for(const k of Object.keys(value)){
    if(COST_KEYS.test(k))hits.push(at+'.'+k);
    badKeys(value[k],at+'.'+k,hits);
  }
}

check('399, 400, 450, 499, and 500 sq ft solid floors follow the band in every tier',()=>{
  for(const tier of TIERS){
    for(const sqft of [399,400,450,499,500]){
      const j=floor(sqft,'solid',tier);
      const x=E.calculate(j,E.defaults);
      const want=expectedSolid(sqft,tier);
      assert.strictEqual(x.total,want,tier+' '+sqft);
      assert.strictEqual(x.choices.opt1.total,expectedSolid(sqft,'opt1'),tier+' choice opt1 '+sqft);
      assert.strictEqual(x.choices.opt2.total,expectedSolid(sqft,'opt2'),tier+' choice opt2 '+sqft);
      assert.strictEqual(x.choices.regular.total,expectedSolid(sqft,'regular'),tier+' choice regular '+sqft);
      const rate=sqft*RATES[tier];
      if(want>rate+0.001){
        assert.strictEqual(x.minimumLabel,'Small solid floor minimum',tier+' '+sqft);
        assert.ok(!/\d|2-car|twoCar|package/i.test(x.minimumLabel),tier+' '+sqft);
      }else{
        assert.strictEqual(x.minimum,0,tier+' '+sqft);
        assert.strictEqual(x.minimumLabel,'',tier+' '+sqft);
      }
    }
    assert.strictEqual(E.calculate(floor(450,'flake',tier),E.defaults).total,450*(tier==='opt1'?8:tier==='opt2'?9:10));
  }
  const j=floor(450,'solid','opt1');
  const x=E.calculate(j,E.defaults);
  const doc=Q.customerSnapshot(E,j,x,E.defaults);
  const staff=Q.staffSnapshotSafe(E,j,x,E.defaults);
  assert.strictEqual(doc.totals.total,3500);
  assert.strictEqual(doc.totals.minimumLabel,'Small solid floor minimum');
  assert.ok(!doc.lines.some(l=>/2-car|twoCar|package price/i.test(String(l.label)+String(l.description))));
  const html=V.render({estimate:doc});
  assert.strictEqual((html.match(/Small solid floor minimum/g)||[]).length,1);
  assert.ok(!/2-car|twoCar|package price/i.test(html));
  const hits=[];
  badKeys({doc,staff},'snap',hits);
  assert.deepStrictEqual(hits,[]);
});

check('the mid band amount and its package source are configurable',()=>{
  const book=JSON.parse(JSON.stringify(E.defaults));
  book.rates.smallSolidFloor.bands[0].min=4100;
  assert.strictEqual(E.calculate(floor(450,'solid','regular'),book).total,4100);
  assert.strictEqual(E.calculate(floor(400,'solid','opt1'),book).total,4100);
  assert.strictEqual(E.calculate(floor(399,'solid','opt1'),book).total,2750);
  delete book.rates.smallSolidFloor.bands[0].min;
  book.garage.packages.opt2.solid.twoCar=3900;
  assert.strictEqual(E.calculate(floor(450,'solid','opt2'),book).total,3900);
  const aliased=Q.buildSettings(E,{garage:{packages:{opt1:{solid:{'2':3600}}}}},{});
  assert.strictEqual(E.calculate(floor(420,'solid','opt1'),aliased).total,3600);
  const canonical=Q.buildSettings(E,{garage:{packages:{opt1:{solid:{twoCar:3400,'2':3600}}}}},{});
  assert.strictEqual(E.calculate(floor(450,'solid','opt1'),canonical).total,3400);
  assert.strictEqual(canonical.garage.packages.opt1.solid.twoCar,3400);
  const legacy=JSON.parse(JSON.stringify(E.defaults));
  legacy.rates.smallSolidFloor={maxSqft:500,min:3000};
  assert.strictEqual(E.calculate(floor(450,'solid','opt1'),legacy).total,3000);
  const unmigrated=Q.buildSettings(E,{rates:{smallSolidFloor:{maxSqft:500,min:2750}}},{});
  assert.ok(Array.isArray(unmigrated.rates.smallSolidFloor.bands)&&unmigrated.rates.smallSolidFloor.bands.length>0);
  assert.strictEqual(E.calculate(floor(399,'solid','opt1'),unmigrated).total,2750);
  assert.strictEqual(E.calculate(floor(400,'solid','opt1'),unmigrated).total,3500);
  assert.strictEqual(E.calculate(floor(500,'solid','opt1'),unmigrated).total,2500);
});

check('garage package selling prices stay put and owner margins are not 100 percent',()=>{
  assert.strictEqual(SIZES.length*STYLES.length*TIERS.length,27);
  for(const [pkg,idx] of SIZES.map((row,i)=>[row[0],i])){
    for(const style of STYLES){
      for(const tier of TIERS){
        const job=garage(pkg,style,tier);
        const x=E.calculate(job,E.defaults);
        const listed=TABLE[tier][style][idx];
        const selling=(style==='solid'&&pkg==='1car'&&tier==='opt1')?2750:listed;
        const sf=pkg==='1car'?250:pkg==='2car'?450:650;
        const same=E.calculate(floor(sf,style,'regular'),E.defaults);
        assert.strictEqual(x.quoteReady,true,pkg+' '+style+' '+tier);
        assert.strictEqual(x.lines.find(l=>l.kind==='starting').total,listed,pkg+' '+style+' '+tier);
        assert.strictEqual(x.total,selling,pkg+' '+style+' '+tier+' selling');
        assert.ok(x.cost>0,pkg+' '+style+' '+tier+' cost');
        assert.ok(Math.abs(x.cost-same.cost)<0.02,pkg+' '+style+' '+tier+' cost model');
        assert.ok(Math.abs(x.mat-same.mat)<0.02);
        assert.ok(Math.abs(x.labor-same.labor)<0.02);
        assert.ok(Math.abs(x.overheadBase-same.overheadBase)<0.02);
        assert.ok(Math.abs(x.contingency-same.contingency)<0.02);
        assert.ok(x.margin<99.9&&x.grossMargin<99.9&&x.operatingMargin<99.9,pkg+' '+style+' '+tier);
        assert.notStrictEqual(Math.round(x.margin),100);
        assert.notStrictEqual(Math.round(x.grossMargin),100);
        assert.notStrictEqual(Math.round(x.operatingMargin),100);
        const staff=Q.staffSnapshotSafe(E,job,x,E.defaults);
        const customer=Q.customerSnapshotSafe(E,job,x,E.defaults);
        const hits=[];
        badKeys({staff,customer},'snap',hits);
        assert.deepStrictEqual(hits,[],pkg+' '+style+' '+tier+' snapshot');
        assert.ok(!(staff.material||[]).some(m=>Object.prototype.hasOwnProperty.call(m,'unitPrice')||Object.prototype.hasOwnProperty.call(m,'total')));
        assert.ok(!(staff.hours||[]).some(h=>Object.prototype.hasOwnProperty.call(h,'unitPrice')||Object.prototype.hasOwnProperty.call(h,'total')));
        assert.ok(!staff.warnings.some(w=>/margin|profit|cost/i.test(w)));
      }
    }
  }
  const over=garage('2car','flake','regular',500);
  const overX=E.calculate(over,E.defaults);
  const overFloor=E.calculate(floor(500,'flake','regular'),E.defaults);
  assert.strictEqual(overX.total,6000);
  assert.ok(Math.abs(overX.cost-overFloor.cost)<0.02);
  const short=garage('2car','metallic','opt1',200);
  const shortX=E.calculate(short,E.defaults);
  const full=E.calculate(floor(450,'metallic','regular'),E.defaults);
  assert.strictEqual(shortX.total,5200);
  assert.ok(Math.abs(shortX.cost-full.cost)<0.02);
});

check('mid solid floor migration creates parent objects and is not a destructive apply',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase/migrations/20261112180000_mid_solid_floor_band.sql'),'utf8');
  assert.ok(sql.includes('Not applied'));
  assert.ok(!/\bdelete\s+from\b/i.test(sql));
  assert.ok(!/\bdrop\s+table\b/i.test(sql));
  assert.ok(!/\btruncate\b/i.test(sql));
  assert.ok(sql.indexOf("'{rates}'")<sql.indexOf("'{rates,smallSolidFloor}'"));
  assert.ok(sql.indexOf("'{rates,smallSolidFloor}'")<sql.indexOf("'{rates,smallSolidFloor,min}'"));
  assert.ok(sql.indexOf("'{rates,smallSolidFloor}'")<sql.indexOf("'{rates,smallSolidFloor,maxSqft}'"));
  assert.ok(sql.indexOf("'{rates,smallSolidFloor}'")<sql.indexOf("'{rates,smallSolidFloor,bands}'"));
  assert.ok(sql.includes("set_config('es.price_book_version_assigned', 'on', true)"));
  assert.ok(sql.includes('version = version + 1'));
  assert.ok(sql.includes('where id = 1'));
  assert.ok(sql.includes("'source', 'package'"));
  assert.ok(sql.includes("'size', '2'"));
  assert.ok(!/3500|3800|4450/.test(sql));
});

function deps(profile){
  return {
    getProfile:async()=>profile,
    getJob:async()=>null,
    getPriceBook:async()=>({version:1,staff_settings:{},owner_settings:{}}),
    getJobMarkup:async()=>null,
    recordQuote:async()=>'quote-test'
  };
}

(async()=>{
  await checkAsync('employee package quote has no owner cost and the owner preview does',async()=>{
    const job={customer:'Pat',projectType:'garage',garagePackage:'2car',garageStyle:'flake',garageTopcoat:'protective',garageCondition:'good',priceOption:'regular',miles:0,minutes:0,tax:0,areas:[{id:'a',name:'Floor',sqft:0,style:'flake'}]};
    const employee=await Q.handleQuoteRequest({mode:'preview',job_data:job},deps({active:true,role:'employee',id:'e'}),E);
    assert.strictEqual(employee.status,200);
    assert.strictEqual(employee.body.internal,undefined);
    assert.strictEqual(employee.body.staff.total,5500);
    const hits=[];
    badKeys(employee.body,'body',hits);
    assert.deepStrictEqual(hits,[]);
    const owner=await Q.handleQuoteRequest({mode:'preview',job_data:job},deps({active:true,role:'owner',id:'o'}),E);
    assert.strictEqual(owner.status,200);
    assert.ok(owner.body.internal.cost>0);
    assert.ok(owner.body.internal.margin<99.9);
    assert.ok(owner.body.internal.grossMargin<99.9);
    assert.ok(owner.body.internal.operatingMargin<99.9);
    assert.strictEqual(owner.body.staff.total,5500);
    const staffHits=[];
    badKeys(owner.body.staff,'staff',staffHits);
    assert.deepStrictEqual(staffHits,[]);
  });
  if(failed){console.error(failed+' failed');process.exit(1)}
  console.log('all mid-floor and package-cost checks passed');
})();
