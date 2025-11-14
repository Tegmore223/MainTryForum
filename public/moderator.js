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
  const loginCard = document.getElementById('modLoginCard');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm));
    try {
      await modRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
      loginCard.classList.add('hidden');
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

window.addEventListener('DOMContentLoaded', initMod);
