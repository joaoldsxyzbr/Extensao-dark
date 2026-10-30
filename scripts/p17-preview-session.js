'use strict';
// P17: transaction primitive for isolated rehearsal, NOT loaded by the MV3.
function createSession(nodes,computed=el=>getComputedStyle(el)){
 const props=['background-color','color'],regex=/^rgb\(\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\s*\)$/;
 const parse=s=>{const m=regex.exec(s||'');if(!m)return null;
  const a=m.slice(1).map(Number);return a.every(v=>v<=255)?a:null;};
 const luma=a=>{const f=v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);};
  return .2126*f(a[0])+.7152*f(a[1])+.0722*f(a[2]);};
 const contrast=(a,b)=>{const x=luma(a),y=luma(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 const rgb=a=>'rgb('+a.join(', ')+')';
 const valid=a=>Array.isArray(a)&&a.length===3&&a.every(n=>
  Number.isInteger(n)&&n>=0&&n<=255);
 if(!Array.isArray(nodes)||!nodes.length||nodes.length>12||
    nodes.some(n=>!n||!n.style||!n.isConnected))
  throw Error('P17: invalid bounded session');
 let closed=false,hasApplied=false;
 const records=nodes.map(node=>({
  node,original:props.map(p=>({
   value:node.style.getPropertyValue(p),priority:node.style.getPropertyPriority(p)})),
  computed:props.map(p=>computed(node).getPropertyValue(p)),applied:null
 }));
 function rollback(){
  if(closed)throw Error('P17: transaction already closed');
  let restored=0,conflicts=0;
  for(const item of records){
   if(!item.applied)continue;
   props.forEach((p,i)=>{
    if(item.node.style.getPropertyValue(p)===item.applied[i]&&
       item.node.style.getPropertyPriority(p)==='important'){
     const previous=item.original[i];
     if(previous.value)item.node.style.setProperty(p,previous.value,previous.priority);
     else item.node.style.removeProperty(p);
     restored++;
    }else conflicts++;
   });
   item.applied=null;
  }
  closed=true;
  return {status:'rolled-back',restored,conflicts};
 }
 function apply(proposals){
  if(closed||hasApplied||!Array.isArray(proposals)||
     !proposals.length||proposals.length>records.length)
   throw Error('P17: invalid or repeated apply');
  const seen=new Set(),changes=[];
  // Reject the full batch before painting anything.
  for(const p of proposals){
   if(!p||typeof p!=='object'||Array.isArray(p)||
      Object.keys(p).sort().join(',')!=='background,foreground,index'||
      !Number.isInteger(p.index)||p.index<0||p.index>=records.length||
      seen.has(p.index)||!valid(p.background)||!valid(p.foreground)||
      luma(p.background)>.16||luma(p.foreground)<.7||
      contrast(p.background,p.foreground)<7)
    throw Error('P17: invalid palette or duplicate region');
   seen.add(p.index);
   const item=records[p.index],el=item.node,style=computed(el);
   if(!el.isConnected||
      el.closest('form,svg,canvas,[data-extensao-dark-ignore]')||
      el.querySelector('input,textarea,select,button,svg,canvas,img,video,[data-extensao-dark-ignore]')||
      item.original.some((original,i)=>
       el.style.getPropertyValue(props[i])!==original.value||
       el.style.getPropertyPriority(props[i])!==original.priority)||
      item.computed.some((value,i)=>style.getPropertyValue(props[i])!==value)||
      style.backgroundImage!=='none'||style.opacity!=='1')
    throw Error('P17: protected, stale or complex surface');
   const originalBg=parse(style.getPropertyValue(props[0]));
   if(!originalBg||luma(originalBg)<.85)throw Error('P17: dark or uncertain background');
   changes.push({item,values:[rgb(p.background),rgb(p.foreground)]});
  }
  hasApplied=true;
  try{
   for(const {item,values} of changes){
    item.applied=values;
    props.forEach((prop,i)=>item.node.style.setProperty(prop,values[i],'important'));
   }
   for(const {item,values} of changes){
    const style=computed(item.node);
    if(props.some((p,i)=>style.getPropertyValue(p)!==values[i])||
       contrast(parse(style.getPropertyValue(props[0]))||[255,255,255],
                parse(style.getPropertyValue(props[1]))||[0,0,0])<7)
     throw Error('P17: CSS audit failure');
   }
   return {status:'preview-only',painted:changes.length};
  }catch(error){rollback();throw error;}
 }
 return Object.freeze({apply,rollback});
}
module.exports=Object.freeze({createSession});