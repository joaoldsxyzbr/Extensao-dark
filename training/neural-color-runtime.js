'use strict';
// P7: contrato de inferência neural de cores, ainda NÃO carregado no manifesto.
// A saída vem exclusivamente de core.predict; sem conversão heurística de cores.
const INPUTS=57,OUTPUTS=7,THRESHOLD=0.65;
function decode(core,model,features){
  if(!core||typeof core.predict!=='function' ||!model||
     model.inputSize!==INPUTS||model.outputSize!==OUTPUTS||
     !Array.isArray(features)||features.length!==INPUTS||
     features.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))
    throw new TypeError('Entrada/modelo P7 incompatível');
  const values=core.predict(model,features);
  if(!values||values.length!==OUTPUTS||Array.from(values).some(v=>
    typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))
    throw new TypeError('Saída neural P7 inválida');
  const probability=values[0];
  if(probability<THRESHOLD)return {action:'preserve',confidence:probability};
  const rgb=start=>'rgb('+Array.from(values.slice(start,start+3),
    n=>Math.max(0,Math.min(255,Math.round(n*255)))).join(', ')+')';
  return {action:'convert',confidence:probability,
    background:rgb(1),color:rgb(4)};
}
module.exports=Object.freeze({decode,INPUTS,OUTPUTS,THRESHOLD});
