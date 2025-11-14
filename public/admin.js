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
  const tools = document.getElementById('adminTools');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm));
    try {
      await adminRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
      tools.classList.remove('hidden');
      await refreshAdmin();
    } catch (err) {
      alert(err.message);
    }
  });
  document.getElementById('sectionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    await adminRequest('/api/sections', { method: 'POST', body: JSON.stringify(data) });
    alert('Раздел добавлен');
    e.target.reset();
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
    alert('Пользователь заблокирован');
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
    document.getElementById('archiveBox').textContent = JSON.stringify(archive.archivedThreads, null, 2);
  });
}

async function refreshAdmin() {
  const stats = await adminRequest('/api/admin/stats');
  document.getElementById('adminStats').textContent = JSON.stringify(stats, null, 2);
  const logs = await adminRequest('/api/admin/logs');
  document.getElementById('adminLogs').textContent = logs.logs.join('\n');
}

window.addEventListener('DOMContentLoaded', initAdmin);
