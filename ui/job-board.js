/* Jobs board filters, sort, search, and delete-confirmation phrases.
 * No prices, costs, or secrets live here. Customer totals are passed in. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.EsJobBoard=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const FILTER_KEY='es-v7-job-board';
const STATUSES=['draft','quoted','issued','archived'];
const DATE_FIELDS=['updated','created','job'];
const SORTS=['updated-desc','updated-asc','date-desc','date-asc','price-desc','price-asc','customer-asc','number-asc'];
const GROUPS=['none','status','type','crew','estimator','city'];
const LABELS={
  status:{draft:'Draft',quoted:'Quoted',issued:'Issued',archived:'Archived'},
  type:{floor:'Floors',garage:'Garage',flatwork:'Tables / counters / bars',seating:'Chairs / stools'},
  system:{solid:'Solid',flake:'Flake',metallic:'Metallic'},
  tier:{regular:'Regular',opt1:'Option 1',opt2:'Option 2'},
  garageSize:{'1car':'1-car','2car':'2-car','3car':'3-car',measured:'Measured'},
  sort:{
    'updated-desc':'Newest updated',
    'updated-asc':'Oldest updated',
    'date-desc':'Job date, newest',
    'date-asc':'Job date, oldest',
    'price-desc':'Price, high to low',
    'price-asc':'Price, low to high',
    'customer-asc':'Customer A-Z',
    'number-asc':'Job number'
  },
  group:{none:'No grouping',status:'Status',type:'Job type',crew:'Crew',estimator:'Estimator',city:'City'},
  dateField:{updated:'Updated',created:'Created',job:'Job date'}
};

function defaultFilters(){
  return {
    q:'',
    status:'',
    type:'',
    system:'',
    tier:'',
    garageSize:'',
    city:'',
    zip:'',
    crew:'',
    estimator:'',
    dateField:'updated',
    dateFrom:'',
    dateTo:'',
    priceMin:'',
    priceMax:'',
    sort:'updated-desc',
    group:'none',
    showArchived:false
  };
}

function loadFilters(storage){
  const base=defaultFilters();
  let raw=null;
  try{raw=JSON.parse(storage.getItem(FILTER_KEY)||'null')}catch(e){raw=null}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return base;
  const out=Object.assign({},base);
  for(const k of Object.keys(base)){
    if(raw[k]===undefined||raw[k]===null)continue;
    if(typeof base[k]==='boolean')out[k]=raw[k]===true;
    else out[k]=String(raw[k]);
  }
  if(!SORTS.includes(out.sort))out.sort=base.sort;
  if(!GROUPS.includes(out.group))out.group=base.group;
  if(!DATE_FIELDS.includes(out.dateField))out.dateField=base.dateField;
  return out;
}

function saveFilters(storage,filters){
  const base=defaultFilters();
  const src=filters||{};
  const keep={};
  for(const k of Object.keys(base)){
    if(typeof base[k]==='boolean')keep[k]=src[k]===true;
    else keep[k]=src[k]==null?base[k]:String(src[k]);
  }
  if(!SORTS.includes(keep.sort))keep.sort=base.sort;
  if(!GROUPS.includes(keep.group))keep.group=base.group;
  if(!DATE_FIELDS.includes(keep.dateField))keep.dateField=base.dateField;
  storage.setItem(FILTER_KEY,JSON.stringify(keep));
}

function statusOf(job){
  const raw=String(job&&(job._status||job.status)||'').toLowerCase();
  if(STATUSES.includes(raw))return raw;
  if(job&&job.draftMark==='issued')return 'issued';
  return 'draft';
}

function cityOf(job){
  const explicit=String(job&&job.city||'').trim();
  if(explicit)return explicit;
  const addr=String(job&&job.address||'').trim();
  const m=addr.match(/,\s*([^,\d]+?),\s*[A-Za-z]{2}\s+\d{5}(?:-\d{4})?\s*$/);
  return m?m[1].trim():'';
}

function zipOf(job){
  const explicit=String(job&&(job.zip||job.postalCode)||'').trim();
  const src=explicit||String(job&&job.address||'');
  const m=src.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m?m[1]:'';
}

function systemsOf(job){
  const out=new Set();
  const type=String(job&&job.projectType||'floor');
  // Floor and catalog jobs quote from area / item style. guidedJob also stores a
  // default garageStyle of flake on those jobs; that default is not their system.
  if(type==='garage'){
    if(job.garageStyle)out.add(String(job.garageStyle));
    return out;
  }
  for(const a of (job&&job.areas)||[]){
    if(a&&a.style)out.add(String(a.style));
  }
  for(const it of (job&&job.catalogItems)||[]){
    if(it&&it.style)out.add(String(it.style));
  }
  return out;
}

function priceOf(job){
  if(!job||job.customerTotal==null||job.customerTotal==='')return null;
  const n=Number(job.customerTotal);
  return Number.isFinite(n)?n:null;
}

function phoneDigits(s){return String(s||'').replace(/\D/g,'')}

function customerSortKey(job){
  return String(job.customer||job.company||'').trim().toLowerCase();
}

function stamp(job,field){
  if(field==='created')return String(job.createdAt||'');
  if(field==='job')return String(job.date||'');
  return String(job.updatedAt||job._updatedAt||'');
}

function dayOf(value){
  const s=String(value||'');
  if(!s)return '';
  return s.slice(0,10);
}

function matchesQuery(job,q){
  const query=String(q||'').trim().toLowerCase();
  if(!query)return true;
  const blob=[job.customer,job.company,job.address,cityOf(job),zipOf(job),job.number].join(' ').toLowerCase();
  if(blob.includes(query))return true;
  const digits=query.replace(/\D/g,'');
  const phone=phoneDigits(job.phone);
  if(digits.length===4&&phone.slice(-4)===digits)return true;
  if(digits.length>4&&phone.includes(digits))return true;
  return false;
}

function inDateRange(job,filters){
  if(!filters.dateFrom&&!filters.dateTo)return true;
  const day=dayOf(stamp(job,filters.dateField||'updated'));
  if(!day)return false;
  if(filters.dateFrom&&day<filters.dateFrom)return false;
  if(filters.dateTo&&day>filters.dateTo)return false;
  return true;
}

function matches(job,filters){
  const f=filters||defaultFilters();
  const status=statusOf(job);
  if(status==='archived'&&f.showArchived!==true&&f.status!=='archived')return false;
  if(f.status&&status!==f.status)return false;
  if(f.type&&String(job.projectType||'floor')!==f.type)return false;
  if(f.system&&!systemsOf(job).has(f.system))return false;
  if(f.tier&&String(job.priceOption||'regular')!==f.tier)return false;
  if(f.garageSize){
    if(String(job.projectType||'floor')!=='garage')return false;
    if(String(job.garagePackage||'')!==f.garageSize)return false;
  }
  if(f.city&&cityOf(job).toLowerCase()!==String(f.city).toLowerCase())return false;
  if(f.zip&&zipOf(job)!==String(f.zip).replace(/\D/g,'').slice(0,5))return false;
  if(f.crew==='__unassigned__'){if(String(job.assignedCrew||'').trim())return false}
  else if(f.crew&&String(job.assignedCrew||'')!==f.crew)return false;
  if(f.estimator&&String(job.estimatorName||'')!==f.estimator)return false;
  if(!matchesQuery(job,f.q))return false;
  if(!inDateRange(job,f))return false;
  const total=priceOf(job);
  if(f.priceMin!==''&&f.priceMin!=null){
    const min=Number(f.priceMin);
    if(Number.isFinite(min)&&!(total!=null&&total>=min))return false;
  }
  if(f.priceMax!==''&&f.priceMax!=null){
    const max=Number(f.priceMax);
    if(Number.isFinite(max)&&!(total!=null&&total<=max))return false;
  }
  return true;
}

function compareText(a,b){return String(a).localeCompare(String(b),'en',{numeric:true,sensitivity:'base'})}

function sortJobs(jobs,sort){
  const list=jobs.slice();
  const key=SORTS.includes(sort)?sort:'updated-desc';
  list.sort((a,b)=>{
    if(key==='updated-desc'||key==='updated-asc'){
      const c=compareText(stamp(a,'updated'),stamp(b,'updated'));
      return key==='updated-desc'?-c:c;
    }
    if(key==='date-desc'||key==='date-asc'){
      const c=compareText(stamp(a,'job'),stamp(b,'job'));
      return key==='date-desc'?-c:c;
    }
    if(key==='price-desc'||key==='price-asc'){
      const av=priceOf(a),bv=priceOf(b);
      if(av==null&&bv==null)return 0;
      if(av==null)return 1;
      if(bv==null)return -1;
      return key==='price-asc'?av-bv:bv-av;
    }
    if(key==='customer-asc')return compareText(customerSortKey(a),customerSortKey(b));
    return compareText(a.number||'',b.number||'');
  });
  return list;
}

function groupKey(job,group){
  if(group==='status')return LABELS.status[statusOf(job)]||statusOf(job);
  if(group==='type')return LABELS.type[job.projectType]||LABELS.type[job.projectType||'floor']||String(job.projectType||'floor');
  if(group==='crew')return String(job.assignedCrew||'').trim()||'Unassigned';
  if(group==='estimator')return String(job.estimatorName||'').trim()||'Unknown';
  if(group==='city')return cityOf(job)||'No city';
  return '';
}

function groupJobs(jobs,group){
  if(!group||group==='none')return [{key:'',label:'',jobs:jobs}];
  const buckets=new Map();
  for(const job of jobs){
    const label=groupKey(job,group);
    if(!buckets.has(label))buckets.set(label,[]);
    buckets.get(label).push(job);
  }
  return Array.from(buckets,([label,rows])=>({key:label,label:label,jobs:rows}));
}

function apply(jobs,filters){
  const f=Object.assign(defaultFilters(),filters||{});
  const matched=(jobs||[]).filter(job=>matches(job,f));
  const sorted=sortJobs(matched,f.sort);
  return {jobs:sorted,groups:groupJobs(sorted,f.group)};
}

function distinct(jobs,read){
  const seen=new Set();
  const out=[];
  for(const job of jobs||[]){
    const value=String(read(job)||'').trim();
    if(!value||seen.has(value))continue;
    seen.add(value);
    out.push(value);
  }
  out.sort((a,b)=>compareText(a,b));
  return out;
}

function expectedDeletePhrase(jobs){
  const list=Array.isArray(jobs)?jobs:[];
  if(list.length===1)return String(list[0].number||'').trim();
  if(list.length>1)return 'DELETE '+list.length;
  return '';
}

function phraseMatches(typed,expected){
  const want=String(expected||'');
  return want!==''&&String(typed||'')===want;
}

return {
  FILTER_KEY,STATUSES,DATE_FIELDS,SORTS,GROUPS,LABELS,
  defaultFilters,loadFilters,saveFilters,
  statusOf,cityOf,zipOf,systemsOf,priceOf,
  matches,apply,distinct,
  expectedDeletePhrase,phraseMatches
};
});
