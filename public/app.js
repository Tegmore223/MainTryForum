const state = {
  user: null,
  sections: [],
  threads: [],
  currentSection: null,
  currentThread: null,
  settings: { title: 'OP.WEB', logo: '' },
  library: { favorites: [], liked: [] },
  pendingThreadId: null,
  messages: { inbox: [], sent: [] }
  pendingThreadId: null
};

const onboardingEl = document.getElementById('onboarding');
const forumShell = document.getElementById('forumShell');
const profileBtn = document.getElementById('profileBtn');
const profilePanel = document.getElementById('profilePanel');
const profileLabel = document.getElementById('profileLabel');
const homeButton = document.getElementById('homeButton');
const collectionsBtn = document.getElementById('collectionsBtn');
const collectionsPanel = document.getElementById('collectionsPanel');
const favoriteList = document.getElementById('favoriteList');
const likedList = document.getElementById('likedList');
const messengerBtn = document.getElementById('messengerBtn');
const messengerPanel = document.getElementById('messengerPanel');
const inboxListEl = document.getElementById('inboxList');
const sentListEl = document.getElementById('sentList');
const messageForm = document.getElementById('messageForm');
const complaintPanel = document.getElementById('complaintPanel');
const complaintForm = document.getElementById('complaintForm');
const forumLogoText = document.getElementById('forumLogoText');
const forumLogoImage = document.getElementById('forumLogoImage');
const boardTicker = document.getElementById('boardTicker');
const twoFactorModal = document.getElementById('twoFactorModal');
const twoFactorForm = document.getElementById('twoFactorForm');
const cancelTwoFactor = document.getElementById('cancelTwoFactor');
const initialParams = new URLSearchParams(window.location.search);
state.pendingThreadId = initialParams.get('thread') || null;
let twoFactorCallback = null;
const initialParams = new URLSearchParams(window.location.search);
state.pendingThreadId = initialParams.get('thread') || null;

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

async function loadSettings() {
  try {
    const data = await request('/api/settings/public', { method: 'GET' });
    state.settings = data.settings;
    applySettings();
  } catch (err) {
    console.warn('Не удалось загрузить настройки', err);
  }
}

function applySettings() {
  if (state.settings.logo) {
    forumLogoImage.src = state.settings.logo;
    forumLogoImage.classList.remove('hidden');
    forumLogoText.classList.add('hidden');
  } else {
    forumLogoText.textContent = state.settings.title || 'OP.WEB';
    forumLogoText.classList.remove('hidden');
    forumLogoImage.classList.add('hidden');
  }
}

async function loadCaptcha() {
  const captcha = await request('/api/auth/captcha');
  document.querySelector('#registerForm [name="captchaId"]').value = captcha.captchaId;
  document.getElementById('captchaQuestion').textContent = captcha.question;
}

async function init() {
  await loadSettings();
  bindAuth();
  bindThreadForm();
  bindProfilePanel();
  bindHomeNavigation();
  bindCollectionsPanel();
  bindMessengerPanel();
  bindComplaintPanel();
  bindTwoFactorModal();
  bindComplaintPanel();
  await loadCaptcha();
  await refreshProfile();
}

function updateThreadParam(threadId) {
  const url = new URL(window.location.href);
  if (threadId) {
    url.searchParams.set('thread', threadId);
  } else {
    url.searchParams.delete('thread');
  }
  window.history.replaceState({}, '', url);
}

function bindAuth() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm));
    try {
      const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
      if (result.twoFactor) {
        openTwoFactorModal(result.challengeId, async () => {
          await refreshProfile();
          loginForm.reset();
        });
        return;
      }
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

function bindHomeNavigation() {
  homeButton.addEventListener('click', () => {
    if (!state.user) {
      showOnboarding();
      return;
    }
    state.pendingThreadId = null;
    resetForumView();
  });
}

function bindCollectionsPanel() {
  if (!collectionsBtn) return;
  const closeBtn = document.querySelector('[data-close-collections]');
  collectionsBtn.addEventListener('click', async () => {
    if (!state.user) {
      showOnboarding();
      return;
    }
    await loadLibrary();
    collectionsPanel.classList.remove('hidden');
  });
  collectionsPanel.addEventListener('click', (e) => {
    if (e.target === collectionsPanel) collectionsPanel.classList.add('hidden');
  });
  if (closeBtn) closeBtn.addEventListener('click', () => collectionsPanel.classList.add('hidden'));
  document.querySelectorAll('.collection-list').forEach((list) => {
    list.addEventListener('click', (e) => {
      const item = e.target.closest('li[data-thread]');
      if (!item) return;
      openThread(item.dataset.thread);
      collectionsPanel.classList.add('hidden');
    });
  });
}

function bindMessengerPanel() {
  if (!messengerBtn || !messengerPanel) return;
  const closeBtn = messengerPanel.querySelector('[data-close-messenger]');
  messengerBtn.addEventListener('click', async () => {
    if (!state.user) {
      showOnboarding();
      return;
    }
    await loadMessages();
    messengerPanel.classList.remove('hidden');
  });
  if (closeBtn) closeBtn.addEventListener('click', () => messengerPanel.classList.add('hidden'));
  messengerPanel.addEventListener('click', (event) => {
    if (event.target === messengerPanel) messengerPanel.classList.add('hidden');
  });
  if (messageForm) {
    messageForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.user) {
        showOnboarding();
        return;
      }
      const payload = Object.fromEntries(new FormData(messageForm));
      try {
        await request('/api/messages', { method: 'POST', body: JSON.stringify(payload) });
        messageForm.reset();
        await loadMessages();
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

function bindComplaintPanel() {
  if (!complaintPanel) return;
  const closeBtn = document.querySelector('[data-close-complaint]');
  if (closeBtn) closeBtn.addEventListener('click', () => complaintPanel.classList.add('hidden'));
  complaintPanel.addEventListener('click', (e) => {
    if (e.target === complaintPanel) complaintPanel.classList.add('hidden');
  });
  complaintForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) {
      showOnboarding();
      return;
    }
    const reason = e.target.reason.value.trim();
    const targetId = e.target.targetId.value;
    const targetType = e.target.targetType.value || 'thread';
    if (!reason) return;
    try {
      await request('/api/complaints', {
        method: 'POST',
        body: JSON.stringify({ targetType, targetId, reason })
      });
      alert('Жалоба отправлена');
      e.target.reset();
      complaintPanel.classList.add('hidden');
    } catch (err) {
      alert(err.message);
    }
  });
}

function bindTwoFactorModal() {
  if (!twoFactorModal || !twoFactorForm) return;
  twoFactorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(twoFactorForm));
    try {
      await request('/api/auth/verify-2fa', { method: 'POST', body: JSON.stringify(formData) });
      closeTwoFactorModal();
      if (typeof twoFactorCallback === 'function') {
        const callback = twoFactorCallback;
        twoFactorCallback = null;
        await callback();
      }
    } catch (err) {
      alert(err.message);
    }
  });
  if (cancelTwoFactor) {
    cancelTwoFactor.addEventListener('click', () => {
      closeTwoFactorModal();
      twoFactorCallback = null;
    });
  }
}

function openTwoFactorModal(challengeId, onSuccess) {
  if (!twoFactorModal || !twoFactorForm) return;
  twoFactorForm.challengeId.value = challengeId;
  twoFactorForm.code.value = '';
  twoFactorCallback = onSuccess;
  twoFactorModal.classList.remove('hidden');
}

function closeTwoFactorModal() {
  if (!twoFactorModal || !twoFactorForm) return;
  twoFactorForm.reset();
  twoFactorModal.classList.add('hidden');
}

async function loadLibrary() {
  try {
    const data = await request('/api/library');
    state.library = data;
    renderCollections(data);
  } catch (err) {
    console.warn('library error', err);
  }
}

function renderCollections(library) {
  const applyList = (element, items) => {
    element.innerHTML = items.length
      ? items
          .map(
            (thread) => `
        <li data-thread="${thread.id}">
          <strong>${thread.title}</strong>
          <small>${thread.views || 0} просмотров</small>
        </li>`
          )
          .join('')
      : '<li class="muted">Нет данных</li>';
  };
  applyList(favoriteList, library.favorites || []);
  applyList(likedList, library.liked || []);
}

function updateBoardTicker() {
  if (!boardTicker) return;
  if (!state.sections.length) {
    boardTicker.innerHTML = '<span class="muted">Разделы станут доступны после входа.</span>';
    return;
  }
  boardTicker.innerHTML = state.sections
    .slice(0, 5)
    .map((section) => `<span class="ticker-chip">/${section.title}/ · ${section.description || ''}</span>`)
    .join('');
}

function renderMessagesPanel() {
  if (!inboxListEl || !sentListEl) return;
  const fill = (element, items, type) => {
    if (!items.length) {
      element.innerHTML = '<li class="muted">Пусто</li>';
      return;
    }
    element.innerHTML = items
      .map(
        (msg) => `
        <li data-msg="${msg.id}" class="message-card ${!msg.readAt && type === 'inbox' ? 'unread' : ''}">
          <div class="message-head">
            <strong>${type === 'inbox' ? msg.fromNickname : msg.toNickname}</strong>
            <span>${new Date(msg.createdAt).toLocaleString()}</span>
          </div>
          <p>${msg.content}</p>
        </li>`
      )
      .join('');
    if (type === 'inbox') {
      element.querySelectorAll('li[data-msg]').forEach((item) => {
        item.addEventListener('click', async () => {
          try {
            await request(`/api/messages/${item.dataset.msg}/read`, { method: 'POST', body: JSON.stringify({}) });
            await loadMessages();
          } catch (err) {
            console.warn(err);
          }
        });
      });
    }
  };
  fill(inboxListEl, state.messages.inbox || [], 'inbox');
  fill(sentListEl, state.messages.sent || [], 'sent');
}

async function loadMessages() {
  if (!state.user) return;
  try {
    const data = await request('/api/messages');
    state.messages = data;
    renderMessagesPanel();
  } catch (err) {
    console.warn('Не удалось загрузить сообщения', err);
  }
}

function openComplaint(target) {
  if (!state.user) {
    showOnboarding();
    return;
  }
  complaintForm.targetId.value = target.id;
  complaintForm.targetType.value = target.type || 'thread';
  document.getElementById('complaintTitle').textContent = target.title;
  const meta = document.getElementById('complaintMeta');
  if (meta) {
    const userId = target.authorId ? target.authorId : 'неизвестен';
    meta.innerHTML = '';
    const idSpan = document.createElement('span');
    idSpan.textContent = `ID объекта: ${target.id}`;
    const br = document.createElement('br');
    const userSpan = document.createElement('span');
    userSpan.textContent = `Пользователь: ${target.authorNickname || 'Аноним'} (${userId})`;
    meta.append(idSpan, br, userSpan);
  }
  complaintForm.reason.value = '';
  complaintPanel.classList.remove('hidden');
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

  if (themeToggle) {
    themeToggle.addEventListener('change', async () => {
      const next = themeToggle.checked ? 'dark' : 'light';
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
}

async function refreshProfile() {
  try {
    const data = await request('/api/me');
    state.user = data.user;
    profileLabel.textContent = `${state.user.nickname}`;
    document.documentElement.setAttribute('data-theme', state.user.theme || 'dark');
    updateProfileView(state.user);
    showForum();
    await loadSections();
  } catch (err) {
    state.user = null;
    profileLabel.textContent = 'Гость';
    document.documentElement.setAttribute('data-theme', 'dark');
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
  const themeToggle = document.getElementById('profileThemeToggle');

  if (!user) {
    nicknameEl.textContent = 'Гость';
    roleEl.textContent = 'Не авторизован';
    details.innerHTML = '<li>Войдите, чтобы увидеть данные</li>';
    statsEl.innerHTML = '<li>Нет данных</li>';
    adminLinks.classList.add('hidden');
    avatar.style.backgroundImage = '';
    if (themeToggle) themeToggle.checked = true;
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
    <li>Избранное: ${(user.favorites || []).length}</li>`;
  if (themeToggle) {
    themeToggle.checked = (user.theme || 'dark') === 'dark';
  }
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
  resetForumView();
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
  state.library = { favorites: [], liked: [] };
  state.messages = { inbox: [], sent: [] };
  document.getElementById('sectionsList').innerHTML = '';
  document.getElementById('threadsList').innerHTML = '';
  document.getElementById('threadView').classList.add('hidden');
  if (!state.pendingThreadId) {
    updateThreadParam(null);
  }
}

function resetForumView() {
  document.getElementById('currentSectionTitle').textContent = 'Выберите раздел';
  document.getElementById('threadForm').classList.add('hidden');
  document.getElementById('threadView').classList.add('hidden');
  const list = document.getElementById('threadsList');
  list.innerHTML = '<p class="muted">Откройте раздел, чтобы увидеть треды.</p>';
  document.querySelectorAll('.section-card').forEach((el) => el.classList.remove('active'));
  state.currentSection = null;
  state.currentThread = null;
  if (!state.pendingThreadId) {
    updateThreadParam(null);
  }
}

async function loadSections() {
  const { sections } = await request('/api/sections');
  state.sections = sections;
  const list = document.getElementById('sectionsList');
  list.innerHTML = '';
  sections.forEach((section) => {
    const card = document.createElement('div');
    card.className = 'section-card';
    if (state.currentSection && state.currentSection.id === section.id) {
      card.classList.add('active');
    }
    card.innerHTML = `
      <div>
        <strong>${section.title}</strong>
        <p>${section.description}</p>
      </div>
      <span class="chevron">→</span>`;
    card.addEventListener('click', () => openSection(section));
    list.appendChild(card);
  });
  if (state.pendingThreadId) {
    try {
      await openThread(state.pendingThreadId);
    } catch (err) {
      console.warn('Не удалось открыть тред из ссылки', err);
      state.pendingThreadId = null;
      updateThreadParam(null);
    }
  }
  updateBoardTicker();
}

async function openSection(section) {
  state.currentSection = section;
  document.getElementById('currentSectionTitle').textContent = section.title;
  document.querySelectorAll('.section-card').forEach((card) => {
    const title = card.querySelector('strong')?.textContent || '';
    card.classList.toggle('active', title === section.title);
  });
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
          <p class="thread-author">Автор: ${thread.authorNickname || 'Аноним'}</p>
        </div>
        <div class="thread-counts">
          <span>${thread.stats.replies} ответов</span>
          <span>${thread.views || 0} просмотров</span>
        </div>
      </div>
      <div class="thread-meta">❤ ${thread.likes.length} · ✨ ${thread.thanks.length} · ★ ${thread.favorites.length} ${status}</div>
      <div class="thread-actions">
        <button class="ghost-btn complaint-btn" type="button">Пожаловаться</button>
      </div>`;
    div.addEventListener('click', () => openThread(thread.id));
    div.querySelector('.complaint-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      openComplaint({
        id: thread.id,
        title: thread.title,
        authorNickname: thread.authorNickname,
        authorId: thread.authorId,
        type: 'thread'
      });
    });
    container.appendChild(div);
  });
}

async function openThread(id) {
  const thread = await request(`/api/threads/${id}`);
  state.currentThread = thread;
  state.pendingThreadId = null;
  updateThreadParam(id);
  const view = document.getElementById('threadView');
  view.classList.remove('hidden');
  const replyForm = thread.locked
    ? `<div class="notice">${thread.lockReason === 'frozen' ? 'Тред временно заморожен.' : 'Тред заблокирован.'}</div>`
    : `<form id="replyForm">
        <textarea name="content" rows="3" required placeholder="Ответ..."></textarea>
        <button class="ghost-btn">Ответить</button>
      </form>`;
  view.innerHTML = `
    <div class="thread-title-row">
      <div>
        <h3>${thread.title} <small class="thread-id">${thread.id}</small></h3>
        <p class="thread-author">Автор: ${thread.authorNickname || 'Аноним'}</p>
      </div>
      <div class="thread-counts">
        <span>${thread.views || 0} просмотров</span>
        <button class="ghost-btn" id="threadComplaintBtn" type="button">Пожаловаться</button>
      </div>
    </div>
    <p class="thread-body">${thread.content}</p>
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
  const complaintBtn = document.getElementById('threadComplaintBtn');
  if (complaintBtn) {
    complaintBtn.addEventListener('click', () =>
      openComplaint({
        id: thread.id,
        title: thread.title,
        authorNickname: thread.authorNickname,
        authorId: thread.authorId,
        type: 'thread'
      })
    );
  }
  view.querySelectorAll('[data-post-complaint]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const nickname = decodeURIComponent(btn.dataset.author || '');
      openComplaint({
        id: btn.dataset.postComplaint,
        title: `Ответ в «${thread.title}»`,
        authorNickname: nickname,
        authorId: btn.dataset.authorId,
        type: 'post'
      });
    });
  });
}

function renderPost(post) {
  const author = post.authorNickname || post.authorId;
  const authorId = post.authorId || '';
  return `<div class="post" data-post="${post.id}">
    <div class="meta">${author} · ${new Date(post.createdAt).toLocaleString()}</div>
    <div class="post-body">${post.content}</div>
    <div class="post-actions">
      <button class="ghost-btn tiny" type="button" data-post-complaint="${post.id}" data-author="${encodeURIComponent(author)}" data-author-id="${authorId}">Пожаловаться</button>
    </div>
  </div>`;
}

async function reactThread(id, type) {
  try {
    await request(`/api/threads/${id}/react`, { method: 'POST', body: JSON.stringify({ type }) });
    openThread(id);
    if (!collectionsPanel.classList.contains('hidden')) {
      await loadLibrary();
    }
  } catch (err) {
    alert(err.message);
  }
}

window.addEventListener('DOMContentLoaded', init);
