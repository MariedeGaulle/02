async function loadRules() {
  const res = await fetch('./rules.json');
  const json = await res.json();
  return json.rules || [];
}

function buildSearchLinks(sourceUrl, keyword) {
  const enc = encodeURIComponent(keyword);
  if (/\.json$/i.test(sourceUrl)) {
    return [{ label: '查看规则文件', href: sourceUrl }];
  }
  return [
    { label: '主页', href: sourceUrl },
    { label: '搜索', href: `${sourceUrl.replace(/\/$/, '')}/search/${enc}` }
  ];
}

async function renderResults(keyword) {
  const rules = await loadRules();
  const container = document.querySelector('#results');
  container.innerHTML = '';

  const categories = [...new Set(rules.map(r => r.category || '其他'))];
  categories.forEach(cat => {
    const title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = cat;
    container.appendChild(title);

    rules.filter(r => (r.category || '其他') === cat).forEach(rule => {
      const card = document.createElement('div');
      card.className = 'source-card';

      const header = document.createElement('div');
      header.className = 'source-header';
      const icon = document.createElement('img');
      icon.className = 'source-icon';
      icon.src = rule.icon || 'https://via.placeholder.com/32';
      icon.alt = rule.name;
      const info = document.createElement('div');
      info.className = 'source-info';
      const h3 = document.createElement('h3');
      h3.textContent = rule.name;
      const desc = document.createElement('div');
      desc.className = 'desc';
      desc.textContent = rule.desc || '';
      info.appendChild(h3);
      info.appendChild(desc);
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = rule.category || '';
      header.appendChild(icon);
      header.appendChild(info);
      header.appendChild(tag);

      const actions = document.createElement('div');
      actions.className = 'source-actions';
      buildSearchLinks(rule.url, keyword).forEach(link => {
        const a = document.createElement('a');
        a.href = link.href;
        a.target = '_blank';
        a.textContent = link.label;
        actions.appendChild(a);
      });

      card.appendChild(header);
      card.appendChild(actions);
      container.appendChild(card);
    });
  });
}

document.querySelector('#searchBtn').addEventListener('click', () => {
  const keyword = document.querySelector('#keyword').value.trim();
  if (keyword) renderResults(keyword);
});

document.querySelector('#openAllBtn').addEventListener('click', async () => {
  const keyword = document.querySelector('#keyword').value.trim();
  if (!keyword) return;
  const rules = await loadRules();
  rules.forEach(rule => {
    const links = buildSearchLinks(rule.url, keyword);
    links.forEach(l => window.open(l.href, '_blank'));
  });
});

document.querySelector('#keyword').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const keyword = e.target.value.trim();
    if (keyword) renderResults(keyword);
  }
});
