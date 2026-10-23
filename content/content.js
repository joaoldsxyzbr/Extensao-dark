/* Motor inicial: transforma cores da página localmente, sem CSS filter e sem ler conteúdo dos formulários. */
(() => {
  'use strict';
  const colors = globalThis.DarkExtensionColors;
  const neural = globalThis.DarkExtensionNeural;
  if (!colors || !/^https?:$/.test(location.protocol)) return;

  const DEFAULTS = {enabled: true, theme: 'deep', disabledHosts: [], smartEnabled: true};
  const SKIP_TAGS = new Set(['IMG', 'PICTURE', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG', 'PATH', 'SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'SOURCE', 'TRACK']);
  const originals = new Map();
  const work = [];
  const predictionCache = new Map();
  let settings = DEFAULTS;
  let generation = 0;
  let running = false;
  let observer = null;
  let themeObserver = null;
  let baseStyle = null;

  function isActive() {
    return colors.isEnabledForSite(settings, location.hostname);
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
      if (record.background) restoreProperty(element, 'background-color', record.background);
      if (record.color) restoreProperty(element, 'color', record.color);
    }
    originals.clear();
    document.documentElement.removeAttribute('data-extensao-dark');
    baseStyle?.remove();
    baseStyle = null;
  }

  function neuralScore(background, foreground) {
    if (!neural || !background || !foreground) return 0;
    const bg = colors.luminance(background), fg = colors.luminance(foreground);
    const key = `${Math.round(bg * 128)}:${Math.round(fg * 128)}:${Math.round(background.a * 16)}`;
    if (predictionCache.has(key)) return predictionCache.get(key);
    const score = neural.probability([bg, fg, background.a]);
    // O cache é pequeno, independente do número de nós ou domínios visitados.
    if (predictionCache.size >= 128) predictionCache.clear();
    predictionCache.set(key, score);
    return score;
  }

  function inheritedBackground(element) {
    // Usa a cor computada efetiva dos ancestrais, já atualizada nesta passagem.
    let ancestor = element.parentElement;
    let depth = 0;
    while (ancestor && depth++ < 12) {
      const style = getComputedStyle(ancestor);
      if (style.backgroundImage && style.backgroundImage !== 'none') return null;
      const color = colors.parseColor(style.backgroundColor);
      if (color && color.a >= .95) return color;
      ancestor = ancestor.parentElement;
    }
    return null;
  }

  function styleElement(element) {
    if (!element.isConnected || SKIP_TAGS.has(element.tagName) || element.closest('svg, canvas, picture, video, audio, [data-extensao-dark-ignore]')) return;
    if (originals.has(element)) return;
    const style = getComputedStyle(element);
    // Gradientes/imagens contêm informação visual que CSS background-color não descreve.
    if (style.backgroundImage && style.backgroundImage !== 'none') return;
    const originalBackground = colors.parseColor(style.backgroundColor);
    const originalText = colors.parseColor(style.color);
    // Não dessaturar o azul de notificações, badges e outros destaques.
    if (colors.isVividAccent(originalBackground)) return;
    let background = colors.mapBackground(originalBackground, settings.theme);
    if (!background && settings.smartEnabled && neural && originalBackground && originalText &&
        originalBackground.a >= .82) {
      const bgLum = colors.luminance(originalBackground);
      const fgLum = colors.luminance(originalText);
      // A rede não tem permissão de inverter superfícies originalmente escuras.
      if (bgLum >= .17 && bgLum < .35 && fgLum < .28 &&
          neuralScore(originalBackground, originalText) >= .80) {
        background = colors.mapBackground(originalBackground, settings.theme, true);
      }
    }
    let foreground = null;
    if (originalText && colors.luminance(originalText) <= .54) {
      const visibleBackground = background ? colors.parseColor(background) :
        (originalBackground?.a >= .95 ? originalBackground : inheritedBackground(element));
      if (visibleBackground && colors.luminance(visibleBackground) < .25) {
        foreground = colors.mapText(originalText);
      }
    }
    // Contraste WCAG: nunca gerar texto claro demais? Priorizar legibilidade do texto.
    if (background && originalText) {
      const outputBackground = colors.parseColor(background);
      const outputText = colors.parseColor(foreground || style.color);
      if (colors.contrastRatio(outputBackground, outputText) < 4.5) foreground = 'rgb(235, 239, 245)';
    }
    if (!background && !foreground) return;
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
    originals.set(element, record);
  }

  function enqueueSubtree(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE || work.length > 40) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    work.push({walker, current: root, generation});
    scheduleWork();
  }

  function scheduleWork() {
    if (running || !isActive()) return;
    running = true;
    if (typeof requestIdleCallback === 'function') requestIdleCallback(flushWork, {timeout: 250});
    else setTimeout(flushWork, 0);
  }

  function flushWork() {
    running = false;
    if (!isActive()) return;
    let count = 0;
    while (work.length && count < 160) {
      const task = work[0];
      if (task.generation !== generation || !task.current) {work.shift(); continue;}
      styleElement(task.current);
      task.current = task.walker.nextNode();
      count++;
    }
    if (work.length) scheduleWork();
  }

  function stopStyling() {
    generation++;
    observer?.disconnect();
    observer = null;
    work.length = 0;
    if (baseStyle) restoreEverything();
  }

  function startStyling() {
    if (baseStyle || hasNativeDarkTheme()) return;
    generation++;
    installBaseStyle();
    observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes || []) enqueueSubtree(node);
      }
    });
    observer.observe(document.documentElement, {childList: true, subtree: true});
    enqueueSubtree(document.documentElement);
  }

  function observeNativeTheme() {
    if (themeObserver || !document.documentElement) return;
    const options = {
      attributes: true,
      attributeFilter: ['dark', 'dark-theme', 'class', 'style', 'data-theme', 'data-color-scheme', 'data-bs-theme']
    };
    themeObserver = new MutationObserver(records => {
      if (!records.some(record => record.type === 'attributes')) return;
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
    if (!hasNativeDarkTheme()) startStyling();
  }

  function deactivate() {
    themeObserver?.disconnect();
    themeObserver = null;
    stopStyling();
  }

  function update(next) {
    const shouldRebuild = isActive() && (next.theme !== settings.theme || next.smartEnabled !== settings.smartEnabled);
    if (baseStyle && (shouldRebuild || !colors.isEnabledForSite(next, location.hostname))) deactivate();
    settings = next;
    if (isActive()) activate();
  }

  chrome.storage.local.get(DEFAULTS).then(value => {
    settings = {...DEFAULTS, ...value};
    if (isActive()) activate();
  }).catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!['enabled', 'theme', 'disabledHosts', 'smartEnabled'].some(key => Object.hasOwn(changes, key))) return;
    const next = {...settings};
    for (const key of ['enabled', 'theme', 'disabledHosts', 'smartEnabled']) {
      if (changes[key]) next[key] = changes[key].newValue ?? DEFAULTS[key];
    }
    update(next);
  });
})();
