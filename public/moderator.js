async function modRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'include',
    ...options
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Ошибка');
  return res.json();
}

async function initMod() {
  const loginForm = document.getElementById('modLoginForm');
  const tools = document.getElementById('modTools');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm));
    try {
      await modRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
      tools.classList.remove('hidden');
      await loadComplaints();
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

async function loadComplaints() {
  const data = await modRequest('/api/complaints');
  const list = document.getElementById('complaintList');
  list.innerHTML = '';
  data.complaints.forEach((complaint) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${complaint.targetType}</strong> ${complaint.targetId}<br>${complaint.reason}`;
    const btn = document.createElement('button');
    btn.className = 'pixel-btn';
    btn.textContent = 'Решено';
    btn.addEventListener('click', async () => {
      await modRequest(`/api/complaints/${complaint.id}/resolve`, { method: 'POST', body: JSON.stringify({ result: 'resolved' }) });
      loadComplaints();
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

window.addEventListener('DOMContentLoaded', initMod);
