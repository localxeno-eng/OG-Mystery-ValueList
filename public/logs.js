const SECTION_COLORS = { added: '#fbbf24', changes: '#38bdf8', fixes: '#f87171' };

let updateLogs = [];

function getSlugFromUrl() {
  const match = location.pathname.match(/^\/logs\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]).toLowerCase() : null;
}

async function loadLogs() {
  try {
    const res = await fetch('/api/get-data');
    const data = await res.json();
    updateLogs = data.updateLogs || [];
    applySettings(data.settings || {});
  } catch (err) {
    updateLogs = [];
  }

  renderLog();
  fetchRobloxStats();
  setInterval(fetchRobloxStats, 60000);
}

function applySettings(settings) {
  const bannerEl = document.getElementById('game-card-banner');
  if (!bannerEl) return;

  let url = settings.gameBannerUrl?.trim();
  if (url && !/^(https?:)?\//.test(url)) url = '/' + url;
  const emoji = settings.gameBannerEmoji || '🐾';

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

function renderLog() {
  const container = document.getElementById('update-logs-list');
  const tocContainer = document.getElementById('toc-links-container');
  if (!container) return;

  if (!updateLogs.length) {
    container.innerHTML = `<div class="empty-state" style="margin:0"><div class="empty-emoji">📋</div><h3>No update logs yet</h3><p>Check back after the next patch!</p></div>`;
    return;
  }

  const slug = getSlugFromUrl();
  const activeLog = updateLogs.find(l => (l.slug || l.id).toLowerCase() === slug) || updateLogs[0];

  container.innerHTML = `
    <div class="devblog-article">
      <div class="devblog-meta">
        <span class="devblog-game-tag">🐾 Pet Simulator OG</span>
        <button class="devblog-share-btn" id="devblog-share-btn" title="Copy share link">🔗 Share</button>
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
      ${updateLogs.map(log => `
        <a class="devblog-nav-item ${log.id === activeLog.id ? 'active' : ''}" href="/logs/${encodeURIComponent(log.slug || log.id || 'log')}">
          <span class="devblog-nav-title">${escapeHtml(log.title)}</span>
          <span class="devblog-nav-date">${escapeHtml(log.date)}</span>
        </a>
      `).join('')}
    </div>
  `;

  const newUrl = `/logs/${encodeURIComponent(activeLog.slug || activeLog.id || 'log')}`;
  if (location.pathname !== newUrl) {
    history.replaceState(null, '', newUrl);
  }

  if (tocContainer) {
    tocContainer.innerHTML = (activeLog.sections || []).map(sec => `
      <a class="toc-link" href="#" style="color:${SECTION_COLORS[sec.type] || '#94a3b8'}">
        ${escapeHtml(sec.label || sec.type)}
      </a>
    `).join('');
  }

  const shareBtn = document.getElementById('devblog-share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const url = `${location.origin}/logs/${encodeURIComponent(activeLog.slug || activeLog.id || 'log')}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          shareBtn.textContent = '✅ Copied!';
          setTimeout(() => { shareBtn.textContent = '🔗 Share'; }, 1800);
        });
      }
    });
  }
}

function renderSection(sec) {
  const color = SECTION_COLORS[sec.type] || '#94a3b8';
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.addEventListener('DOMContentLoaded', loadLogs);
