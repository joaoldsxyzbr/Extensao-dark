'use strict';
// P3: regras de julgamento de medições agregadas de páginas PÚBLICAS.
const SITES=Object.freeze([
  Object.freeze({id:'example',url:'https://example.com/',group:'static',minSamples:1}),
  Object.freeze({id:'wikipedia',url:'https://en.wikipedia.org/wiki/Cascading_Style_Sheets',group:'knowledge',minSamples:8}),
  Object.freeze({id:'mdn',url:'https://developer.mozilla.org/en-US/docs/Web/CSS/color',group:'documentation',minSamples:8}),
  Object.freeze({id:'github',url:'https://github.com/',group:'application',minSamples:8}),
  Object.freeze({id:'roblox',url:'https://www.roblox.com/',group:'application',minSamples:8}),
  Object.freeze({id:'youtube',url:'https://www.youtube.com/',group:'media',minSamples:8})
]);
const KNOWN=new Map(SITES.map(s=>[s.id,s]));
const DEFAULT_IDS=Object.freeze(['example','wikipedia','github']);
function chooseSites(value=DEFAULT_IDS.join(',')){
  if(typeof value!=='string'||value.length>200)throw Error('Lista de sites inválida');
  const ids=value.split(',').map(v=>v.trim()).filter(Boolean);
  if(!ids.length||ids.length>6||new Set(ids).size!==ids.length)throw Error('Seleção vazia, repetida ou grande demais');
  return ids.map(id=>{
    if(!KNOWN.has(id))throw Error('Site fora da lista pública aprovada: '+id);
    return KNOWN.get(id);
  });
}
function isAllowedLanding(site,landedUrl){
  try {
    const initial=new URL(site.url),landed=new URL(landedUrl);
    return landed.protocol==='https:' && (landed.hostname===initial.hostname ||
      landed.hostname==='www.'+initial.hostname ||
      initial.hostname==='www.'+landed.hostname);
  }catch{return false;}
}
function checkSnapshot(snapshot,site){
  if(!snapshot||!Number.isSafeInteger(snapshot.totalElements)||
    !Number.isSafeInteger(snapshot.sampledText)||
    !Number.isSafeInteger(snapshot.maskedIcons)||
    !Number.isSafeInteger(snapshot.weakText)||
    !Number.isSafeInteger(snapshot.weakIcons)||
    !Number.isSafeInteger(snapshot.changedBackgrounds)||
    snapshot.totalElements<site.minSamples||snapshot.sampledText<site.minSamples||
    snapshot.weakText<0||snapshot.weakIcons<0||snapshot.weakText>snapshot.sampledText||
    snapshot.weakIcons>snapshot.maskedIcons||
    !isAllowedLanding(site,snapshot.landingUrl)) return false;
  return true;
}
// Comparação limitada: páginas públicas podem mudar entre inicializações.
// A contagem é apenas sinal de regressão, não prova de correção.
function assessPair(site,baseline,candidate){
  if(!checkSnapshot(baseline,site)||!checkSnapshot(candidate,site)){
    return {status:'inconclusive',reason:'Sem amostras suficientes, URL mudou ou carregamento bloqueado'};
  }
  if(!baseline.extensionActive||!candidate.extensionActive){
    if(!baseline.extensionActive&&!candidate.extensionActive&&
       baseline.nativeDarkDetected===true&&candidate.nativeDarkDetected===true){
      return {status:'expected-native-dark-skip',evidence:'native-dark-both-models',
        reason:'As duas versões preservaram o tema nativo detectado'};
    }
    return {status:'inconclusive',reason:'Extensão inativa sem evidência consistente de tema escuro nativo'};
  }
  const ratio=(snapshot,key,base)=>snapshot[base]?snapshot[key]/snapshot[base]:0;
  const oldText=ratio(baseline,'weakText','sampledText');
  const newText=ratio(candidate,'weakText','sampledText');
  const oldIcons=ratio(baseline,'weakIcons','maskedIcons');
  const newIcons=ratio(candidate,'weakIcons','maskedIcons');
  const notes=[];
  // Uma diferença de um ícone único já merece revisão, mas não é benchmark
  // de precisão: amostras e layout podem não estar idênticos.
  if(candidate.weakIcons>baseline.weakIcons && newIcons>oldIcons+.04)
    notes.push('possível perda de contraste em ícones mascarados');
  if(candidate.weakText>baseline.weakText+2 && newText>oldText+.05)
    notes.push('possível perda de contraste em texto');
  if(candidate.totalElements<baseline.totalElements*.65)
    notes.push('quantidade de componentes caiu entre perfis');
  return {status:notes.length?'needs-review':'observed-no-regression',
    notes,baseline:{sampledText:baseline.sampledText,weakText:baseline.weakText,
      maskedIcons:baseline.maskedIcons,weakIcons:baseline.weakIcons,
      changedBackgrounds:baseline.changedBackgrounds},
    candidate:{sampledText:candidate.sampledText,weakText:candidate.weakText,
      maskedIcons:candidate.maskedIcons,weakIcons:candidate.weakIcons,
      changedBackgrounds:candidate.changedBackgrounds}};
}
function promotionGate(results){
  const pairs=results.filter(r=>r&&r.assessment).map(r=>r.assessment);
  // Nunca liberar com base só no laboratório automático: precisa de revisão
  // humana de capturas, rótulos independentes e teste de UX em sites reais.
  return {ready:false,reason:'Revisão visual manual e validação externa ainda são obrigatórias',
    observed:pairs.filter(a=>a.status==='observed-no-regression').length,
    expectedSkips:pairs.filter(a=>a.status==='expected-native-dark-skip').length,
    needsReview:pairs.filter(a=>a.status==='needs-review').length,
    inconclusive:pairs.filter(a=>a.status==='inconclusive').length};
}
module.exports=Object.freeze({SITES,chooseSites,isAllowedLanding,checkSnapshot,assessPair,promotionGate});
