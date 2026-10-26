'use strict';
// P8: duas redes do Neural Core; nunca roda como content script MV3.
// Decisão: rede BCE. Cor: rede MSE. Nenhuma paleta de fallback algorítmica.
const KIND='neural-color-twohead-experimental-v1';
function loadCandidate(core,candidate){
  if(!core||typeof core.loadModel!=='function'||
    !candidate||candidate.kind!==KIND||candidate.formatVersion!==1||
    candidate.featureCount!==57||!candidate.heads||
    typeof candidate.threshold!=='number'||!Number.isFinite(candidate.threshold)||
    candidate.threshold<0||candidate.threshold>1)throw new TypeError('Contrato P8 inválido');
  const apply=core.loadModel(candidate.heads.apply);
  const rgb=core.loadModel(candidate.heads.rgb);
  if(apply.inputSize!==57||apply.outputSize!==1||rgb.inputSize!==57||rgb.outputSize!==6)
    throw new TypeError('Dimensões de rede P8 inválidas');
  return Object.freeze({apply,rgb,threshold:candidate.threshold});
}
function predictColors(core,loaded,features){
  if(!core||typeof core.predict!=='function'||!loaded||
    !Array.isArray(features)||features.length!==57||
    features.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0||x>1))
    throw new TypeError('Vetor de entrada P8 inválido');
  const score=core.predict(loaded.apply,features);
  if(score?.length!==1||!Number.isFinite(score[0])||score[0]<0||score[0]>1)
    throw new TypeError('Decisão neural inválida');
  if(score[0]<=loaded.threshold)return {action:'preserve',confidence:score[0]};
  const result=core.predict(loaded.rgb,features);
  if(result?.length!==6||Array.from(result).some(x=>
    typeof x!=='number'||!Number.isFinite(x)||x<0||x>1))
    throw new TypeError('Cores neurais inválidas');
  const fmt=offset=>'rgb('+Array.from(result.slice(offset,offset+3),
    v=>Math.round(v*255)).join(', ')+')';
  return {action:'convert',confidence:score[0],background:fmt(0),color:fmt(3)};
}
module.exports=Object.freeze({loadCandidate,predictColors,KIND});
