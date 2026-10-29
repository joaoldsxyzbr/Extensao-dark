/* Motor inicial: transforma cores da página localmente, sem CSS filter e sem ler conteúdo dos formulários. */
(() => {
  'use strict';
  const colors = globalThis.DarkExtensionColors;
  const neural = globalThis.DarkExtensionNeural;
  if (!colors || !/^https?:$/.test(location.protocol)) return;

  const DEFAULTS = {enabled: true, theme: 'deep', disabledHosts: [], smartEnabled: true, ignoreNativeDark: false};
  const SKIP_TAGS = new Set(['IMG', 'PICTURE', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG', 'PATH', 'SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'SOURCE', 'TRACK']);
  const originals = new Map();
  const styleSnapshots = new WeakMap();
  const work = [];
  const MAX_PENDING_ROOTS = 40;
  const predictionCache = new Map();
  let settings = DEFAULTS;
  let generation = 0;
  let running = false;
  let observer = null;
  let themeObserver = null;
  let observedShadowRoots = new WeakSet();
  let baseStyle = null;

  const ancestorOrigins=Array.from(location.ancestorOrigins || []);
  function isEnabledInFrame(value) {
    return colors.isEnabledForFrame(value, location.hostname, ancestorOrigins);
  }
  function isActive() {
    return isEnabledInFrame(settings);
  }

  function hasExplicitDarkTheme() {
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      if (el.hasAttribute?.('dark') || el.hasAttribute?.('dark-theme')) return true;
      for (const name of ['data-theme', 'data-color-scheme', 'data-bs-theme']) {
        if (el.getAttribute?.(name)?.toLowerCase() === 'dark') return true;
      }
      const className = el.getAttribute?.('class') || '';
      if (/(?:^|\s)(?:dark|dark-mode|theme-dark|dark-theme)(?:\s|$)/i.test(className)) return true;
    }
    return false;
  }

  function hasNativeDarkTheme() {
    if (hasExplicitDarkTheme()) return true;
    // As cores computadas, após a ativação, já incluem as nossas alterações.
    if (baseStyle) return false;
    // Verifica apenas superfícies principais, não cartões isolados.
    const candidates = [document.documentElement, document.body, document.body?.firstElementChild];
    let hasDarkSurface = false;
    for (const element of candidates) {
      if (!element) continue;
      const style = getComputedStyle(element);
      const background = colors.parseColor(style.backgroundColor);
      // Um documento claro com apenas uma barra superior escura não é uma página escura.
      if (background && background.a >= 0.95 && colors.luminance(background) >= 0.72) return false;
      if (colors.isNativeDarkSurface(style.backgroundColor, style.color)) hasDarkSurface = true;
    }
    return hasDarkSurface;
  }

  function backgroundForPalette() {
    return ({soft: '#25282b', deep: '#17191c', amoled: '#000000'})[settings.theme] || '#17191c';
  }

  function installBaseStyle() {
    baseStyle = document.createElement('style');
    baseStyle.id = 'extensao-dark-base';
    baseStyle.textContent = `html[data-extensao-dark="on"] {
      color-scheme: dark !important;
      background-color: ${backgroundForPalette()} !important;
    }
    html[data-extensao-dark="on"] ::selection {
      background-color: #446d9b !important;
      color: #ffffff !important;
    }`;
    document.documentElement.appendChild(baseStyle);
    document.documentElement.setAttribute('data-extensao-dark', 'on');
  }

  function restoreProperty(element, property, saved) {
    // Se o site alterou o estilo durante a execução, não sobrepor sua alteração.
    if (element.style.getPropertyValue(property) !== saved.applied || element.style.getPropertyPriority(property) !== 'important') return;
    if (saved.original) element.style.setProperty(property, saved.original, saved.priority);
    else element.style.removeProperty(property);
  }

  function restoreEverything() {
    for (const [element, record] of originals) {
      restoreRecord(element, record);
    }
    originals.clear();
    document.documentElement.removeAttribute('data-extensao-dark');
    baseStyle?.remove();
    baseStyle = null;
  }

  function neuralScore(background, foreground, ancestor, state) {
    if (!neural || !background || !foreground) return 0;
    const expected = neural.MODEL?.input ?? 7;
    // P4: não calcula as 11 dimensões adicionais para o modelo legado.
    const features = expected === 7 ?
      colors.neuralFeatures(background,foreground,ancestor,state) :
      expected === colors.CONTEXT_FEATURE_COUNT ?
      colors.contextFeatures(background,foreground,ancestor,state) : null;
    if (!features) return 0;
    // Chave sem arredondamento: duas superfícies com contraste diferente
    // jamais compartilham acidentalmente a mesma previsão.
    const key = features.join(':');
    if (predictionCache.has(key)) return predictionCache.get(key);
    const score = neural.probability(features);
    if (predictionCache.size >= 256) predictionCache.clear();
    predictionCache.set(key, score);
    return score;
  }

  function composedParent(element) {
    // parentElement é null ao atravessar a fronteira de um ShadowRoot real.
    return element.parentElement?.nodeType === Node.ELEMENT_NODE ? element.parentElement :
      (element.getRootNode?.()?.host || element.parentElement?.host || null);
  }

  function effectiveBackground(element, overrideColor = null, overrideStyle = null) {
    // Computa as camadas sobrepostas, inclusive rgba() e ancestrais de Shadow DOM.
    // Se há imagens ou gradientes, não inferir uma cor de fundo que não conhecemos.
    let node = element;
    let combined = null;
    let depth = 0;
    while (node && depth++ < 24) {
      const style = node === element && overrideStyle ? overrideStyle : getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== 'none') return null;
      const color = colors.parseColor(node === element && overrideColor !== null ? overrideColor : style.backgroundColor);
      if (color && color.a > 0) {
        if (!combined) combined = {...color};
        else {
          const outA = combined.a + color.a * (1-combined.a);
          combined = {
            r: (combined.r*combined.a + color.r*color.a*(1-combined.a))/outA,
            g: (combined.g*combined.a + color.g*color.a*(1-combined.a))/outA,
            b: (combined.b*combined.a + color.b*color.a*(1-combined.a))/outA,
            a: outA
          };
        }
        if (combined.a >= .99) return {...combined, a:1};
      }
      node = composedParent(node);
    }
    return null;
  }

  function inheritedBackground(element) {
    const parent = composedParent(element);
    return parent ? effectiveBackground(parent) : null;
  }

  function restoreRecord(element, record) {
    if (record.background) restoreProperty(element, 'background-color', record.background);
    if (record.color) restoreProperty(element, 'color', record.color);
    for (const [property, saved] of Object.entries(record.borders || {})) {
      restoreProperty(element, property, saved);
    }
  }

  function rememberStyle(element) {
    // Snapshot da declaração inline para ignorar mutações causadas por nós mesmos.
    // Não interfere com alterações subsequentes feitas pelo próprio site.
    styleSnapshots.set(element, element.getAttribute?.('style') ?? '');
  }

  function styleElement(element) {
    if (!element.isConnected) return;
    const previous = originals.get(element);
    if (previous) {
      // Reavalia com o CSS do site, não com a cor que aplicamos anteriormente.
      restoreRecord(element, previous);
      originals.delete(element);
    }
    if (SKIP_TAGS.has(element.tagName) || element.closest('svg, canvas, picture, video, audio, [data-extensao-dark-ignore]')) {
      rememberStyle(element);
      return;
    }
    const style = getComputedStyle(element);
    const visual = colors.visualContext(element, style, () => [
      getComputedStyle(element, '::before'), getComputedStyle(element, '::after')
    ]);
    if (visual.action === 'preserve') {
      rememberStyle(element);
      return;
    }
    const originalBackground = colors.parseColor(style.backgroundColor);
    const originalText = colors.parseColor(style.color);
    // Não dessaturar o azul de notificações, badges e outros destaques.
    const vividBackground = colors.isVividAccent(originalBackground);
    let background = visual.action === 'convert' && settings.ignoreNativeDark && !vividBackground ?
      colors.mapNativeBackground(originalBackground, originalText, settings.theme) : null;
    // O classificador atual evita fundos semitransparentes. Corrigir apenas
    // painéis claros com texto escuro sobre um fundo já convertido: é um
    // tratamento de compatibilidade que preserva o alpha do site.
    const isTranslucent = originalBackground && originalBackground.a >= .35 && originalBackground.a < .95;
    if (!background && visual.action === 'convert' && isTranslucent && !vividBackground) {
      background = colors.mapTranslucentBackground(originalBackground, originalText,
        inheritedBackground(element), settings.theme);
    }
    if (background) {
      // Painel transparente corrigido por regra conservadora.
    } else if (vividBackground) {
      // Preserva a identidade do destaque, mas ainda avalia a legibilidade do texto.
    } else if (visual.action === 'convert' && settings.smartEnabled && neural) {
      // Neural-first: o modelo decide se esta superfície será convertida.
      // Limites físicos continuam protegendo cores escuras nativas e transparências.
      if (originalBackground && originalText && !isTranslucent && originalBackground.a >= .82 &&
          colors.luminance(originalBackground) >= .17 &&
          colors.neuralDecision(
            neuralScore(originalBackground, originalText, inheritedBackground(element), visual),
            visual, neural.MODEL?.input ?? 7).convert) {
        background = colors.mapBackground(originalBackground, settings.theme, true);
      }
    } else if (visual.action === 'convert') {
      // Modo tradicional disponível no popup e também como fallback seguro.
      if (!isTranslucent) background = colors.mapBackground(originalBackground, settings.theme);
    }
    // P14: avoid an all-white app shell when the neural threshold rejects
    // a very large, simple opaque light canvas. Keep the original CSS
    // protections: icons, media, gradients, controls and native-dark skip.
    if(!background && visual.action==='convert' && originalBackground &&
       originalText && originalBackground.a>=.999 &&
       colors.luminance(originalBackground)>=.85 &&
       colors.luminance(originalText)<=.22 &&
       typeof element.getBoundingClientRect==='function' &&
       typeof innerWidth==='number' && typeof innerHeight==='number') {
      const rect=element.getBoundingClientRect();
      if(colors.shouldRecoverBrightCanvas(originalBackground,originalText,visual,{
        width:rect.width,height:rect.height,
        viewportWidth:innerWidth,viewportHeight:innerHeight,
        position:style.position,opacity:Number(style.opacity)
      })) background=colors.mapBackground(originalBackground,settings.theme);
    }
    const surface = effectiveBackground(element, background, style);
    let foreground = null;
    if (surface && originalText) {
      // Não alterar texto sobre fundo desconhecido. Fora das superfícies escuras,
      // corrigir apenas contrastes deficientes de destaques que preservamos.
      const shouldCheck = background || colors.luminance(surface) < .25 || vividBackground;
      if (shouldCheck) {
        // P3: quando a superfície ficou escura, texto que era preto em fundo
        // claro precisa de uma cor realmente clara, não apenas atingir 4.5:1.
        // Preservar tons já claros e o texto de badges coloridos.
        const preferred = !vividBackground && colors.luminance(surface) < .18 &&
          colors.luminance(originalText) < .10 ? colors.mapText(originalText) : null;
        const candidate = preferred ? colors.parseColor(preferred) : originalText;
        foreground = colors.ensureContrast(candidate, surface, colors.textContrastThreshold(style)) || preferred;
      }
    }
    const borders = {};
    // Cores computadas já resolvem var(--cor); não sobrescrever custom properties.
    // Modificar apenas bordas de fato visíveis e superfícies que escurecemos.
    const borderSurface = inheritedBackground(element);
    if (borderSurface && colors.luminance(borderSurface) < .25) {
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        const borderStyle = style[`border${side}Style`];
        const borderWidth = parseFloat(style[`border${side}Width`]);
        if (!borderStyle || borderStyle === 'none' || borderStyle === 'hidden' ||
            !Number.isFinite(borderWidth) || borderWidth <= 0) continue;
        const originalBorder = colors.parseColor(style[`border${side}Color`]);
        let mapped = colors.mapBorder(originalBorder, settings.theme);
        if (visual.control) {
          const candidate = colors.parseColor(mapped) || originalBorder;
          const contrastFix = colors.ensureContrast(candidate, borderSurface, 3);
          if (contrastFix) mapped = contrastFix;
          // Uma borda colorida já visível não deve ser trocada por uma cinza.
          if (colors.isVividAccent(originalBorder) &&
              colors.contrastRatio(originalBorder, borderSurface) >= 3) mapped = null;
        }
        if (!mapped) continue;
        const property = `border-${side.toLowerCase()}-color`;
        borders[property] = {
          original: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property),
          applied: mapped
        };
      }
    }
    if (!background && !foreground && !Object.keys(borders).length) {rememberStyle(element); return;}
    const record = {};
    if (background) {
      record.background = {
        original: element.style.getPropertyValue('background-color'),
        priority: element.style.getPropertyPriority('background-color'),
        applied: background
      };
      element.style.setProperty('background-color', background, 'important');
    }
    if (foreground) {
      record.color = {
        original: element.style.getPropertyValue('color'),
        priority: element.style.getPropertyPriority('color'),
        applied: foreground
      };
      element.style.setProperty('color', foreground, 'important');
    }
    if (Object.keys(borders).length) {
      record.borders = borders;
      for (const [property, saved] of Object.entries(borders)) {
        element.style.setProperty(property, saved.applied, 'important');
      }
    }
    originals.set(element, record);
    rememberStyle(element);
  }

  function cleanupDetachedSubtree(root) {
    if (!root || (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== 11) || root.isConnected) return;
    // Liberar referências fortes de elementos que saíram do DOM. Se forem
    // reutilizados depois, entram novamente na fila como elementos novos.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let current = root.nodeType === Node.ELEMENT_NODE ? root : walker.nextNode();
    while (current) {
      const record = originals.get(current);
      if (record) {
        restoreRecord(current, record);
        originals.delete(current);
      }
      styleSnapshots.delete(current);
      if (current.shadowRoot) cleanupDetachedSubtree(current.shadowRoot);
      current = walker.nextNode();
    }
  }

  function enqueueSubtree(root, force = false) {
    if (!root || (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== 11) ||
        !(root.isConnected || root.host?.isConnected)) return;
    // Reaproveitar tarefas do mesmo nó, evitando trabalho redundante.
    const existing = work.find(task => task.generation === generation && task.root === root);
    if (existing) {
      if (force && !existing.force) {
        existing.force = true;
        existing.walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        existing.current = root.nodeType === Node.ELEMENT_NODE ? root : existing.walker.nextNode();
      }
      return;
    }
    if (work.length >= MAX_PENDING_ROOTS) {
      // Em vez de descartar novos elementos, consolidar a fila numa varredura
      // completa. O TreeWalker do documento inclui todos os novos nós.
      work.length = 0;
      root = document.documentElement;
      force = true;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    work.push({root, walker, current: root.nodeType === Node.ELEMENT_NODE ? root : walker.nextNode(), generation, force});
    scheduleWork();
  }

  function scheduleWork() {
    if (running || !isActive()) return;
    running = true;
    const scheduledGeneration = generation;
    const callback = () => {
      // Uma execução antiga não pode consumir a fila de uma nova ativação.
      if (scheduledGeneration !== generation) return;
      flushWork();
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(callback, {timeout: 250});
    else setTimeout(callback, 0);
  }

  function flushWork() {
    running = false;
    if (!isActive()) return;
    let count = 0;
    while (work.length && count < 160) {
      const task = work[0];
      if (task.generation !== generation || !task.current || !task.root.isConnected) {work.shift(); continue;}
      const current = task.current;
      styleElement(current);
      if (current.shadowRoot) {
        observeShadowRoot(current.shadowRoot);
        enqueueSubtree(current.shadowRoot);
      }
      task.current = task.walker.nextNode();
      count++;
    }
    if (work.length) scheduleWork();
  }

  function stopStyling() {
    generation++;
    observer?.disconnect();
    observer = null;
    observedShadowRoots = new WeakSet();
    document.removeEventListener?.('load', onStyleSheetLoad, true);
    running = false;
    work.length = 0;
    if (baseStyle) restoreEverything();
  }

  function observeShadowRoot(root) {
    if (!observer || !root || observedShadowRoots.has(root)) return;
    observer.observe(root, observerOptions());
    observedShadowRoots.add(root);
  }

  function observerOptions() {
    return {
      childList: true, subtree: true, attributes: true, characterData: true,
      attributeFilter: ['class', 'style', 'aria-selected', 'aria-pressed', 'aria-current',
        'data-state', 'href', 'rel', 'media', 'disabled']
    };
  }

  function styleSheetRoot(node) {
    const tree = node?.getRootNode?.();
    return tree?.nodeType === 11 && tree.host ? tree : document.documentElement;
  }

  function onStyleSheetLoad(event) {
    if (event.target?.tagName === 'LINK' && event.target.rel?.includes('stylesheet')) {
      enqueueSubtree(styleSheetRoot(event.target), true);
    }
  }

  function startStyling() {
    if (baseStyle || (!settings.ignoreNativeDark && hasNativeDarkTheme())) return;
    generation++;
    installBaseStyle();
    observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') {
          if (record.target.parentElement?.tagName === 'STYLE') {
            enqueueSubtree(styleSheetRoot(record.target.parentElement), true);
          }
          continue;
        }
        if (record.type === 'attributes') {
          if (record.target.tagName === 'LINK') {
            enqueueSubtree(styleSheetRoot(record.target), true);
            continue;
          }
          if (record.attributeName === 'style' &&
              styleSnapshots.has(record.target) &&
              styleSnapshots.get(record.target) === (record.target.getAttribute?.('style') ?? '')) continue;
          // Reavaliar o nó e seus descendentes: uma classe pode alterar estilos
          // herdados e estados de abas/botões, não só o elemento alvo.
          enqueueSubtree(record.target, true);
        } else if (record.type === 'childList') {
          if (record.target.tagName === 'STYLE') {
            enqueueSubtree(styleSheetRoot(record.target), true);
          }
          for (const node of record.removedNodes || []) cleanupDetachedSubtree(node);
          for (const node of record.addedNodes || []) {
            if (node.tagName === 'STYLE' || node.tagName === 'LINK') {
              enqueueSubtree(styleSheetRoot(node), true);
            } else {
              enqueueSubtree(node);
            }
          }
        }
      }
    });
    observer.observe(document.documentElement, observerOptions());
    document.addEventListener?.('load', onStyleSheetLoad, true);
    enqueueSubtree(document.documentElement);
  }

  function observeNativeTheme() {
    if (themeObserver || !document.documentElement) return;
    const options = {
      attributes: true,
      attributeFilter: ['dark', 'dark-theme', 'class', 'style', 'data-theme', 'data-color-scheme', 'data-bs-theme']
    };
    themeObserver = new MutationObserver(records => {
      if (!records.some(record => record.type === 'attributes') || settings.ignoreNativeDark) return;
      if (hasExplicitDarkTheme()) {
        if (baseStyle) stopStyling();
      } else if (isActive() && !baseStyle && !hasNativeDarkTheme()) {
        startStyling();
      }
    });
    themeObserver.observe(document.documentElement, options);
    if (document.body) themeObserver.observe(document.body, options);
  }

  function activate() {
    if (!document.documentElement) {
      document.addEventListener('readystatechange', () => activate(), {once: true});
      return;
    }
    if (document.readyState === 'loading' && !document.body) {
      document.addEventListener('DOMContentLoaded', () => activate(), {once: true});
      return;
    }
    observeNativeTheme();
    if (settings.ignoreNativeDark || !hasNativeDarkTheme()) startStyling();
  }

  function deactivate() {
    themeObserver?.disconnect();
    themeObserver = null;
    stopStyling();
  }

  function update(next) {
    const shouldRebuild = isActive() && (next.theme !== settings.theme || next.smartEnabled !== settings.smartEnabled || next.ignoreNativeDark !== settings.ignoreNativeDark);
    if (baseStyle && (shouldRebuild || !isEnabledInFrame(next))) deactivate();
    settings = next;
    if (isActive()) activate();
  }

  chrome.storage.local.get(DEFAULTS).then(value => {
    settings = {...DEFAULTS, ...value};
    if (isActive()) activate();
  }).catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!['enabled', 'theme', 'disabledHosts', 'smartEnabled', 'ignoreNativeDark'].some(key => Object.hasOwn(changes, key))) return;
    const next = {...settings};
    for (const key of ['enabled', 'theme', 'disabledHosts', 'smartEnabled', 'ignoreNativeDark']) {
      if (changes[key]) next[key] = changes[key].newValue ?? DEFAULTS[key];
    }
    update(next);
  });
})();
