'use strict';
// P11: inferência offline da cor do texto. Modelo separado do MV3 distribuído.
// A rede sugere RGB; a barreira de segurança sempre verifica contraste real.
const KIND='p11-neural-descendant-rgb-experimental-v1';
function loadCandidate(core,candidate){
  if(!core||typeof core.loadModel!=='function'||!candidate||
    candidate.kind!==KIND||candidate.formatVersion!==1||
    candidate.featureCount!==12||candidate.outputCount!==3)
    throw new TypeError('P11: contrato de candidato inválido');
  const model=core.loadModel(candidate.model);
  if(model.inputSize!==12||model.outputSize!==3)
    throw new TypeError('P11: dimensões neurais inválidas');
  return model;
}
function featuresFor(colors,{background,text,sourceBackground,isLink=false,
  isLarge=false,explicitColor=true}){
  const parsed=[background,text,sourceBackground].map(s=>colors.parseColor(s));
  if(parsed.some(c=>!c||c.a!==1)||
    [isLink,isLarge,explicitColor].some(v=>typeof v!=='boolean'))
    throw new TypeError('P11: contexto de cores incompleto');
  return parsed.flatMap(c=>[c.r,c.g,c.b].map(v=>v/255))
    .concat([Number(isLink),Number(isLarge),Number(explicitColor)]);
}
function predictText(core,model,features,colors){
  if(!core||typeof core.predict!=='function'||!model||
    !Array.isArray(features)||features.length!==12||
    features.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||
    !colors||typeof colors.contrastRatio!=='function'||
    typeof colors.parseColor!=='function')
    throw new TypeError('P11: entradas de inferência inválidas');
  const output=core.predict(model,features);
  if(!output||output.length!==3||Array.from(output).some(v=>
    typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))
    throw new TypeError('P11: cor neural inválida');
  const fg='rgb('+Array.from(output,v=>Math.round(v*255)).join(', ')+')';
  const proposedBackground='rgb('+features.slice(0,3).map(v=>Math.round(v*255)).join(', ')+')';
  const ratio=colors.contrastRatio(colors.parseColor(fg),
    colors.parseColor(proposedBackground));
  if(!Number.isFinite(ratio)||ratio<(features[10]===1?3:4.5))
    return {action:'reject',reason:'insufficient-neural-contrast'};
  return {action:'suggest',color:fg};
}
module.exports=Object.freeze({KIND,loadCandidate,featuresFor,predictText});
