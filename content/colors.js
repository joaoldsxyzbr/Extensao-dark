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

  function mapText(color) {
    if (!color || color.a < 0.12 || luminance(color) > 0.54) return null;
    const {h, s, l} = rgbToHsl(color);
    return hslToCss(h, Math.min(s * 0.65, 0.7), Math.max(0.72, 0.90 - l * 0.2));
  }

  // Um site já escuro, com texto claro legível, deve continuar com suas próprias cores.
  function contrastRatio(first, second) {
    if (!first || !second) return 1;
    const a = luminance(first), b = luminance(second);
    return (Math.max(a,b) + 0.05) / (Math.min(a,b) + 0.05);
  }

  function isNativeDarkSurface(background, foreground) {
    const bg = parseColor(background);
    const fg = parseColor(foreground);
    return Boolean(bg && fg && bg.a >= 0.95 && fg.a >= 0.7 &&
      luminance(bg) <= 0.12 && luminance(fg) >= 0.45);
  }

  function isEnabledForSite(settings, hostname) {
    return settings.enabled !== false && !(Array.isArray(settings.disabledHosts) && settings.disabledHosts.includes(hostname));
  }

  const api = Object.freeze({parseColor, luminance, mapBackground, mapText, contrastRatio, isNativeDarkSurface, isEnabledForSite});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DarkExtensionColors = api;
})(globalThis);
