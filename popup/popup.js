(() => {
  'use strict';
  const DEFAULTS = {enabled:true, theme:'deep', disabledHosts:[], smartEnabled:true, ignoreNativeDark:false};
  const $ = (id) => document.getElementById(id);
  const enabledInput = $('enabled');
  const siteInput = $('site-enabled');
  const smartInput = $('smart-enabled');
  const nativeDarkInput = $('ignore-native-dark');
  const notice = $('notice');
  let settings = {...DEFAULTS};
  let hostname = null;

  function showError(message) {
    notice.classList.add('error');
    notice.textContent = message;
  }

  function render() {
    enabledInput.checked = settings.enabled;
    smartInput.checked = settings.smartEnabled !== false;
    nativeDarkInput.checked = settings.ignoreNativeDark === true;
    siteInput.checked = Boolean(hostname) && !settings.disabledHosts.includes(hostname);
    siteInput.disabled = !hostname;
    $('site-name').textContent = hostname || 'Esta página não permite alterações';
    $('status').textContent = settings.enabled ? 'Ativo' : 'Pausado';
    $('status').classList.toggle('off', !settings.enabled);
    for (const button of document.querySelectorAll('[data-theme]')) {
      button.setAttribute('aria-pressed', String(button.dataset.theme === settings.theme));
    }
  }

  async function save(changes) {
    try {
      const updated = {...settings, ...changes};
      await chrome.storage.local.set(changes);
      settings = updated;
      notice.classList.remove('error');
      notice.textContent = 'Preferências salvas apenas neste navegador.';
      render();
    } catch (error) {
      render();
      showError('Não foi possível salvar as preferências.');
    }
  }

  async function init() {
    try {
      const [stored, tabs] = await Promise.all([
        chrome.storage.local.get(DEFAULTS),
        chrome.tabs.query({active:true, currentWindow:true})
      ]);
      settings = {...DEFAULTS, ...stored};
      const url = tabs?.[0]?.url;
      if (url) {
        try {
          const page = new URL(url);
          if (page.protocol === 'https:' || page.protocol === 'http:') hostname = page.hostname;
        } catch (_) {
          // Algumas abas especiais não expõem uma URL HTTP(S) válida.
        }
      }
      render();
    } catch (error) {
      render();
      showError('Não foi possível ler as preferências.');
    }
  }

  enabledInput.addEventListener('change', () => save({enabled:enabledInput.checked}));
  smartInput.addEventListener('change', () => save({smartEnabled:smartInput.checked}));
  nativeDarkInput.addEventListener('change', () => save({ignoreNativeDark:nativeDarkInput.checked}));
  siteInput.addEventListener('change', () => {
    if (!hostname) return;
    const hosts = new Set(settings.disabledHosts);
    if (siteInput.checked) hosts.delete(hostname);
    else hosts.add(hostname);
    save({disabledHosts:[...hosts]});
  });
  for (const button of document.querySelectorAll('[data-theme]')) {
    button.addEventListener('click', () => save({theme:button.dataset.theme}));
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of ['enabled', 'theme', 'disabledHosts', 'smartEnabled', 'ignoreNativeDark']) {
      if (changes[key]) settings[key] = changes[key].newValue ?? DEFAULTS[key];
    }
    render();
  });
  init();
})();
