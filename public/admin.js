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

async function initAdmin() {
  const loginForm = document.getElementById('adminLoginForm');
  const loginCard = document.getElementById('adminLoginCard');
  const workspace = document.getElementById('adminWorkspace');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm));
    try {
      await adminRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
      loginCard.classList.add('hidden');
      workspace.classList.remove('hidden');
      await Promise.all([refreshAdmin(), loadSections(), loadThreads()]);
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
      </div>
      <div class="thread-admin-actions">
        <button data-thread="${thread.id}" data-action="block" class="ghost-btn">Заблокировать</button>
        <button data-thread="${thread.id}" data-action="freeze" class="ghost-btn">${frozen ? 'Разморозить' : 'Заморозить'}</button>
        <button data-thread="${thread.id}" data-action="archive" class="ghost-btn">Архив</button>
        <button data-thread="${thread.id}" data-action="delete" class="danger-btn">Удалить</button>
      </div>
    </article>`;
}

async function handleThreadAction(id, action) {
  const endpoints = {
    block: `/api/threads/${id}/block`,
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
  document.getElementById('adminStats').textContent = JSON.stringify(stats, null, 2);
  const logs = await adminRequest('/api/admin/logs');
  document.getElementById('adminLogs').textContent = logs.logs.join('\n');
}

window.addEventListener('DOMContentLoaded', initAdmin);
