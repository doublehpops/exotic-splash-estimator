'use strict';
/* Run every tools/*.test.js file in its own Node process and exit non-zero if
 * any file fails. `node tools/*.test.js` does not do this: Node executes only
 * the first file and treats the rest as that file's arguments. */
const {spawnSync}=require('child_process');
const fs=require('fs');
const path=require('path');

const dir=__dirname;
const files=fs.readdirSync(dir).filter(name=>name.endsWith('.test.js')&&!name.startsWith('.')).sort();
if(!files.length){
  console.error('no test files in '+dir);
  process.exit(1);
}

let failed=0;
for(const name of files){
  console.log('--- '+name);
  const result=spawnSync(process.execPath,[path.join(dir,name)],{stdio:'inherit'});
  if(result.error||result.status!==0){
    failed++;
    const why=result.error?result.error.message:(result.signal?'signal '+result.signal:'exit '+result.status);
    console.error('FAIL '+name+' '+why);
  }else{
    console.log('PASS '+name);
  }
}
console.log(files.length+' files, '+failed+' failed');
process.exit(failed?1:0);
