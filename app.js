// ========== 常量与工具 ==========
const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));
const store = {
  get:k=>localStorage.getItem(k),
  set:(k,v)=>localStorage.setItem(k,v),
  jget:k=>JSON.parse(localStorage.getItem(k)||"null"),
  jset:(k,v)=>localStorage.setItem(k,JSON.stringify(v))
};
const THEME_K = "portal_theme";
const HISTORY_K = "search_history_v1";

// 热门关键词可按需修改
const HOT = ["4K HDR","HEVC 10bit","Remux","AAC 2.0","Nyaa 1080p","YTS 2160p"];

// ========== 主题 ==========
function applyTheme(){
  const t = store.get(THEME_K);
  document.documentElement.dataset.theme = t || "";
}
$("#themeBtn").addEventListener("click",()=>{
  const cur = store.get(THEME_K);
  const next = cur==="dark" ? "light" : cur==="light" ? "" : "dark";
  next ? store.set(THEME_K,next) : localStorage.removeItem(THEME_K);
  applyTheme();
});
applyTheme();

// ========== 规则加载 ==========
async function loadRules(){
  const res = await fetch("./rules.json",{cache:"no-store"});
  const j = await res.json();
  return Array.isArray(j.rules)? j.rules : [];
}

// ========== 规则 JSON 解析为搜索 URL ==========
/*
支持以下字段（遇到则优先）：
- searchUrlTemplate 或 template 或 search.template
- {keyword} / {query} / %s 占位符
*/
function resolveTemplate(obj){
  if (!obj || typeof obj!=="object") return null;
  if (typeof obj.searchUrlTemplate==="string") return obj.searchUrlTemplate;
  if (typeof obj.template==="string") return obj.template;
  if (obj.search && typeof obj.search.template==="string") return obj.search.template;
  if (obj.search && typeof obj.search.url==="string") return obj.search.url;
  return null;
}
function fillKeyword(tpl, kw){
  const enc = encodeURIComponent(kw);
  return tpl
    .replaceAll("{keyword}",enc)
    .replaceAll("{query}",enc)
    .replaceAll("%s",enc);
}

// ========== 搜索链接生成 ==========
async function buildSearchLinks(rule, keyword){
  const enc = encodeURIComponent(keyword);

  // 规则 JSON：解析模板
  if (/\.json(\?|$)/i.test(rule.url)){
    try{
      const r = await fetch(rule.url);
      const j = await r.json();
      const tpl = resolveTemplate(j);
      if (tpl){
        return [
          { label:"搜索", href: fillKeyword(tpl, keyword), kind:"primary" },
          { label:"主页", href: j.home || j.base || rule.url, kind:"secondary", warn: !!j.needProxy }
        ];
      }
      // 未发现模板，退回查看规则文件
      return [{ label:"查看规则文件", href: rule.url, kind:"warn" }];
    }catch{
      return [{ label:"查看规则文件", href: rule.url, kind:"warn" }];
    }
  }

  // 普通站点：常见路径 + 主页
  const base = rule.url.replace(/\/$/,"");
  const candidates = [
    `${base}/search/${enc}`,
    `${base}/search?${enc}`,
    `${base}/?q=${enc}`,
    `${base}/search?q=${enc}`,
  ];
  return [
    { label:"主页", href: rule.url, kind:"secondary" },
    { label:"搜索", href: candidates[0], kind:"primary" }
  ];
}

// ========== UI 渲染 ==========
const resultsEl = $("#results");
const cardTpl = $("#sourceCardTpl");
const categorySel = $("#categoryFilter");
const historyEl = $("#history");
const chipsEl = $("#hotChips");

function renderHot(){
  chipsEl.innerHTML = "";
  HOT.forEach(k=>{
    const c = document.createElement("button");
    c.className = "chip";
    c.textContent = k;
    c.addEventListener("click",()=>{
      $("#keyword").value = k;
      doSearch();
    });
    chipsEl.appendChild(c);
  });
}

function getHistory(){
  return store.jget(HISTORY_K) || [];
}
function pushHistory(kw){
  if (!kw) return;
  const arr = getHistory().filter(x=>x!==kw);
  arr.unshift(kw);
  const out = arr.slice(0,10);
  store.jset(HISTORY_K,out);
}
function renderHistory(){
  const arr = getHistory();
  historyEl.innerHTML = "";
  if (!arr.length) return;
  const frag = document.createDocumentFragment();
  arr.forEach(k=>{
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = k;
    b.addEventListener("click",()=>{
      $("#keyword").value = k;
      doSearch();
    });
    frag.appendChild(b);
  });
  const clr = document.createElement("button");
  clr.className = "chip";
  clr.textContent = "清空历史";
  clr.addEventListener("click",()=>{
    localStorage.removeItem(HISTORY_K);
    renderHistory();
  });
  frag.appendChild(clr);
  historyEl.appendChild(frag);
}

function fillCategorySelect(rules){
  const cats = Array.from(new Set(rules.map(r=>r.category||"其他")));
  categorySel.innerHTML = `<option value="all">全部分类</option>`;
  cats.forEach(c=>{
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    categorySel.appendChild(opt);
  });
}

function applyStatus(node, state){
  const dot = $(".status .dot", node);
  const text = $(".status .text", node);
  if (state==="ok"){ dot.style.background="var(--ok)"; text.textContent="在线"; }
  else if (state==="blocked"){ dot.style.background="var(--bad)"; text.textContent="不可达/需代理"; }
  else { dot.style.background="var(--warn)"; text.textContent="检测中…"; }
}

// 轻量可用性检测：对主页或可推断域名发起 fetch（GET, no-cors），超时视为 blocked
async function probe(url, timeout=4500){
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(), timeout);
  try{
    await fetch(url, { mode:"no-cors", method:"GET", signal:controller.signal });
    clearTimeout(t);
    return "ok";
  }catch{
    clearTimeout(t);
    return "blocked";
  }
}

async function renderCards(rules, keyword){
  resultsEl.innerHTML = "";
  const cat = categorySel.value || "all";
  const filtered = cat==="all" ? rules : rules.filter(r=>(r.category||"其他")===cat);

  for (const rule of filtered){
    const card = cardTpl.content.firstElementChild.cloneNode(true);
    $(".source-icon", card).src = rule.icon || "https://via.placeholder.com/34";
    $(".source-icon", card).alt = rule.name || "";
    $(".source-name", card).textContent = rule.name || "(未命名)";
    $(".desc", card).textContent = rule.desc || "";
    $(".tag", card).textContent = rule.category || "其他";

    // 状态先显示“检测中…”，随后异步更新
    applyStatus(card, "pending");
    const probeUrl = /\.json(\?|$)/i.test(rule.url) ? (rule.home || rule.base || rule.url) : rule.url;
    probe(probeUrl).then(st=>applyStatus(card, st));

    const actions = $(".source-actions", card);
    actions.innerHTML = "";
    const links = await buildSearchLinks(rule, keyword);

    links.forEach(l=>{
      const a = document.createElement("a");
      a.href = l.href;
      a.target = "_blank";
      a.textContent = l.label;
      if (l.kind==="secondary") a.classList.add("secondary");
      if (l.kind==="warn") a.classList.add("warn");
      actions.appendChild(a);
    });

    resultsEl.appendChild(card);
  }
}

// ========== 搜索 ==========
let rulesCache = null;
async function ensureRules(){
  if (!rulesCache) rulesCache = await loadRules();
  return rulesCache;
}

async function doSearch(){
  const kw = ($("#keyword").value || "").trim();
  if (!kw) return;
  pushHistory(kw);
  renderHistory();
  const rules = await ensureRules();
  await renderCards(rules, kw);
}

// ========== 一键全开 ==========
async function openAll(){
  const kw = ($("#keyword").value || "").trim();
  if (!kw) return;
  const rules = await ensureRules();
  const cat = categorySel.value || "all";
  const arr = cat==="all" ? rules : rules.filter(r=>(r.category||"其他")===cat);
  for (const rule of arr){
    const links = await buildSearchLinks(rule, kw);
    links.forEach(l=>window.open(l.href, "_blank"));
  }
}

// ========== 事件 ==========
$("#searchBtn").addEventListener("click", doSearch);
$("#openAllBtn").addEventListener("click", openAll);
$("#keyword").addEventListener("keydown", e=>{ if (e.key==="Enter") doSearch(); });
categorySel.addEventListener("change", ()=>{
  const kw = ($("#keyword").value || "").trim();
  if (kw && rulesCache) renderCards(rulesCache, kw);
});

// 初始化
(async function init(){
  renderHot();
  renderHistory();
  const rules = await ensureRules();
  fillCategorySelect(rules);
})();
