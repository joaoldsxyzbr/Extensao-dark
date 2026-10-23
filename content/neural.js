/* Rede neural pequena, treinada localmente com amostras sintéticas curadas.
 * Gerada por: node scripts/train-neural.js (Node nativo).
 * Sem aprendizagem online, telemetria, dependências ou conexões externas. */
(function exposeNeural(root) {
  'use strict';
  const MODEL = Object.freeze({"input":3,"hidden":8,"w1":[[-0.4591304,2.9612279,22.3370299],[-1.6394145,-4.2042959,5.9498617],[-0.2664546,20.0165454,-1.3010157],[0.6242128,-1.5659089,1.2716371],[-1.922664,4.2662182,-3.8640002],[-0.3360619,1.4680141,-1.0643245],[15.3288408,-11.5538883,-2.434002],[1.2584863,-3.0425807,2.3658751]],"b1":[-18.0297639,-3.2293014,-4.7376316,-1.2027207,5.0545274,0.8625934,0.6113935,-3.4618697],"w2":[6.003161,1.2907013,-5.5824515,0.2869224,-2.2095975,-0.2495643,6.4963986,1.65606],"b2":-8.6136615});
  function probability(features) {
    if (!Array.isArray(features) || features.length !== MODEL.input) return 0;
    const x = features.map(value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);
    let sum = MODEL.b2;
    for (let j=0;j<MODEL.hidden;j++) {
      let a = MODEL.b1[j];
      for (let k=0;k<MODEL.input;k++) a += MODEL.w1[j][k]*x[k];
      sum += Math.tanh(a)*MODEL.w2[j];
    }
    return 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, sum))));
  }
  const api = Object.freeze({MODEL, probability});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DarkExtensionNeural = api;
})(globalThis);
