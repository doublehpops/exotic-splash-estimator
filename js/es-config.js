/* Exotic Splash v7 — public runtime config validation (browser + Node). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EsConfig=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const PLACEHOLDER=/YOUR[-_ ]|<|>|example\.(com|test)|changeme|placeholder/i;
function b64urlDecode(s){
  s=String(s).replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';
  if(typeof atob==='function')return decodeURIComponent(Array.prototype.map.call(atob(s),c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  return Buffer.from(s,'base64').toString('utf8');
}
function jwtRole(key){
  const parts=String(key).split('.');if(parts.length!==3)return null;
  try{const p=JSON.parse(b64urlDecode(parts[1]));return p&&p.role?String(p.role):'';}catch{return '';}
}
/** Returns {state:'unconfigured'|'invalid'|'ok', errors:[], url, key, siteUrl, allowOfflineDemo} */
function validate(cfg){
  cfg=cfg||{};
  const url=String(cfg.supabaseUrl||'').trim();
  const key=String(cfg.supabaseAnonKey||'').trim();
  const out={state:'ok',errors:[],url,key,siteUrl:String(cfg.siteUrl||'').trim(),allowOfflineDemo:cfg.allowOfflineDemo===true};
  if(!url&&!key){out.state='unconfigured';return out}
  if(!url||PLACEHOLDER.test(url)||!key||PLACEHOLDER.test(key)){out.state='unconfigured';out.errors.push('Supabase URL and anon/publishable key are still placeholders.');return out}
  let u;try{u=new URL(url)}catch{out.state='invalid';out.errors.push('Supabase URL is not a valid URL.');return out}
  const local=u.hostname==='localhost'||u.hostname==='127.0.0.1';
  if(u.protocol!=='https:'&&!(local&&u.protocol==='http:')){out.state='invalid';out.errors.push('Supabase URL must use https://.')}
  if(u.pathname!=='/'&&u.pathname!==''){out.state='invalid';out.errors.push('Supabase URL must be the project base URL (no path).')}
  if(/^sb_secret_/i.test(key)){out.state='invalid';out.errors.push('That is a SECRET key (sb_secret_…). Use the publishable/anon key. Rotate the secret key if it was published.')}
  const role=jwtRole(key);
  if(role!==null){
    if(role==='service_role'){out.state='invalid';out.errors.push('That is the service_role key. It must never be in the browser. Use the anon key and rotate the service_role key if it was published.')}
    else if(role!=='anon'){out.state='invalid';out.errors.push('Key is a JWT but not an anon key (role "'+role+'").')}
  }else if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)){
    out.state='invalid';out.errors.push('Key must be the legacy anon JWT or an sb_publishable_ key.');
  }
  if(out.siteUrl){try{const s=new URL(out.siteUrl);if(s.protocol!=='https:'&&!/^(localhost|127\.0\.0\.1)$/.test(s.hostname)){out.state='invalid';out.errors.push('siteUrl must use https://.')}}catch{out.state='invalid';out.errors.push('siteUrl is not a valid URL.')}}
  if(out.state!=='ok')out.key='';
  return out;
}
return{validate,jwtRole};
});
