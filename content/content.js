/* Motor inicial: transforma cores da página localmente, sem CSS filter e sem ler conteúdo dos formulários. */
(() => {
  'use strict';
  const colors = globalThis.DarkExtensionColors;
  if (!colors || !/^https?:$/.test(location.protocol)) return;

  const DEFAULTS = {enabled: true, theme: 'deep', disabledHosts: []};
  const SKIP_TAGS = new Set(['IMG', 'PICTURE', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG', 'PATH', 'SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'SOURCE', 'TRACK']);
  const originals = new Map();
  const work = [];
  let settings = DEFAULTS;
  let generation = 0;
  let running = false;
  let observer = null;
  let baseStyle = null;

  function isActive() {
    return colors.isEnabledForSite(settings, location.hostname);
  }

  function hasNativeDarkTheme() {
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

  function styleElement(element) {
    if (!element.isConnected || SKIP_TAGS.has(element.tagName) || element.closest('svg, canvas, picture, video, audio, [data-extensao-dark-ignore]')) return;
    if (originals.has(element)) return;
    const style = getComputedStyle(element);
    const background = colors.mapBackground(colors.parseColor(style.backgroundColor), settings.theme);
    const foreground = colors.mapText(colors.parseColor(style.color));
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

  function activate() {
    if (!document.documentElement) {
      document.addEventListener('readystatechange', () => activate(), {once: true});
      return;
    }
    if (baseStyle) return;
    if (document.readyState === 'loading' && !document.body) {
      document.addEventListener('DOMContentLoaded', () => activate(), {once: true});
      return;
    }
    if (hasNativeDarkTheme()) return;
    generation++;
    installBaseStyle();
    observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) enqueueSubtree(node);
      }
    });
    observer.observe(document.documentElement, {childList: true, subtree: true});
    enqueueSubtree(document.documentElement);
  }

  function deactivate() {
    generation++;
    observer?.disconnect();
    observer = null;
    work.length = 0;
    restoreEverything();
  }

  function update(next) {
    const shouldRebuild = isActive() && next.theme !== settings.theme;
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
    if (!['enabled', 'theme', 'disabledHosts'].some(key => Object.hasOwn(changes, key))) return;
    const next = {...settings};
    for (const key of ['enabled', 'theme', 'disabledHosts']) {
      if (changes[key]) next[key] = changes[key].newValue ?? DEFAULTS[key];
    }
    update(next);
  });
})();
