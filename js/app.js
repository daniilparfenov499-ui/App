'use strict';

// ---------- Хранилище (IndexedDB) ----------
const DB = new Promise((ok, fail) => {
  const r = indexedDB.open('danillons-vault', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('files', {keyPath: 'id', autoIncrement: true});
  r.onsuccess = () => ok(r.result);
  r.onerror = () => fail(r.error);
});
const tx = async (mode, fn) => {
  const db = await DB;
  return new Promise((ok, fail) => {
    const t = db.transaction('files', mode), s = t.objectStore('files');
    const req = fn(s);
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => fail(t.error);
  });
};
const addFile = f => tx('readwrite', s => s.add({name: f.name, type: f.type, blob: f, added: Date.now()}));
const allFiles = () => tx('readonly', s => s.getAll());
const delFile = id => tx('readwrite', s => s.delete(id));

// ---------- Секретный код ----------
const getCode = () => localStorage.getItem('dv_code') || '1337';

// ---------- Калькулятор ----------
let expr = '';
const exprEl = document.getElementById('expr'), resEl = document.getElementById('res');
const show = v => { resEl.textContent = v === '' ? '0' : v; };
const sym = s => s.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');

function calcEval(e) {
  e = e.replace(/%/g, '/100');
  if (!/^[0-9+\-*/.() ]+$/.test(e)) return 'Ошибка';
  try {
    const v = Function('"use strict";return (' + e + ')')();
    if (!isFinite(v)) return 'Ошибка';
    return String(+v.toFixed(10));
  } catch { return 'Ошибка'; }
}

document.querySelector('.keys').addEventListener('click', e => {
  const k = e.target.dataset.k;
  if (!k) return;
  if (k === 'C') { expr = ''; exprEl.textContent = ''; show('0'); return; }
  if (k === 'B') { expr = expr.slice(0, -1); show(sym(expr)); return; }
  if (k === '=') {
    if (expr === getCode()) { expr = ''; exprEl.textContent = ''; show('0'); openGallery(); return; }
    if (!expr) return;
    const r = calcEval(expr);
    exprEl.textContent = sym(expr) + ' =';
    expr = r === 'Ошибка' ? '' : r;
    show(r);
    return;
  }
  expr += k;
  show(sym(expr));
});

// ---------- Галерея ----------
const gal = document.getElementById('gallery'), calc = document.getElementById('calc');
const grid = document.getElementById('grid'), emptyEl = document.getElementById('empty');
let urls = [];

async function render() {
  urls.forEach(URL.revokeObjectURL); urls = [];
  const files = await allFiles();
  grid.innerHTML = '';
  emptyEl.style.display = files.length ? 'none' : 'block';
  files.reverse().forEach(f => {
    const u = URL.createObjectURL(f.blob); urls.push(u);
    const d = document.createElement('div');
    if (f.type.startsWith('image/')) d.style.backgroundImage = `url(${u})`;
    else d.textContent = '▶';
    d.onclick = () => openViewer(f, u);
    grid.appendChild(d);
  });
}
function openGallery() { calc.style.display = 'none'; gal.style.display = 'flex'; render(); }
function closeGallery() {
  closeViewer();
  gal.style.display = 'none'; calc.style.display = 'flex';
  urls.forEach(URL.revokeObjectURL); urls = []; grid.innerHTML = '';
}

document.getElementById('lock').onclick = closeGallery;
document.getElementById('file').onchange = async e => {
  for (const f of e.target.files) await addFile(f);
  e.target.value = '';
  render();
};
document.getElementById('setcode').onclick = () => {
  const c = prompt('Новый секретный код (только цифры, минимум 4):', '');
  if (c === null) return;
  if (!/^\d{4,}$/.test(c)) return alert('Код: минимум 4 цифры.');
  localStorage.setItem('dv_code', c);
  alert('Код изменён. Вводите его в калькуляторе и жмите «=».');
};

// ---------- Просмотр ----------
const viewer = document.getElementById('viewer'), vbody = document.getElementById('vbody');
let current = null;
function openViewer(f, u) {
  current = f;
  document.getElementById('vname').textContent = f.name;
  vbody.innerHTML = '';
  const el = document.createElement(f.type.startsWith('video/') ? 'video' : 'img');
  el.src = u;
  if (el.tagName === 'VIDEO') el.controls = true;
  vbody.appendChild(el);
  viewer.style.display = 'flex';
}
function closeViewer() { viewer.style.display = 'none'; vbody.innerHTML = ''; current = null; }
document.getElementById('vclose').onclick = closeViewer;
document.getElementById('vdel').onclick = async () => {
  if (current && confirm('Удалить файл?')) { await delFile(current.id); closeViewer(); render(); }
};

// Автоблокировка при сворачивании приложения
document.addEventListener('visibilitychange', () => {
  if (document.hidden && gal.style.display === 'flex') closeGallery();
});

// ---------- Хуки для Android-оболочки ----------
// Кнопка «Назад»: закрыть просмотр -> закрыть галерею -> (иначе приложение сворачивается)
window.__back = () => {
  if (viewer.style.display === 'flex') { closeViewer(); return true; }
  if (gal.style.display === 'flex') { closeGallery(); return true; }
  return false;
};
// Блокировка при сворачивании
window.__lock = () => { if (gal.style.display === 'flex') closeGallery(); };

// ---------- Service worker (офлайн + установка) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
