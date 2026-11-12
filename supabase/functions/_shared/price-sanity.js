(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.EsPriceSanity=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
/* Price sanity guard. Does not change approved tier rates or catalog dollar amounts.
   Per-sqft inputs are bounded. Catalog adjustments stay flat dollar amounts. */
const PER_SQFT_MAX=40;
const PER_SQFT_WARN=20;
const AREA_RATE_MIN=3;
const AREA_RATE_MAX=20;
const DEPTH_MAX=2;
const SQFT_WARN=20000;
const SQFT_BLOCK=100000;
const FINISH_WARN_LOW=5, FINISH_WARN_HIGH=15, FINISH_BLOCK_LOW=3, FINISH_BLOCK_HIGH=20;
const BLEND_WARN_HIGH=30, BLEND_WARN_LOW=4, BLEND_BLOCK=50;
const TOTAL_WARN=75000, TOTAL_BLOCK=250000;
const GARAGE_WARN=8000, GARAGE_BLOCK=15000;
const FLATWORK_WARN=3000, SEATING_WARN=500;
const ADDON_WARN=5000, ADDON_BLOCK=25000; /* one catalog add-on, absolute dollars (credits included) */
const CATALOG_ADJ_MAPS=['prepAdj','conditionAdj','materialAdj','topcoatAdj'];
const PER_SQFT_RATE_KEYS=['solid','flake','metallic','sealer','level','removal','moisture','extraCoat','mediumFlakeExtra','fullFlakeExtra'];
const EXTRA_SQFT_KEYS=[['coatingRemoval','Coating removal / sq ft'],['paintRemoval','Paint removal / sq ft'],['adhesiveRemoval','Adhesive / mastic removal / sq ft'],['poorSlab','Poor slab / sq ft'],['antiSlip','Anti-slip additive / sq ft']];
const RATE_LABELS={
  solid:'Solid epoxy / sq ft',
  flake:'Flake epoxy / sq ft',
  metallic:'Metallic epoxy / sq ft',
  sealer:'Clear seal / sq ft',
  level:'Leveling / sq ft',
  removal:'Extra removal / sq ft',
  moisture:'Moisture control / sq ft',
  extraCoat:'Additional solid base coat / sq ft',
  mediumFlakeExtra:'Medium flake premium / sq ft',
  fullFlakeExtra:'Full flake premium / sq ft'
};
const TIER_STYLE_LABELS={solid:'solid',flake:'flake',metallic:'metallic'};
const clone=x=>JSON.parse(JSON.stringify(x==null?{}:x));
function money(v){
  const n=Number(v);
  if(!Number.isFinite(n))return '$0.00';
  return n.toLocaleString('en-US',{style:'currency',currency:'USD'});
}
function sqftText(v){return Number(v).toLocaleString('en-US',{maximumFractionDigits:2});}
function issue(level,code,line,message){return {level,code,line:line||'',message};}
function perSqftIssue(label,raw){
  if(raw===null||raw===undefined||raw==='')return null;
  const v=Number(raw);
  if(!Number.isFinite(v)||v<0||v>PER_SQFT_MAX){
    return issue('block','per_sqft',label,label+' is '+money(v)+' per sq ft, outside $0–$40.');
  }
  if(v>PER_SQFT_WARN){
    return issue('warn','per_sqft',label,label+' is '+money(v)+' per sq ft, above the usual $20.');
  }
  return null;
}
/** Area override keeps the tighter $3–$20 rule. Blank is not an override. */
function customRateProblem(area){
  if(!area)return null;
  const raw=area.rate;
  if(raw===null||raw===undefined||raw==='')return null;
  const rate=Number(raw);
  const name=area.name||'Floor area';
  const sf=Number(area.sqft);
  if(!Number.isFinite(rate)){
    return issue('block','rate_invalid',name,name+': override is not a price per sq ft.');
  }
  if((Number.isFinite(sf)&&sf>0&&rate===sf)||rate>=100){
    return issue('block','rate_looks_like_sqft',name,name+': This looks like square footage, not a price per sq ft.');
  }
  if(rate<AREA_RATE_MIN||rate>AREA_RATE_MAX){
    return issue('block','rate_out_of_range',name,name+': override '+money(rate)+' per sq ft is outside $3–$20.');
  }
  return null;
}
function capDepth(depth,name){
  const d=Number(depth);
  const who=name||'Area';
  if(!Number.isFinite(d)||d<0)return {depth:0,issue:null};
  if(d>DEPTH_MAX){
    return {depth:DEPTH_MAX,issue:issue('block','depth',who,who+': leveling depth '+d+' in is above the 2 in cap.')};
  }
  return {depth:d,issue:null};
}
function collectBook(settings){
  const blocks=[],warnings=[];
  const rates=(settings&&settings.rates)||{};
  for(const key of PER_SQFT_RATE_KEYS){
    const hit=perSqftIssue(RATE_LABELS[key]||key,rates[key]);
    if(!hit)continue;
    (hit.level==='block'?blocks:warnings).push(hit);
  }
  const extras=(settings&&settings.extras)||{};
  for(const [key,label] of EXTRA_SQFT_KEYS){
    const hit=perSqftIssue(label,extras[key]&&extras[key].perSqft);
    if(!hit)continue;
    (hit.level==='block'?blocks:warnings).push(hit);
  }
  const polyRates=[
    [settings&&settings.catalog&&settings.catalog.garage&&settings.catalog.garage.topcoatAdj&&settings.catalog.garage.topcoatAdj.premium,'Polyaspartic topcoat / sq ft'],
    [settings&&settings.catalog&&settings.catalog.flatwork&&settings.catalog.flatwork.topcoatAdj&&settings.catalog.flatwork.topcoatAdj.premium,'Flatwork polyaspartic topcoat / sq ft']
  ];
  for(const [raw,label] of polyRates){
    const hit=perSqftIssue(label,raw);
    if(!hit)continue;
    (hit.level==='block'?blocks:warnings).push(hit);
  }
  const addOn=(settings&&settings.addOn)||{};
  for(const [key,label] of [['low','Standard add-in / sq ft'],['high','Higher add-in / sq ft']]){
    const hit=perSqftIssue(label,addOn[key]);
    if(!hit)continue;
    (hit.level==='block'?blocks:warnings).push(hit);
  }
  const opts=(settings&&settings.pricingOptions)||{};
  for(const optKey of Object.keys(opts)){
    const opt=opts[optKey]||{};
    const optName=opt.short||opt.label||optKey;
    const map=opt.rates||{};
    for(const style of Object.keys(TIER_STYLE_LABELS)){
      const hit=perSqftIssue(optName+' '+TIER_STYLE_LABELS[style]+' / sq ft',map[style]);
      if(!hit)continue;
      (hit.level==='block'?blocks:warnings).push(hit);
    }
  }
  return {blocks,warnings};
}
/** Copy settings and drop per-sqft values outside $0–$40 so they are not multiplied through. */
function guardSettings(settings){
  const found=collectBook(settings);
  const next=clone(settings||{});
  next.rates=next.rates||{};
  for(const key of PER_SQFT_RATE_KEYS){
    const hit=perSqftIssue(RATE_LABELS[key]||key,next.rates[key]);
    if(hit&&hit.level==='block')next.rates[key]=null;
  }
  next.extras=next.extras||{};
  for(const [key,label] of EXTRA_SQFT_KEYS){
    if(!next.extras[key])continue;
    const hit=perSqftIssue(label,next.extras[key].perSqft);
    if(hit&&hit.level==='block'){next.extras[key].perSqft=0;next.extras[key].min=0;}
  }
  if(next.catalog&&next.catalog.garage&&next.catalog.garage.topcoatAdj){
    const hit=perSqftIssue('Polyaspartic topcoat / sq ft',next.catalog.garage.topcoatAdj.premium);
    if(hit&&hit.level==='block')next.catalog.garage.topcoatAdj.premium=null;
  }
  if(next.catalog&&next.catalog.flatwork&&next.catalog.flatwork.topcoatAdj){
    const hit=perSqftIssue('Flatwork polyaspartic topcoat / sq ft',next.catalog.flatwork.topcoatAdj.premium);
    if(hit&&hit.level==='block')next.catalog.flatwork.topcoatAdj.premium=null;
  }
  next.addOn=next.addOn||{};
  for(const key of ['low','high']){
    const label=key==='low'?'Standard add-in / sq ft':'Higher add-in / sq ft';
    const hit=perSqftIssue(label,next.addOn[key]);
    if(hit&&hit.level==='block')next.addOn[key]=0;
  }
  next.pricingOptions=next.pricingOptions||{};
  for(const optKey of Object.keys(next.pricingOptions)){
    const opt=next.pricingOptions[optKey];
    if(!opt||!opt.rates)continue;
    const optName=opt.short||opt.label||optKey;
    for(const style of Object.keys(TIER_STYLE_LABELS)){
      const hit=perSqftIssue(optName+' '+TIER_STYLE_LABELS[style]+' / sq ft',opt.rates[style]);
      if(hit&&hit.level==='block')opt.rates[style]=null;
    }
  }
  const minHit=minimumJobIssue(next.rates.minimumJob);
  if(minHit){(minHit.level==='block'?found.blocks:found.warnings).push(minHit);if(minHit.level==='block')next.rates.minimumJob=0}
  const cost=costIssues(settings);
  for(const hit of cost.blocks.concat(cost.warnings))found.warnings.push(Object.assign({},hit,{level:'warn'}));
  for(const hit of productIssues(settings))found.warnings.push(hit);
  return {settings:next,blocks:found.blocks,warnings:found.warnings};
}
function minimumJobIssue(raw){
  if(raw===null||raw===undefined||raw==='')return null;
  const v=Number(raw);
  if(!Number.isFinite(v)||v<0||v>10000)return issue('block','minimum_job','Minimum job charge','Minimum job charge is '+money(v)+', outside $0–$10,000.');
  if(v>5000)return issue('warn','minimum_job','Minimum job charge','Minimum job charge is '+money(v)+', over $5,000.');
  return null;
}
function productIssues(settings){
  const warnings=[];
  const flake=settings&&settings.products&&settings.products.flake;
  const size=Number(flake&&flake.size),price=Number(flake&&flake.price);
  if(Number.isFinite(size)&&size>0&&Number.isFinite(price)){
    const per=price/size;
    if(per>10)warnings.push(issue('warn','flake_supplier','Decorative flakes','Flake supplier cost is $'+per.toFixed(2)+'/lb — market is about $2.70–$4.62/lb. Check the package size.'));
  }
  return warnings;
}
function costBound(blocks,warnings,label,raw,block,warn){
  if(raw===null||raw===undefined||raw==='')return;
  const v=Number(raw);
  if(!Number.isFinite(v)||(block&&(v<block[0]||v>block[1]))){
    blocks.push(issue('block','cost_input',label,label+' cost is '+(Number.isFinite(v)?v:raw)+', outside '+(block?block[0]+'–'+block[1]:'a number')+'.'));
    return;
  }
  if(warn&&(v<warn[0]||v>warn[1]))warnings.push(issue('warn','cost_input',label,label+' cost is '+v+', outside the usual '+warn[0]+'–'+warn[1]+'.'));
}
function costIssues(settings){
  const c=(settings&&settings.costs)||{};
  const blocks=[],warnings=[];
  costBound(blocks,warnings,'Loaded labor',c.labor,[10,150],[30,70]);
  costBound(blocks,warnings,'Material waste',c.waste,[0,30],null);
  costBound(blocks,warnings,'Materials purchase tax',c.purchaseTax,[0,15],null);
  costBound(blocks,warnings,'Setup hours',c.setupHours,[0,60],null);
  costBound(blocks,warnings,'Flat overhead',c.overhead,[0,10000],null);
  costBound(blocks,warnings,'Markup',c.markup,[0,300],null);
  const markup=Number(c.markup);
  if(Number.isFinite(markup)&&markup>=0&&markup<=300&&markup<33.33)warnings.push(issue('warn','cost_input','Markup','Markup cost '+markup+'% is below 33.33% (under a 25% margin).'));
  costBound(blocks,warnings,'Target margin',c.targetMargin,[0,80],null);
  const tm=Number(c.targetMargin);
  if(Number.isFinite(tm)&&tm>=0&&tm<=80&&tm<25)warnings.push(issue('warn','cost_input','Target margin','Target margin cost '+tm+'% is under the 25% minimum margin.'));
  let rate=Number(c.overheadPerHour);
  const lines=Array.isArray(c.overheadLines)?c.overheadLines:[];
  const hours=Number(c.billableHoursPerMonth);
  if(lines.length&&Number.isFinite(hours)&&hours>0){
    const monthly=lines.reduce((s,l)=>s+(Number(l&&l.monthly)||0),0);
    rate=monthly/hours;
  }
  if(lines.length||(c.overheadPerHour!=null&&c.overheadPerHour!==''))costBound(blocks,warnings,'Overhead per hour',rate,[0,100],null);
  return {blocks,warnings};
}
function garageStartWarnings(settings){
  const g=(settings&&settings.catalog&&settings.catalog.garage)||{};
  const flake=Number(settings&&settings.rates&&settings.rates.flake);
  const sq=g.packageSqft||{oneCar:250,twoCar:450,threeCar:650};
  const rows=[['oneCar','1-car',g.oneCarStarting],['twoCar','2-car',g.twoCarStarting],['threeCar','3-car',g.threeCarStarting]];
  const out=[];
  if(!Number.isFinite(flake))return out;
  for(const [key,label,start] of rows){
    const sf=Number(sq[key]);
    if(!Number.isFinite(Number(start))||!(sf>0))continue;
    const bench=flake*sf;
    if(Number(start)<bench)out.push(issue('warn','garage_start',label,'Garage '+label+' starting price '+money(start)+' is below the approved Regular flake rate × '+sf+' sf ('+money(bench)+') — check cost/margin.'));
  }
  return out;
}
function addOnAmountIssue(label,raw){
  if(raw===null||raw===undefined||raw==='')return null;
  const v=Number(raw);
  if(!Number.isFinite(v))return null;
  const a=Math.abs(v);
  if(a>ADDON_BLOCK)return issue('block','catalog_addon_amount',label,label+' is '+money(v)+', over the $25,000 limit for one catalog add-on.');
  if(a>ADDON_WARN)return issue('warn','catalog_addon_amount',label,label+' is '+money(v)+', over $5,000 for one catalog add-on.');
  return null;
}
/* Catalog add-on dollar amounts in the price book (checked when the book is saved). */
function collectCatalog(settings){
  const blocks=[],warnings=[];
  const cat=(settings&&settings.catalog)||{};
  for(const group of Object.keys(cat)){
    const g=cat[group];
    if(!g||typeof g!=='object')continue;
    for(const mapKey of CATALOG_ADJ_MAPS){
      const map=g[mapKey];
      if(!map||typeof map!=='object')continue;
      for(const key of Object.keys(map)){
        walkAddOnAmounts('Catalog '+group+' '+mapKey+' '+key,map[key],blocks,warnings);
      }
    }
  }
  return {blocks,warnings};
}
function walkAddOnAmounts(label,raw,blocks,warnings){
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
    for(const key of Object.keys(raw))walkAddOnAmounts(label+' '+key,raw[key],blocks,warnings);
    return;
  }
  const hit=addOnAmountIssue(label,raw);
  if(hit)(hit.level==='block'?blocks:warnings).push(hit);
}
function bookIssues(settings){
  const a=collectBook(settings),b=collectCatalog(settings);
  const minHit=minimumJobIssue(settings&&settings.rates&&settings.rates.minimumJob);
  if(minHit)(minHit.level==='block'?a.blocks:a.warnings).push(minHit);
  return {blocks:a.blocks.concat(b.blocks),warnings:a.warnings.concat(b.warnings)};
}
function areaSqftOf(job){
  let s=0;
  for(const a of (job&&job.areas)||[])s+=Number(a&&a.sqft)||0;
  return s;
}
function review(job,result){
  const blocks=[],warnings=[];
  const x=result||{};
  const lines=x.lines||[];
  for(const line of lines){
    if(line.kind!=='finish')continue;
    const rate=Number(line.rate);
    if(!Number.isFinite(rate))continue;
    const name=line.label||'Finish';
    if(rate<FINISH_BLOCK_LOW||rate>FINISH_BLOCK_HIGH){
      blocks.push(issue('block','finish_rate',name,name+': finish rate '+money(rate)+' per sq ft is outside $3–$20.'));
    }else if(rate<FINISH_WARN_LOW||rate>FINISH_WARN_HIGH){
      warnings.push(issue('warn','finish_rate',name,name+': finish rate '+money(rate)+' per sq ft is outside the usual $5–$15.'));
    }
  }
  const jobType=String(job&&job.projectType||'floor');
  const pkg=String(job&&job.garagePackage||'measured');
  const measuredFloor=jobType==='floor'||(jobType==='garage'&&(pkg==='measured'||pkg==='4plus'||pkg==='custom'));
  const measured=Number(x.sqft)||0;
  const total=Number(x.total)||0;
  if(measuredFloor&&measured>0&&total>0){
    const per=total/measured;
    if(per>BLEND_BLOCK){
      blocks.push(issue('block','blended','Blended total', 'Blended total is '+money(per)+' per sq ft, over $50.'));
    }else if(per>BLEND_WARN_HIGH||per<BLEND_WARN_LOW){
      warnings.push(issue('warn','blended','Blended total', 'Blended total is '+money(per)+' per sq ft'+(per>BLEND_WARN_HIGH?', over $30.':', under $4.')));
    }
    if(total>TOTAL_BLOCK){
      blocks.push(issue('block','job_total','Measured job total','Measured job total '+money(total)+' is over $250,000.'));
    }else if(total>TOTAL_WARN){
      warnings.push(issue('warn','job_total','Measured job total','Measured job total '+money(total)+' is over $75,000.'));
    }
  }
  for(const line of lines){
    if(line.kind==='starting'&&/package/i.test(String(line.unit||''))){
      const amt=Number(line.total)||0;
      const name=line.label||'Garage package';
      if(amt>GARAGE_BLOCK)blocks.push(issue('block','garage_package',name,name+' is '+money(amt)+', over $15,000.'));
      else if(amt>GARAGE_WARN)warnings.push(issue('warn','garage_package',name,name+' is '+money(amt)+', over $8,000.'));
    }
  }
  const type=String(job&&job.projectType||'');
  if(type==='flatwork'){
    for(const line of lines){
      if(line.kind!=='starting')continue;
      const amt=Number(line.total)||0;
      if(amt>FLATWORK_WARN)warnings.push(issue('warn','flatwork_item',line.label||'Flatwork item',(line.label||'Flatwork item')+' is '+money(amt)+', over $3,000.'));
    }
  }
  if(type==='seating'){
    for(const line of lines){
      if(line.kind!=='starting')continue;
      const amt=Number(line.rate)||0;
      if(amt>SEATING_WARN)warnings.push(issue('warn','seating_item',line.label||'Seating item',(line.label||'Seating item')+' is '+money(amt)+' each, over $500.'));
    }
  }
  for(const a of (job&&job.areas)||[]){
    const sf=Number(a&&a.sqft)||0;
    const name=(a&&a.name)||'Area';
    const hint=' square inches? divide by 144';
    if(sf>SQFT_BLOCK)blocks.push(issue('block','sqft',name,name+': '+sqftText(sf)+' sq ft is over 100,000.'+hint));
    else if(sf>SQFT_WARN)warnings.push(issue('warn','sqft',name,name+': '+sqftText(sf)+' sq ft is over 20,000.'+hint));
  }
  /* Catalog adjustments are flat dollar amounts (qty 1). Flag a line that was scaled by sq ft. */
  const sf=areaSqftOf(job);
  for(const line of lines){
    if(line.kind!=='adjustment')continue;
    const amount=Number(line.rate);
    const lineTotal=Number(line.total);
    const scaled=sf>1&&Number.isFinite(amount)&&Number.isFinite(lineTotal)&&Math.abs(lineTotal-amount*sf)<0.02&&Math.abs(lineTotal-amount)>0.02;
    if(scaled){
      blocks.push(issue('block','catalog_times_sqft',line.label||'Catalog adjustment',(line.label||'Catalog adjustment')+': this catalog adjustment was multiplied by sq ft. Catalog adjustments are a flat dollar amount.'));
    }
  }
  /* One catalog add-on line: warn over $5,000, block over $25,000 (absolute value). */
  for(const line of lines){
    if(line.kind!=='adjustment')continue;
    const hit=addOnAmountIssue(line.label||'Catalog adjustment',line.total);
    if(hit)(hit.level==='block'?blocks:warnings).push(hit);
  }
  return {blocks,warnings,ok:blocks.length===0};
}
function fingerprint(list){return (list||[]).map(x=>x&&x.message?x.message:String(x||'')).join('\n');}
function quoteStop(result,opts){
  opts=opts||{};
  const blocks=(result&&result.blockingIssues)||[];
  if(blocks.length){
    const messages=blocks.map(b=>b.message||String(b));
    return {status:422,body:{ok:false,code:'price_blocked',error:messages[0],blockingIssues:messages}};
  }
  const warnings=(result&&result.sanity&&result.sanity.warnings)||[];
  if(warnings.length&&!(opts.owner&&opts.sanityContinue)){
    const messages=warnings.map(w=>w.message||String(w));
    const tail=opts.owner?' Tap Looks right, continue to issue this quote.':' Employees cannot override a price warning.';
    return {status:422,body:{ok:false,code:'price_warning',error:messages[0]+tail,warnings:messages}};
  }
  return null;
}
return {
  PER_SQFT_RATE_KEYS,PER_SQFT_MAX,PER_SQFT_WARN,DEPTH_MAX,SQFT_WARN,SQFT_BLOCK,ADDON_WARN,ADDON_BLOCK,
  customRateProblem,capDepth,guardSettings,bookIssues,review,fingerprint,quoteStop,money,
  productIssues,costIssues,garageStartWarnings,minimumJobIssue
};
});
