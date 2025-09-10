// ====== 简易选择器与工具 ======
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const nowISO = () => new Date().toISOString();

const STORAGE_KEY = "magnet_keeper_v2";
const THEME_KEY = "magnet_keeper_theme";
const REGEX_KEY = "magnet_custom_regex_lines";
const API_URL_KEY = "bt_api_url";
const API_TOKEN_KEY = "bt_api_token";
const CLIENT_TYPE_KEY = "bt_client_type"; // qb | tr
const RULE_SOURCES_KEY = "magnet_rule_sources_cache";

// ====== 持久化 ======
function readList() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function writeList(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
function readRegexLines() {
  try { return JSON.parse(localStorage.getItem(REGEX_KEY) || "[]"); } catch { return []; }
}
function writeRegexLines(lines) {
  localStorage.setItem(REGEX_KEY, JSON.stringify(lines || []));
}

// ====== Magnet 校验与解析 ======
function isValidMagnet(uri) {
  const lines = readRegexLines();
  if (lines.length) {
    return lines.some(p => {
      try { return new RegExp(p, "i").test(uri); } catch { return false; }
    });
  }
  return /^magnet:\?xt=urn:btih:[A-Za-z0-9]{32,40}/i.test(uri);
}

function parseMagnet(uri) {
  const out = { dn: "", xt: "", tr: [], params: {} };
  try {
    const q = uri.split("magnet:?")[1] || "";
    const parts = q.split("&");
    for (const p of parts) {
      const [k, v = ""] = p.split("=");
      const key = decodeURIComponent(k || "").toLowerCase();
      const val = decodeURIComponent(v || "");
      if (!key) continue;
      if (!out.params[key]) out.params[key] = [];
      out.params[key].push(val);
      if (key === "dn" && !out.dn) out.dn = val;
      if (key === "xt" && val.toLowerCase().startsWith("urn:btih:")) out.xt = val;
      if (key === "tr") out.tr.push(val);
    }
  } catch {}
  const infoHash = out.xt ? out.xt.split("urn:btih:")[1] : "";
  return { dn: out.dn, tr: out.tr, infoHash, raw: uri };
}

function uniqTags(s) {
  return Array.from(new Set((s || "").split(/[, ，]/).map(t => t.trim()).filter(Boolean)));
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString();
}

function toast(msg) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;left:50%;bottom:24px;transform:translateX(-50%);
    background:rgba(0,0,0,.78);color:#fff;padding:8px 12px;border-radius:8px;z-index:9999
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("已复制");
  }
}

// ====== 全局状态 ======
let data = readList();
let speedTimer = null;

// ====== DOM 缓存 ======
const listEl = $("#list");
const emptyHint = $("#emptyHint");
const itemTpl = $("#itemTpl");
const searchResults = $("#searchResults");
const searchEmptyHint = $("#searchEmptyHint");

// ====== 渲染列表（含真实速度） ======
async function renderList() {
  // 过滤与排序
  const q = ($("#qInput").value || "").toLowerCase();
  const tagFilter = uniqTags($("#tagFilterInput").value).map(t => t.toLowerCase());
  const sort = $("#sortSelect").value;

  let items = [...data];

  if (q) {
    items = items.filter(it => {
      const hay = [it.title, it.note, it.infoHash, it.magnet, ...(it.tags || [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  if (tagFilter.length) {
    items = items.filter(it =>
      tagFilter.every(t => (it.tags || []).map(x => x.toLowerCase()).includes(t))
    );
  }
  items.sort((a, b) => {
    switch (sort) {
      case "created_asc": return a.created.localeCompare(b.created);
      case "title_asc": return (a.title || "").localeCompare(b.title || "");
      case "title_desc": return (b.title || "").localeCompare(a.title || "");
      case "created_desc":
      default: return b.created.localeCompare(a.created);
    }
  });

  listEl.innerHTML = "";
  if (!items.length) {
    emptyHint.style.display = "block";
    return;
  }
  emptyHint.style.display = "none";

  for (const it of items) {
    const node = itemTpl.content.firstElementChild.cloneNode(true);
    $(".item-title", node).textContent = it.title || it.dn || "(未命名)";
    $(".item-time", node).textContent = fmtTime(it.created);
    $(".item-hash", node).textContent = it.infoHash || "—";
    $(".item-tags", node).textContent = (it.tags || []).map(t => `#${t}`).join(" ");
    $(".item-note", node).textContent = it.note || "";
    $(".kv-hash", node).textContent = it.infoHash || "";
    $(".kv-dn", node).textContent = it.dn || "";
    $(".kv-raw", node).textContent = it.magnet;

    const trList = $(".kv-tr", node);
    if (it.tr?.length) {
      it.tr.forEach(tr => {
        const li = document.createElement("li");
        li.textContent = tr;
        trList.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "（无 Tracker 参数）";
      trList.appendChild(li);
    }

    // 操作
    $(".openBtn", node).addEventListener("click", () => window.location.href = it.magnet);
    $(".copyBtn", node).addEventListener("click", () => copyText(it.magnet));
    $(".editBtn", node).addEventListener("click", () => editItem(it.id));
    $(".delBtn", node).addEventListener("click", () => deleteItem(it.id));

    listEl.appendChild(node);
  }

  // 速度轮询
  setupSpeedPolling();
}

// ====== 速度获取（qBittorrent / Transmission） ======
function getApiConfig() {
  return {
    type: localStorage.getItem(CLIENT_TYPE_KEY) || "qb",
    url: (localStorage.getItem(API_URL_KEY) || "").trim(),
    token: (localStorage.getItem(API_TOKEN_KEY) || "").trim(),
  };
}

async function fetchSpeedFor(infoHash) {
  const { type, url, token } = getApiConfig();
  if (!url) return null;

  try {
    if (type === "qb") {
      // qBittorrent: GET /torrents/properties?hash=<hash>
      const res = await fetch(`${url.replace(/\/$/, "")}/torrents/properties?hash=${encodeURIComponent(infoHash)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include"
      });
      if (!res.ok) return null;
      const j = await res.json();
      return j?.dlspeed ?? null; // B/s
    } else {
      // Transmission: POST /transmission/rpc
      // 需先获取 X-Transmission-Session-Id
      const sessionId = await ensureTransmissionSessionId(url, token);
      const body = {
        method: "torrent-get",
        arguments: { fields: ["hashString", "rateDownload"], ids: [infoHash.toLowerCase()] }
      };
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Transmission-Session-Id": sessionId,
          ...(token ? { Authorization: `Basic ${btoa(token)}` } : {})
        },
        body: JSON.stringify(body),
        credentials: "include"
      });
      if (!res.ok) return null;
      const j = await res.json();
      const t = j?.arguments?.torrents?.[0];
      return t?.rateDownload ?? null; // B/s
    }
  } catch {
    return null;
  }
}

let trSessionIdCache = null;
async function ensureTransmissionSessionId(url, token) {
  if (trSessionIdCache) return trSessionIdCache;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Basic ${btoa(token)}` } : {})
    },
    body: JSON.stringify({ method: "session-get" }),
    credentials: "include"
  });
  if (res.status === 409) {
    const sid = res.headers.get("X-Transmission-Session-Id");
    trSessionIdCache = sid;
    return sid;
  }
  if (res.ok) {
    const sid = res.headers.get("X-Transmission-Session-Id");
    trSessionIdCache = sid;
    return sid;
  }
  return "";
}

function formatSpeed(bytes) {
  if (bytes == null) return "N/A";
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB/s`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB/s`;
}

function setupSpeedPolling() {
  if (speedTimer) {
    clearInterval(speedTimer);
    speedTimer = null;
  }
  const { url } = getApiConfig();
  if (!url) {
    // 未配置 API，速度显示置为 N/A
    $$(".item").forEach(node => {
      const el = $(".item-speed", node);
      if (el) el.textContent = "速度: N/A";
    });
    return;
  }

  // 先立即刷一次
  pollOnce();
  speedTimer = setInterval(pollOnce, 5000);

  async function pollOnce() {
    const nodes = $$(".item");
    for (const node of nodes) {
      const hash = $(".kv-hash", node)?.textContent?.trim();
      if (!hash) continue;
      const bps = await fetchSpeedFor(hash);
      const el = $(".item-speed", node);
      if (el) el.textContent = `速度: ${formatSpeed(bps)}`;
    }
  }
}

// ====== CRUD ======
function addItem({ title, magnet, tags, note }) {
  if (!isValidMagnet(magnet)) {
    alert("无效的 magnet 链接：需匹配默认或自定义正则。");
    return;
  }
  const parsed = parseMagnet(magnet);
  const item = {
    id: crypto.randomUUID(),
    title: (title || "").trim(),
    dn: parsed.dn || "",
    infoHash: (parsed.infoHash || "").toUpperCase(),
    tr: parsed.tr || [],
    magnet: magnet.trim(),
    tags: uniqTags(tags),
    note: (note || "").trim(),
    created: nowISO(),
    updated: nowISO(),
  };
  data.unshift(item);
  writeList(data);
  renderList();
}

function editItem(id) {
  const idx = data.findIndex(x => x.id === id);
  if (idx < 0) return;
  const it = data[idx];

  const title = prompt("编辑标题：", it.title || it.dn || "");
  if (title === null) return;

  const magnet = prompt("编辑磁力链接：", it.magnet);
  if (magnet === null) return;
  if (!isValidMagnet(magnet)) { alert("无效的 magnet 链接。"); return; }

  const tags = prompt("编辑标签（逗号分隔）：", (it.tags || []).join(", "));
  if (tags === null) return;

  const note = prompt("编辑备注：", it.note || "");
  if (note === null) return;

  const parsed = parseMagnet(magnet);
  data[idx] = {
    ...it,
    title: (title || "").trim(),
    magnet: magnet.trim(),
    dn: parsed.dn || "",
    infoHash: (parsed.infoHash || "").toUpperCase(),
    tr: parsed.tr || [],
    tags: uniqTags(tags),
    note: (note || "").trim(),
    updated: nowISO(),
  };
  writeList(data);
  renderList();
}

function deleteItem(id) {
  if (!confirm("确定要删除该条目吗？")) return;
  data = data.filter(x => x.id !== id);
  writeList(data);
  renderList();
}

// ====== 规则源加载（多源搜索用） ======
async function loadRuleSources() {
  // 优先使用缓存（避免频繁请求）
  try {
    const cached = JSON.parse(localStorage.getItem(RULE_SOURCES_KEY) || "null");
    if (cached && Array.isArray(cached) && cached.length) return cached;
  } catch {}
  try {
    const res = await fetch("./rules.json", { cache: "no-store" });
    const j = await res.json();
    const arr = Array.isArray(j.rules) ? j.rules : [];
    localStorage.setItem(RULE_SOURCES_KEY, JSON.stringify(arr));
    return arr;
  } catch {
    return [];
  }
}
function clearRuleSourcesCache() {
  localStorage.removeItem(RULE_SOURCES_KEY);
}

// ====== 多源搜索（生成跳转链接） ======
// 由于不同源规则格式不一致，这里提供“访问源”和“尝试搜索”的常见模式链接
function buildSearchLinksForSource(sourceUrl, keyword) {
  const links = [];
  const enc = encodeURIComponent(keyword);

  // 规则文件（.json）不一定可直接搜索，提供“查看规则文件”
  if (/\.json(\?|$)/i.test(sourceUrl)) {
    links.push({ label: "查看规则文件", href: sourceUrl, target: "_blank" });
    // 常见模板尝试（如果规则文件中有template，用户可手动复制）
    return links;
  }

  // 常见站点搜索路径尝试（不一定都可用）
  links.push({ label: "访问源主页", href: sourceUrl, target: "_blank" });

  // 常见搜索路径猜测（多提供几个备选）
  const candidates = [
    `${sourceUrl.replace(/\/$/, "")}/search/${enc}`,
    `${sourceUrl.replace(/\/$/, "")}/search?${enc}`,
    `${sourceUrl.replace(/\/$/, "")}/?s=${enc}`,
    `${sourceUrl.replace(/\/$/, "")}/search?q=${enc}`,
    `${sourceUrl.replace(/\/$/, "")}/?q=${enc}`
  ];
  // 去重
  const uniq = Array.from(new Set(candidates));
  uniq.forEach(u => links.push({ label: "尝试搜索", href: u, target: "_blank" }));

  return links;
}

async function handleSearch() {
  const keyword = ($("#searchInput").value || "").trim();
  if (!keyword) return;
  const rules = await loadRuleSources();

  searchResults.innerHTML = "";
  if (!rules.length) {
    searchEmptyHint.textContent = "未加载到任何规则源。";
    searchEmptyHint.style.display = "block";
    return;
  }
  searchEmptyHint.style.display = "none";

  for (const r of rules) {
    const li = document.createElement("li");
    li.className = "item";
    const left = document.createElement("div");
    left.className = "item-main";
    const right = document.createElement("div");
    right.className = "item-actions";

    const titleRow = document.createElement("div");
    titleRow.className = "item-title-row";
    const strong = document.createElement("strong");
    strong.className = "item-title";
    strong.textContent = r.name || "(未命名源)";
    const urlSpan = document.createElement("span");
    urlSpan.className = "item-time";
    urlSpan.textContent = r.url;
    titleRow.appendChild(strong);
    titleRow.appendChild(urlSpan);

    const sub = document.createElement("div");
    sub.className = "item-sub";
    sub.textContent = "搜索入口：";

    const links = buildSearchLinksForSource(r.url, keyword);
    if (!links.length) {
      const s = document.createElement("span");
      s.textContent = "（无可用入口）";
      sub.appendChild(s);
    } else {
      links.forEach(lk => {
        const a = document.createElement("a");
        a.href = lk.href;
        a.target = lk.target || "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = lk.label;
        a.style.marginRight = "8px";
        right.appendChild(a);
      });
    }

    left.appendChild(titleRow);
    left.appendChild(sub);
    li.appendChild(left);
    li.appendChild(right);
    searchResults.appendChild(li);
  }
}

// ====== 事件绑定 ======
$("#addForm").addEventListener("submit", e => {
  e.preventDefault();
  addItem({
    title: $("#titleInput").value,
    magnet: $("#magnetInput").value,
    tags: $("#tagsInput").value,
    note: $("#noteInput").value
  });
  $("#addForm").reset();
  $("#titleInput").focus();
});

$("#qInput").addEventListener("input", renderList);
$("#tagFilterInput").addEventListener("input", renderList);
$("#sortSelect").addEventListener("change", renderList);

$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `magnet-keeper-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$("#importInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error("格式错误");

    const map = new Map(data.map(x => [x.id, x]));
    for (const it of arr) {
      if (it?.id && !map.has(it.id)) {
        map.set(it.id, it);
      } else if (it?.magnet) {
        const key = it.magnet + "|" + (it.infoHash || "");
        const existed = Array.from(map.values()).some(v => (v.magnet + "|" + (v.infoHash||"")) === key);
        if (!existed) {
          const id = crypto.randomUUID();
          map.set(id, { ...it, id });
        }
      }
    }
    data = Array.from(map.values());
    writeList(data);
    renderList();
    toast("导入完成");
  } catch {
    alert("导入失败：请检查 JSON 文件。");
  } finally {
    e.target.value = "";
  }
});

$("#clearAllBtn").addEventListener("click", () => {
  if (!confirm("这将清空本地所有数据，确定吗？")) return;
  data = [];
  writeList(data);
  renderList();
});

const themeToggle = $("#themeToggle");
function applyTheme() {
  const pref = localStorage.getItem(THEME_KEY);
  document.documentElement.dataset.theme = pref || "";
}
themeToggle.addEventListener("click", () => {
  const cur = localStorage.getItem(THEME_KEY);
  const next = cur === "dark" ? "light" : cur === "light" ? "" : "dark";
  if (next) localStorage.setItem(THEME_KEY, next);
  else localStorage.removeItem(THEME_KEY);
  applyTheme();
});
applyTheme();

// 设置面板
$("#settingsBtn").addEventListener("click", () => {
  $("#clientTypeSelect").value = localStorage.getItem(CLIENT_TYPE_KEY) || "qb";
  $("#apiUrlInput").value = localStorage.getItem(API_URL_KEY) || "";
  $("#apiTokenInput").value = localStorage.getItem(API_TOKEN_KEY) || "";
  $("#rulesRegexInput").value = readRegexLines().join("\n");
  $("#settingsPanel").classList.remove("hidden");
});
$("#closeSettingsBtn").addEventListener("click", () => {
  $("#settingsPanel").classList.add("hidden");
});
$("#saveSettingsBtn").addEventListener("click", () => {
  localStorage.setItem(CLIENT_TYPE_KEY, $("#clientTypeSelect").value);
  localStorage.setItem(API_URL_KEY, $("#apiUrlInput").value.trim());
  localStorage.setItem(API_TOKEN_KEY, $("#apiTokenInput").value.trim());
  const lines = $("#rulesRegexInput").value.split("\n").map(s => s.trim()).filter(Boolean);
  writeRegexLines(lines);
  // 清理 TR 会话缓存
  trSessionIdCache = null;
  toast("设置已保存");
  $("#settingsPanel").classList.add("hidden");
  renderList();
});

// 多源搜索
$("#searchBtn").addEventListener("click", handleSearch);
$("#reloadRulesBtn").addEventListener("click", () => {
  clearRuleSourcesCache();
  toast("已清空规则缓存，稍后将重新加载。");
  handleSearch();
});

// ====== 启动 ======
renderList();
