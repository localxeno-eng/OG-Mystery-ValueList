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
  activeLogId: null,
  activeFilterPostId: 'all',
  theme: localStorage.getItem('og_theme') || 'light'
};

function initTheme() {
  document.documentElement.setAttribute('data-theme', appState.theme);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = appState.theme === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  appState.theme = appState.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('og_theme', appState.theme);
  initTheme();
}

async function loadData() {
  initTheme();
  try {
    const res = await fetch('/api/get-data');
    const data = await res.json();
    appState.categories = data.categories || [];
    appState.pets = data.pets || [];
    appState.updateLogs = (data.updateLogs || []).filter(l => !l.isPrivate);
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

  let url = appState.settings.gameBannerUrl?.trim();
  if (url && !/^(https?:)?\//.test(url)) url = '/' + url;
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

function renderCategoryFilters() {
  const container = document.getElementById('category-filter-list');
  if (!container) return;

  const totalPets = appState.pets.length;
  let html = `
    <button class="pill ${appState.activeCategory === 'all' ? 'active' : ''}" data-cat="all">
      <span class="pill-name">All Values</span>
      <span class="pill-count">${totalPets}</span>
    </button>
  `;

  appState.categories.forEach(cat => {
    const count = appState.pets.filter(p => p.category === cat.id).length;
    html += `
      <button class="pill ${appState.activeCategory === cat.id ? 'active' : ''}" data-cat="${escapeHtml(cat.id)}">
        <span class="pill-swatch" style="background:${cat.badgeColor || '#a855f7'};box-shadow:0 0 8px ${cat.badgeColor || '#a855f7'}"></span>
        <span class="pill-name">${escapeHtml(cat.name)}</span>
        <span class="pill-count">${count}</span>
      </button>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.activeCategory = btn.dataset.cat;
      renderCategoryFilters();
      renderPetGrid();
    });
  });
}

function getFilteredPets() {
  let list = appState.pets.slice();

  if (appState.activeCategory !== 'all') {
    list = list.filter(p => p.category === appState.activeCategory);
  }

  if (appState.searchQuery) {
    const q = appState.searchQuery.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q));
  }

  list.sort((a, b) => {
    switch (appState.sortMode) {
      case 'price-desc':
        return b.price - a.price;
      case 'price-asc':
        return a.price - b.price;
      case 'demand-desc':
        return (b.demandRating || 0) - (a.demandRating || 0);
      case 'demand-asc':
        return (a.demandRating || 0) - (b.demandRating || 0);
      case 'name-asc':
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  return list;
}

function renderPetGrid() {
  const grid = document.getElementById('pets-grid');
  const countEl = document.getElementById('search-result-count');
  const emptyEl = document.getElementById('empty-state');
  if (!grid) return;

  const filtered = getFilteredPets();
  if (countEl) countEl.textContent = `${filtered.length} pets registered`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  grid.innerHTML = filtered.map(pet => {
    const imageHtml = pet.image
      ? `<img src="${pet.image}" alt="${escapeHtml(pet.name)}" class="pet-thumb" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'pet-placeholder\\'><span>🐾</span><span>No Image</span></div>'">`
      : `<div class="pet-placeholder"><span>🐾</span><span>No Image</span></div>`;

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

const SECTION_COLORS = { added: '#f97316', changes: '#0ea5e9', fixes: '#f43f5e' };

function renderDevblogList() {
  const container = document.getElementById('update-logs-list');
  if (!container) return;

  if (!appState.updateLogs.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-emoji">📜</div><h3>No update logs yet</h3><p>Check back after the next patch!</p></div>`;
    return;
  }

  const logs = appState.updateLogs;
  const featured = logs[0];
  const otherLogs = logs.slice(1);

  const featuredImg = featured.bannerUrl || appState.settings.gameBannerUrl || '';
  const featuredImgHtml = featuredImg
    ? `<img src="${featuredImg}" alt="${escapeHtml(featured.title)}" onerror="this.style.display='none';this.parentElement.querySelector('.featured-blog-fallback').style.display='block';"><div class="featured-blog-fallback" style="display:none;">🐾</div>`
    : `<div class="featured-blog-fallback">🐾</div>`;

  let cardsHtml = '';
  if (otherLogs.length > 0) {
    cardsHtml = otherLogs.map(log => {
      const cardImg = log.bannerUrl || appState.settings.gameBannerUrl || '';
      const imgHtml = cardImg
        ? `<img src="${cardImg}" alt="${escapeHtml(log.title)}" loading="lazy" onerror="this.style.display='none';this.parentElement.innerHTML='<span style=\\'font-size:3rem;\\'>🐾</span>';">`
        : `<span style="font-size:3rem;">🐾</span>`;

      return `
        <div class="big-blog-card" onclick="openDevblogDetail('${log.id}')">
          <div class="big-card-thumb-wrap">
            ${imgHtml}
          </div>
          <div class="big-card-body">
            <div class="big-card-meta">
              <span>Pet Simulator OG</span>
              <span>${escapeHtml(log.date)}</span>
            </div>
            <h3 class="big-card-title">${escapeHtml(log.title)}</h3>
            <p class="big-card-summary">${escapeHtml(log.summary || 'Click to view full update patch notes and changes.')}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  container.innerHTML = `
    <div class="big-page-header">
      <div class="big-header-row">
        <h1 class="big-main-title">og:mystery Dev Blog</h1>
        <div class="big-search-box">
          <svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="devblog-search" placeholder="Search the blog..." autocomplete="off">
        </div>
      </div>
      <p class="big-sub-desc">Update notes for Pet Simulator OG, straight from us. Newest first, with patch details, stats, and changelogs.</p>
    </div>

    <div class="big-pills-row">
      <button class="big-pill active" data-filter="all">🐾 All Posts</button>
      <button class="big-pill" data-filter="updates">🔥 Updates</button>
      <button class="big-pill" data-filter="events">🎃 Events</button>
      <button class="big-pill" data-filter="fixes">🛠️ Patches</button>
    </div>

    <div class="featured-blog-card">
      <div class="featured-blog-img-wrapper">
        ${featuredImgHtml}
      </div>
      <div class="featured-blog-content">
        <div class="featured-eyebrow">Latest Dev Blog</div>
        <div class="featured-game-chip">Pet Simulator OG</div>
        <h2 class="featured-title">${escapeHtml(featured.title)}</h2>
        <p class="featured-summary">${escapeHtml(featured.summary || 'The newest patch is live! Check out what was added, balance changes, and bug fixes.')}</p>
        <button class="big-read-post-btn" onclick="openDevblogDetail('${featured.id}')">
          Read the post →
        </button>
      </div>
    </div>

    ${otherLogs.length > 0 ? `
      <div class="big-grid-cards">
        ${cardsHtml}
      </div>
    ` : ''}

    <div id="full-article-view" style="display:none;margin-top:40px;">
      <div style="margin-bottom:16px;">
        <button class="nav-btn" onclick="closeDevblogDetail()" style="display:inline-flex;align-items:center;gap:6px;">
          ← Back to All Posts
        </button>
      </div>
      <div id="active-article-target"></div>
    </div>
  `;

  const searchInput = document.getElementById('devblog-search');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.big-blog-card').forEach(card => {
        const title = card.querySelector('.big-card-title')?.textContent.toLowerCase() || '';
        const summary = card.querySelector('.big-card-summary')?.textContent.toLowerCase() || '';
        if (title.includes(q) || summary.includes(q)) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  }
}

window.openDevblogDetail = function(logId) {
  const activeLog = appState.updateLogs.find(l => l.id === logId) || appState.updateLogs[0];
  if (!activeLog) return;
  appState.activeLogId = activeLog.id;

  const fullView = document.getElementById('full-article-view');
  const target = document.getElementById('active-article-target');
  const tocContainer = document.getElementById('toc-links-container');
  if (!fullView || !target) return;

  target.innerHTML = `
    <article class="devblog-article">
      <div class="devblog-meta">
        <span class="devblog-game-tag">🐾 Pet Simulator OG</span>
        <button class="devblog-share-btn" id="devblog-share-btn">🔗 Share</button>
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
    </article>
  `;

  if (tocContainer) {
    tocContainer.innerHTML = (activeLog.sections || []).map(sec => `
      <a class="toc-link" href="#" style="color:${SECTION_COLORS[sec.type] || 'inherit'}">
        ${escapeHtml(sec.label || sec.type)}
      </a>
    `).join('');
  }

  const shareBtn = document.getElementById('devblog-share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const url = `${location.origin}/logs/${encodeURIComponent(activeLog.slug || activeLog.id)}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          shareBtn.textContent = '✓ Copied!';
          setTimeout(() => { shareBtn.textContent = '🔗 Share'; }, 1800);
        });
      }
    });
  }

  fullView.style.display = 'block';
  fullView.scrollIntoView({ behavior: 'smooth' });
};

window.closeDevblogDetail = function() {
  const fullView = document.getElementById('full-article-view');
  if (fullView) fullView.style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function renderSection(sec) {
  const color = SECTION_COLORS[sec.type] || '#f97316';
  const items = (sec.items || []).map(item => `
    <div class="blog-section-item">
      ${item.heading ? `<h4 class="blog-item-heading">${escapeHtml(item.heading)}</h4>` : ''}
      ${item.body ? `<p class="blog-item-body">${escapeHtml(item.body)}</p>` : ''}
      ${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.heading || '')}" class="blog-item-image" loading="lazy">` : ''}
    </div>
  `).join('');
  return `
    <div class="blog-section" data-type="${sec.type}">
      <h2 class="blog-section-label" style="color:${color}">${escapeHtml(sec.label || sec.type)}</h2>
      <div class="blog-section-items">${items}</div>
    </div>
  `;
}

function setupNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab');
  const petSection = document.getElementById('pets-section');
  const logsSection = document.getElementById('update-logs-section');

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.section;
      if (target === 'pets') {
        petSection.classList.remove('hidden');
        logsSection.classList.add('hidden');
      } else if (target === 'logs') {
        petSection.classList.add('hidden');
        logsSection.classList.remove('hidden');
      }
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

  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', e => {
      appState.sortMode = e.target.value;
      renderPetGrid();
    });
  }

  const themeToggle = document.getElementById('theme-toggle-btn');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
}

function formatCurrency(num) {
  if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toLocaleString();
}

function formatDemand(demand, rating) {
  if (typeof demand === 'string' && demand.includes('/')) return demand;
  const num = rating !== undefined ? rating : (Number(demand) || 5);
  return `${num}/10`;
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

async function refreshDataSilently() {
  try {
    const res = await fetch('/api/get-data');
    const data = await res.json();
    appState.categories = data.categories || [];
    appState.pets = data.pets || [];
    appState.updateLogs = (data.updateLogs || []).filter(l => !l.isPrivate);
    appState.settings = Object.assign({ gameBannerUrl: '', gameBannerEmoji: '🐾', activeUpdateBadge: 'Update 3: Haunted Island' }, data.settings || {});
    applySettings();
  } catch (err) {}
}

window.addEventListener('DOMContentLoaded', () => {
  loadData();
  setInterval(refreshDataSilently, 20000);
});
