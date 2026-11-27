'use strict';

(() => {
  const key = 'vibe-vmix-operator-theme';
  const root = document.documentElement;
  const valid = (value) => value === 'light' || value === 'dark';
  function readTheme() {
    try {
      // Loopback modules use different ports. Their cookies share the hostname.
      const saved = document.cookie
        .split('; ')
        .find((item) => item.startsWith(key + '='))
        ?.slice(key.length + 1);
      if (valid(saved)) return saved;
    } catch {}
    try {
      const saved = localStorage.getItem(key);
      if (valid(saved)) return saved;
    } catch {}
  }
  function apply(theme) {
    if (!valid(theme) || root.dataset.operatorTheme === theme) return;
    root.dataset.operatorTheme = theme;
    window.dispatchEvent(new Event('operator-theme-change'));
  }
  apply(readTheme() || 'light');
  window.addEventListener('storage', (event) => {
    if (event.key === key) apply(event.newValue);
  });
  window.addEventListener('pageshow', () => apply(readTheme()));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) apply(readTheme());
  });
  if (window.parent !== window && document.referrer) {
    const parentOrigin = new URL(document.referrer).origin;
    window.addEventListener('message', (event) => {
      if (
        event.source === window.parent &&
        event.origin === parentOrigin &&
        event.data?.type === key
      )
        apply(event.data.theme);
    });
  }
  window.operatorTheme = {
    get: () => root.dataset.operatorTheme,
    set(theme) {
      if (!valid(theme)) return;
      try {
        document.cookie = key + '=' + theme + '; Path=/; Max-Age=31536000; SameSite=Strict';
      } catch {}
      try {
        localStorage.setItem(key, theme);
      } catch {}
      apply(theme);
    },
    sendTo(frame, origin) {
      frame.postMessage({ type: key, theme: root.dataset.operatorTheme }, origin);
    },
  };
})();
