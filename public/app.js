const state = {
  user: null,
  sections: [],
  threads: [],
  currentSection: null,
  currentThread: null,
  settings: { title: 'OP.WEB', logo: '' },
  library: { favorites: [], liked: [] },
  pendingThreadId: null,
  chats: [],
  activeChatId: null,
  deviceMode: 'desktop'
};

const onboardingEl = document.getElementById('onboarding');
const forumShell = document.getElementById('forumShell');
const profileBtn = document.getElementById('profileBtn');
const profilePanel = document.getElementById('profilePanel');
const profileLabel = document.getElementById('profileLabel');
const homeButton = document.getElementById('homeButton');
const deviceModeBtn = document.getElementById('deviceModeBtn');
const onboardingDeviceBtn = document.getElementById('onboardingDeviceBtn');
const collectionsBtn = document.getElementById('collectionsBtn');
const collectionsPanel = document.getElementById('collectionsPanel');
const favoriteList = document.getElementById('favoriteList');
const likedList = document.getElementById('likedList');
const messengerBtn = document.getElementById('messengerBtn');
const messengerPanel = document.getElementById('messengerPanel');
const conversationList = document.getElementById('conversationList');
const newChatForm = document.getElementById('newChatForm');
const chatPlaceholder = document.getElementById('chatPlaceholder');
const chatView = document.getElementById('chatView');
const chatMessagesEl = document.getElementById('chatMessages');
const chatTitleEl = document.getElementById('chatTitle');
const chatSendForm = document.getElementById('chatSendForm');
const chatBackBtn = document.getElementById('chatBackBtn');
const refreshChatsBtn = document.getElementById('refreshChatsBtn');
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
const DEVICE_MODE_KEY = 'opweb-device-mode';

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

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderRichText(text) {
  const safe = escapeHtml(text || '').trim();
  if (!safe) return '<p></p>';
  return safe
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n/g, '<br>'))
    .map((block) => `<p>${block}</p>`)
    .join('');
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

function detectDeviceMode() {
  const ua = (navigator.userAgent || '').toLowerCase();
  const matchUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(ua);
  const narrow = typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 768px)').matches
    : window.innerWidth <= 768;
  return matchUA || narrow ? 'mobile' : 'desktop';
}

function getStoredDeviceMode() {
  try {
    return localStorage.getItem(DEVICE_MODE_KEY);
  } catch (err) {
    return null;
  }
}

function setDeviceMode(mode, persist = true) {
  state.deviceMode = mode;
  document.documentElement.setAttribute('data-device', mode);
  updateDeviceButtons(mode);
  if (persist) {
    try {
      localStorage.setItem(DEVICE_MODE_KEY, mode);
    } catch (err) {
      /* ignore quota errors */
    }
  }
}

function updateDeviceButtons(mode) {
  const label = mode === 'mobile' ? 'Полная версия' : 'Версия для телефона';
  [deviceModeBtn, onboardingDeviceBtn].forEach((btn) => {
    if (!btn) return;
    btn.textContent = label;
    btn.setAttribute('aria-pressed', mode === 'mobile');
  });
}

function initDeviceMode() {
  const saved = getStoredDeviceMode();
  if (saved) {
    setDeviceMode(saved, false);
  } else {
    setDeviceMode(detectDeviceMode(), false);
  }
  const toggleButtons = [deviceModeBtn, onboardingDeviceBtn].filter(Boolean);
  toggleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = state.deviceMode === 'mobile' ? 'desktop' : 'mobile';
      setDeviceMode(next, true);
    });
  });
  if (typeof window.matchMedia === 'function') {
    const query = window.matchMedia('(max-width: 768px)');
    const syncSystemMode = () => {
      if (!getStoredDeviceMode()) {
        setDeviceMode(detectDeviceMode(), false);
      }
    };
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', syncSystemMode);
    } else if (typeof query.addListener === 'function') {
      query.addListener(syncSystemMode);
    }
  }
}

async function loadCaptcha() {
  const captcha = await request('/api/auth/captcha');
  document.querySelector('#registerForm [name="captchaId"]').value = captcha.captchaId;
  document.getElementById('captchaQuestion').textContent = captcha.question;
}

async function init() {
  initDeviceMode();
  await loadSettings();
  bindAuth();
  bindThreadForm();
  bindProfilePanel();
  bindHomeNavigation();
  bindCollectionsPanel();
  bindMessengerPanel();
  bindComplaintPanel();
  bindTwoFactorModal();
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
    data.remember = loginForm.remember ? loginForm.remember.checked : false;
    try {
      const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
      if (result.twoFactor) {
        openTwoFactorModal(result.challengeId, async () => {
          await refreshProfile();
          loginForm.reset();
        });
        return;
      }
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
    await loadChats();
    messengerPanel.classList.remove('hidden');
  });
  if (closeBtn) closeBtn.addEventListener('click', () => messengerPanel.classList.add('hidden'));
  messengerPanel.addEventListener('click', (event) => {
    if (event.target === messengerPanel) messengerPanel.classList.add('hidden');
  });
  if (conversationList) {
    conversationList.addEventListener('click', (e) => {
      const item = e.target.closest('li[data-chat]');
      if (!item) return;
      openChat(item.dataset.chat);
    });
  }
  if (newChatForm) {
    newChatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.user) {
        showOnboarding();
        return;
      }
      const payload = Object.fromEntries(new FormData(newChatForm));
      payload.toNickname = (payload.toNickname || '').trim();
      payload.content = (payload.content || '').trim();
      if (!payload.toNickname || !payload.content) return;
      try {
        const conversation = await request('/api/messages', { method: 'POST', body: JSON.stringify(payload) });
        upsertChat(conversation);
        state.activeChatId = conversation.id;
        newChatForm.reset();
        renderMessengerView();
      } catch (err) {
        alert(err.message);
      }
    });
  }
  if (chatSendForm) {
    chatSendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.user) {
        showOnboarding();
        return;
      }
      if (!state.activeChatId) return;
      const payload = Object.fromEntries(new FormData(chatSendForm));
      const content = (payload.content || '').trim();
      if (!content) return;
      try {
        const conversation = await request('/api/messages', {
          method: 'POST',
          body: JSON.stringify({ conversationId: state.activeChatId, content })
        });
        upsertChat(conversation);
        chatSendForm.reset();
        renderMessengerView();
      } catch (err) {
        alert(err.message);
      }
    });
  }
  if (chatBackBtn) {
    chatBackBtn.addEventListener('click', () => {
      state.activeChatId = null;
      renderMessengerView();
    });
  }
  if (refreshChatsBtn) {
    refreshChatsBtn.addEventListener('click', () => {
      loadChats(state.activeChatId);
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

function getChatPeer(chat) {
  if (!chat || !Array.isArray(chat.participants)) return null;
  if (!state.user) return chat.participants[0];
  return chat.participants.find((p) => p.id !== state.user.id) || chat.participants[0];
}

function upsertChat(conversation) {
  if (!conversation) return;
  const idx = state.chats.findIndex((chat) => chat.id === conversation.id);
  if (idx === -1) {
    state.chats = [conversation, ...state.chats];
  } else {
    state.chats.splice(idx, 1, conversation);
  }
  state.chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function renderMessengerView() {
  renderChatList();
  renderActiveChat();
}

function renderChatList() {
  if (!conversationList) return;
  if (!state.chats.length) {
    conversationList.innerHTML = '<li class="muted">Нет бесед</li>';
    return;
  }
  conversationList.innerHTML = '';
  state.chats.forEach((chat) => {
    const item = document.createElement('li');
    item.dataset.chat = chat.id;
    if (chat.id === state.activeChatId) {
      item.classList.add('active');
    }
    const head = document.createElement('div');
    head.className = 'chat-preview';
    const title = document.createElement('strong');
    const peer = getChatPeer(chat);
    title.textContent = peer ? peer.nickname : 'Беседа';
    head.appendChild(title);
    if (chat.unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'chat-unread';
      badge.textContent = chat.unreadCount > 9 ? '9+' : chat.unreadCount;
      head.appendChild(badge);
    }
    item.appendChild(head);
    const meta = document.createElement('div');
    meta.className = 'chat-meta';
    const excerpt = document.createElement('span');
    excerpt.textContent = chat.lastMessage ? chat.lastMessage.content.slice(0, 80) : 'Нет сообщений';
    const time = document.createElement('span');
    time.textContent = chat.lastMessage ? new Date(chat.lastMessage.createdAt).toLocaleString() : '—';
    meta.append(excerpt, time);
    item.appendChild(meta);
    conversationList.appendChild(item);
  });
}

function renderActiveChat() {
  if (!chatPlaceholder || !chatView) return;
  const chat = state.chats.find((entry) => entry.id === state.activeChatId);
  if (!chat) {
    chatPlaceholder.classList.remove('hidden');
    chatView.classList.add('hidden');
    return;
  }
  chatPlaceholder.classList.add('hidden');
  chatView.classList.remove('hidden');
  if (chatTitleEl) {
    const peer = getChatPeer(chat);
    chatTitleEl.textContent = peer ? peer.nickname : 'Беседа';
  }
  if (chatMessagesEl) {
    chatMessagesEl.innerHTML = '';
    chat.messages.forEach((message) => {
      const bubble = document.createElement('div');
      bubble.classList.add('chat-bubble');
      if (message.authorId === state.user?.id) {
        bubble.classList.add('self');
      }
      const body = document.createElement('p');
      body.textContent = message.content;
      const meta = document.createElement('span');
      const authorLabel = message.authorId === state.user?.id ? 'Вы' : message.authorNickname;
      meta.textContent = `${authorLabel} · ${new Date(message.createdAt).toLocaleString()}`;
      bubble.append(body, meta);
      chatMessagesEl.appendChild(bubble);
    });
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
  if (chat.unreadCount > 0) {
    markChatRead(chat.id);
  }
}

async function markChatRead(chatId) {
  try {
    const updated = await request(`/api/messages/${chatId}/read`, { method: 'POST', body: JSON.stringify({}) });
    upsertChat(updated);
    renderChatList();
  } catch (err) {
    console.warn('Не удалось отметить чат прочитанным', err);
  }
}

async function loadChats(preselectId) {
  if (!state.user) return;
  try {
    const data = await request('/api/messages');
    state.chats = Array.isArray(data) ? data : [];
    if (preselectId) {
      state.activeChatId = preselectId;
    }
    if (state.activeChatId && !state.chats.some((chat) => chat.id === state.activeChatId)) {
      state.activeChatId = state.chats[0]?.id || null;
    }
    if (!state.activeChatId && state.chats.length) {
      state.activeChatId = state.chats[0].id;
    }
    renderMessengerView();
  } catch (err) {
    console.warn('Не удалось загрузить чаты', err);
  }
}

function openChat(chatId) {
  state.activeChatId = chatId;
  renderMessengerView();
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
  state.chats = [];
  state.activeChatId = null;
  renderMessengerView();
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
    <div class="thread-body">${renderRichText(thread.content)}</div>
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
    <div class="post-body">${renderRichText(post.content)}</div>
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
