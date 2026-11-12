'use strict';
/* Live quote-job smoke. Runs only when both env vars are present.
 * This file does not contain a URL, a token, or any other secret. */
const url=process.env.QUOTE_JOB_SMOKE_URL||'';
const token=process.env.QUOTE_JOB_SMOKE_TOKEN||'';
if(!url||!token){
  console.log('skip live quote-job: QUOTE_JOB_SMOKE_URL or QUOTE_JOB_SMOKE_TOKEN is not set');
  process.exit(0);
}
const body={
  mode:'preview',
  job_data:{
    projectType:'floor',
    customer:'Smoke',
    priceOption:'regular',
    tax:0,
    discount:0,
    miles:0,
    minutes:0,
    areas:[{name:'Floor area',sqft:450,style:'flake',flake:'light',coats:1,level:false,moisture:false}]
  }
};
(async()=>{
  const res=await fetch(url,{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const text=await res.text();
  let data=null;
  try{data=JSON.parse(text)}catch{data=null}
  if(!res.ok||!data||data.ok!==true){
    console.error('live quote-job failed',res.status);
    process.exit(1);
  }
  const total=data.staff&&data.staff.total;
  if(total!==4500){
    console.error('live quote-job total was not the 450 sq ft flake selling price');
    process.exit(1);
  }
  console.log('live quote-job ok',total);
})().catch(err=>{
  console.error('live quote-job failed');
  process.exit(1);
});
