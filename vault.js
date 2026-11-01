const STORAGE_KEY = 'og_mystery_data_v4';
const INACTIVITY_TIMEOUT_SEC = 900;

let vaultState = {
  authenticated: false,
  sessionToken: null,
  inactivityTimer: null,
  secondsLeft: INACTIVITY_TIMEOUT_SEC,
  categories: [],
  pets: [],
  updateLogs: [],
  settings: { gameBannerUrl: '', gameBannerEmoji: '🐾', activeUpdateBadge: 'Update 3: Haunted Island' }
};

const SALT = '976ffe31800b836f8daf47027e3f5ddb';
const EXPECTED_HASH = '422d56274799d90e8603a8d26cf67f794b2fc96cdd7243f7043050e89c36ed8944718be1ad7334b7366e57e89df21ac3cc28560812b7d1c725d45e79bbed133e';

async function deriveHash(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-512'
    },
    keyMaterial,
    512
  );
  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function checkLocalOrRemoteVerify(code) {
  try {
    const res = await fetch('/api/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) return data;
    }
  } catch (err) {}

  try {
    const computedHash = await deriveHash(code, SALT);
    if (computedHash === EXPECTED_HASH) {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      return { success: true, token };
    }
  } catch (err) {}

  return { success: false, error: 'Authorization denied. Access code incorrect.' };
}

async function loadVaultData() {
  try {
    const res = await fetch('/api/get-data');
    const data = await res.json();
    vaultState.categories = data.categories || [];
    vaultState.pets = data.pets || [];
    vaultState.updateLogs = data.updateLogs || [];
    vaultState.settings = Object.assign({ gameBannerUrl: '', gameBannerEmoji: '🐾', activeUpdateBadge: 'Update 3: Haunted Island' }, data.settings || {});
  } catch (err) {
    vaultState.categories = [];
    vaultState.pets = [];
    vaultState.updateLogs = [];
    vaultState.settings = { gameBannerUrl: '', gameBannerEmoji: '🐾', activeUpdateBadge: 'Update 3: Haunted Island' };
  }
}

async function persistToServer(payload) {
  try {
    const res = await fetch('/api/save-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vaultState.sessionToken}`
      },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function saveVaultData() {
  const payload = {
    settings: vaultState.settings,
    categories: vaultState.categories,
    pets: vaultState.pets,
    updateLogs: vaultState.updateLogs
  };
  const ok = await persistToServer(payload);
  if (!ok) showToast('Could not save to the live site. Check your connection and try again.');
  return ok;
}

function initVault() {
  setupGate();
  setupTabs();
  setupModals();
}

function setupGate() {
  const gateForm = document.getElementById('gate-form');
  const codeInput = document.getElementById('gate-code');
  const errorEl = document.getElementById('gate-error');
  const submitBtn = document.getElementById('gate-submit-btn');
  const lockBtn = document.getElementById('lock-btn');

  gateForm.addEventListener('submit', async e => {
    e.preventDefault();
    const code = codeInput.value.trim();
    if (!code) return;

    submitBtn.disabled = true;
    errorEl.classList.add('hidden');
    submitBtn.textContent = 'Verifying...';

    const res = await checkLocalOrRemoteVerify(code);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Authorize Entry';

    if (res.success) {
      vaultState.authenticated = true;
      vaultState.sessionToken = res.token;
      codeInput.value = '';
      enterDashboard();
    } else {
      errorEl.textContent = res.error || 'Authorization denied. Access code incorrect.';
      errorEl.classList.remove('hidden');
      codeInput.value = '';
      codeInput.focus();
    }
  });

  lockBtn.addEventListener('click', () => exitDashboard('Session closed by staff.'));
}

function enterDashboard() {
  document.getElementById('gate-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.remove('hidden');
  document.getElementById('lock-btn').classList.remove('hidden');

  const indicator = document.getElementById('vault-status-indicator');
  const statusText = document.getElementById('vault-status-text');
  indicator.classList.add('unlocked');
  statusText.textContent = 'AUTHORIZED';
  indicator.querySelector('.status-indicator-dot').classList.add('unlocked');

  loadVaultData().then(() => renderAllPanels());
  startInactivityMonitor();
  showToast('Vault unlocked. Staff session initiated.');
}

function exitDashboard(reason) {
  vaultState.authenticated = false;
  vaultState.sessionToken = null;
  clearInterval(vaultState.inactivityTimer);

  document.getElementById('gate-screen').classList.remove('hidden');
  document.getElementById('dashboard-screen').classList.add('hidden');
  document.getElementById('lock-btn').classList.add('hidden');

  const indicator = document.getElementById('vault-status-indicator');
  const statusText = document.getElementById('vault-status-text');
  indicator.classList.remove('unlocked');
  statusText.textContent = 'LOCKED';
  indicator.querySelector('.status-indicator-dot').classList.remove('unlocked');

  if (reason) {
    const errorEl = document.getElementById('gate-error');
    errorEl.textContent = reason;
    errorEl.classList.remove('hidden');
  }
}

function startInactivityMonitor() {
  vaultState.secondsLeft = INACTIVITY_TIMEOUT_SEC;
  updateTimerDisplay();

  const resetActivity = () => {
    if (!vaultState.authenticated) return;
    vaultState.secondsLeft = INACTIVITY_TIMEOUT_SEC;
    updateTimerDisplay();
  };

  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, resetActivity, { passive: true });
  });

  clearInterval(vaultState.inactivityTimer);
  vaultState.inactivityTimer = setInterval(() => {
    if (!vaultState.authenticated) return;
    vaultState.secondsLeft--;
    updateTimerDisplay();
    if (vaultState.secondsLeft <= 0) {
      exitDashboard('Session timed out due to 15 minutes of inactivity.');
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('session-timer');
  if (!el) return;
  const m = Math.floor(vaultState.secondsLeft / 60);
  const s = vaultState.secondsLeft % 60;
  el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function setupTabs() {
  document.querySelectorAll('.dash-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(tab.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });
}

function renderAllPanels() {
  renderPetsTable();
  renderCategoriesList();
  renderLogsList();
  renderSettingsPanel();
}

function renderPetsTable() {
  const tbody = document.getElementById('pets-table-body');
  if (!tbody) return;

  tbody.innerHTML = vaultState.pets.map(pet => {
    const cat = vaultState.categories.find(c => c.id === pet.category) || { name: pet.category };
    const thumb = pet.image ? `<img src="${pet.image}" class="table-thumb" alt="${escapeHtml(pet.name)}">` : '<div class="table-thumb"></div>';
    return `
      <tr>
        <td>${thumb}</td>
        <td><strong>${escapeHtml(pet.name)}</strong></td>
        <td><span class="tier-tag">${escapeHtml(cat.name)}</span></td>
        <td style="color:#38bdf8;font-weight:700;">${escapeHtml(pet.priceDisplay || String(pet.price))}</td>
        <td style="color:#fbbf24;font-weight:700;">${escapeHtml(formatVaultDemand(pet.demand, pet.demandRating))}</td>
        <td>
          <div class="table-actions">
            <button class="icon-btn" onclick="openEditPetModal('${pet.id}')" title="Edit">✏️</button>
            <button class="icon-btn delete" onclick="deletePet('${pet.id}')" title="Delete">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function formatVaultDemand(demand, rating) {
  if (typeof demand === 'string' && demand.includes('/')) return demand;
  const num = rating !== undefined ? rating : (Number(demand) || 5);
  return `${num}/10`;
}

function parseDemandNumber(val) {
  if (typeof val === 'number') return Math.min(10, Math.max(1, val));
  if (typeof val === 'string') {
    const match = val.match(/\d+/);
    if (match) return Math.min(10, Math.max(1, parseInt(match[0], 10)));
  }
  return 5;
}

function renderCategoriesList() {
  const container = document.getElementById('categories-list-container');
  if (!container) return;

  container.innerHTML = vaultState.categories.map(cat => `
    <div class="category-card">
      <div class="category-meta">
        <span class="category-swatch" style="background:${cat.badgeColor || '#a855f7'}"></span>
        <div>
          <div class="category-name">${escapeHtml(cat.name)}</div>
          <div class="category-id">id: ${escapeHtml(cat.id)}</div>
        </div>
      </div>
      <div class="table-actions">
        <button class="icon-btn delete" onclick="deleteCategory('${cat.id}')" title="Delete">🗑️</button>
      </div>
    </div>
  `).join('');
}

function renderLogsList() {
  const container = document.getElementById('logs-admin-container');
  if (!container) return;

  if (!vaultState.updateLogs.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-dim);">No update logs yet. Click "+ Post Log" to create one.</div>`;
    return;
  }

  container.innerHTML = vaultState.updateLogs.map(log => {
    const sectionBadges = (log.sections || []).map(sec => `
      <span class="log-section-badge log-section-badge-${sec.type}">${escapeHtml(sec.label || sec.type)}</span>
    `).join('');

    return `
      <div class="log-admin-item">
        <div class="log-admin-meta">
          <h4>${escapeHtml(log.title)}</h4>
          <div class="date">${escapeHtml(log.date)}${log.readTime ? ' · ' + escapeHtml(log.readTime) : ''}</div>
          ${log.summary ? `<p>${escapeHtml(log.summary)}</p>` : ''}
          <div class="log-section-badges">${sectionBadges}</div>
        </div>
        <div class="table-actions">
          <button class="icon-btn" onclick="shareLog('${log.slug || log.id}')" title="Copy share link">🔗</button>
          <button class="icon-btn" onclick="openEditLogModal('${log.id}')" title="Edit">✏️</button>
          <button class="icon-btn delete" onclick="deleteLog('${log.id}')" title="Delete">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

function setupModals() {
  const backdrop = document.getElementById('modal-backdrop');
  const closeBtn = document.getElementById('modal-close-btn');

  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeModal();
  });

  document.getElementById('add-pet-btn').addEventListener('click', () => openPetModal());
  document.getElementById('add-category-btn').addEventListener('click', () => openCategoryModal());
  document.getElementById('add-log-btn').addEventListener('click', () => openLogModal());
  document.getElementById('download-json-btn').addEventListener('click', downloadDataJson);
  document.getElementById('reset-defaults-btn').addEventListener('click', resetToDefaults);
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
}

function openModal(title, formHtml, isWide) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = formHtml;
  const card = document.querySelector('.modal-card');
  card.style.maxWidth = isWide ? '740px' : '520px';
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

function openPetModal(petToEdit = null) {
  const isEdit = !!petToEdit;
  const pet = petToEdit || {
    id: 'pet-' + Date.now(),
    name: '',
    category: vaultState.categories[0]?.id || 'pets',
    price: 10000000,
    priceDisplay: '10M',
    demand: '7/10',
    demandRating: 7,
    image: ''
  };

  const currentDemandNum = parseDemandNumber(pet.demandRating !== undefined ? pet.demandRating : pet.demand);

  const categoryOptions = vaultState.categories.map(c =>
    `<option value="${c.id}" ${pet.category === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
  ).join('');

  let selectedImageData = pet.image || '';

  const html = `
    <form id="pet-form">
      <div class="form-group">
        <label class="form-label">Pet Name</label>
        <input type="text" id="m-pet-name" class="form-input" required value="${escapeHtml(pet.name)}" placeholder="e.g. Huge Haunted Cat">
      </div>
      <div class="form-group">
        <label class="form-label">Category / Tier</label>
        <select id="m-pet-category" class="form-select">${categoryOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Price Numeric (for sorting)</label>
        <input type="number" id="m-pet-price" class="form-input" required value="${pet.price}" placeholder="e.g. 50000000">
      </div>
      <div class="form-group">
        <label class="form-label">Price Display String</label>
        <input type="text" id="m-pet-display" class="form-input" required value="${escapeHtml(pet.priceDisplay)}" placeholder="e.g. 50M, 2.5B">
      </div>
      <div class="form-group">
        <label class="form-label">Demand Score (1 - 10)</label>
        <input type="number" id="m-pet-demand" class="form-input" min="1" max="10" required value="${currentDemandNum}" placeholder="e.g. 7 (displayed as 7/10)">
      </div>
      <div class="form-group">
        <label class="form-label">Pet Image</label>
        <div class="image-upload-wrapper">
          <label class="file-drop-area" id="file-drop-area">
            <input type="file" id="m-pet-file" accept="image/*" class="file-input-hidden">
            <div class="upload-icon">📁</div>
            <div class="upload-text">Click or drag image file here</div>
            <div class="upload-hint">PNG, WEBP, JPG supported</div>
          </label>
          <div class="upload-preview-container ${pet.image ? '' : 'hidden'}" id="upload-preview-container">
            <img id="m-pet-preview" src="${escapeHtml(pet.image)}" alt="Preview" class="upload-preview-img">
            <button type="button" class="remove-preview-btn" id="remove-preview-btn" title="Remove image">✕</button>
          </div>
        </div>
        <input type="hidden" id="m-pet-image" value="${escapeHtml(pet.image)}">
      </div>
      <div class="form-actions">
        <button type="button" class="action-btn secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="action-btn primary" id="pet-submit-btn">${isEdit ? 'Save Changes' : 'Create Pet'}</button>
      </div>
    </form>
  `;

  openModal(isEdit ? 'Edit Pet' : 'Add New Pet', html);

  const fileInput = document.getElementById('m-pet-file');
  const previewContainer = document.getElementById('upload-preview-container');
  const previewImg = document.getElementById('m-pet-preview');
  const hiddenInput = document.getElementById('m-pet-image');
  const removeBtn = document.getElementById('remove-preview-btn');

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const base64 = evt.target.result;
      previewImg.src = base64;
      previewContainer.classList.remove('hidden');

      try {
        const uploadRes = await fetch('/api/upload-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${vaultState.sessionToken}`
          },
          body: JSON.stringify({ filename: file.name, base64 })
        });
        const uploadJson = await uploadRes.json();
        if (uploadJson.success && uploadJson.path) {
          hiddenInput.value = uploadJson.path;
          selectedImageData = uploadJson.path;
        } else {
          hiddenInput.value = base64;
          selectedImageData = base64;
        }
      } catch (err) {
        hiddenInput.value = base64;
        selectedImageData = base64;
      }
    };
    reader.readAsDataURL(file);
  });

  removeBtn.addEventListener('click', () => {
    hiddenInput.value = '';
    selectedImageData = '';
    fileInput.value = '';
    previewImg.src = '';
    previewContainer.classList.add('hidden');
  });

  document.getElementById('pet-form').addEventListener('submit', e => {
    e.preventDefault();
    const rawDemand = Number(document.getElementById('m-pet-demand').value);
    const demandScore = Math.min(10, Math.max(1, isNaN(rawDemand) ? 5 : rawDemand));

    const updatedPet = {
      id: pet.id,
      name: document.getElementById('m-pet-name').value.trim(),
      category: document.getElementById('m-pet-category').value,
      price: Number(document.getElementById('m-pet-price').value),
      priceDisplay: document.getElementById('m-pet-display').value.trim(),
      demand: `${demandScore}/10`,
      demandRating: demandScore,
      image: hiddenInput.value || selectedImageData
    };

    if (isEdit) {
      const idx = vaultState.pets.findIndex(p => p.id === pet.id);
      if (idx !== -1) vaultState.pets[idx] = updatedPet;
    } else {
      vaultState.pets.unshift(updatedPet);
    }

    saveVaultData();
    renderPetsTable();
    closeModal();
    showToast(isEdit ? 'Pet details updated.' : 'New pet added to registry.');
  });
}

window.openEditPetModal = function(petId) {
  const found = vaultState.pets.find(p => p.id === petId);
  if (found) openPetModal(found);
};

window.deletePet = function(petId) {
  if (!confirm('Remove this pet?')) return;
  vaultState.pets = vaultState.pets.filter(p => p.id !== petId);
  saveVaultData();
  renderPetsTable();
  showToast('Pet removed.');
};

function openCategoryModal() {
  const html = `
    <form id="category-form">
      <div class="form-group">
        <label class="form-label">Tier Name (Display)</label>
        <input type="text" id="m-cat-name" class="form-input" required placeholder="e.g. Secrets, Exclusives">
      </div>
      <div class="form-group">
        <label class="form-label">Unique Identifier (Slug)</label>
        <input type="text" id="m-cat-id" class="form-input" required placeholder="e.g. secrets">
      </div>
      <div class="form-group">
        <label class="form-label">Badge Glow Color</label>
        <input type="color" id="m-cat-color" class="form-input" value="#f43f5e">
      </div>
      <div class="form-actions">
        <button type="button" class="action-btn secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="action-btn primary">Add Category</button>
      </div>
    </form>
  `;

  openModal('Add Pet Category', html);

  document.getElementById('category-form').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('m-cat-id').value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const name = document.getElementById('m-cat-name').value.trim();
    const badgeColor = document.getElementById('m-cat-color').value;

    if (vaultState.categories.some(c => c.id === id)) {
      alert('A category with that ID already exists.');
      return;
    }

    vaultState.categories.push({ id, name, badgeColor });
    saveVaultData();
    renderCategoriesList();
    closeModal();
    showToast(`New category "${name}" added.`);
  });
}

window.deleteCategory = function(catId) {
  if (vaultState.categories.length <= 1) {
    alert('At least one category tier must remain.');
    return;
  }
  if (!confirm(`Delete tier "${catId}"?`)) return;
  vaultState.categories = vaultState.categories.filter(c => c.id !== catId);
  saveVaultData();
  renderCategoriesList();
  showToast('Category deleted.');
};

function buildSectionEditorHtml(sections) {
  return sections.map((sec, si) => `
    <div class="section-editor-block" data-section-index="${si}">
      <div class="section-editor-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <select class="form-select sec-type" data-si="${si}" style="width:140px;">
            <option value="added" ${sec.type === 'added' ? 'selected' : ''}>Added</option>
            <option value="changes" ${sec.type === 'changes' ? 'selected' : ''}>Changes</option>
            <option value="fixes" ${sec.type === 'fixes' ? 'selected' : ''}>Fixes</option>
          </select>
          <input type="text" class="form-input sec-label" data-si="${si}" value="${escapeHtml(sec.label || '')}" placeholder="Custom label (optional)" style="flex:1;">
        </div>
        <button type="button" class="icon-btn delete remove-section-btn" data-si="${si}" title="Remove section">🗑️</button>
      </div>
      <div class="section-items-editor" id="section-items-${si}">
        ${sec.items.map((item, ii) => buildItemEditorHtml(si, ii, item)).join('')}
      </div>
      <button type="button" class="action-btn secondary add-item-btn" data-si="${si}" style="margin-top:10px;font-size:0.8rem;padding:6px 12px;">+ Add Item</button>
    </div>
  `).join('');
}

function buildItemEditorHtml(si, ii, item) {
  return `
    <div class="item-editor-row" data-si="${si}" data-ii="${ii}">
      <div style="flex:1;">
        <input type="text" class="form-input item-heading" data-si="${si}" data-ii="${ii}" value="${escapeHtml(item.heading || '')}" placeholder="Heading (e.g. Haunted Island)">
        <textarea class="form-textarea item-body" data-si="${si}" data-ii="${ii}" placeholder="Description text..." style="margin-top:6px;min-height:62px;">${escapeHtml(item.body || '')}</textarea>
        <div class="item-image-upload" style="margin-top:8px;">
          <label class="file-drop-area item-drop-area" style="padding:10px;">
            <input type="file" class="file-input-hidden item-file" data-si="${si}" data-ii="${ii}" accept="image/*">
            <div class="upload-text" style="font-size:0.78rem;">📎 Drop or click to add image</div>
          </label>
          <div class="upload-preview-container item-preview-container ${item.image ? '' : 'hidden'}" data-si="${si}" data-ii="${ii}" style="width:70px;height:70px;margin-top:6px;display:${item.image ? 'inline-flex' : 'none'};">
            <img class="item-preview-img" data-si="${si}" data-ii="${ii}" src="${escapeHtml(item.image || '')}" alt="" class="upload-preview-img">
            <button type="button" class="remove-preview-btn item-remove-img" data-si="${si}" data-ii="${ii}" title="Remove image">✕</button>
          </div>
          <input type="hidden" class="item-image-value" data-si="${si}" data-ii="${ii}" value="${escapeHtml(item.image || '')}">
        </div>
      </div>
      <button type="button" class="icon-btn delete remove-item-btn" data-si="${si}" data-ii="${ii}" title="Remove item">✕</button>
    </div>
  `;
}

function openLogModal(logToEdit = null) {
  const isEdit = !!logToEdit;
  let sections = isEdit && logToEdit.sections && logToEdit.sections.length
    ? JSON.parse(JSON.stringify(logToEdit.sections))
    : [
        { type: 'added', label: 'Added', items: [{ heading: '', body: '', image: '' }] },
        { type: 'changes', label: 'Changes', items: [{ heading: '', body: '', image: '' }] },
        { type: 'fixes', label: 'Fixes', items: [{ heading: '', body: '', image: '' }] }
      ];

  const logData = logToEdit || {
    id: 'update-' + Date.now(),
    title: '',
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    summary: '',
    readTime: '3 min read',
    slug: ''
  };

  const renderEditor = () => {
    const el = document.getElementById('sections-editor-container');
    if (el) el.innerHTML = buildSectionEditorHtml(sections);
    attachSectionEditorListeners(sections, renderEditor);
  };

  const html = `
    <form id="log-form" class="log-form-wide">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label class="form-label">Log Title</label>
          <input type="text" id="m-log-title" class="form-input" required value="${escapeHtml(logData.title)}" placeholder="e.g. Update 4: Winter Wonderland">
        </div>
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="text" id="m-log-date" class="form-input" required value="${escapeHtml(logData.date)}">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label class="form-label">Summary Subtitle</label>
          <input type="text" id="m-log-summary" class="form-input" value="${escapeHtml(logData.summary || '')}" placeholder="One-line teaser shown in the feed">
        </div>
        <div class="form-group">
          <label class="form-label">Read Time</label>
          <input type="text" id="m-log-readtime" class="form-input" value="${escapeHtml(logData.readTime || '')}" placeholder="e.g. 3 min read">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">URL Slug</label>
        <input type="text" id="m-log-slug" class="form-input" value="${escapeHtml(logData.slug || '')}" placeholder="e.g. hell (→ /logs/hell)">
      </div>

      <div style="margin-top:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <label class="form-label" style="margin:0;">Content Sections</label>
          <button type="button" id="add-section-btn" class="action-btn primary" style="font-size:0.78rem;padding:6px 12px;">+ Add Section</button>
        </div>
        <div id="sections-editor-container"></div>
      </div>

      <div class="form-actions">
        <button type="button" class="action-btn secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="action-btn primary">${isEdit ? 'Save Changes' : 'Post Log'}</button>
      </div>
    </form>
  `;

  openModal(isEdit ? 'Edit Update Log' : 'Post Update Log', html, true);
  renderEditor();

  document.getElementById('add-section-btn').addEventListener('click', () => {
    sections.push({ type: 'added', label: 'Added', items: [{ heading: '', body: '', image: '' }] });
    renderEditor();
  });

  document.getElementById('log-form').addEventListener('submit', e => {
    e.preventDefault();
    collectSectionsFromDOM(sections);
    const rawSlug = document.getElementById('m-log-slug').value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const updatedLog = {
      id: logData.id,
      title: document.getElementById('m-log-title').value.trim(),
      date: document.getElementById('m-log-date').value.trim(),
      readTime: document.getElementById('m-log-readtime').value.trim(),
      summary: document.getElementById('m-log-summary').value.trim(),
      slug: rawSlug || logData.id,
      sections: sections.filter(s => s.items.some(i => i.heading || i.body))
    };

    if (isEdit) {
      const idx = vaultState.updateLogs.findIndex(l => l.id === logData.id);
      if (idx !== -1) vaultState.updateLogs[idx] = updatedLog;
    } else {
      vaultState.updateLogs.unshift(updatedLog);
    }

    saveVaultData();
    renderLogsList();
    closeModal();
    showToast(isEdit ? 'Update log updated.' : 'New update log published.');
  });
}

window.openEditLogModal = function(logId) {
  const found = vaultState.updateLogs.find(l => l.id === logId);
  if (found) openLogModal(found);
};

window.shareLog = function(slug) {
  const url = `${location.origin}/logs/${slug}`;
  navigator.clipboard.writeText(url).then(() => showToast('Link copied: ' + url));
};

function collectSectionsFromDOM(sections) {
  sections.forEach((sec, si) => {
    const typeEl = document.querySelector(`.sec-type[data-si="${si}"]`);
    const labelEl = document.querySelector(`.sec-label[data-si="${si}"]`);
    if (typeEl) sec.type = typeEl.value;
    if (labelEl) {
      sec.label = labelEl.value.trim() || capitalize(typeEl ? typeEl.value : sec.type);
    }
    sec.items.forEach((item, ii) => {
      const hEl = document.querySelector(`.item-heading[data-si="${si}"][data-ii="${ii}"]`);
      const bEl = document.querySelector(`.item-body[data-si="${si}"][data-ii="${ii}"]`);
      const imgEl = document.querySelector(`.item-image-value[data-si="${si}"][data-ii="${ii}"]`);
      if (hEl) item.heading = hEl.value.trim();
      if (bEl) item.body = bEl.value.trim();
      if (imgEl) item.image = imgEl.value;
    });
  });
}

function attachSectionEditorListeners(sections, renderEditor) {
  document.querySelectorAll('.remove-section-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const si = parseInt(btn.dataset.si);
      collectSectionsFromDOM(sections);
      sections.splice(si, 1);
      renderEditor();
    });
  });

  document.querySelectorAll('.add-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const si = parseInt(btn.dataset.si);
      collectSectionsFromDOM(sections);
      sections[si].items.push({ heading: '', body: '', image: '' });
      renderEditor();
    });
  });

  document.querySelectorAll('.remove-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const si = parseInt(btn.dataset.si);
      const ii = parseInt(btn.dataset.ii);
      collectSectionsFromDOM(sections);
      sections[si].items.splice(ii, 1);
      if (!sections[si].items.length) sections[si].items.push({ heading: '', body: '', image: '' });
      renderEditor();
    });
  });

  document.querySelectorAll('.item-file').forEach(input => {
    input.addEventListener('change', async (e) => {
      const si = input.dataset.si, ii = input.dataset.ii;
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const base64 = evt.target.result;
        const previewContainer = document.querySelector(`.item-preview-container[data-si="${si}"][data-ii="${ii}"]`);
        const previewImg = document.querySelector(`.item-preview-img[data-si="${si}"][data-ii="${ii}"]`);
        const hiddenVal = document.querySelector(`.item-image-value[data-si="${si}"][data-ii="${ii}"]`);
        previewImg.src = base64;
        previewContainer.classList.remove('hidden');
        previewContainer.style.display = 'inline-flex';
        hiddenVal.value = base64;

        try {
          const uploadRes = await fetch('/api/upload-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${vaultState.sessionToken}`
            },
            body: JSON.stringify({ filename: file.name, base64 })
          });
          const uploadJson = await uploadRes.json();
          if (uploadJson.success && uploadJson.path) {
            hiddenVal.value = uploadJson.path;
          }
        } catch (err) {}
      };
      reader.readAsDataURL(file);
    });
  });

  document.querySelectorAll('.item-remove-img').forEach(btn => {
    btn.addEventListener('click', () => {
      const si = btn.dataset.si, ii = btn.dataset.ii;
      const hiddenVal = document.querySelector(`.item-image-value[data-si="${si}"][data-ii="${ii}"]`);
      const previewContainer = document.querySelector(`.item-preview-container[data-si="${si}"][data-ii="${ii}"]`);
      const fileInput = document.querySelector(`.item-file[data-si="${si}"][data-ii="${ii}"]`);
      hiddenVal.value = '';
      previewContainer.classList.add('hidden');
      previewContainer.style.display = 'none';
      fileInput.value = '';
    });
  });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

window.deleteLog = function(logId) {
  if (!confirm('Delete this update log entry?')) return;
  vaultState.updateLogs = vaultState.updateLogs.filter(l => l.id !== logId);
  saveVaultData();
  renderLogsList();
  showToast('Update log removed.');
};

function downloadDataJson() {
  const data = { categories: vaultState.categories, pets: vaultState.pets, updateLogs: vaultState.updateLogs };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'data.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded data.json snapshot.');
}

async function resetToDefaults() {
  if (!confirm('Reset all values and logs to the original default seed file? This affects the live site for everyone.')) return;
  try {
    const res = await fetch('data.json');
    const seed = await res.json();
    vaultState.categories = seed.categories || [];
    vaultState.pets = seed.pets || [];
    vaultState.updateLogs = seed.updateLogs || [];
    vaultState.settings = Object.assign({ gameBannerUrl: '', gameBannerEmoji: '🐾', activeUpdateBadge: 'Update 3: Haunted Island' }, seed.settings || {});
    await saveVaultData();
    renderAllPanels();
    showToast('Reset to original default data.');
  } catch (err) {
    showToast('Reset failed. Check your connection and try again.');
  }
}

function showToast(msg) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
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

window.addEventListener('DOMContentLoaded', initVault);

function renderSettingsPanel() {
  const s = vaultState.settings;
  const urlEl = document.getElementById('s-banner-url');
  const emojiEl = document.getElementById('s-banner-emoji');
  const badgeEl = document.getElementById('s-update-badge');
  if (urlEl) urlEl.value = s.gameBannerUrl || '';
  if (emojiEl) emojiEl.value = s.gameBannerEmoji || '🐾';
  if (badgeEl) badgeEl.value = s.activeUpdateBadge || '';
  updateVaultBannerPreview();

  const urlInput = document.getElementById('s-banner-url');
  const emojiInput = document.getElementById('s-banner-emoji');
  if (urlInput) urlInput.addEventListener('input', updateVaultBannerPreview);
  if (emojiInput) emojiInput.addEventListener('input', updateVaultBannerPreview);

  const saveBtn = document.getElementById('save-settings-btn');
  if (saveBtn) {
    saveBtn.replaceWith(saveBtn.cloneNode(true));
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  }
}

function updateVaultBannerPreview() {
  const previewEl = document.getElementById('banner-preview');
  if (!previewEl) return;
  const url = (document.getElementById('s-banner-url')?.value || '').trim();
  const emoji = document.getElementById('s-banner-emoji')?.value || '🐾';

  if (url) {
    previewEl.innerHTML = `
      <img src="${url}" alt="Preview" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;" onerror="this.style.display='none';">
      <div class="game-card-bg" id="banner-preview-inner">${escapeHtml(emoji)}</div>
      <div class="game-card-overlay">Pet Simulator OG</div>
    `;
  } else {
    previewEl.innerHTML = `
      <div class="game-card-bg" id="banner-preview-inner">${escapeHtml(emoji)}</div>
      <div class="game-card-overlay">Pet Simulator OG</div>
    `;
  }
}

function saveSettings() {
  const url = (document.getElementById('s-banner-url')?.value || '').trim();
  const emoji = document.getElementById('s-banner-emoji')?.value?.trim() || '🐾';
  const badge = (document.getElementById('s-update-badge')?.value || '').trim();

  vaultState.settings = { gameBannerUrl: url, gameBannerEmoji: emoji, activeUpdateBadge: badge };
  saveVaultData();
  showToast('Settings saved — live site will refresh on next page load.');
}
