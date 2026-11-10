/* Whole sellable-pack billing. Does not add a second charge onto an installed sq ft or package price.
 * Unknown pack size is unresolved. Nothing here is a supplier cost. */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.EsPackBilling=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function wholePack(opts){
  opts=opts||{};
  const required=Number(opts.required);
  const packSize=Number(opts.packSize);
  if(!Number.isFinite(required)||required<=0){
    return {status:'zero',required:0,packSize:Number.isFinite(packSize)&&packSize>0?packSize:null,packs:0,billedQty:0,leftover:0,reason:'No positive requirement, so no pack is billed.'};
  }
  if(opts.requiredUnit&&opts.packUnit&&String(opts.requiredUnit)!==String(opts.packUnit)){
    return {status:'unresolved',required,packSize:Number.isFinite(packSize)?packSize:null,packs:null,billedQty:null,leftover:null,reason:'Required unit does not match the sellable pack unit. No conversion was invented.'};
  }
  if(!Number.isFinite(packSize)||packSize<=0){
    return {status:'unresolved',required,packSize:null,packs:null,billedQty:null,leftover:null,reason:'Sellable pack size is missing. No pack count was invented and it was not treated as zero.'};
  }
  const packs=Math.ceil(required/packSize-1e-10);
  const billedQty=Math.round(packs*packSize*1000)/1000;
  const leftover=Math.round((billedQty-required)*1000)/1000;
  return {status:'ok',required,packSize,packs,billedQty,leftover,reason:packs+' whole pack'+(packs===1?'':'s')+' cover '+required+'. The billed quantity is '+billedQty+', not a prorated fraction.'};
}
function money(v){
  if(v===null||v===undefined||v==='')return null;
  const x=Number(v);
  return Number.isFinite(x)?Math.round(x*100)/100:null;
}
/** Full-pack selling charge inside an inclusive installed total. Never added on top. Missing price is not $0. */
function reconcile(opts){
  opts=opts||{};
  const lines=opts.lines||[];
  const detail=[];
  let obligation=0, missingPrice=false, unresolved=false, missingCost=false;
  for(const line of lines){
    const unit=line.unit||line.volumeUnit||'';
    if(line.packStatus==='unresolved'||line.packStatus==='missing-cost'){
      if(line.packStatus==='missing-cost')missingCost=true; else unresolved=true;
      detail.push({key:line.key,status:line.packStatus,required:line.required,unit,packs:null,billedQty:null,fullCharge:null});
      continue;
    }
    if(!line.packs)continue;
    const price=money(line.customerPackPrice);
    if(price==null||price<=0){
      missingPrice=true;
      detail.push({key:line.key,status:'missing-pack-price',required:line.required,unit,packs:line.packs,billedQty:line.billedQty,fullCharge:null,reason:'Pack selling price is missing. It is not treated as free and it is not prorated.'});
      continue;
    }
    const full=money(line.packs*price);
    const prorated=line.billedQty?money((line.required/line.billedQty)*full):null;
    obligation=money(obligation+full);
    detail.push({key:line.key,status:'full-pack',required:line.required,unit,packs:line.packs,billedQty:line.billedQty,fullCharge:full,proratedWouldHaveBeen:prorated});
  }
  const inclusive=money(opts.inclusiveTotal)||0;
  const shortfall=money(obligation-inclusive);
  const gap=shortfall!=null&&shortfall>0.009;
  const blocked=!!(opts.enforce&&(missingPrice||unresolved||missingCost||gap)&&lines.some(l=>Number(l.required)>0));
  const covered=!missingPrice&&!unresolved&&!missingCost&&!gap;
  return {
    addToInstalledTotal:false,
    mode:opts.mode||'sqft_inclusive',
    obligation:missingPrice||unresolved||missingCost?null:obligation,
    inclusiveTotal:inclusive,
    shortfall:gap?shortfall:0,
    covered,
    blocked,
    missingPrice,unresolved,missingCost,
    lines:detail,
    wording:covered
      ?'The installed price already includes materials. The customer material obligation is the full sellable pack, not a prorated fraction of that pack, and that full charge is covered by the installed total. It is not added again.'
      :'The full sellable-pack charge is not covered, or the pack price or pack size is missing. It was not prorated and it was not treated as free. Finalize only after owner review.'
  };
}
function chargePolicy(mode){
  if(mode==='package_inclusive')return {addToInstalledTotal:false,mode,wording:'The package or per-item price already includes materials. A separate pack charge is not added. Measured container counts apply only when a quantity is entered.'};
  if(mode==='materials_only')return {addToInstalledTotal:false,mode,conflict:'A second materials-only pack charge is not added on top of an installed price.',wording:'Whole packs are the materials quantity. They are not added again to an installed total.'};
  return {addToInstalledTotal:false,mode,wording:'The installed price already includes materials. Billing uses the full pack, not a fraction of the pack, and that charge must be covered by the installed total.'};
}
return {wholePack,reconcile,chargePolicy};
});
