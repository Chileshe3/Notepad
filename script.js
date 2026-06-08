import { initializeApp, getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, set, get, remove, onValue, push } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// ── STATE ──
let db = null;
let currentTab = 'notes';
let currentEditId = null;
let currentEditType = null;
let selectedEmoji = '💡';
let allData = { notes: {}, quotes: {}, cards: {} };

// ── HARDCODED FIREBASE CONFIG ──
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD9JM5URP6TiCjWHPqW8M_Xg69PRezhLCA",
  authDomain: "notepad-7bf67.firebaseapp.com",
  databaseURL: "https://notepad-7bf67-default-rtdb.firebaseio.com",
  projectId: "notepad-7bf67",
  storageBucket: "notepad-7bf67.firebasestorage.app",
  messagingSenderId: "968369853386",
  appId: "1:968369853386:web:715e5769fb2c968d19f533",
  measurementId: "G-DRCSDELJ8S"
};

function initFirebase() {
  try {
    let app;
    try { app = initializeApp(FIREBASE_CONFIG, 'inkwell'); }
    catch (dupErr) { app = getApp('inkwell'); }
    db = getDatabase(app);
    return true;
  } catch (e) {
    console.error('Firebase init error:', e);
    return false;
  }
}

async function startApp() {
  try {
    const ok = initFirebase();
    if (ok) {
      await loadAllData();
    } else {
      showToast('⚠ Firebase failed to connect');
      renderAll();
    }
  } catch (e) {
    console.error('startApp error:', e);
    renderAll();
  } finally {
    document.getElementById('loadingOverlay').style.display = 'none';
  }
}

// ── DATA ──
async function loadAllData() {
  if (!db) { renderAll(); return; }
  try {
    const snap = await get(ref(db, 'inkwell'));
    if (snap.exists()) {
      const data = snap.val();
      allData.notes = data.notes || {};
      allData.quotes = data.quotes || {};
      allData.cards = data.cards || {};
    }
  } catch (e) { showToast('⚠ Could not load from Firebase'); }
  renderAll();
}

function renderAll() {
  renderNotes(Object.entries(allData.notes));
  renderQuotes(Object.entries(allData.quotes));
  renderCards(Object.entries(allData.cards));
}

async function saveItem(type, id, data) {
  allData[type][id] = data;
  renderAll();
  if (!db) { showToast('Saved locally (no Firebase)'); return; }
  try {
    await set(ref(db, `inkwell/${type}/${id}`), data);
    showToast('✓ Saved');
  } catch (e) { showToast('⚠ Save failed: ' + e.message); }
}

async function deleteItem(type, id) {
  delete allData[type][id];
  renderAll();
  if (!db) return;
  try {
    await remove(ref(db, `inkwell/${type}/${id}`));
    showToast('Deleted');
  } catch (e) { showToast('⚠ Delete failed'); }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ── RENDER ──
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent || tmp.innerText || '';
}

function renderNotes(entries) {
  const list = document.getElementById('notesList');
  if (!entries.length) {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">📝</div>
      <h3>No notes yet</h3>
      <p>Tap the + button to capture your first thought.</p>
    </div>`;
    return;
  }
  entries.sort((a,b) => (b[1].ts||0)-(a[1].ts||0));
  list.innerHTML = entries.map(([id,n]) => `
    <div class="note-card" onclick="openNoteEditor('${id}')">
      <h3>${escHtml(n.title||'Untitled')}</h3>
      <p>${escHtml(stripHtml(n.content))}</p>
      <div class="note-meta">
        <span>${formatDate(n.ts)}</span>
        <span>${wordCount(stripHtml(n.content))} words</span>
      </div>
    </div>`).join('');
}

function renderQuotes(entries) {
  const list = document.getElementById('quotesList');
  if (!entries.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">💬</div>
      <h3>No quotes yet</h3>
      <p>Save words that move you.</p>
    </div>`;
    return;
  }
  entries.sort((a,b)=>(b[1].ts||0)-(a[1].ts||0));
  list.innerHTML = entries.map(([id,q]) => `
    <div class="quote-card" onclick="openViewModal('quotes','${id}')">
      <span class="quote-mark">"</span>
      <div class="quote-text">${escHtml(q.text||'')}</div>
      <div class="quote-author">— ${escHtml(q.author||'Unknown')}</div>
      ${q.source ? `<div class="quote-source">${escHtml(q.source)}</div>` : ''}
    </div>`).join('');
}

function renderCards(entries) {
  const list = document.getElementById('cardsList');
  if (!entries.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🃏</div>
      <h3>No cards yet</h3>
      <p>Cards are great for resources, ideas, or references.</p>
    </div>`;
    return;
  }
  entries.sort((a,b)=>(b[1].ts||0)-(a[1].ts||0));
  list.innerHTML = entries.map(([id,c]) => `
    <div class="card-item" onclick="openViewModal('cards','${id}')">
      <div class="card-icon">${c.icon||'💡'}</div>
      <div class="card-body">
        <h3>${escHtml(c.title||'Untitled')}</h3>
        <p>${escHtml(c.content||'')}</p>
        ${c.tag ? `<span class="card-tag">${escHtml(c.tag)}</span>` : ''}
      </div>
    </div>`).join('');
}

// ── SEARCH ──
window.handleSearch = function() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) { renderAll(); return; }
  const filterNotes = Object.entries(allData.notes).filter(([,n]) =>
    (n.title||'').toLowerCase().includes(q) || (n.content||'').toLowerCase().includes(q));
  const filterQuotes = Object.entries(allData.quotes).filter(([,q2]) =>
    (q2.text||'').toLowerCase().includes(q) || (q2.author||'').toLowerCase().includes(q));
  const filterCards = Object.entries(allData.cards).filter(([,c]) =>
    (c.title||'').toLowerCase().includes(q) || (c.content||'').toLowerCase().includes(q) || (c.tag||'').toLowerCase().includes(q));
  renderNotes(filterNotes);
  renderQuotes(filterQuotes);
  renderCards(filterCards);
}

// ── TABS ──
window.switchTab = function(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
  document.getElementById('notesView').classList.toggle('hidden', tab!=='notes');
  document.getElementById('quotesView').classList.toggle('hidden', tab!=='quotes');
  document.getElementById('cardsView').classList.toggle('hidden', tab!=='cards');
}

// ── FAB ──
document.getElementById('fabBtn').onclick = () => {
  currentEditId = null;
  if (currentTab === 'notes') openNoteModal();
  else if (currentTab === 'quotes') openQuoteModal();
  else openCardModal();
};

// ── NOTE FULL-SCREEN EDITOR ──
function openNoteModal(data) {
  const now = data?.ts ? new Date(data.ts) : new Date();
  document.getElementById('neDate').textContent = now.toLocaleString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  document.getElementById('noteTitleInput').value = data?.title || '';
  const ce = document.getElementById('noteContentInput');
  ce.innerHTML = data?.content || '';
  document.getElementById('noteEditor').classList.add('open');
  setTimeout(() => {
    if (data?.title) ce.focus();
    else document.getElementById('noteTitleInput').focus();
  }, 120);
}

function closeNoteEditor() {
  document.getElementById('noteEditor').classList.remove('open');
}

document.getElementById('neBack').onclick = closeNoteEditor;

document.getElementById('neDeleteBtn').onclick = async () => {
  if (!currentEditId) { closeNoteEditor(); return; }
  await deleteItem('notes', currentEditId);
  closeNoteEditor();
};

document.getElementById('saveNoteBtn').onclick = async () => {
  const title = document.getElementById('noteTitleInput').value.trim();
  const ce = document.getElementById('noteContentInput');
  const content = ce.innerHTML.trim();
  if (!title && (!content || content === '<br>')) { closeNoteEditor(); return; }
  const id = currentEditId || generateId();
  await saveItem('notes', id, { title, content, ts: Date.now() });
  closeNoteEditor();
};

// Formatting toolbar
document.querySelector('.ne-toolbar').addEventListener('click', e => {
  const btn = e.target.closest('.ne-fmt');
  if (!btn) return;
  const cmd = btn.dataset.cmd;
  const val = btn.dataset.val || null;
  document.getElementById('noteContentInput').focus();
  document.execCommand(cmd, false, val);
  // Toggle active style for stateful commands
  ['bold','italic','underline','strikeThrough'].forEach(c => {
    const el = document.querySelector(`.ne-fmt[data-cmd="${c}"]`);
    if (el) el.classList.toggle('active', document.queryCommandState(c));
  });
});

// Update toolbar active states on selection change
document.addEventListener('selectionchange', () => {
  if (!document.getElementById('noteEditor').classList.contains('open')) return;
  ['bold','italic','underline','strikeThrough'].forEach(c => {
    const el = document.querySelector(`.ne-fmt[data-cmd="${c}"]`);
    if (el) el.classList.toggle('active', document.queryCommandState(c));
  });
});

// ── QUOTE MODAL ──
function openQuoteModal(data) {
  document.getElementById('quoteModalTitle').textContent = currentEditId ? 'Edit Quote' : 'New Quote';
  document.getElementById('quoteTextInput').value = data?.text || '';
  document.getElementById('quoteAuthorInput').value = data?.author || '';
  document.getElementById('quoteSourceInput').value = data?.source || '';
  openModal('quoteModal');
}

document.getElementById('saveQuoteBtn').onclick = async () => {
  const text = document.getElementById('quoteTextInput').value.trim();
  const author = document.getElementById('quoteAuthorInput').value.trim();
  const source = document.getElementById('quoteSourceInput').value.trim();
  if (!text) { showToast('Enter the quote first!'); return; }
  const id = currentEditId || generateId();
  await saveItem('quotes', id, { text, author, source, ts: Date.now() });
  closeModal('quoteModal');
};

// ── CARD MODAL ──
function openCardModal(data) {
  document.getElementById('cardModalTitle').textContent = currentEditId ? 'Edit Card' : 'New Card';
  document.getElementById('cardTitleInput').value = data?.title || '';
  document.getElementById('cardContentInput').value = data?.content || '';
  document.getElementById('cardTagInput').value = data?.tag || '';
  selectedEmoji = data?.icon || '💡';
  document.querySelectorAll('.emoji-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.emoji === selectedEmoji);
  });
  openModal('cardModal');
}

document.getElementById('emojiPicker').onclick = e => {
  const btn = e.target.closest('.emoji-btn');
  if (!btn) return;
  selectedEmoji = btn.dataset.emoji;
  document.querySelectorAll('.emoji-btn').forEach(b => b.classList.toggle('selected', b===btn));
};

document.getElementById('saveCardBtn').onclick = async () => {
  const title = document.getElementById('cardTitleInput').value.trim();
  const content = document.getElementById('cardContentInput').value.trim();
  const tag = document.getElementById('cardTagInput').value.trim();
  if (!title) { showToast('Give the card a title!'); return; }
  const id = currentEditId || generateId();
  await saveItem('cards', id, { title, content, tag, icon: selectedEmoji, ts: Date.now() });
  closeModal('cardModal');
};

// ── VIEW MODAL ──
// Open note directly in editor (no intermediate modal)
window.openNoteEditor = function(id) {
  const item = allData['notes'][id];
  if (!item) return;
  currentEditType = 'notes';
  currentEditId = id;
  openNoteModal(item);
};

window.openViewModal = function(type, id) {
  // Notes go straight to editor; only quotes/cards use the view modal
  if (type === 'notes') { window.openNoteEditor(id); return; }
  const item = allData[type][id];
  if (!item) return;
  currentEditType = type;
  currentEditId = id;

  let title = '', body = '', meta = '';
  if (type === 'quotes') {
    title = '"' + (item.text || '') + '"';
    body = '— ' + (item.author || 'Unknown') + (item.source ? '\n' + item.source : '');
    meta = 'Saved ' + formatDate(item.ts);
  } else {
    title = (item.icon||'💡') + ' ' + (item.title||'Untitled');
    body = item.content || '';
    meta = (item.tag ? '#'+item.tag+' · ' : '') + 'Saved ' + formatDate(item.ts);
  }

  document.getElementById('viewTitle').textContent = title;
  document.getElementById('viewBody').textContent = body;
  document.getElementById('viewMeta').textContent = meta;
  openModal('viewModal');
};

document.getElementById('viewEditBtn').onclick = () => {
  const type = currentEditType;
  const id = currentEditId;
  closeModal('viewModal');
  setTimeout(() => {
    const item = allData[type][id];
    currentEditType = type;
    currentEditId = id;
    if (type === 'notes') openNoteModal(item);
    else if (type === 'quotes') openQuoteModal(item);
    else openCardModal(item);
  }, 300);
};

document.getElementById('viewDeleteBtn').onclick = async () => {
  await deleteItem(currentEditType, currentEditId);
  closeModal('viewModal');
};

// ── CONFIG ──
document.getElementById('settingsBtn').onclick = () => {
  document.getElementById('configScreen').classList.add('visible');
};
document.getElementById('configBack').onclick = () => {
  document.getElementById('configScreen').classList.remove('visible');
};

document.getElementById('saveConfig').onclick = async () => {
  document.getElementById('configScreen').classList.remove('visible');
  showToast('✓ Already connected to Firebase!');
};

document.getElementById('syncBtn').onclick = async () => {
  document.getElementById('syncBtn').style.transform = 'rotate(360deg)';
  document.getElementById('syncBtn').style.transition = 'transform 0.6s';
  await loadAllData();
  setTimeout(() => {
    document.getElementById('syncBtn').style.transform = '';
    document.getElementById('syncBtn').style.transition = '';
  }, 700);
  showToast('✓ Synced');
};

// ── HELPERS ──
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
window.closeModal = function(id) {
  document.getElementById(id).classList.remove('open');
}

// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function wordCount(str) {
  return (str||'').trim().split(/\s+/).filter(Boolean).length;
}

// ── BOOT ──
startApp();
