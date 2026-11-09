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
/** Installed sq ft rates and catalog package starts already include materials. */
function chargePolicy(mode){
  if(mode==='package_inclusive')return {addToInstalledTotal:false,wording:'The package or per-item price already includes materials. Whole packs are not added again. Required container counts stay unresolved until a measured quantity is entered.'};
  if(mode==='materials_only')return {addToInstalledTotal:false,conflict:'A separate materials-only pack charge is not added on top of an installed price in this draft.',wording:'Whole packs would be the materials-only quantity. They are not added again to an installed sq ft or package total.'};
  return {addToInstalledTotal:false,wording:'The installed price already includes materials. A product sold by the full pack is billed as whole packs. That pack price is not added on top of the sq ft rate.'};
}
return {wholePack,chargePolicy};
});
