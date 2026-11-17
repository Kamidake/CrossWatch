/* assets/helpers/providers-ui.js */
/* Extracted provider/auth/metadata UI from core.js */
/* Copyright (c) 2025-2026 CrossWatch / Cenodude (https://github.com/cenodude/CrossWatch) */
(function(){
  const authSetupPending = () => window.cwIsAuthSetupPending?.() === true;
  const apiText = async (url) => {
    if (authSetupPending()) throw new Error("auth setup pending");
    if (window.CW?.API?.j) return window.CW.API.j(url);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };

  const listProviders = async (force = false) => {
    if (authSetupPending()) return [];
    if (window.CW?.API?.Providers?.list) return window.CW.API.Providers.list(!!force);
    return fetch("/api/sync/providers", { cache: "no-store" }).then((r) => r.json()).catch(() => []);
  };

  function bindCopyButton(btnId, inputId) {
    const btn = document.getElementById(btnId);
    if (!btn || btn.__cwBound) return;
    if (btn.getAttribute("onclick")) {
      btn.__cwBound = true;
      return;
    }
    btn.addEventListener("click", (e) => window.CW.AuthShared.copyField(inputId, e.currentTarget));
    btn.__cwBound = true;
  }

  function wireCopyButtons() {
    bindCopyButton("btn-copy-plex-pin", "plex_pin");
    bindCopyButton("btn-copy-trakt-pin", "trakt_pin");
  }

  function initMountedAuthSections(root, tries = 0) {
    if (!root) return;
    if (typeof window.cwEnsureAuthSection !== "function") {
      if (tries < 20) setTimeout(() => initMountedAuthSections(root, tries + 1), 50);
      return;
    }
    const sections = Array.from(root.querySelectorAll(".section.open[id]"));
    sections.forEach((sec) => {
      try { window.cwEnsureAuthSection(sec.id).catch(() => {}); } catch {}
    });
  }

  const AUTH_GROUPS = Object.freeze([
    { id: "sec-auth-media", title: "Media servers", keys: ["PLEX", "JELLYFIN", "EMBY", "SILO", "TOFA"] },
    { id: "sec-auth-trackers", title: "Trackers", keys: ["CROSSWATCH", "TRAKT", "SIMKL", "TMDB", "MDBLIST", "PUBLICMETADB", "ANILIST", "MYANIMELIST", "KITSU", "WETRAKR", "PUNCHPLAY", "BINGEBASE", "FLICKLIST", "FLOPPY", "SCROB"] },
    { id: "sec-auth-clients", title: "Media clients", keys: ["NUVIO", "KODI", "STREMIO"] },
    { id: "sec-auth-others", title: "Others", keys: ["TAUTULLI", "TRACEARR"] },
  ]);
  const AUTH_GROUP_BY_KEY = Object.freeze(Object.fromEntries(AUTH_GROUPS.flatMap((group) => group.keys.map((key) => [key, group.id]))));
  const META_GROUP = Object.freeze({ id: "sec-auth-metadata", title: "Metadata", keys: ["TMDB_METADATA", "FANART_METADATA", "ANIME_MAPPING"] });
  const META_ITEMS = Object.freeze({
    TMDB_METADATA: { key: "TMDB_METADATA", label: "TMDb Metadata", logoKey: "TMDB", sectionId: "sec-meta-tmdb", provider: "tmdb" },
    FANART_METADATA: { key: "FANART_METADATA", label: "Fanart.tv Artwork", icon: "photo_library", sectionId: "sec-meta-fanart", provider: "fanart" },
    ANIME_MAPPING: { key: "ANIME_MAPPING", label: "Anime ID Mapping", icon: "shield", sectionId: "sec-meta-anime-mapping", provider: "anime-mapping" },
  });

  function providerMeta() {
    return window.CW?.ProviderMeta || {};
  }

  function authProviderInfo(key) {
    const meta = providerMeta();
    const norm = typeof meta.keyOf === "function" ? meta.keyOf(key) : String(key || "").trim().toUpperCase();
    return {
      key: norm,
      label: typeof meta.label === "function" ? meta.label(norm) : norm,
      sectionId: typeof meta.sectionId === "function" ? meta.sectionId(norm) : "",
      groupId: typeof meta.authGroupId === "function" ? meta.authGroupId(norm) : (AUTH_GROUP_BY_KEY[norm] || "sec-auth-others"),
    };
  }

  function metadataProviderInfo(key) {
    const norm = String(key || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    return META_ITEMS[norm] || null;
  }

  function getCachedConfig() {
    return window.CW?.Cache?.getCfg?.() || window._cfgCache || {};
  }

  async function loadConfig(force = false) {
    try {
      if (typeof window.CW?.API?.Config?.load === "function") {
        const cfg = await window.CW.API.Config.load(!!force);
        if (cfg && typeof cfg === "object") return cfg;
      }
    } catch {}
    try {
      const res = await fetch("/api/config", { cache: "no-store" });
      if (res.ok) return await res.json();
    } catch {}
    return getCachedConfig();
  }

  function stremioAddonIds(cfg) {
    const ids = cfg?.security?.webhook_ids;
    if (!ids || typeof ids !== "object") return [];
    return Object.keys(ids)
      .filter((key) => key.startsWith("stremioaddon:") && hasConfiguredValue(ids[key]))
      .map((key) => key.slice("stremioaddon:".length) || "default");
  }

  function stremioAddonOnly(cfg, provider, id) {
    if (String(provider || "").toLowerCase() !== "stremio") return false;
    const raw = String(id || "default");
    if (!stremioAddonIds(cfg).some((item) => item === raw)) return false;
    const block = providerConfigBlock(cfg, "stremio");
    const source = raw.toLowerCase() === "default" ? block : block?.instances?.[raw];
    return !profileConfigured("stremio", source, cfg);
  }

  let managedInstances = {};

  function managedUser() {
    return document.documentElement.dataset.cwRole === "user";
  }

  async function loadManagedInstances() {
    if (!managedUser()) return;
    try { await window.__cwAuthBootstrapPromise; } catch {}
    try {
      const res = await fetch(`/api/provider-instances?configured_only=true&ts=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
      const data = res.ok ? await res.json() : {};
      managedInstances = data && typeof data === "object" ? data : {};
    } catch {
      managedInstances = {};
    }
  }

  function managedInstanceIds(provider) {
    const key = String(provider || "").toUpperCase() === "TMDB_SYNC" ? "TMDB" : String(provider || "").toUpperCase();
    const rows = Array.isArray(managedInstances[key]) ? managedInstances[key] : [];
    return rows.filter((row) => row && row.id && row.id !== "default" && row.configured !== false).map((row) => String(row.id));
  }

  function configuredProviderKeys(cfg = getCachedConfig()) {
    if (managedUser()) {
      return new Set(Object.keys(managedInstances).filter((key) => managedInstanceIds(key).length).map((key) => authProviderInfo(key).key).filter(Boolean));
    }
    let set = new Set();
    try {
      if (typeof window.getConfiguredProviders === "function") {
        set = new Set(Array.from(window.getConfiguredProviders(cfg) || []).map((key) => authProviderInfo(key).key).filter(Boolean));
      }
    } catch {}
    if (stremioAddonIds(cfg).length) set.add("STREMIO");
    return set;
  }

  function statusProviderData(key) {
    const providers = window.__CW_PROVIDER_STATUS__?.providers || window._statusCache?.providers || window.loadStatusCache?.()?.providers || {};
    if (!providers || typeof providers !== "object") return null;
    const upper = String(key || "").toUpperCase();
    const lower = upper.toLowerCase();
    return providers[lower] || providers[upper] || null;
  }

  function sortProfileIds(ids) {
    return Array.from(new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean)))
      .sort((a, b) => (a !== "default") - (b !== "default") || a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }

  function profileStatusEntryConnected(entry) {
    if (typeof entry === "boolean") return entry;
    if (!entry || typeof entry !== "object") return null;
    if (typeof entry.connected === "boolean") return entry.connected;
    if (typeof entry.ok === "boolean") return entry.ok;
    if (typeof entry.authorized === "boolean") return entry.authorized;
    const text = String(entry.status || entry.state || "").trim().toLowerCase();
    if (/^(ok|up|connected|ready|true|on|online|active|authorized|valid)$/.test(text)) return true;
    if (/^(no|down|disconnected|false|off|disabled|failed|error|invalid|expired|unauthorized|forbidden)$/.test(text)) return false;
    return null;
  }

  function profileStatusEntry(data, id) {
    const inst = data?.instances;
    if (!inst || typeof inst !== "object") return null;
    const raw = String(id || "").trim();
    if (Object.prototype.hasOwnProperty.call(inst, raw)) return inst[raw];
    const found = Object.keys(inst).find((key) => String(key || "").toLowerCase() === raw.toLowerCase());
    return found ? inst[found] : null;
  }

  function settingsScope() {
    const scope = window.CW?.SettingsScope;
    return scope && typeof scope.active === "function" && scope.active() ? scope : null;
  }

  function scopedProfileIds(provider, ids) {
    const scope = settingsScope();
    return scope ? ids.filter((id) => scope.allowsInstance(provider, id)) : ids;
  }

  function authProfileIds(cfg, provider, data = null, connected = false) {
    const ids = configuredProfileIds(cfg, provider, connected);
    const inst = data?.instances;
    if (inst && typeof inst === "object") {
      Object.keys(inst).forEach((id) => {
        if (String(id || "").trim()) ids.push(String(id));
      });
    }
    return scopedProfileIds(provider, sortProfileIds(ids));
  }

  function authProfileState(cfg, provider, id, data = statusProviderData(provider), connected = false) {
    if (stremioAddonOnly(cfg, provider, id)) return "ok";
    const entry = profileStatusEntry(data, id);
    const entryConnected = profileStatusEntryConnected(entry);
    if (entryConnected === true) return "ok";
    if (entryConnected === false) return "fail";
    if (entry && typeof entry === "object") {
      if (entry.probed === true) return "fail";
      if (entry.configured === true) return "ok";
    }
    if (data?.instances && typeof data.instances === "object") {
      return configuredProfileIds(cfg, provider, connected).some((pid) => String(pid) === String(id)) ? "ok" : "fail";
    }
    if (data && typeof data.connected === "boolean") return data.connected ? "ok" : "fail";
    return configuredProfileIds(cfg, provider, connected).some((pid) => String(pid) === String(id)) ? "ok" : "fail";
  }

  function failedProfileIds(cfg, provider, data = statusProviderData(provider), connected = false) {
    if (!data || typeof data !== "object") return [];
    return authProfileIds(cfg, provider, data, connected).filter((id) => authProfileState(cfg, provider, id, data, connected) === "fail");
  }

  function authStatusFor(key, configured, cfg = getCachedConfig()) {
    const data = statusProviderData(key);
    const failed = failedProfileIds(cfg, String(key || "").toLowerCase(), data, configured);
    if (failed.length) {
      const names = failed.map((id) => profileFriendlyName(cfg, String(key || "").toLowerCase(), id));
      const shown = names.slice(0, 2).join(", ");
      const overflow = names.length > 2 ? ` +${names.length - 2}` : "";
      return { text: `Check connection: ${shown}${overflow}`, ok: false, failed: true };
    }
    if (String(key || "").toUpperCase() === "NUVIO" && configured) {
      return { text: "Connected", ok: true };
    }
    if (String(key || "").toUpperCase() === "STREMIO" && data?.connected !== true && stremioAddonIds(cfg).some((id) => stremioAddonOnly(cfg, "stremio", id))) {
      return { text: "Scrobble add-on", ok: true };
    }
    if (data && typeof data.connected === "boolean") {
      return data.connected ? { text: "Connected", ok: true } : { text: "Check connection", ok: false, failed: true };
    }
    return configured ? { text: "Configured", ok: true } : { text: "Not configured", ok: false };
  }

  function authProviderLogo(key) {
    return window.CW?.ProviderMeta?.logoHtml?.(key, "cw-auth-provider-logo") || `<span class="token-text">${key || ""}</span>`;
  }

  function metadataProviderLogo(info) {
    if (info?.icon) return `<span class="material-symbols-rounded cw-auth-provider-icon" aria-hidden="true">${escHtml(info.icon)}</span>`;
    return window.CW?.ProviderMeta?.logoHtml?.(info?.logoKey || info?.label || "", "cw-auth-provider-logo") || `<span class="token-text">${info?.label || ""}</span>`;
  }

  function hasConfiguredValue(v) {
    return typeof v === "string" ? v.trim().length > 0 : !!v;
  }

  function escHtml(v) {
    return String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  function providerConfigBlock(cfg, provider) {
    const p = String(provider || "").trim().toLowerCase();
    const direct = cfg?.[p];
    if (p === "tmdb") return (cfg?.tmdb_sync && typeof cfg.tmdb_sync === "object") ? cfg.tmdb_sync : (direct && typeof direct === "object" ? direct : {});
    return direct && typeof direct === "object" ? direct : {};
  }

  function profileConfigured(provider, blk, cfg) {
    const p = String(provider || "").toLowerCase();
    const b = blk && typeof blk === "object" ? blk : {};
    if (p === "plex") return hasConfiguredValue(b.account_token) || hasConfiguredValue(b.token) || hasConfiguredValue(b.access_token);
    if (p === "emby" || p === "jellyfin") return hasConfiguredValue(b.access_token) || hasConfiguredValue(b.api_key) || hasConfiguredValue(b.token);
    if (p === "trakt" || p === "simkl") return hasConfiguredValue(b.access_token) || hasConfiguredValue(b.refresh_token);
    if (p === "kitsu") return hasConfiguredValue(b.access_token) && !b.reauth_required;
    if (p === "anilist") return hasConfiguredValue(b.access_token) || hasConfiguredValue(b.token);
    if (p === "mdblist") return hasConfiguredValue(b.api_key) || hasConfiguredValue(b.access_token);
    if (p === "myanimelist") return hasConfiguredValue(b.access_token) && !b.reauth_required;
    if (p === "wetrakr") return hasConfiguredValue(b.access_token) && !b.reauth_required;
    if (p === "punchplay") return hasConfiguredValue(b.access_token);
    if (p === "bingebase") return hasConfiguredValue(b.access_token) || hasConfiguredValue(b.webhook_url);
    if (p === "flicklist") return hasConfiguredValue(b.api_key) || hasConfiguredValue(b.access_token) || hasConfiguredValue(b.token);
    if (p === "floppy") return hasConfiguredValue(b.server_url || b.server) && hasConfiguredValue(b.api_token || b.token);
    if (p === "scrob") return hasConfiguredValue(b.server_url) && hasConfiguredValue(b.api_key) && hasConfiguredValue(b.username) && hasConfiguredValue(b.password);
    if (p === "nuvio") return (hasConfiguredValue(b.access_token) || hasConfiguredValue(b.refresh_token)) && hasConfiguredValue(b.profile_id);
    if (p === "silo") return hasConfiguredValue(b.server_url) && (hasConfiguredValue(b.access_token) || hasConfiguredValue(b.refresh_token)) && hasConfiguredValue(b.profile_id) && b.auth_error !== "reconnect_required";
    if (p === "tofa") return hasConfiguredValue(b.server_url) && hasConfiguredValue(b.server_id) && (hasConfiguredValue(b.access_token) || hasConfiguredValue(b.refresh_token)) && hasConfiguredValue(b.profile_id) && b.auth_error !== "reconnect_required";
    if (p === "kodi") return hasConfiguredValue(b.server) && b.connection_verified === true;
    if (p === "stremio") return hasConfiguredValue(b.auth_key) || hasConfiguredValue(b.authKey);
    if (p === "tracearr") return hasConfiguredValue(b.server_url || b.server) && hasConfiguredValue(b.api_key);
    if (p === "tautulli") return hasConfiguredValue((b || cfg?.tautulli || cfg?.auth?.tautulli || {}).server_url || (b || cfg?.tautulli || cfg?.auth?.tautulli || {}).server);
    if (p === "tmdb") return hasConfiguredValue(b.account_id) || (hasConfiguredValue(b.api_key) && hasConfiguredValue(b.session_id || b.session));
    if (p === "crosswatch") return !!(cfg?.crosswatch || cfg?.CrossWatch) && b.connected === true && b.enabled !== false;
    return hasConfiguredValue(b.access_token) || hasConfiguredValue(b.api_key) || hasConfiguredValue(b.token);
  }

  function profileDisplayName(id) {
    const raw = String(id || "").trim();
    if (!raw || raw.toLowerCase() === "default") return "Default";
    // Fixed regex to properly capture 1 to 3 digits for instances P10 and above
    const generated = raw.match(/^[A-Z0-9]+-P0*([1-9]\d*)$/i);
    return generated ? `P${String(generated[1]).padStart(2, "0")}` : raw;
  }

  function configuredProfileIds(cfg, provider, connected = false) {
    if (managedUser()) return scopedProfileIds(provider, sortProfileIds(managedInstanceIds(provider)));
    const block = providerConfigBlock(cfg, provider);
    const out = [];
    if (profileConfigured(provider, block, cfg)) out.push("default");
    const insts = block?.instances;
    if (insts && typeof insts === "object") {
      Object.entries(insts).forEach(([id, instBlock]) => {
        if (String(id || "").trim() && profileConfigured(provider, instBlock, cfg)) out.push(String(id));
      });
    }
    if (String(provider || "").toLowerCase() === "stremio") out.push(...stremioAddonIds(cfg));
    if (!out.length && connected) out.push("default");
    return scopedProfileIds(provider, sortProfileIds(out));
  }

  function profileFriendlyName(cfg, provider, id) {
    const raw = String(id || "").trim();
    if (managedUser()) {
      const key = String(provider || "").toUpperCase() === "TMDB_SYNC" ? "TMDB" : String(provider || "").toUpperCase();
      const row = (Array.isArray(managedInstances[key]) ? managedInstances[key] : []).find((item) => String(item?.id) === raw);
      return String(row?.display_label || row?.label || profileDisplayName(raw));
    }
    const isDefault = raw.toLowerCase() === "default";
    const block = providerConfigBlock(cfg, provider);
    const instances = block?.instances;
    const source = isDefault ? block : (instances && typeof instances === "object" ? instances[raw] : null);
    const label = source && typeof source === "object" ? String(source.label || "").trim() : "";
    return label || (isDefault ? "Default" : profileDisplayName(raw));
  }

  const PROFILE_NAME_LIMIT = 2;

  function authProfileSummary(card, cfg) {
    const base = { text: card.status.text, detail: "", title: card.status.text, dot: card.status.ok ? "ok" : (card.status.failed ? "fail" : "") };
    if (card.type !== "provider") return base;
    const data = statusProviderData(card.key || card.provider);
    const ids = authProfileIds(cfg, card.provider, data, !!card.status?.ok);
    const names = ids.map((id) => {
      const state = authProfileState(cfg, card.provider, id, data, !!card.status?.ok);
      return { id, name: profileFriendlyName(cfg, card.provider, id), state };
    });
    const onlyDefault = names.length === 1 && String(names[0].id).toLowerCase() === "default";
    if (!names.length || onlyDefault) return base;
    const title = `${card.status.text} - ${names.map((item) => `${item.name}: ${item.state === "ok" ? "Connected" : "Check connection"}`).join(", ")}`;
    const okCount = names.filter((item) => item.state === "ok").length;
    if (okCount < names.length) {
      if (!okCount) return { ...base, title };
      return { text: `${okCount} of ${names.length} connected`, detail: "", title, dot: "warn" };
    }
    if (!card.status.ok) return { ...base, title };
    const detail = names.length > PROFILE_NAME_LIMIT ? `${names.length} instances` : names.map((item) => item.name).join(", ");
    return { ...base, detail, title };
  }

  function authProviderKeysWithSections() {
    const meta = providerMeta();
    const infos = typeof meta.authProviders === "function" ? meta.authProviders() : [];
    const fromMeta = infos.map((info) => String(info?.key || "").trim().toUpperCase()).filter(Boolean);
    const fallback = AUTH_GROUPS.flatMap((group) => group.keys);
    return Array.from(new Set(fromMeta.length ? fromMeta : fallback)).filter((key) => !!authProviderInfo(key).sectionId);
  }

  function metadataConfigured(key, cfg = getCachedConfig()) {
    const info = metadataProviderInfo(key);
    if (!info) return false;
    if (info.key === "TMDB_METADATA") return !!String(cfg?.tmdb?.api_key || cfg?.metadata?.tmdb_api_key || "").trim();
    if (info.key === "ANIME_MAPPING") return !!cfg?.anime_mapping?.enabled;
    if (info.key === "FANART_METADATA") return cfg?.fanart?.enabled === true;
    return false;
  }

  function metadataStatusFor(key, cfg = getCachedConfig()) {
    const info = metadataProviderInfo(key);
    const on = metadataConfigured(key, cfg);
    if (info?.key === "ANIME_MAPPING" || info?.key === "FANART_METADATA") return on ? { text: "Enabled", ok: true } : { text: "Not enabled", ok: false };
    return on ? { text: "Connected", ok: true } : { text: "Not configured", ok: false };
  }

  function ensureAuthShell(slot) {
    let shell = slot.querySelector(":scope > .cw-auth-main");
    let library = slot.querySelector(":scope > .cw-auth-provider-library");
    if (!library) {
      library = document.createElement("div");
      library.className = "cw-auth-provider-library";
      library.setAttribute("aria-hidden", "true");
      Array.from(slot.children).forEach((child) => {
        if (child.classList?.contains("section") && String(child.id || "").startsWith("sec-auth-")) library.appendChild(child);
      });
      slot.appendChild(library);
    }
    if (!shell) {
      shell = document.createElement("div");
      shell.className = "cw-auth-main";
      slot.insertBefore(shell, library);
    }
    ensureAuthOverlay(slot);
    return { shell, library };
  }

  function ensureAuthOverlay(slot) {
    let overlay = slot.querySelector(":scope > .cw-auth-overlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "cw-auth-connection-overlay";
    overlay.className = "cw-auth-overlay hidden";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="cw-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="cw-auth-dialog-title">
        <div class="cw-auth-dialog-head">
          <span class="cw-auth-dialog-logo" aria-hidden="true"></span>
          <div class="cw-auth-dialog-copy">
            <div class="cw-auth-dialog-kicker" id="cw-auth-dialog-kicker">Connections</div>
            <h3 id="cw-auth-dialog-title">Add connection</h3>
            <div class="cw-auth-dialog-subtitle" id="cw-auth-dialog-subtitle"></div>
          </div>
          <button type="button" class="cw-auth-icon-btn material-symbols-rounded" data-cw-auth-close aria-label="Close">close</button>
        </div>
        <div class="cw-auth-provider-picker cw-page-provider-picker" id="cw-auth-provider-picker"></div>
        <form class="cw-auth-provider-form hidden" id="cw-auth-provider-form" autocomplete="off" onsubmit="return false"></form>
      </div>`;
    slot.appendChild(overlay);
    bindAuthPresentation(slot);
    return overlay;
  }

  function providerHome(section, key) {
    const groupId = authProviderInfo(key).groupId;
    const group = document.getElementById(groupId);
    return group?.querySelector(":scope > .body") || section?.parentElement || null;
  }

  function metadataHome() {
    return document.getElementById("meta-provider-panel") || document.getElementById("metadata-providers");
  }

  function parkActiveAuthForm() {
    const overlay = document.getElementById("cw-auth-connection-overlay");
    const form = document.getElementById("cw-auth-provider-form");
    const section = form?.querySelector(":scope > .section[id]");
    if (!section) return;
    const metaKey = Object.keys(META_ITEMS).find((candidate) => META_ITEMS[candidate].sectionId === section.id);
    const key = metaKey ? "" : authProviderKeysWithSections().find((candidate) => authProviderInfo(candidate).sectionId === section.id);
    const home = metaKey ? metadataHome() : providerHome(section, key);
    if (home) home.appendChild(section);
    form.classList.add("hidden");
    overlay?.classList.remove("cw-connection-overlay");
    if (overlay?.dataset) delete overlay.dataset.cwConnectionSize;
    overlay?.querySelector("#cw-auth-provider-picker")?.classList.remove("hidden");
  }

  function setPickerHtml(picker, html) {
    if (picker.__cwPickerHtml === html) return;
    picker.__cwPickerHtml = html;
    picker.innerHTML = html;
  }

  function renderAuthPicker(overlay, cfg = getCachedConfig(), mode = "provider") {
    const picker = overlay?.querySelector("#cw-auth-provider-picker");
    if (!picker) return;
    const groups = mode === "metadata" ? [META_GROUP] : AUTH_GROUPS;
    const category = groups.some(group => group.id === overlay.dataset.cwPickerCategory) ? overlay.dataset.cwPickerCategory : "all";
    const search = overlay.dataset.cwPickerSearch || "";
    const tabs = [{id:"all", title:mode === "metadata" ? "All metadata" : "All providers"}, ...groups];
    if (picker.dataset.mode !== mode || !picker.querySelector(".cw-auth-picker-results")) {
      picker.dataset.mode = mode;
      setPickerHtml(picker, `
        <div class="cw-auth-picker-tools">
          <label class="cw-auth-picker-search"><span class="material-symbols-rounded" aria-hidden="true">search</span><input type="search" data-cw-picker-search aria-label="Search providers" placeholder="Search providers..." autocomplete="off"></label>
          <div class="cw-auth-picker-tabs" role="tablist" aria-label="Provider categories">${tabs.map(tab => `<button type="button" role="tab" id="cw-picker-tab-${tab.id}" data-cw-picker-category="${tab.id}" aria-controls="cw-auth-picker-results">${escHtml(tab.title)}</button>`).join("")}</div>
        </div>
        <div id="cw-auth-picker-results" class="cw-auth-picker-results" role="tabpanel" tabindex="0"></div>
        <span class="sr-only" data-cw-picker-count role="status"></span>`);
    }
    const input = picker.querySelector("[data-cw-picker-search]");
    if (input.value !== search) input.value = search;
    picker.querySelectorAll("[data-cw-picker-category]").forEach(tab => {
      const active = tab.dataset.cwPickerCategory === category;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    const configured = configuredProviderKeys(cfg);
    const supported = new Set(authProviderKeysWithSections());
    let total = 0;
    const rows = groups.filter(group => category === "all" || category === group.id).map(group => {
      const items = group.keys
        .filter(key => mode === "metadata" || supported.has(key))
        .map(key => mode === "metadata" ? metadataProviderInfo(key) : authProviderInfo(key))
        .filter(info => `${info.label} ${info.key}`.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, {sensitivity:"base"}))
        .map(info => {
          total++;
          const status = mode === "metadata" ? metadataStatusFor(info.key, cfg) : authStatusFor(info.key, configured.has(info.key), cfg);
          const failedNames = status.text.startsWith("Check connection: ") ? status.text.slice(18) : "";
          const label = failedNames ? "Check connection" : status.text;
          const attr = mode === "metadata" ? "data-cw-meta-pick" : "data-cw-auth-pick";
          return `<button type="button" class="cw-auth-picker-row" ${attr}="${escHtml(info.key)}">
            <span class="cw-auth-picker-logo" aria-hidden="true">${mode === "metadata" ? metadataProviderLogo(info) : authProviderLogo(info.key)}</span>
            <span class="cw-auth-picker-copy"><strong>${escHtml(info.label)}</strong><small>${status.ok ? '<span class="cw-auth-picker-dot" aria-hidden="true"></span>' : ""}<span>${escHtml(label)}</span>${failedNames ? `<span class="cw-auth-picker-instance">${escHtml(failedNames)}</span>` : ""}</small></span>
            <span class="material-symbols-rounded cw-auth-picker-chevron" aria-hidden="true">chevron_right</span>
          </button>`;
        }).join("");
      return items ? `<section class="cw-auth-picker-group" aria-labelledby="cw-picker-heading-${group.id}"><h4 id="cw-picker-heading-${group.id}">${escHtml(group.title)}</h4><div class="cw-auth-picker-grid">${items}</div></section>` : "";
    }).join("");
    const results = picker.querySelector(".cw-auth-picker-results");
    results.setAttribute("aria-labelledby", `cw-picker-tab-${category}`);
    setPickerHtml(results, rows || '<div class="cw-auth-picker-empty">No providers found. Try another search or category.</div>');
    const count = picker.querySelector("[data-cw-picker-count]");
    const countText = `${total} provider${total === 1 ? "" : "s"} found`;
    if (count.textContent !== countText) count.textContent = countText;
  }

  function syncAuthChildren(parent, nextChildren, keyOf, update) {
    const current = new Map(Array.from(parent.children, (node) => [keyOf(node), node]));
    let cursor = parent.firstElementChild;
    for (const next of nextChildren) {
      const key = keyOf(next);
      const node = current.get(key) || next;
      current.delete(key);
      if (node !== next) update(node, next);
      if (node !== cursor) parent.insertBefore(node, cursor);
      cursor = node.nextElementSibling;
    }
    current.forEach((node) => node.remove());
  }

  function updateAuthDashboard(shell, html) {
    if (!shell.querySelector(":scope > .cw-auth-dashboard")) {
      shell.innerHTML = html;
      return;
    }
    const template = document.createElement("template");
    template.innerHTML = html;
    const patchCard = (node, next) => {
      if (node.className !== next.className) node.className = next.className;
      if (node.innerHTML !== next.innerHTML) node.innerHTML = next.innerHTML;
    };
    syncAuthChildren(shell.querySelector(".cw-auth-summary-row"),
      Array.from(template.content.querySelector(".cw-auth-summary-row").children),
      (node) => node.dataset.cwAuthSummary, patchCard);
    syncAuthChildren(shell.querySelector(".cw-auth-service-list"),
      Array.from(template.content.querySelector(".cw-auth-service-list").children),
      (node) => node.dataset.cwAuthGroup, (section, next) => {
        const grid = section.querySelector(":scope > .cw-auth-service-grid");
        if (!grid) return;
        syncAuthChildren(grid, Array.from(next.querySelector(".cw-auth-service-grid").children),
          (node) => node.dataset.cwAuthOpen || node.dataset.cwMetaOpen || `add:${node.dataset.cwAuthEmptyAdd}`,
          patchCard);
      });
  }

  function fanartNudgeHtml(cfg) {
    if (settingsScope() || !metadataConfigured("TMDB_METADATA", cfg)) return "";
    if (cfg?.fanart?.enabled === true || cfg?.fanart?.nudge_dismissed === true) return "";
    return `<div class="cw-auth-nudge">
        <button type="button" class="cw-auth-service-card cw-auth-add-card" data-cw-meta-open="FANART_METADATA">
          <span class="cw-auth-add-mark"><span class="material-symbols-rounded" aria-hidden="true">auto_awesome</span></span>
          <span class="cw-auth-service-copy">
            <strong>Try fanart.tv</strong>
            <small>Better logos and backgrounds. Optional, no key needed.</small>
          </span>
          <span class="material-symbols-rounded cw-auth-chevron" aria-hidden="true">arrow_forward</span>
        </button>
        <button type="button" class="cw-auth-nudge-dismiss" data-cw-fanart-nudge-dismiss title="Hide this suggestion" aria-label="Hide this suggestion"><span class="material-symbols-rounded" aria-hidden="true">close</span></button>
      </div>`;
  }

  async function dismissFanartNudge() {
    try {
      const r = await fetch("/api/fanart/settings", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", credentials: "same-origin", body: JSON.stringify({ nudge_dismissed: true }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) return;
    } catch {
      return;
    }
    const cfg = getCachedConfig();
    cfg.fanart = { ...(cfg.fanart || {}), nudge_dismissed: true };
    const slot = document.getElementById("auth-providers");
    if (slot) renderAuthCards(slot, cfg);
  }

  function renderAuthCards(slot, cfg = getCachedConfig(), refreshProfiles = false) {
    const { shell } = ensureAuthShell(slot);