const state = {
  user: null,
  sections: [],
  threads: [],
  currentSection: null,
  currentThread: null
};

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'include',
    ...options
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || 'Ошибка');
  }
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

async function loadCaptcha() {
  const captcha = await request('/api/auth/captcha');
  document.querySelector('#registerForm [name="captchaId"]').value = captcha.captchaId;
  document.getElementById('captchaQuestion').textContent = captcha.question;
}

async function init() {
  bindAuth();
  bindThreadForm();
  bindTheme();
  await loadCaptcha();
  await refreshProfile();
  await loadSections();
  await loadStats();
}

function bindAuth() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm));
    try {
      await request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
      await refreshProfile();
    } catch (err) {
      alert(err.message);
    }
  });
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(registerForm));
    try {
      await request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) });
      await refreshProfile();
    } catch (err) {
      alert(err.message);
    } finally {
      loadCaptcha();
    }
  });
}

function bindThreadForm() {
  document.getElementById('newThreadBtn').addEventListener('click', () => {
    document.getElementById('threadForm').classList.toggle('hidden');
  });
  document.getElementById('threadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentSection) return;
    const data = Object.fromEntries(new FormData(e.target));
    data.sectionId = state.currentSection.id;
    try {
      await request('/api/threads', { method: 'POST', body: JSON.stringify(data) });
      e.target.reset();
      document.getElementById('threadForm').classList.add('hidden');
      await openSection(state.currentSection);
    } catch (err) {
      alert(err.message);
    }
  });
}

function bindTheme() {
  document.getElementById('themeToggle').addEventListener('click', async () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    if (state.user) {
      try {
        await request('/api/profile/theme', { method: 'POST', body: JSON.stringify({ theme: next }) });
      } catch (err) {
        console.warn(err);
      }
    }
  });
}

async function refreshProfile() {
  try {
    const data = await request('/api/me');
    state.user = data.user;
    document.getElementById('profileInfo').textContent = `${state.user.nickname} (${state.user.role})`;
    document.documentElement.setAttribute('data-theme', state.user.theme || 'light');
    renderBadges(state.user.badges);
    renderUserStats(state.user);
  } catch (err) {
    state.user = null;
    document.getElementById('profileInfo').textContent = 'Гость';
    renderBadges();
    renderUserStats(null);
  }
}

async function loadSections() {
  const { sections } = await request('/api/sections');
  state.sections = sections;
  const list = document.getElementById('sectionsList');
  list.innerHTML = '';
  sections.forEach((section) => {
    const div = document.createElement('div');
    div.className = 'section';
    div.innerHTML = `<strong>${section.title}</strong><p>${section.description}</p>`;
    div.addEventListener('click', () => openSection(section));
    list.appendChild(div);
  });
}

async function loadStats() {
  const stats = await request('/api/stats');
  const list = document.getElementById('statsList');
  list.innerHTML = Object.entries(stats).map(([key, value]) => `<li>${key}: <strong>${value}</strong></li>`).join('');
}

function renderBadges(list) {
  const badges = document.getElementById('activityBadges');
  badges.innerHTML = '';
  (list && list.length ? list : ['Гость форума']).forEach((badge) => {
    const li = document.createElement('li');
    li.textContent = badge;
    badges.appendChild(li);
  });
}

function renderUserStats(user) {
  const el = document.getElementById('userStats');
  if (!user) {
    el.innerHTML = '<li>Войдите, чтобы увидеть статистику</li>';
    return;
  }
  el.innerHTML = `
    <li>Репутация: ${user.reputation}</li>
    <li>Лайки: ${user.likes}</li>
    <li>Благодарности: ${user.thanks}</li>
    <li>Ответы: ${user.answers}</li>
    <li>Избранное: ${user.favorites.length}</li>`;
}

async function openSection(section) {
  state.currentSection = section;
  document.getElementById('threadsPanel').classList.remove('hidden');
  document.getElementById('currentSectionTitle').textContent = section.title;
  const threads = await request(`/api/threads?sectionId=${section.id}`);
  state.threads = threads.items;
  const container = document.getElementById('threadsList');
  container.innerHTML = '';
  threads.items.forEach((thread) => {
    const div = document.createElement('div');
    div.className = 'thread-card';
    div.innerHTML = `
      <div class="thread-head">
        <strong>${thread.title}</strong>
        <span>${thread.stats.replies} ответов</span>
      </div>
      <div class="thread-meta">❤ ${thread.likes.length} · ✨ ${thread.thanks.length} · ★ ${thread.favorites.length}</div>`;
    div.addEventListener('click', () => openThread(thread.id));
    container.appendChild(div);
  });
}

async function openThread(id) {
  const thread = await request(`/api/threads/${id}`);
  state.currentThread = thread;
  const view = document.getElementById('threadView');
  view.classList.remove('hidden');
  view.innerHTML = `
    <h3>${thread.title}</h3>
    <p>${thread.content}</p>
    <div class="thread-controls">
      <button class="pixel-btn" data-action="like">Лайк (${thread.likes.length})</button>
      <button class="pixel-btn" data-action="thanks">Благодарность (${thread.thanks.length})</button>
      <button class="pixel-btn" data-action="favorite">Избранное (${thread.favorites.length})</button>
    </div>
    <form id="replyForm">
      <textarea name="content" rows="3" required placeholder="Ответ..."></textarea>
      <button class="pixel-btn">Ответить</button>
    </form>
    <div class="posts">${thread.posts.map(renderPost).join('')}</div>`;
  view.querySelector('#replyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = e.target.content.value.trim();
    if (!content) return;
    try {
      await request(`/api/threads/${thread.id}/reply`, { method: 'POST', body: JSON.stringify({ content }) });
      e.target.reset();
      openThread(thread.id);
    } catch (err) {
      alert(err.message);
    }
  });
  view.querySelectorAll('.thread-controls button').forEach((btn) => {
    btn.addEventListener('click', () => reactThread(thread.id, btn.dataset.action));
  });
}

function renderPost(post) {
  return `<div class="post"><div class="meta">${post.authorId} · ${new Date(post.createdAt).toLocaleString()}</div><div>${post.content}</div></div>`;
}

async function reactThread(id, type) {
  try {
    await request(`/api/threads/${id}/react`, { method: 'POST', body: JSON.stringify({ type }) });
    openThread(id);
  } catch (err) {
    alert(err.message);
  }
}

window.addEventListener('DOMContentLoaded', init);
