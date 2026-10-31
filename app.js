const STORAGE_KEY = 'og_mystery_data_v4';
const ROBLOX_STATS_INTERVAL = 60000;

let appState = {
  categories: [],
  pets: [],
  updateLogs: [],
  settings: { gameBannerUrl: '', gameBannerEmoji: '🐾', activeUpdateBadge: 'Update 3: Haunted Island' },
  activeCategory: 'all',
  searchQuery: '',
  sortMode: 'price-desc',
  activeLogId: null
};

async function loadData() {
  try {
    const res = await fetch('/api/get-data');
    const data = await res.json();
    appState.categories = data.categories || [];
    appState.pets = data.pets || [];
    appState.updateLogs = data.updateLogs || [];
    appState.settings = Object.assign({ gameBannerUrl: '', gameBannerEmoji: '🐾', activeUpdateBadge: 'Update 3: Haunted Island' }, data.settings || {});
  } catch (err) {
    appState.categories = [
      { id: 'pets', name: 'Pets', badgeColor: '#a855f7' },
      { id: 'huges', name: 'Huges', badgeColor: '#f59e0b' }
    ];
    appState.pets = [];
    appState.updateLogs = [];
  }

  initUI();
}

function initUI() {
  renderCategoryFilters();
  renderPetGrid();
  renderDevblogList();
  updateStats();
  applySettings();
  setupNavigation();
  setupEventListeners();
  fetchRobloxStats();
  setInterval(fetchRobloxStats, ROBLOX_STATS_INTERVAL);
}

function applySettings() {
  updateBannerImage();
}

function updateBannerImage() {
  const bannerEl = document.getElementById('game-card-banner');
  if (!bannerEl) return;

  const url = appState.settings.gameBannerUrl?.trim();
  const emoji = appState.settings.gameBannerEmoji || '🐾';

  if (url) {
    bannerEl.innerHTML = `
      <img src="${url}" alt="Pet Simulator OG" class="game-thumb" onerror="this.style.display='none';document.getElementById('game-card-banner').querySelector('.game-card-bg').style.display='flex';">
      <div class="game-card-bg" style="display:none;">${emoji}</div>
      <div class="game-card-overlay">Pet Simulator OG</div>
    `;
  } else {
    bannerEl.innerHTML = `
      <div class="game-card-bg">${emoji}</div>
      <div class="game-card-overlay">Pet Simulator OG</div>
    `;
  }
}

async function fetchRobloxStats() {
  try {
    const res = await fetch('/api/roblox-stats');
    const data = await res.json();
    if (data.success) {
      setStatDisplay('stat-active', data.active);
      setStatDisplay('stat-favorites', data.favorites);
      setStatDisplay('stat-visits', data.visits);
    }
  } catch (e) {}
}

function setStatDisplay(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '—';
}

function updateStats() {}

function renderCategoryFilters() {
  const container = document.getElementById('category-filters');
  if (!container) return;

  container.innerHTML = `<button class="filter-pill ${appState.activeCategory === 'all' ? 'active' : ''}" data-category="all">All Tiers</button>`;

  appState.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `filter-pill ${appState.activeCategory === cat.id ? 'active' : ''}`;
    btn.dataset.category = cat.id;
    btn.textContent = cat.name;
    container.appendChild(btn);
  });
}

function formatDemand(demand, rating) {
  if (typeof demand === 'string' && demand.includes('/')) return demand;
  const num = rating !== undefined ? rating : (Number(demand) || 5);
  return `${num}/10`;
}

function getCategoryMeta(catId) {
  return appState.categories.find(c => c.id === catId) || { id: catId, name: catId, badgeColor: '#94a3b8' };
}

function renderPetGrid() {
  const grid = document.getElementById('pet-grid');
  const countEl = document.getElementById('results-count');
  const emptyEl = document.getElementById('no-results');
  if (!grid) return;

  let filtered = appState.pets.filter(pet => {
    const matchesCategory = appState.activeCategory === 'all' || pet.category === appState.activeCategory;
    const matchesSearch = pet.name.toLowerCase().includes(appState.searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  filtered.sort((a, b) => {
    switch (appState.sortMode) {
      case 'price-asc': return a.price - b.price;
      case 'demand-desc': return b.demandRating - a.demandRating || b.price - a.price;
      case 'name-asc': return a.name.localeCompare(b.name);
      default: return b.price - a.price;
    }
  });

  if (countEl) countEl.textContent = `Showing ${filtered.length} ${filtered.length === 1 ? 'pet' : 'pets'}`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  grid.innerHTML = filtered.map(pet => {
    const cat = getCategoryMeta(pet.category);
    const imageHtml = pet.image
      ? `<img src="${pet.image}" alt="${escapeHtml(pet.name)}" class="pet-thumb" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'pet-placeholder\\'><svg width=\\'36\\' height=\\'36\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><polyline points=\\'21 15 16 10 5 21\\'/></svg><span>No Image</span></div>'">`
      : `<div class="pet-placeholder"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>No Image</span></div>`;

    return `
      <article class="pet-card tier-${pet.category}" data-id="${pet.id}">
        <div class="card-top">
          ${imageHtml}
        </div>
        <div class="card-body">
          <h3 class="pet-title" title="${escapeHtml(pet.name)}">${escapeHtml(pet.name)}</h3>
          <div class="card-metrics">
            <div class="metric-item">
              <span class="metric-label">Value</span>
              <span class="metric-value price">${escapeHtml(pet.priceDisplay || formatCurrency(pet.price))}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Demand</span>
              <span class="metric-value demand">${escapeHtml(formatDemand(pet.demand, pet.demandRating))}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

const SECTION_COLORS = { added: '#f59e0b', changes: '#38bdf8', fixes: '#f43f5e' };

function renderDevblogList() {
  const container = document.getElementById('update-logs-list');
  const tocContainer = document.getElementById('toc-links-container');
  if (!container) return;

  if (!appState.updateLogs.length) {
    container.innerHTML = `<div class="empty-state" style="margin:0"><div class="empty-emoji">📋</div><h3>No update logs yet</h3><p>Check back after the next patch!</p></div>`;
    return;
  }

  const activeLog = appState.updateLogs.find(l => l.id === appState.activeLogId) || appState.updateLogs[0];
  appState.activeLogId = activeLog.id;

  container.innerHTML = `
    <div class="devblog-article">
      <div class="devblog-meta">
        <span class="devblog-game-tag">🐾 Pet Simulator OG</span>
      </div>
      <h1 class="devblog-title">${escapeHtml(activeLog.title)}</h1>
      <div class="devblog-byline">
        <span>${escapeHtml(activeLog.date)}</span>
        ${activeLog.readTime ? `<span class="byline-sep">|</span><span>${escapeHtml(activeLog.readTime)}</span>` : ''}
      </div>
      ${activeLog.summary ? `<p class="devblog-summary">${escapeHtml(activeLog.summary)}</p>` : ''}
      <div class="devblog-sections">
        ${(activeLog.sections || []).map(sec => renderSection(sec)).join('')}
      </div>
    </div>
    <div class="devblog-nav">
      ${appState.updateLogs.map(log => `
        <button class="devblog-nav-item ${log.id === activeLog.id ? 'active' : ''}" data-log-id="${log.id}">
          <span class="devblog-nav-title">${escapeHtml(log.title)}</span>
          <span class="devblog-nav-date">${escapeHtml(log.date)}</span>
        </button>
      `).join('')}
    </div>
  `;

  if (tocContainer) {
    tocContainer.innerHTML = (activeLog.sections || []).map(sec => `
      <a class="toc-link" href="#" style="color:${SECTION_COLORS[sec.type] || '#94a3b8'}">
        ${escapeHtml(sec.label || sec.type)}
      </a>
    `).join('');
  }

  container.querySelectorAll('.devblog-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.activeLogId = btn.dataset.logId;
      renderDevblogList();
      if (tocContainer) {
        const activeLog2 = appState.updateLogs.find(l => l.id === appState.activeLogId);
        tocContainer.innerHTML = (activeLog2?.sections || []).map(sec => `
          <a class="toc-link" href="#" style="color:${SECTION_COLORS[sec.type] || '#94a3b8'}">
            ${escapeHtml(sec.label || sec.type)}
          </a>
        `).join('');
      }
    });
  });
}

function renderSection(sec) {
  const color = SECTION_COLORS[sec.type] || '#94a3b8';
  const items = (sec.items || []).map(item => `
    <div class="blog-section-item">
      ${item.heading ? `<h4 class="blog-item-heading">${escapeHtml(item.heading)}</h4>` : ''}
      ${item.body ? `<p class="blog-item-body">${escapeHtml(item.body)}</p>` : ''}
    </div>
  `).join('');
  return `
    <div class="blog-section" data-type="${sec.type}">
      <h2 class="blog-section-label" style="color:${color}">${escapeHtml(sec.label || sec.type)}</h2>
      <div class="blog-section-items">${items}</div>
    </div>
  `;
}

function formatCurrency(num) {
  if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toLocaleString();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function switchView(targetViewId) {
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const viewEl = document.getElementById(targetViewId);
  if (viewEl) viewEl.classList.add('active');
  const navMatch = document.querySelector(`.nav-btn[data-target="${targetViewId}"]`);
  if (navMatch) navMatch.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.target));
  });
  document.querySelectorAll('.footer-link[data-target]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      switchView(link.dataset.target);
    });
  });
}

function setupEventListeners() {
  const searchInput = document.getElementById('pet-search');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      appState.searchQuery = e.target.value.trim();
      renderPetGrid();
    });
  }

  const catContainer = document.getElementById('category-filters');
  if (catContainer) {
    catContainer.addEventListener('click', e => {
      const pill = e.target.closest('.filter-pill');
      if (!pill) return;
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      appState.activeCategory = pill.dataset.category;
      renderPetGrid();
    });
  }

  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', e => {
      appState.sortMode = e.target.value;
      renderPetGrid();
    });
  }
}

async function refreshDataSilently() {
  try {
    const res = await fetch('/api/get-data');
    const data = await res.json();
    appState.categories = data.categories || [];
    appState.pets = data.pets || [];
    appState.updateLogs = data.updateLogs || [];
    appState.settings = Object.assign({ gameBannerUrl: '', gameBannerEmoji: '🐾', activeUpdateBadge: 'Update 3: Haunted Island' }, data.settings || {});
    initUI();
  } catch (err) {}
}

window.addEventListener('DOMContentLoaded', () => {
  loadData();
  setInterval(refreshDataSilently, 20000);
});
