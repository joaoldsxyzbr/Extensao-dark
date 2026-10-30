/* P17: optional local beta gate. No approved regional weights exist yet.
 * It deliberately routes ALL configurations to the shipped classic engine.
 * Does not sample DOM, access storage, browse, fetch, emit logs or paint CSS.
 */
(function(root){
  'use strict';
  const CAPABILITIES=Object.freeze({
    kind:'p17-mv3-ai-first-beta-gate-v1',
    regionalModelApproved:false,
    regionalInferenceEnabled:false,
    autoTrainingEnabled:false,
    independentValidationComplete:false,
    releaseEligible:false
  });
  function selectEngine(settings){
    const options=settings&&typeof settings==='object'?settings:{};
    const requested=options.aiFirstBeta===true;
    let reason='beta-off';
    if(requested&&options.enabled!==true)reason='extension-disabled';
    else if(requested&&options.smartEnabled!==true)reason='neural-mode-disabled';
    else if(requested)reason='regional-model-not-approved';
    // Until the independent review and model provenance gates actually pass,
    // neither a storage setting nor a synthetic training artifact can enable AI.
    return Object.freeze({engine:'classic',requested,
      reason,modelApproved:false,promotionEligible:false});
  }
  const api=Object.freeze({selectEngine,CAPABILITIES});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.DarkExtensionAIFirstBeta=api;
})(globalThis);
