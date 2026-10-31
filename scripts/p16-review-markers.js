'use strict';
// P16 manual-only visual markers. Never loaded by the MV3 extension.
function captureReviewFrame(capture){
 if(typeof capture!=='function')throw Error('P16 visual: missing capture function');
 const refs=[];
 const graph=capture((element,index,rect)=>{
  if(!element?.ownerDocument||!Number.isSafeInteger(index)||index<0||
     index>=80||refs.length>=80||!rect||
     ![rect.top,rect.left,rect.width,rect.height].every(Number.isFinite))
   throw Error('P16 visual: invalid region');
  refs.push({element,index,rect});
 });
 if(!graph||graph.kind!=='p15-region-graph-v1'||graph.status!=='ready'||
    !Array.isArray(graph.nodes)||refs.length<2||
    graph.nodes.length!==refs.length||
    refs.some((r,i)=>r.index!==i||graph.nodes[i]?.index!==i))
  throw Error('P16 visual: incomplete graph or index mismatch');
 const markers=[];
 try{
  for(const {element,index,rect} of refs){
   if(!element.isConnected||rect.width<1||rect.height<1)
    throw Error('P16 visual: detached element');
   const doc=element.ownerDocument;
   if(!doc.documentElement)throw Error('P16 visual: detached document');
   const box=doc.createElement('div');
   box.setAttribute('data-p16-region-label',String(index));
   box.setAttribute('aria-hidden','true');
   box.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;'+
     'box-sizing:border-box;border:2px solid #00b8b0;background:transparent;';
   box.style.left=Math.max(0,rect.left)+'px';
   box.style.top=Math.max(0,rect.top)+'px';
   box.style.width=rect.width+'px';
   box.style.height=rect.height+'px';
   const tag=doc.createElement('span');
   tag.style.cssText='position:absolute;left:0;top:0;'+
     'padding:2px 5px;background:#063138;color:#fff;'+
     'font:700 12px/1.3 monospace;pointer-events:none;';
   tag.textContent='R'+index;
   box.appendChild(tag);
   doc.documentElement.appendChild(box);
   markers.push(box);
  }
 }catch(error){for(const marker of markers)marker.remove();throw error;}
 return {graph,markerCount:markers.length,
   status:'local-visual-unverified',verifiedHumanLabels:false,
   trainingAuthorized:false,promotionEligible:false};
}
// Removes every drawn marker so a fresh capture sees only the original page.
function clearReviewMarkers(){
 const stale=document.querySelectorAll('[data-p16-region-label]');
 stale.forEach(node=>node.remove());
 return stale.length;
}
// A review session is stable only when the region evidence observed at
// marker time is byte-identical to the evidence recaptured after the
// operator finished inspecting. Any churn (SPA, lazy load, layout shift,
// animation state) invalidates the marker-to-region binding.
function reviewSessionStable(original,current){
 if(!original||!current||typeof original!=='object'||typeof current!=='object'||
    original.kind!=='p15-region-graph-v1'||current.kind!=='p15-region-graph-v1'||
    original.status!=='ready'||current.status!=='ready')
  return false;
 if(!Array.isArray(original.nodes)||!Array.isArray(current.nodes)||
    original.nodes.length!==current.nodes.length)
  return false;
 return JSON.stringify(original.nodes)===JSON.stringify(current.nodes);
}
module.exports=Object.freeze({captureReviewFrame,clearReviewMarkers,
  reviewSessionStable});
