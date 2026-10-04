(function() {
    const style = document.createElement('style'); style.id = '__abyss_style';
    style.textContent = 'html { padding-top: 40px !important; } body { padding-top: 40px !important; margin-top: 0 !important; }';
    document.documentElement.appendChild(style);
    function createNav() {
        if (document.getElementById('__abyss_nav')) return;
        const nav = document.createElement('div'); nav.id = '__abyss_nav'; nav.setAttribute('data-tauri-drag-region', '');
        nav.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;height:40px;display:flex;align-items:center;padding:0 12px;gap:8px;background:#1a1a1a;border-bottom:1px solid rgba(255,255,255,0.08);box-sizing:border-box;-webkit-app-region:drag;font-family:-apple-system,BlinkMacSystemFont,sans-serif';
        const backBtn = document.createElement('button'); backBtn.id = '__abyss_back'; backBtn.style.cssText = '-webkit-app-region:no-drag;width:32px;height:28px;border:none;background:transparent;color:#b0b0b0;cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:background 0.15s,color 0.15s';
        backBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
        backBtn.onmouseenter = function() { this.style.background = '#2a2a2a'; this.style.color = '#f0f0f0'; }; backBtn.onmouseleave = function() { this.style.background = 'transparent'; this.style.color = '#b0b0b0'; }; backBtn.onclick = function() { history.back(); };
        const fwdBtn = document.createElement('button'); fwdBtn.id = '__abyss_fwd'; fwdBtn.style.cssText = backBtn.style.cssText;
        fwdBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
        fwdBtn.onmouseenter = function() { this.style.background = '#2a2a2a'; this.style.color = '#f0f0f0'; }; fwdBtn.onmouseleave = function() { this.style.background = 'transparent'; this.style.color = '#b0b0b0'; }; fwdBtn.onclick = function() { history.forward(); };
        const reloadBtn = document.createElement('button'); reloadBtn.id = '__abyss_reload'; reloadBtn.style.cssText = backBtn.style.cssText;
        reloadBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
        reloadBtn.onmouseenter = function() { this.style.background = '#2a2a2a'; this.style.color = '#f0f0f0'; }; reloadBtn.onmouseleave = function() { this.style.background = 'transparent'; this.style.color = '#b0b0b0'; }; reloadBtn.onclick = function() { location.reload(); };
        const urlSpan = document.createElement('span'); urlSpan.id = '__abyss_url'; urlSpan.style.cssText = '-webkit-app-region:no-drag;flex:1;text-align:center;font-size:12px;color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 8px;background:rgba(255,255,255,0.04);border-radius:8px;height:28px;line-height:28px;min-width:0'; urlSpan.textContent = location.href;
        const closeBtn = document.createElement('button'); closeBtn.id = '__abyss_close'; closeBtn.style.cssText = '-webkit-app-region:no-drag;width:32px;height:28px;border:none;background:transparent;color:#b0b0b0;cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:background 0.15s,color 0.15s';
        closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        closeBtn.onmouseenter = function() { this.style.background = '#e74c3c'; this.style.color = '#fff'; }; closeBtn.onmouseleave = function() { this.style.background = 'transparent'; this.style.color = '#b0b0b0'; };
        closeBtn.onclick = function() {
            try {
                if (typeof window.__ABYSS_CLOSE_WINDOW__ === 'function') {
                    window.__ABYSS_CLOSE_WINDOW__();
                    return;
                }
                if (window.__TAURI_INTERNALS__) {
                    window.__TAURI_INTERNALS__.invoke('plugin:window|close');
                } else if (window.__TAURI__ && window.__TAURI__.window) {
                    window.__TAURI__.window.getCurrent().close();
                } else {
                    window.close();
                }
            } catch(e) {
                window.close();
            }
        };
        nav.appendChild(backBtn); nav.appendChild(fwdBtn); nav.appendChild(reloadBtn); nav.appendChild(urlSpan); nav.appendChild(closeBtn);
        document.body.prepend(nav); updateUrl();
    }
    createNav();
    setInterval(function() { if (!document.getElementById('__abyss_nav')) createNav(); if (!document.getElementById('__abyss_style')) document.documentElement.appendChild(style); const d = document.documentElement; const b = document.body; if (d.style.paddingTop !== '40px') d.style.setProperty('padding-top', '40px', 'important'); if (b.style.paddingTop !== '40px') b.style.setProperty('padding-top', '40px', 'important'); }, 500);
    function updateUrl() { const el = document.getElementById('__abyss_url'); if (el) el.textContent = location.href; }
    const origPush = history.pushState; history.pushState = function() { origPush.apply(this, arguments); updateUrl(); };
    const origReplace = history.replaceState; history.replaceState = function() { origReplace.apply(this, arguments); updateUrl(); };
    window.addEventListener('popstate', updateUrl); window.addEventListener('hashchange', updateUrl);
})()
