async function modRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'include',
    ...options
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Ошибка');
  return res.json();
}

let modTwoFactorModal;
let modTwoFactorForm;
let modCancelTwoFactor;
let modTwoFactorCallback = null;
let loginCardEl;
let toolsEl;

async function initMod() {
  const loginForm = document.getElementById('modLoginForm');
  toolsEl = document.getElementById('modTools');
  loginCardEl = document.getElementById('modLoginCard');
  modTwoFactorModal = document.getElementById('modTwoFactor');
  modTwoFactorForm = document.getElementById('modTwoFactorForm');
  modCancelTwoFactor = document.getElementById('modCancelTwoFactor');
  bindModTwoFactor();
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm));
    try {
      const result = await modRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
      if (result.twoFactor) {
        openModTwoFactor(result.challengeId);
        return;
      }
      await enterModTools();
    } catch (err) {
      alert(err.message);
    }
  });
  document.getElementById('modBanForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await modRequest('/api/mod/ban', { method: 'POST', body: JSON.stringify(data) });
      alert('Бан оформлен');
    } catch (err) {
      alert(err.message);
    }
  });
}

async function enterModTools() {
  if (!loginCardEl || !toolsEl) return;
  loginCardEl.classList.add('hidden');
  toolsEl.classList.remove('hidden');
  const loginForm = document.getElementById('modLoginForm');
  if (loginForm) loginForm.reset();
  await loadComplaints();
}

async function loadComplaints() {
  const data = await modRequest('/api/complaints');
  const list = document.getElementById('complaintList');
  list.innerHTML = '';
  if (!data.complaints.length) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = 'Жалоб нет';
    list.appendChild(empty);
    return;
  }
  data.complaints.forEach((complaint) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="complaint-details clickable">
        <strong>${complaint.targetTitle || complaint.targetType} (${complaint.targetId})</strong>
        <span class="reporter">Жалоба ${complaint.id} от ${complaint.authorNickname} (${complaint.authorId || '—'})</span>
        <span>На пользователя: ${complaint.targetAuthorNickname || 'Аноним'} (${complaint.targetAuthorId || '—'})</span>
        <span>${complaint.reason}</span>
        ${complaint.targetSnippet ? `<small class="complaint-meta">${complaint.targetSnippet}</small>` : ''}
      </div>`;
    const details = li.querySelector('.complaint-details');
    details.addEventListener('click', () => {
      const threadId = complaint.threadId || complaint.targetId;
      if (threadId) {
        window.open(`/?thread=${threadId}`, '_blank');
      }
    });
    const btn = document.createElement('button');
    btn.className = 'ghost-btn';
    btn.textContent = 'Решено';
    btn.addEventListener('click', async () => {
      await modRequest(`/api/complaints/${complaint.id}/resolve`, { method: 'POST', body: JSON.stringify({ result: 'resolved' }) });
      loadComplaints();
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function bindModTwoFactor() {
  if (!modTwoFactorForm) return;
  modTwoFactorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(modTwoFactorForm));
    try {
      await modRequest('/api/auth/verify-2fa', { method: 'POST', body: JSON.stringify(payload) });
      closeModTwoFactor();
      if (typeof modTwoFactorCallback === 'function') {
        const cb = modTwoFactorCallback;
        modTwoFactorCallback = null;
        await cb();
      }
    } catch (err) {
      alert(err.message);
    }
  });
  if (modCancelTwoFactor) {
    modCancelTwoFactor.addEventListener('click', () => {
      modTwoFactorCallback = null;
      closeModTwoFactor();
    });
  }
}

function openModTwoFactor(challengeId) {
  if (!modTwoFactorModal || !modTwoFactorForm) return;
  modTwoFactorForm.challengeId.value = challengeId;
  modTwoFactorForm.code.value = '';
  modTwoFactorCallback = () => enterModTools();
  modTwoFactorModal.classList.remove('hidden');
}

function closeModTwoFactor() {
  if (!modTwoFactorModal || !modTwoFactorForm) return;
  modTwoFactorForm.reset();
  modTwoFactorModal.classList.add('hidden');
}

window.addEventListener('DOMContentLoaded', initMod);
