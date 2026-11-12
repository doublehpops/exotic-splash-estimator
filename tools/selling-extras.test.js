'use strict';
const assert=require('assert');
const E=require('../js/epoxy-engine');
const Q=require('../js/quote-core');
const V=require('../js/es-estimate-view');

let failed=0;
function check(name,fn){try{fn();console.log('ok',name);}catch(e){failed++;console.error('FAIL',name,e&&e.stack||e);}}

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
function line(x,label){return (x.lines||[]).find(l=>l.label===label);}
const TABLE={
  opt1:{solid:[2600,3500,4400],flake:[3100,4400,5750],metallic:[3500,5200,6850]},
  opt2:{solid:[2850,3800,4800],flake:[3500,4950,6450],metallic:[4150,6150,8100]},
  regular:{solid:[3300,4450,5600],flake:[3900,5500,7200],metallic:[4750,7100,9350]}
};
const SIZES=[['1car',0],['2car',1],['3car',2]];

check('small solid floor is per job and applies in every tier under 400 sq ft',()=>{
  const pkg={opt1:3500,opt2:3800,regular:4450};
  for(const tier of ['opt1','opt2','regular']){
    const small=E.calculate(floor(250,'solid',tier),E.defaults);
    assert.strictEqual(small.total,2750,tier+' 250');
    assert.strictEqual(small.minimumLabel,'Small solid floor minimum');
    const mid=E.calculate(floor(450,'solid',tier),E.defaults);
    const raw=450*(tier==='opt1'?5:tier==='opt2'?6:7);
    assert.strictEqual(mid.total,Math.max(raw,pkg[tier]),tier+' 450');
    assert.strictEqual(mid.minimumLabel,'Small solid floor minimum');
  }
  assert.strictEqual(E.calculate(floor(450,'solid','regular'),E.defaults).total,4450);
  assert.strictEqual(E.calculate(floor(499,'solid','opt1'),E.defaults).total,3500);
  assert.strictEqual(E.calculate(floor(500,'solid','opt1'),E.defaults).total,2500);
  assert.strictEqual(E.calculate(floor(250,'flake','opt1'),E.defaults).total,2000);
  const parts=floor(0,'solid','opt1');
  parts.areas=[{...E.newArea(),sqft:200,style:'solid',coats:1},{...E.newArea(),sqft:200,style:'solid',coats:1}];
  const both=E.calculate(parts,E.defaults);
  assert.strictEqual(E.solidSystemSqft(parts,E.defaults),400);
  assert.strictEqual(both.total,3500);
  parts.areas[1].sqft=300;parts.areas[0].sqft=300;
  assert.strictEqual(E.calculate(parts,E.defaults).total,3000);
  const book=JSON.parse(JSON.stringify(E.defaults));
  book.rates.smallSolidFloor={maxSqft:200,min:9000};
  assert.strictEqual(E.calculate(floor(250,'solid','opt1'),book).total,2000);
  book.rates.smallSolidFloor={maxSqft:500,min:3000};
  assert.strictEqual(E.calculate(floor(450,'solid','opt1'),book).total,3000);
});

check('garage package table prices every tier, system, and size',()=>{
  for(const [pkg,idx] of SIZES){
    for(const style of ['solid','flake','metallic']){
      for(const tier of ['opt1','opt2','regular']){
        const x=E.calculate(garage(pkg,style,tier),E.defaults);
        const listed=TABLE[tier][style][idx];
        const total=(style==='solid'&&pkg==='1car'&&tier==='opt1')?2750:listed;
        assert.strictEqual(x.quoteReady,true,pkg+' '+style+' '+tier);
        assert.strictEqual(x.lines.find(l=>l.kind==='starting').total,listed,pkg+' '+style+' '+tier);
        assert.strictEqual(x.total,total,pkg+' '+style+' '+tier+' total');
        assert.ok(!x.lines.some(l=>l.total<0),pkg+' '+style+' '+tier+' credit');
      }
    }
  }
  const over=E.calculate(garage('2car','metallic','opt1',500),E.defaults);
  assert.strictEqual(over.lines.find(l=>l.kind==='overflow').qty,50);
  assert.strictEqual(over.lines.find(l=>l.kind==='overflow').rate,11);
  assert.strictEqual(over.total,5200+550);
  const solidOver=E.calculate(garage('3car','solid','regular',800),E.defaults);
  assert.strictEqual(solidOver.lines.find(l=>l.kind==='overflow').rate,7);
  assert.strictEqual(solidOver.total,5600+150*7);
});

check('without the package table the flake base and solid credit still apply',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.garage.packages=null;
  const j=garage('2car','solid','opt1');
  const x=E.calculate(j,s);
  assert.strictEqual(x.lines.find(l=>l.kind==='starting').total,3600);
  assert.strictEqual(x.lines.find(l=>/solid/.test(l.label)).total,-1350);
  assert.strictEqual(x.minimumLabel,'Small solid floor minimum');
  assert.strictEqual(x.total,3500);
  const met=garage('2car','metallic','regular');
  const pending=E.calculate(met,s);
  assert.strictEqual(pending.quoteReady,true);
  assert.strictEqual(pending.total,4500);
  assert.ok((pending.unpricedLines||[]).some(r=>/metallic/i.test(r)));
});

check('coating, paint, adhesive, and poor slab use actual sq ft and their minimums',()=>{
  const coat=floor(100,'flake','regular');
  coat.areas[0].prep={coatingRemoval:true};
  const small=E.calculate(coat,E.defaults);
  assert.strictEqual(line(small,'Coating removal').qty,100);
  assert.strictEqual(line(small,'Coating removal').total,650);
  coat.areas[0].sqft=1000;
  const big=E.calculate(coat,E.defaults);
  assert.strictEqual(line(big,'Coating removal').total,1500);
  assert.strictEqual(big.total,10000+1500);
  const paint=floor(100,'flake');
  paint.areas[0].prep={paintRemoval:true};
  assert.strictEqual(line(E.calculate(paint,E.defaults),'Paint removal').total,250);
  paint.areas[0].sqft=400;
  assert.strictEqual(line(E.calculate(paint,E.defaults),'Paint removal').total,500);
  const glue=floor(100,'flake');
  glue.areas[0].prep={adhesive:true};
  assert.strictEqual(line(E.calculate(glue,E.defaults),'Adhesive / mastic removal').total,350);
  glue.areas[0].sqft=400;
  assert.strictEqual(line(E.calculate(glue,E.defaults),'Adhesive / mastic removal').total,600);
  const poor=floor(100,'flake');
  poor.areas[0].prep={spalling:true};
  assert.strictEqual(line(E.calculate(poor,E.defaults),'Poor slab').total,400);
  poor.areas[0].sqft=1000;
  assert.strictEqual(line(E.calculate(poor,E.defaults),'Poor slab').total,750);
  const wide=garage('2car','flake','regular',800);
  wide.garagePrep.coatingRemoval=true;
  const gx=E.calculate(wide,E.defaults);
  assert.strictEqual(line(gx,'Coating removal').qty,800);
  assert.strictEqual(line(gx,'Coating removal').total,1200);
  assert.notStrictEqual(line(gx,'Coating removal').total,450*1.5);
});

check('crack repair is a flat then a per-foot rate',()=>{
  const j=floor(1000,'flake');
  j.areas[0].prep={cracks:true,crackLf:0};
  assert.strictEqual(line(E.calculate(j,E.defaults),'Crack repair').total,250);
  j.areas[0].prep.crackLf=10;
  assert.strictEqual(line(E.calculate(j,E.defaults),'Crack repair').total,250);
  j.areas[0].prep.crackLf=11;
  assert.strictEqual(line(E.calculate(j,E.defaults),'Crack repair').total,262);
  j.areas[0].prep.crackLf=25;
  assert.strictEqual(line(E.calculate(j,E.defaults),'Crack repair').total,430);
  j.areas[0].prep.cracks=false;
  assert.ok(!line(E.calculate(j,E.defaults),'Crack repair'));
});

check('moisture and self-leveling keep the live rates',()=>{
  assert.strictEqual(E.defaults.rates.moisture,4);
  assert.strictEqual(E.defaults.rates.level,6);
  const j=floor(100,'flake');
  j.areas[0].moisture=true;
  assert.strictEqual(line(E.calculate(j,E.defaults),'Moisture-control primer / barrier — Floor area').total,400);
  const level=floor(100,'flake');
  level.areas[0].level=true;level.areas[0].depth=0.25;
  assert.strictEqual(line(E.calculate(level,E.defaults),'Self-leveling preparation - Floor area').rate,6);
  level.areas[0].depth=0.5;
  assert.strictEqual(line(E.calculate(level,E.defaults),'Self-leveling preparation - Floor area').rate,12);
});

check('each remaining extra prices on its own and percent extras do not multiply',()=>{
  const j=floor(1000,'flake','regular');
  j.areas[0].grip=true;
  assert.strictEqual(line(E.calculate(j,E.defaults),'Anti-slip additive').total,350);
  j.areas[0].grip=false;
  j.extras.stairsSolid=4;j.extras.stairsFlake=2;
  let x=E.calculate(j,E.defaults);
  assert.strictEqual(line(x,'Stairs (solid)').total,340);
  assert.strictEqual(line(x,'Stairs (flake)').total,220);
  j.extras={...E.blankExtras(),stemWallLf:20};
  assert.strictEqual(line(E.calculate(j,E.defaults),'Stem walls / cove').total,180);
  j.extras={...E.blankExtras(),countertopSqft:10,countertopStyle:'solid'};
  assert.strictEqual(line(E.calculate(j,E.defaults),'Countertop / bar top (solid)').total,900);
  j.extras.countertopSqft=30;
  assert.strictEqual(line(E.calculate(j,E.defaults),'Countertop / bar top (solid)').total,1350);
  j.extras={...E.blankExtras(),countertopSqft:20,countertopStyle:'metallic'};
  assert.strictEqual(line(E.calculate(j,E.defaults),'Countertop / bar top (metallic)').total,1300);
  j.extras={...E.blankExtras(),travel:true};j.miles=40;
  assert.strictEqual(line(E.calculate(j,E.defaults),'Travel beyond 25 miles').total,75);
  j.miles=20;
  assert.ok(!line(E.calculate(j,E.defaults),'Travel beyond 25 miles'));
  j.miles=0;j.extras={...E.blankExtras(),movingHours:3};
  assert.strictEqual(line(E.calculate(j,E.defaults),'Furniture / vehicle moving').total,450);
  j.extras={...E.blankExtras(),winterHeatDays:2};
  assert.strictEqual(line(E.calculate(j,E.defaults),'Winter heat').total,500);
  j.extras={...E.blankExtras(),consumables:true};
  assert.strictEqual(line(E.calculate(j,E.defaults),'Per-job consumables').total,150);
  j.miles=10;j.extras={...E.blankExtras(),fuel:true};
  assert.strictEqual(line(E.calculate(j,E.defaults),'Fuel and vehicle wear').total,13);
  j.miles=0;j.extras={...E.blankExtras(),extraVisits:2};
  assert.strictEqual(line(E.calculate(j,E.defaults),'Extra site visit').total,250);
  j.extras={...E.blankExtras(),warrantyYears:1};
  assert.strictEqual(E.calculate(j,E.defaults).total,10000);
  j.extras={...E.blankExtras(),warrantyYears:3};
  assert.strictEqual(line(E.calculate(j,E.defaults),'3-year warranty').total,400);
  j.extras={...E.blankExtras(),rush:true,weekend:true};
  x=E.calculate(j,E.defaults);
  assert.strictEqual(line(x,'Rush (within 7 days)').total,1000);
  assert.strictEqual(line(x,'Weekend').total,1500);
  assert.strictEqual(x.total,12500);
  assert.notStrictEqual(x.total,Math.round(10000*1.1*1.15));
  assert.strictEqual(x.choices.opt1.breakdown.finishRate,8);
  assert.strictEqual(x.choices.opt1.total,8000+800+1200);
  assert.strictEqual(x.choices.regular.breakdown.finishRate,10);
});

check('an over-cap extra rate is not multiplied and the estimate lists the line',()=>{
  const s=JSON.parse(JSON.stringify(E.defaults));
  s.extras.coatingRemoval.perSqft=900;
  const j=floor(450,'flake');
  j.areas[0].prep={coatingRemoval:true};
  const x=E.calculate(j,s);
  assert.strictEqual(x.quoteReady,true);
  assert.strictEqual(x.total,4500);
  assert.ok(!x.lines.some(l=>l.label==='Coating removal'&&l.total===900*450));
  assert.ok((x.unpricedLines||[]).some(r=>/Coating removal/.test(r)));
  const shown=floor(1000,'flake');
  shown.areas[0].prep={coatingRemoval:true};
  const snap=Q.customerSnapshot(E,shown,E.calculate(shown,E.defaults),E.defaults);
  assert.ok(snap.lines.some(l=>l.label==='Coating removal'&&l.total===1500));
  const html=V.render({estimate:snap});
  assert.ok(html.includes('Coating removal'));
  const floored=floor(250,'solid','opt1');
  const doc=Q.customerSnapshot(E,floored,E.calculate(floored,E.defaults),E.defaults);
  assert.strictEqual(doc.totals.total,2750);
  assert.strictEqual(doc.totals.minimumLabel,'Small solid floor minimum');
  assert.ok(V.render({estimate:doc}).includes('Small solid floor minimum'));
});

if(failed){console.error(failed+' failed');process.exit(1)}
console.log('all selling extra checks passed');
