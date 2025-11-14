const state = {
  user: null,
  sections: [],
  threads: [],
  currentSection: null,
  currentThread: null
};

const onboardingEl = document.getElementById('onboarding');
const forumShell = document.getElementById('forumShell');
const profileBtn = document.getElementById('profileBtn');
const profilePanel = document.getElementById('profilePanel');
const profileLabel = document.getElementById('profileLabel');

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
  bindProfilePanel();
  await loadCaptcha();
  await refreshProfile();
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
      registerForm.reset();
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

function bindProfilePanel() {
  const profileClose = document.getElementById('profileClose');
  const logoutBtn = document.getElementById('logoutBtn');
  const adminLinks = document.getElementById('adminLinks');
  const themeToggle = document.getElementById('profileThemeToggle');
  const avatarUpload = document.getElementById('avatarUpload');

  profileBtn.addEventListener('click', () => {
    if (!state.user) {
      onboardingEl.classList.remove('hidden');
      return;
    }
    profilePanel.classList.toggle('hidden');
  });

  profileClose.addEventListener('click', () => profilePanel.classList.add('hidden'));
  profilePanel.addEventListener('click', (e) => {
    if (e.target === profilePanel) {
      profilePanel.classList.add('hidden');
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
      state.user = null;
      profilePanel.classList.add('hidden');
      await refreshProfile();
    } catch (err) {
      alert(err.message);
    }
  });

  adminLinks.addEventListener('click', (e) => {
    const target = e.target.closest('button[data-link]');
    if (target) {
      window.location.href = target.dataset.link;
    }
  });

  avatarUpload.addEventListener('change', async (event) => {
    if (!event.target.files.length) return;
    const file = event.target.files[0];
    if (file.size > 400 * 1024) {
      alert('Файл слишком большой (макс 400 КБ).');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await request('/api/profile/avatar', { method: 'POST', body: JSON.stringify({ avatar: reader.result }) });
        await refreshProfile();
        event.target.value = '';
      } catch (err) {
        alert(err.message);
      }
    };
    reader.readAsDataURL(file);
  });

  themeToggle.addEventListener('click', async () => {
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
    profileLabel.textContent = `${state.user.nickname}`;
    document.documentElement.setAttribute('data-theme', state.user.theme || 'light');
    updateProfileView(state.user);
    showForum();
    await loadSections();
  } catch (err) {
    state.user = null;
    profileLabel.textContent = 'Гость';
    showOnboarding();
    clearForumState();
  }
}

function updateProfileView(user) {
  const nicknameEl = document.getElementById('profileNickname');
  const roleEl = document.getElementById('profileRole');
  const details = document.getElementById('profileDetails');
  const statsEl = document.getElementById('profileStats');
  const adminLinks = document.getElementById('adminLinks');
  const avatar = document.getElementById('profileAvatar');

  if (!user) {
    nicknameEl.textContent = 'Гость';
    roleEl.textContent = 'Не авторизован';
    details.innerHTML = '<li>Войдите, чтобы увидеть данные</li>';
    statsEl.innerHTML = '<li>Нет данных</li>';
    adminLinks.classList.add('hidden');
    avatar.style.backgroundImage = '';
    return;
  }

  nicknameEl.textContent = user.nickname;
  roleEl.textContent = user.role === 'admin' ? 'Администратор' : user.role === 'moderator' ? 'Модератор' : 'Участник';
  details.innerHTML = `
    <li>Ник: <strong>${user.nickname}</strong></li>
    <li>Роль: ${user.role}</li>
    <li>Регистрация: ${new Date(user.createdAt).toLocaleDateString()}</li>
    ${user.email ? `<li>E-mail: ${user.email}</li>` : ''}
    <li>IP: ${user.ip}</li>`;
  statsEl.innerHTML = `
    <li>Репутация: ${user.reputation}</li>
    <li>Лайки: ${user.likes}</li>
    <li>Благодарности: ${user.thanks}</li>
    <li>Ответы: ${user.answers}</li>
    <li>Избранное: ${user.favorites.length}</li>`;
  if (user.role === 'admin') {
    adminLinks.classList.remove('hidden');
    adminLinks.querySelector('[data-link="/admin.html"]').classList.remove('hidden');
    adminLinks.querySelector('[data-link="/moderator.html"]').classList.remove('hidden');
  } else if (user.role === 'moderator') {
    adminLinks.classList.remove('hidden');
    adminLinks.querySelector('[data-link="/admin.html"]').classList.add('hidden');
    adminLinks.querySelector('[data-link="/moderator.html"]').classList.remove('hidden');
  } else {
    adminLinks.classList.add('hidden');
  }
  avatar.style.backgroundImage = user.avatar ? `url(${user.avatar})` : '';
  avatar.style.backgroundSize = 'cover';
  avatar.style.backgroundPosition = 'center';
}

function showForum() {
  onboardingEl.classList.add('hidden');
  forumShell.classList.remove('hidden');
}

function showOnboarding() {
  onboardingEl.classList.remove('hidden');
  forumShell.classList.add('hidden');
  profilePanel.classList.add('hidden');
}

function clearForumState() {
  state.currentSection = null;
  state.threads = [];
  state.currentThread = null;
  document.getElementById('sectionsList').innerHTML = '';
  document.getElementById('threadsList').innerHTML = '';
  document.getElementById('threadView').classList.add('hidden');
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

async function openSection(section) {
  state.currentSection = section;
  document.getElementById('currentSectionTitle').textContent = section.title;
  const threads = await request(`/api/threads?sectionId=${section.id}`);
  state.threads = threads.items;
  const container = document.getElementById('threadsList');
  container.innerHTML = '';
  threads.items.forEach((thread) => {
    const div = document.createElement('div');
    div.className = 'thread-card';
    const status = thread.locked ? `<span class="badge danger">${thread.lockReason === 'frozen' ? 'Заморожен' : 'Удалён'}</span>` : '';
    div.innerHTML = `
      <div class="thread-head">
        <div>
          <strong>${thread.title}</strong>
          <small class="thread-id">${thread.id}</small>
        </div>
        <span>${thread.stats.replies} ответов</span>
      </div>
      <div class="thread-meta">❤ ${thread.likes.length} · ✨ ${thread.thanks.length} · ★ ${thread.favorites.length} ${status}</div>`;
    div.addEventListener('click', () => openThread(thread.id));
    container.appendChild(div);
  });
}

async function openThread(id) {
  const thread = await request(`/api/threads/${id}`);
  state.currentThread = thread;
  const view = document.getElementById('threadView');
  view.classList.remove('hidden');
  const replyForm = thread.locked
    ? `<div class="notice">${thread.lockReason === 'frozen' ? 'Тред временно заморожен.' : 'Тред заблокирован.'}</div>`
    : `<form id="replyForm">
        <textarea name="content" rows="3" required placeholder="Ответ..."></textarea>
        <button class="ghost-btn">Ответить</button>
      </form>`;
  view.innerHTML = `
    <h3>${thread.title} <small class="thread-id">${thread.id}</small></h3>
    <p>${thread.content}</p>
    <div class="thread-controls">
      <button class="accent-btn" data-action="like">Лайк (${thread.likes.length})</button>
      <button class="accent-btn" data-action="thanks">Благодарность (${thread.thanks.length})</button>
      <button class="accent-btn" data-action="favorite">Избранное (${thread.favorites.length})</button>
    </div>
    ${replyForm}
    <div class="posts">${thread.posts.map(renderPost).join('')}</div>`;
  const form = view.querySelector('#replyForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
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
  }
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
