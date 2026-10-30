#!/usr/bin/env node
'use strict';
// Human vote transcription only. No reviewer authentication/independence claim.
const {validateLedger}=require('./p16-review-intake.js');
const {safePalette}=require('../content/region-ai.js');
const {readLocal,saveLocal}=require('./p16-public-capture.js');
const ID=/^case-[a-z0-9-]{4,48}$/;
const DECIMAL=/^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/;
function parseArgs(args){
 if(!Array.isArray(args)||args.length<4||args.length>5)
  throw Error('P16 vote: case, region, slot, vote; optional 6-channel palette');
 const m=new Map();
 for(const arg of args){
  if(typeof arg!=='string'||!arg.startsWith('--')||!arg.includes('='))
   throw Error('P16 vote: invalid argument');
  const pos=arg.indexOf('='),name=arg.slice(2,pos),value=arg.slice(pos+1);
  if(!['case','region','slot','vote','palette'].includes(name)||m.has(name))
   throw Error('P16 vote: forbidden or duplicate option');
  m.set(name,value);
 }
 const keys=['case','region','slot','vote'];
 if(keys.some(k=>!m.has(k))||!ID.test(m.get('case'))||
   !/^(?:0|[1-9][0-9]?)$/.test(m.get('region'))||
   Number(m.get('region'))>=80||
   !['first','second'].includes(m.get('slot'))||
   !['convert','preserve','uncertain'].includes(m.get('vote')))
  throw Error('P16 vote: invalid case, region, reviewer slot or vote');
 let palette=null;
 if(m.has('palette')){
  const channels=m.get('palette').split(',');
  if(channels.length!==6||channels.some(x=>!DECIMAL.test(x)))
   throw Error('P16 vote: malformed normalized palette');
  palette=channels.map(Number);
  if(!safePalette(palette))throw Error('P16 vote: unsafe contrast palette');
 }
 return Object.freeze({caseId:m.get('case'),regionIndex:Number(m.get('region')),
  slot:m.get('slot'),vote:m.get('vote'),palette});
}
function applyVote(ledger,change){
 const before=validateLedger(ledger);
 if(before.recordedRegions===0)throw Error('P16 vote: no captured regions');
 const matches=ledger.entries.filter(row=>row.caseId===change.caseId&&
    row.regionIndex===change.regionIndex);
 if(matches.length!==1)throw Error('P16 vote: region not found or ambiguous');
 const row=matches[0],key=change.slot==='first'?'firstReview':'secondReview';
 if(row[key]!=='pending')throw Error('P16 vote: slot already filled; no overwrite');
 const newRow={...row,[key]:change.vote};
 if(newRow.firstReview==='convert'&&newRow.secondReview==='convert'){
  if(change.palette===null)throw Error('P16 vote: consensus needs a safe palette');
  newRow.palette=change.palette;
 }else if(change.palette!==null){
  throw Error('P16 vote: palette only allowed on final convert consensus');
 }
 const output={...ledger,entries:ledger.entries.map(x=>x===row?newRow:x)};
 const report=validateLedger(output);
 if(report.verifiedIndependentReviews!==0||report.trainingAuthorized||
   report.holdoutAccessed||report.promotionEligible)
  throw Error('P16 vote: false human review certification');
 return {ledger:output,report};
}
function main(args=process.argv.slice(2)){
 const command=parseArgs(args);
 const existing=readLocal();
 const {ledger,report}=applyVote(existing,command);
 saveLocal(ledger,existing);
 // No feature vector, case identifier, domain, answer or reviewer identity in logs.
 console.log(JSON.stringify({kind:'p16-local-vote-recorded-v1',
  recordedRegions:report.recordedRegions,
  declaredAgreement:report.declaredAgreement,
  verifiedIndependentReviews:0,trainingAuthorized:false,promotionEligible:false}));
}
if(require.main===module){
 try{main();}catch(e){console.error('P16 vote:',e.message);process.exitCode=1;}
}
module.exports=Object.freeze({parseArgs,applyVote,main});
