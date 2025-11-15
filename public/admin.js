async function adminRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'include',
    ...options
  });
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({}))).error || 'Ошибка');
  }
  return res.headers.get('content-type')?.includes('application/json') ? res.json() : res.text();
}

let brandingLogoData = null;
let loginCard;
let workspace;
let adminTwoFactorModal;
let adminTwoFactorForm;
let adminCancelTwoFactor;
let adminTwoFactorCallback = null;

async function initAdmin() {
  const loginForm = document.getElementById('adminLoginForm');
  loginCard = document.getElementById('adminLoginCard');
  workspace = document.getElementById('adminWorkspace');
  adminTwoFactorModal = document.getElementById('adminTwoFactor');
  adminTwoFactorForm = document.getElementById('adminTwoFactorForm');
  adminCancelTwoFactor = document.getElementById('adminCancelTwoFactor');
  bindAdminTwoFactor();

async function initAdmin() {
  const loginForm = document.getElementById('adminLoginForm');
  const loginCard = document.getElementById('adminLoginCard');
  const workspace = document.getElementById('adminWorkspace');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm));
    try {
      const result = await adminRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
      if (result.twoFactor) {
        openAdminTwoFactor(result.challengeId);
        return;
      }
      await enterWorkspace();
      await adminRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
      loginCard.classList.add('hidden');
      workspace.classList.remove('hidden');
      await Promise.all([refreshAdmin(), loadSections(), loadThreads(), loadBranding(), loadUsers(), loadComplaints()]);
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('sectionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    await adminRequest('/api/sections', { method: 'POST', body: JSON.stringify(data) });
    e.target.reset();
    await loadSections();
  });

  document.getElementById('roleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    await adminRequest('/api/admin/assign-role', { method: 'POST', body: JSON.stringify(data) });
    alert('Роль обновлена');
  });

  document.getElementById('banForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    await adminRequest('/api/admin/ban', { method: 'POST', body: JSON.stringify(data) });
    alert('Блокировка применена');
    await loadBans();
  });

  document.getElementById('exportUsers').addEventListener('click', async () => {
    const res = await fetch('/api/admin/users/export', { credentials: 'include' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('loadArchive').addEventListener('click', async () => {
    const archive = await adminRequest('/api/admin/archive');
    const box = document.getElementById('archiveBox');
    box.classList.toggle('hidden');
    box.textContent = JSON.stringify(archive.archivedThreads, null, 2);
  });

  document.getElementById('threadSearchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = new FormData(e.target).get('threadId');
    try {
      const thread = await adminRequest(`/api/threads/${id}`);
      renderThreads([thread], 'Результат поиска');
    } catch (err) {
      alert('Тред не найден');
    }
  });

  document.getElementById('refreshThreads').addEventListener('click', () => loadThreads());
  document.getElementById('threadSectionFilter').addEventListener('change', () => loadThreads());

  const logoUpload = document.getElementById('logoUpload');
  logoUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== 'image/png') {
      alert('Загрузите PNG-изображение.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      brandingLogoData = reader.result;
      document.getElementById('logoPreview').src = brandingLogoData;
      document.getElementById('logoPreview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('brandingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const payload = {};
    if (data.title) payload.title = data.title;
    if (brandingLogoData) payload.logo = brandingLogoData;
    try {
      const response = await adminRequest('/api/admin/settings', { method: 'POST', body: JSON.stringify(payload) });
      updateBrandingPreview(response.settings);
      brandingLogoData = null;
      e.target.reset();
      logoUpload.value = '';
      alert('Настройки обновлены');
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('removeLogo').addEventListener('click', async () => {
    try {
      const response = await adminRequest('/api/admin/settings', { method: 'POST', body: JSON.stringify({ removeLogo: true }) });
      updateBrandingPreview(response.settings);
      alert('Логотип удалён');
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('refreshUsers').addEventListener('click', () => loadUsers());
  const refreshComplaints = document.getElementById('refreshComplaints');
  if (refreshComplaints) refreshComplaints.addEventListener('click', () => loadComplaints());
}

async function enterWorkspace() {
  if (!loginCard || !workspace) return;
  loginCard.classList.add('hidden');
  workspace.classList.remove('hidden');
  const loginForm = document.getElementById('adminLoginForm');
  if (loginForm) loginForm.reset();
  await Promise.all([
    refreshAdmin(),
    loadSections(),
    loadThreads(),
    loadBranding(),
    loadUsers(),
    loadComplaints(),
    loadBans()
  ]);
}

async function loadSections() {
  const select = document.getElementById('threadSectionFilter');
  const data = await adminRequest('/api/sections');
  const sections = data.sections || [];
  select.innerHTML = '<option value="">Все разделы</option>' +
    sections.map((s) => `<option value="${s.id}">${s.title}</option>`).join('');
}

async function loadThreads() {
  const select = document.getElementById('threadSectionFilter');
  const sectionId = select.value || '';
  const query = sectionId ? `?sectionId=${sectionId}` : '';
  const { threads } = await adminRequest(`/api/admin/threads${query}`);
  renderThreads(threads, sectionId ? 'Треды раздела' : 'Свежие треды');
}

function renderThreads(list, title) {
  const container = document.getElementById('threadResults');
  if (!list.length) {
    container.innerHTML = '<p class="muted">Нет тредов</p>';
    return;
  }
  container.innerHTML = `<p class="eyebrow">${title}</p>` +
    list.map((thread) => threadCard(thread)).join('');
  container.querySelectorAll('[data-thread][data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleThreadAction(btn.dataset.thread, btn.dataset.action));
  });
}

function threadCard(thread) {
  const frozen = thread.lockReason === 'frozen';
  const blocked = thread.lockReason === 'blocked';
  const preview = (thread.content || '').slice(0, 180);
  const blockAction = blocked ? 'unblock' : 'block';
  const blockLabel = blocked ? 'Разблокировать' : 'Заблокировать';
  return `
    <article class="thread-admin-card">
      <header>
        <div>
          <strong>${thread.title}</strong>
          <small>${thread.id}</small>
        </div>
        <span>${new Date(thread.createdAt).toLocaleString()}</span>
      </header>
      <p>${preview}</p>
      <div class="thread-flags">
        ${thread.locked ? `<span class="badge danger">${blocked ? 'Заблокирован' : 'Заморожен'}</span>` : ''}
        ${thread.archived ? '<span class="badge">Архив</span>' : ''}
        <span class="badge">Просмотры: ${thread.views || 0}</span>
      </div>
      <div class="thread-admin-actions">
        <button data-thread="${thread.id}" data-action="${blockAction}" class="ghost-btn">${blockLabel}</button>
        <button data-thread="${thread.id}" data-action="freeze" class="ghost-btn">${frozen ? 'Разморозить' : 'Заморозить'}</button>
        <button data-thread="${thread.id}" data-action="archive" class="ghost-btn">Архив</button>
        <button data-thread="${thread.id}" data-action="delete" class="danger-btn">Удалить</button>
      </div>
    </article>`;
}

async function handleThreadAction(id, action) {
  const endpoints = {
    block: `/api/threads/${id}/block`,
    unblock: `/api/threads/${id}/unblock`,
    freeze: `/api/threads/${id}/freeze`,
    archive: `/api/threads/${id}/archive`,
    delete: `/api/threads/${id}/delete`
  };
  try {
    await adminRequest(endpoints[action], { method: 'POST' });
    await loadThreads();
  } catch (err) {
    alert(err.message);
  }
}

async function refreshAdmin() {
  const stats = await adminRequest('/api/admin/stats');
  renderStats(stats);
  const logs = await adminRequest('/api/admin/logs');
  document.getElementById('adminLogs').textContent = logs.logs.join('\n');
}

async function loadBranding() {
  const data = await adminRequest('/api/admin/settings');
  updateBrandingPreview(data.settings);
}

function updateBrandingPreview(settings) {
  const preview = document.getElementById('logoPreview');
  if (!preview) return;
  if (settings.logo) {
    preview.src = settings.logo;
    preview.classList.remove('hidden');
  } else {
    preview.removeAttribute('src');
    preview.classList.add('hidden');
  }
  const titleInput = document.querySelector('#brandingForm [name="title"]');
  if (titleInput && settings.title) {
    titleInput.placeholder = settings.title;
  }
}

function renderStats(stats) {
  const summary = document.getElementById('statsSummary');
  if (!summary) return;
  summary.innerHTML = `
    <div><span>Пользователи</span><strong>${stats.counts.users}</strong></div>
    <div><span>Разделы</span><strong>${stats.counts.sections}</strong></div>
    <div><span>Треды</span><strong>${stats.counts.threads}</strong></div>
    <div><span>Ответы</span><strong>${stats.counts.posts}</strong></div>
    <div><span>Жалобы</span><strong>${stats.counts.complaints}</strong></div>
    <div><span>Баны</span><strong>${stats.counts.bans}</strong></div>`;
  drawChart('threadsChart', stats.timeline.map((item) => ({ label: item.label, value: item.threads })), '#0f9d58');
  drawChart('postsChart', stats.timeline.map((item) => ({ label: item.label, value: item.posts })), '#5c6ac4');
  const list = document.getElementById('topSections');
  if (list) {
    list.innerHTML = stats.topSections.length
      ? stats.topSections.map((section) => `<li>${section.title || 'Без названия'} — ${section.threads} тредов</li>`).join('')
      : '<li class="muted">Нет разделов</li>';
  }
}

function drawChart(canvasId, dataset, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const max = Math.max(...dataset.map((d) => d.value), 1);
  const barWidth = canvas.width / dataset.length;
  dataset.forEach((point, index) => {
    const height = (point.value / max) * (canvas.height - 20);
    ctx.fillStyle = color;
    ctx.fillRect(index * barWidth + 10, canvas.height - height - 10, barWidth - 20, height);
    ctx.fillStyle = '#7a7a7a';
    ctx.font = '10px sans-serif';
    ctx.fillText(point.label, index * barWidth + 4, canvas.height - 4);
  });
}

async function loadUsers() {
  const data = await adminRequest('/api/admin/users');
  const tbody = document.querySelector('#userTable tbody');
  if (!tbody) return;
  tbody.innerHTML = data.users
    .map(
      (user) => `
        <tr>
          <td>${user.nickname}</td>
          <td>${user.id}</td>
          <td>${user.email || '—'}</td>
          <td>${user.ip || '—'}</td>
        </tr>`
    )
    .join('');
}

async function loadComplaints() {
  const list = document.getElementById('adminComplaintList');
  if (!list) return;
  const data = await adminRequest('/api/complaints');
  list.innerHTML = '';
  if (!data.complaints.length) {
    list.innerHTML = '<li class="muted">Жалоб нет</li>';
    return;
  }
  data.complaints.forEach((complaint) => {
    const li = document.createElement('li');
    const details = document.createElement('div');
    details.className = 'complaint-details clickable';
    details.innerHTML = `
      <strong>${complaint.targetTitle || complaint.targetType} (${complaint.targetId})</strong>
      <span class="reporter">Жалоба ${complaint.id} от ${complaint.authorNickname} (${complaint.authorId || '—'})</span>
      <span>На пользователя: ${complaint.targetAuthorNickname || 'Аноним'} (${complaint.targetAuthorId || '—'})</span>
      <span>${complaint.reason}</span>
      ${complaint.targetSnippet ? `<small class="complaint-meta">${complaint.targetSnippet}</small>` : ''}`;
    details.addEventListener('click', () => {
      const threadId = complaint.threadId || complaint.targetId;
      if (threadId) {
        window.open(`/?thread=${threadId}`, '_blank');
      }
    });
    li.appendChild(details);
    const btn = document.createElement('button');
    btn.className = 'ghost-btn';
    btn.textContent = 'Решено';
    btn.addEventListener('click', async () => {
      await adminRequest(`/api/complaints/${complaint.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ result: 'resolved' })
      });
      loadComplaints();
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

async function loadBans() {
  const list = document.getElementById('banList');
  if (!list) return;
  const data = await adminRequest('/api/admin/bans');
  if (!data.bans.length) {
    list.innerHTML = '<li class="muted">Активных блокировок нет</li>';
    return;
  }
  list.innerHTML = data.bans
    .map(
      (ban) => `
        <li>
          <div class="ban-row">
            <div>
              <strong>${ban.userId || ban.ip || '—'}</strong>
              <span>${ban.reason || 'Без причины'}</span>
              <small>${ban.ip ? `IP: ${ban.ip}` : ''}</small>
              <small>${ban.expiresAt ? `До ${new Date(ban.expiresAt).toLocaleString()}` : 'Бессрочно'}</small>
            </div>
            <button class="ghost-btn" data-unban="${ban.id}">Снять бан</button>
          </div>
        </li>`
    )
    .join('');
  list.querySelectorAll('[data-unban]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await adminRequest('/api/admin/unban', { method: 'POST', body: JSON.stringify({ banId: btn.dataset.unban }) });
        await loadBans();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function bindAdminTwoFactor() {
  if (!adminTwoFactorForm) return;
  adminTwoFactorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(adminTwoFactorForm));
    try {
      await adminRequest('/api/auth/verify-2fa', { method: 'POST', body: JSON.stringify(payload) });
      closeAdminTwoFactor();
      if (typeof adminTwoFactorCallback === 'function') {
        const cb = adminTwoFactorCallback;
        adminTwoFactorCallback = null;
        await cb();
      }
    } catch (err) {
      alert(err.message);
    }
  });
  if (adminCancelTwoFactor) {
    adminCancelTwoFactor.addEventListener('click', () => {
      adminTwoFactorCallback = null;
      closeAdminTwoFactor();
    });
  }
}

function openAdminTwoFactor(challengeId) {
  if (!adminTwoFactorModal || !adminTwoFactorForm) return;
  adminTwoFactorForm.challengeId.value = challengeId;
  adminTwoFactorForm.code.value = '';
  adminTwoFactorCallback = () => enterWorkspace();
  adminTwoFactorModal.classList.remove('hidden');
}

function closeAdminTwoFactor() {
  if (!adminTwoFactorModal || !adminTwoFactorForm) return;
  adminTwoFactorForm.reset();
  adminTwoFactorModal.classList.add('hidden');
}

window.addEventListener('DOMContentLoaded', initAdmin);
