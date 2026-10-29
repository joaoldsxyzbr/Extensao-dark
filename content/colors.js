/* Funções puras compartilhadas entre o content script e os testes (sem dependências). */
(function exposeColorTools(root) {
  'use strict';

  const PALETTE = Object.freeze({soft: 0.145, deep: 0.09, amoled: 0});

  function parseColor(value) {
    if (typeof value !== 'string') return null;
    const match = /^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*(?:\/|,)\s*([\d.]+%?))?\s*\)$/i.exec(value.trim());
    if (!match) return null;
    const [r, g, b] = match.slice(1, 4).map(Number);
    const a = match[4] == null ? 1 : (match[4].endsWith('%') ? Number(match[4].slice(0, -1)) / 100 : Number(match[4]));
    if (![r, g, b, a].every(Number.isFinite) || [r, g, b].some(n => n < 0 || n > 255) || a < 0 || a > 1) return null;
    return {r, g, b, a};
  }

  function luminance(color) {
    const linear = [color.r, color.g, color.b].map(n => {
      const s = n / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function rgbToHsl({r, g, b}) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / delta) % 6; break;
        case g: h = (b - r) / delta + 2; break;
        default: h = (r - g) / delta + 4;
      }
      h = (h * 60 + 360) % 360;
    }
    return {h, s, l};
  }

  function hslToCss(h, s, l) {
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - chroma / 2;
    const zones = [[chroma,x,0],[x,chroma,0],[0,chroma,x],[0,x,chroma],[x,0,chroma],[chroma,0,x]];
    const rgb = zones[Math.min(5, Math.floor(h / 60))].map(v => Math.round((v + m) * 255));
    return `rgb(${rgb.join(', ')})`;
  }

  function mapBackground(color, theme = 'deep', allowMedium = false) {
    if (!color || color.a < 0.12 || luminance(color) < (allowMedium ? 0.17 : 0.35)) return null;
    const {h, s, l} = rgbToHsl(color);
    const base = PALETTE[theme] ?? PALETTE.deep;
    const targetL = base === 0 ? Math.max(0, (1 - l) * 0.09) : Math.min(0.25, base + (1 - l) * 0.13);
    return hslToCss(h, Math.min(s * 0.48, 0.30), targetL);
  }

  function mapNativeBackground(background, foreground, theme = 'deep') {
    // Ao forçar a aparência, harmonizar superfícies que já são escuras.
    // Nunca normalizar acentos coloridos, transparências ou textos escuros.
    if (!background || !foreground || background.a < .95 || foreground.a < .7 ||
        luminance(background) > .12 || luminance(foreground) < .45 ||
        isVividAccent(background)) return null;
    const {s, l} = rgbToHsl(background);
    const base = PALETTE[theme] ?? PALETTE.deep;
    const variation = Math.max(-.04, Math.min(.09, (l - .09) * .6));
    return hslToCss(210, Math.min(.12, s * .35), Math.max(0, Math.min(.28, base + variation)));
  }

  function mapTranslucentBackground(color, text, backdrop, theme = 'deep') {
    // Corrige apenas superfícies claramente claras com texto escuro sobre
    // um fundo escuro conhecido. Mantém o alpha e ignora overlays decorativos.
    if (!color || !text || !backdrop || color.a < .35 || color.a >= .95 ||
        backdrop.a < .99 || luminance(backdrop) >= .30 ||
        luminance(color) < .60 || luminance(text) > .28 ||
        isVividAccent(color)) return null;
    const mapped = mapBackground({...color, a: 1}, theme, true);
    if (!mapped) return null;
    const rgb = parseColor(mapped);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${color.a})`;
  }

  function mapBorder(color, theme = 'deep') {
    if (!color || color.a < .65 || isVividAccent(color) || luminance(color) < .35) return null;
    const {h, s} = rgbToHsl(color);
    const tone = theme === 'amoled' ? .30 : theme === 'soft' ? .38 : .34;
    return hslToCss(h, Math.min(s * .45, .28), tone);
  }

  function mapText(color) {
    if (!color || color.a < 0.12 || luminance(color) > 0.54) return null;
    const {h, s, l} = rgbToHsl(color);
    return hslToCss(h, Math.min(s * 0.65, 0.7), Math.max(0.72, 0.90 - l * 0.2));
  }

  // Um site já escuro, com texto claro legível, deve continuar com suas próprias cores.
  function isVividAccent(color) {
    if (!color || color.a < .65) return false;
    const {s, l} = rgbToHsl(color);
    return s >= .55 && l >= .20 && l <= .82;
  }

  function contrastRatio(first, second) {
    if (!first || !second) return 1;
    const a = luminance(first), b = luminance(second);
    return (Math.max(a,b) + 0.05) / (Math.min(a,b) + 0.05);
  }

  // Características numéricas de contexto, em ordem estável para treino e inferência.
  function neuralFeatures(background, foreground, ancestor, state = {}) {
    if (!background || !foreground) return null;
    const n = value => Math.max(0, Math.min(1, value));
    return [
      n(luminance(background)), n(luminance(foreground)), n(background.a),
      n(rgbToHsl(background).s), ancestor ? n(luminance(ancestor)) : 1,
      state.control ? 1 : 0, state.selected ? 1 : 0
    ];
  }

  function compositeColor(foreground, background) {
    if (!foreground || !background) return null;
    const a = foreground.a;
    return {
      r: foreground.r * a + background.r * (1 - a),
      g: foreground.g * a + background.g * (1 - a),
      b: foreground.b * a + background.b * (1 - a),
      a: 1
    };
  }

  function textContrastThreshold(style) {
    const size = parseFloat(style?.fontSize);
    const weight = style?.fontWeight;
    const bold = weight === 'bold' || weight === 'bolder' || Number(weight) >= 700;
    if (Number.isFinite(size) && (size >= 24 || (bold && size >= 18.6667))) return 3;
    return 4.5;
  }

  function ensureContrast(foreground, background, threshold) {
    if (!foreground || !background || ![3, 4.5].includes(threshold) ||
        foreground.a < .25 || background.a < .99) return null;
    const visible = compositeColor(foreground, background);
    if (contrastRatio(visible, background) >= threshold) return null;
    // Aproxima o tom original da cor mais clara ou mais escura que alcance a razão.
    // Preserva a matiz sempre que possível e evita substituir tudo por branco puro.
    const candidates = [];
    for (const target of [0, 255]) {
      let lo = 0, hi = 1;
      const mix = ratio => ({
        r: Math.round(foreground.r + (target - foreground.r) * ratio),
        g: Math.round(foreground.g + (target - foreground.g) * ratio),
        b: Math.round(foreground.b + (target - foreground.b) * ratio), a: 1
      });
      if (contrastRatio(mix(1), background) < threshold) continue;
      for (let i=0;i<16;i++) {
        const mid = (lo+hi)/2;
        if (contrastRatio(mix(mid), background) >= threshold + .015) hi = mid;
        else lo = mid;
      }
      const result = mix(hi);
      if (contrastRatio(result, background) >= threshold) candidates.push({color:result, distance:hi});
    }
    if (!candidates.length) return null;
    const chosen = candidates.reduce((a,b)=> a.distance <= b.distance ? a : b).color;
    return `rgb(${chosen.r}, ${chosen.g}, ${chosen.b})`;
  }

  function isNativeDarkSurface(background, foreground) {
    const bg = parseColor(background);
    const fg = parseColor(foreground);
    return Boolean(bg && fg && bg.a >= 0.95 && fg.a >= 0.7 &&
      luminance(bg) <= 0.12 && luminance(fg) >= 0.45);
  }


  // P1: contexto visual usado pelo motor ANTES de transformar qualquer cor.
  // Não consulta texto da página, valores de formulário ou qualquer URL externa.
  function visualContext(element, style={}, readPseudo) {
    const tag=String(element?.tagName||'').toUpperCase();
    const attr=name=>element?.getAttribute?.(name)??null;
    const role=String(attr('role')||'').toLowerCase();
    const cls=String(attr('class')||'');
    const present=value=>typeof value==='string'&&value.trim()!==''&&value.trim()!=='none';
    const masked=present(style.maskImage)||present(style.webkitMaskImage);
    const backgroundImage=present(style.backgroundImage);
    const clipped=present(style.clipPath)||present(style.webkitClipPath);
    const control=['INPUT','SELECT','TEXTAREA','BUTTON','PROGRESS','METER'].includes(tag)||
      /^(button|checkbox|radio|switch|textbox|combobox|searchbox|tab|slider)$/.test(role);
    const state=attr('data-state'),current=attr('aria-current');
    const selected=attr('aria-selected')==='true'||attr('aria-pressed')==='true'||
      (current!=null&&current!=='false')||['active','selected','checked'].includes(state)||
      /(?:^|\s)(?:active|selected|current)(?:\s|$)/i.test(cls);
    const disabled=element?.hasAttribute?.('disabled')===true||attr('aria-disabled')==='true';
    const w=parseFloat(style.width),h=parseFloat(style.height);
    const compact=Number.isFinite(w)&&w>0&&w<=72&&Number.isFinite(h)&&h>0&&h<=72;
    const graphicRole=role==='img';
    const iconName=/(?:^|[-_\s])(icon|glyph|sprite|pictogram|symbol|pseudo)(?:$|[-_\s])/i.test(cls);
    const wrapper=compact&&['SPAN','I','B','EM','A','BUTTON','DIV'].includes(tag);
    const hasGraphicChild=wrapper&&element?.querySelector?.('svg, img, canvas, picture')!=null;
    let pseudo=false;
    if(wrapper&&(graphicRole||iconName)&&!masked&&!backgroundImage&&typeof readPseudo==='function'){
      try {
        pseudo=Boolean(readPseudo()?.some(s=>s&&(
          present(s.maskImage)||present(s.webkitMaskImage)||
          present(s.backgroundImage)||(present(s.content)&&iconName))));
      }catch { /* Pseudo-elementos podem ser indisponíveis no ambiente. */ }
    }
    const graphic=masked||backgroundImage||clipped||graphicRole||
      ['SVG','PATH','IMG','PICTURE','CANVAS','VIDEO','AUDIO','SOURCE'].includes(tag)||
      (compact&&iconName)||hasGraphicChild||pseudo;
    const bg=parseColor(style.backgroundColor),fg=parseColor(style.color);
    const text=['P','H1','H2','H3','H4','H5','H6','SMALL','LABEL','STRONG',
      'EM','A','SPAN','CODE','PRE','LI'].includes(tag);
    const kind=graphic?'graphic':control?'control':text&&(!bg||bg.a<.12)?'text':'surface';
    const action=graphic?'preserve':kind==='text'?'contrast':'convert';
    return Object.freeze({kind,action,control,selected,disabled,masked,backgroundImage,
      clipped,compact,pseudo,translucent:Boolean(bg&&bg.a>=.12&&bg.a<.95),
      nativeDark:isNativeDarkSurface(style.backgroundColor,style.color),
      contrast:contrastRatio(bg,fg)});
  }

  // P1: vetor preparado para treino contextual futuro; as 7 primeiras dimensões
  // continuam idênticas às do modelo versionado existente.
  const CONTEXT_FEATURE_COUNT=18;
  function contextFeatures(background,foreground,ancestor,context={}) {
    const base=neuralFeatures(background,foreground,ancestor,context);
    if(!base)return null;
    const bit=value=>value?1:0;
    return base.concat([
      context.kind==='graphic',context.backgroundImage,context.masked,
      context.pseudo,context.clipped,context.control,context.disabled,
      context.translucent
    ].map(bit),Math.max(0,Math.min(1,(Number(context.contrast)||1)/21)),
      bit(context.nativeDark),bit(context.compact));
  }

  // P5: extrator avançado compartilhado entre corpus e futura inferência.
  // As 18 dimensões do P2 nunca mudam. Estes sinais são somente CSS computado;
  // não consultam DOM, strings de texto, URLs, campos ou estado do usuário.
  const ADVANCED_FEATURE_NAMES=Object.freeze([
    'backgroundLuminance','foregroundLuminance','backgroundAlpha',
    'backgroundSaturation','ancestorLuminance','control','selected',
    'graphic','backgroundImage','mask','pseudo','clip','isControl','disabled',
    'translucent','contrast','nativeDark','compact',
    'displayGrid','displayFlex','displayInline','positionOverlay','positionSticky',
    'opacity','fontSize','fontWeight','lineHeight','borderRadius','borderWidth',
    'outlineWidth','boxShadow','textShadow','filter','backdropFilter',
    'mixBlend','isolation','overflowHidden','overflowScroll','pointerNone',
    'pointerCursor','zIndex','width','height','aspect','gradient','rasterImage',
    'pseudoContent','colorSchemeDark'
  ]);
  const ADVANCED_FEATURE_COUNT=ADVANCED_FEATURE_NAMES.length;
  function advancedStyleFeatures(style={}) {
    const s=style||{};
    const text=(key,fallback='')=>String(s[key]??fallback).trim().toLowerCase();
    const numeric=(value,fallback=0)=>{
      const n=parseFloat(value);
      return Number.isFinite(n)?n:fallback;
    };
    const clamp=(v,min,max)=>Math.max(0,Math.min(1,(v-min)/(max-min)));
    const visible=key=>!['','none','normal','initial','unset'].includes(text(key));
    const contains=(key,re)=>re.test(text(key));
    const px=(key,scale)=>clamp(numeric(text(key)),0,scale);
    const weight=text('fontWeight','normal');
    const weightValue=weight==='bold'||weight==='bolder'?700:
      weight==='normal'||weight==='lighter'?400:numeric(weight,400);
    const bg=text('backgroundImage','none');
    const w=numeric(text('width')),h=numeric(text('height'));
    const z=text('zIndex');
    const zNum=numeric(z);
    const border=Math.max(...['borderTopWidth','borderRightWidth',
      'borderBottomWidth','borderLeftWidth'].map(key=>numeric(text(key))));
    const overflow=[text('overflowX'),text('overflowY'),text('overflow')];
    const output=[
      contains('display',/^(inline-)?grid$/)?1:0,
      contains('display',/^(inline-)?flex$/)?1:0,
      contains('display',/^inline(?:-block|-table)?$/)?1:0,
      contains('position',/^(absolute|fixed)$/)?1:0,
      text('position')==='sticky'?1:0,
      clamp(numeric(text('opacity','1'),1),0,1),
      px('fontSize',72),
      clamp(weightValue,100,900),
      px('lineHeight',96),
      px('borderTopLeftRadius',80),
      clamp(border,0,16),
      px('outlineWidth',16),
      visible('boxShadow')?1:0,
      visible('textShadow')?1:0,
      visible('filter')?1:0,
      visible('backdropFilter')||visible('webkitBackdropFilter')?1:0,
      !['','normal'].includes(text('mixBlendMode'))?1:0,
      text('isolation')==='isolate'?1:0,
      overflow.includes('hidden')||overflow.includes('clip')?1:0,
      overflow.some(x=>['auto','scroll'].includes(x))?1:0,
      text('pointerEvents')==='none'?1:0,
      contains('cursor',/^(pointer|grab|grabbing)$/)?1:0,
      z==='auto'||!z?0:clamp(zNum,-10,100),
      clamp(w,0,1600),
      clamp(h,0,1200),
      w>0&&h>0?clamp(w/h,0,5):0,
      /(linear|radial|conic)-gradient\(/.test(bg)?1:0,
      /url\(/.test(bg)?1:0,
      !['','normal','none'].includes(text('content'))?1:0,
      contains('colorScheme',/(?:^|\s)dark(?:$|\s)/)?1:0
    ];
    return output.map(n=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0);
  }
  function advancedContextFeatures(background,foreground,ancestor,context={},style={}) {
    const base=contextFeatures(background,foreground,ancestor,context);
    return base ? base.concat(advancedStyleFeatures(style)) : null;
  }

  // P4: separa confiança do modelo de autorização para modificar um
  // componente. Nunca converte grafismos, transparências ou superfícies
  // já escuras. O candidato contextual exige margem extra de confiança.
  // P14: when a neural vote leaves a near-white, viewport-sized canvas
  // untreated, recover only opaque and legible background surfaces. This is
  // deliberately not a rule for specific websites or small decorative cards.
  function shouldRecoverBrightCanvas(background, foreground, context={},geometry={}) {
    const foregroundLuminance=foreground?luminance(foreground):null;
    const inheritedOnDark=foregroundLuminance!==null&&
      foregroundLuminance>=.55&&typeof geometry.ancestorLuminance==='number'&&
      Number.isFinite(geometry.ancestorLuminance)&&
      geometry.ancestorLuminance<.22;
    if(!background||!foreground||background.a<.999||foreground.a<.999||
        luminance(background)<.85||
        (foregroundLuminance>.22&&!inheritedOnDark)||
        context.action!=='convert'||context.control||context.selected||
        context.disabled||context.nativeDark||context.backgroundImage||
        context.masked||context.clipped||context.pseudo||context.translucent||
        context.kind==='graphic')return false;
    const {width,height,viewportWidth,viewportHeight,position,opacity}=geometry;
    if([width,height,viewportWidth,viewportHeight].some(v=>
        typeof v!=='number'||!Number.isFinite(v)||v<=0)||
        viewportWidth<100||viewportHeight<100||
        width<viewportWidth*.65||height<viewportHeight*.45||
        ['fixed','sticky'].includes(position)||opacity!==1)return false;
    return true;
  }

  function neuralDecision(score, context, modelInputs=7) {
    if (!context || !Number.isFinite(score) || score<0 || score>1 ||
        ![7,18].includes(modelInputs)) return {convert:false,reason:'invalid'};
    if (context.action!=='convert' || context.kind==='graphic' ||
        context.masked || context.clipped || context.backgroundImage ||
        context.pseudo || context.translucent || context.nativeDark) {
      return {convert:false,reason:'protected'};
    }
    if (modelInputs===18 && context.control && (context.selected || context.disabled))
      return {convert:false,reason:'control-state'};
    const threshold=modelInputs===18?.90:.80;
    return {convert:score>=threshold,
      reason:score>=threshold?'approved':'low-confidence'};
  }

  function isEnabledForSite(settings, hostname) {
    return settings.enabled !== false && !(Array.isArray(settings.disabledHosts) && settings.disabledHosts.includes(hostname));
  }

  // Com all_frames=true, desabilitar a aba superior deve prevalecer também
  // sobre iframes em domínios de terceiros (Chrome location.ancestorOrigins).
  function isEnabledForFrame(settings,hostname,ancestorOrigins=[]) {
    if(!isEnabledForSite(settings,hostname))return false;
    for(const origin of ancestorOrigins){
      try {
        const parent=new URL(origin);
        if(['http:','https:'].includes(parent.protocol)&&
          !isEnabledForSite(settings,parent.hostname))return false;
      } catch { /* ancestorOrigin opaca/desconhecida: não inferir host */ }
    }
    return true;
  }

  const api = Object.freeze({shouldRecoverBrightCanvas, parseColor, luminance, mapBackground, mapNativeBackground, mapTranslucentBackground, mapBorder, mapText, isVividAccent, contrastRatio, neuralFeatures, compositeColor, ensureContrast, textContrastThreshold, isNativeDarkSurface, visualContext, contextFeatures, CONTEXT_FEATURE_COUNT, advancedStyleFeatures, advancedContextFeatures, ADVANCED_FEATURE_NAMES, ADVANCED_FEATURE_COUNT, neuralDecision, isEnabledForSite, isEnabledForFrame});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DarkExtensionColors = api;
})(globalThis);
