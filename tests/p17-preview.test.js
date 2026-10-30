'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSession}=require('../scripts/p17-preview-session.js');
const {HTML}=require('../scripts/p17-preview-browser.js');
function fixture(){
 const make=(background,fg)=>{
  const values=new Map([['background-color',background],['color',fg]]);
  const priority=new Map();
  return {getPropertyValue:k=>values.get(k)||'',
   getPropertyPriority:k=>priority.get(k)||'',
   setProperty:(k,v,p='')=>{values.set(k,v);priority.set(k,p)},
   removeProperty:k=>{values.delete(k);priority.delete(k)}};
 };
 const nodes=[
  {style:make('rgb(255, 255, 255)','rgb(12, 12, 12)'),isConnected:true},
  {style:make('rgb(251, 251, 251)','rgb(14, 14, 14)'),isConnected:true},
  {style:make('rgb(255, 255, 255)','rgb(10, 10, 10)'),isConnected:true}
 ];
 nodes.forEach((n,i)=>{n.closest=()=>null;n.querySelector=()=>i===2?{}:null;});
 const computed=n=>({getPropertyValue:k=>n.style.getPropertyValue(k),
  backgroundImage:'none',opacity:'1'});
 return {nodes,session:createSession(nodes,computed)};
}
const good=i=>({index:i,background:[16,20,24],foreground:[242,245,247]});
test('P17 preview fixture never fetches real pages',()=>{
 assert.equal(HTML.includes('http://'),false);
 assert.equal(HTML.includes('https://'),false);
 assert.equal(HTML.includes('fetch('),false);
});
test('P17 batch rejects any unsafe control before paint',()=>{
 const {nodes,session}=fixture();
 assert.throws(()=>session.apply([good(0),good(2)]),/P17:/);
 assert.equal(nodes[0].style.getPropertyPriority('background-color'),'');
 assert.throws(()=>session.apply([{...good(0),url:'secret'}]),/P17:/);
 assert.throws(()=>session.apply([{...good(0),background:[255,255,255]}]),/P17:/);
 assert.equal(session.rollback().restored,0);
});
test('P17 rollback restores owned declarations, preserves site CSS changes',()=>{
 const {nodes,session}=fixture();
 assert.equal(session.apply([good(0),good(1)]).painted,2);
 nodes[1].style.setProperty('background-color','rgb(120, 25, 25)','important');
 const result=session.rollback();
 assert.equal(result.restored,3);
 assert.equal(result.conflicts,1);
 assert.equal(nodes[0].style.getPropertyValue('background-color'),'rgb(255, 255, 255)');
 assert.equal(nodes[1].style.getPropertyValue('background-color'),'rgb(120, 25, 25)');
 assert.throws(()=>session.rollback(),/P17:/);
});
test('P17 preflight detects mutations after snapshot without modifying site',()=>{
 const {nodes,session}=fixture();
 nodes[0].style.setProperty('color','rgb(42, 42, 42)');
 assert.throws(()=>session.apply([good(0)]),/P17:/);
 assert.equal(nodes[0].style.getPropertyValue('color'),'rgb(42, 42, 42)');
 assert.equal(session.rollback().restored,0);
});
