// Точка входа приложения. Здесь связываются UI, БД и менеджер окон.
// Для расширения: внедрите роутер или синхронизацию с сервером/WebRTC.

import {
  init as initDb,
  getConversations,
  getConversation,
  getMessages,
  saveMessage,
  createConversation,
  markRead,
  exportJson,
  importJson,
  resetDb,
} from './db.js';
import {
  initUI,
  renderConversationList,
  renderConversationHeader,
  renderMessages,
  appendMessage,
  updateFiles,
  updateStatus,
} from './ui.js';
import {
  createWindow,
  focusWindow,
  closeWindow,
} from './windows.js';
import { pulseAvatar } from './animations.js';

const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const newChatButton = document.getElementById('newChatButton');
const exportDbButton = document.getElementById('exportDbButton');
const importDbButton = document.getElementById('importDbButton');
const resetDbButton = document.getElementById('resetDbButton');
const dbJsonArea = document.getElementById('dbJsonArea');
const avatarButton = document.getElementById('avatarButton');
const themeToggle = document.getElementById('themeToggle');
const appRoot = document.getElementById('appRoot');
const openChatWindowButton = document.getElementById('openChatWindowButton');
const openRepoWindowButton = document.getElementById('openRepoWindowButton');
const menuButton = document.getElementById('menuButton');

const keyboardState = {
  openWindows: [],
};

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

let currentConversationId = null;
let files = [
  { name: 'Памятка по жестам.pdf', meta: 'Обновлено 3 ч назад' },
  { name: 'Чек-лист запуска.txt', meta: 'Добавил Антон' },
  { name: 'Концепт MonoFlow.fig', meta: 'Файл доступен оффлайн' },
];

function bootstrap() {
  initDb();
  initUI({
    onSelectConversation: selectConversation,
    onOpenConversationWindow: () => openConversationWindow(currentConversationId),
    onOpenRepoWindow: openRepositoryWindow,
    onAvatarClick: () => {
      pulseAvatar(avatarButton);
      openProfileWindow();
    },
  });

  renderConversations();
  updateFiles(files);
  bindEvents();
  updateStatus('Локальные данные загружены');
}

function renderConversations() {
  const conversations = getConversations();
  renderConversationList(conversations, currentConversationId);
  if (!currentConversationId && conversations.length) {
    selectConversation(conversations[0].id);
  }
}

function selectConversation(conversationId) {
  const conversation = getConversation(conversationId);
  if (!conversation) return;
  currentConversationId = conversationId;
  renderConversationHeader(conversation);
  renderMessages(getMessages(conversationId));
  markRead(conversationId);
  renderConversations();
}

function bindEvents() {
  messageForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentConversationId) return;
    const text = messageInput.value.trim();
    if (!text) return;
    const stored = saveMessage(currentConversationId, {
      body: text,
      outgoing: true,
      author: 'Вы',
    });
    appendMessage(stored);
    messageInput.value = '';
    renderConversations();
  });

  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      messageForm.requestSubmit();
    }
  });

  newChatButton.addEventListener('click', () => {
    const title = prompt('Название беседы?');
    if (!title) return;
    const conv = createConversation({
      title,
      subtitle: 'Создано вручную',
      participants: ['Вы'],
    });
    renderConversations();
    selectConversation(conv.id);
    updateStatus(`Создан чат «${title}»`);
  });

  exportDbButton.addEventListener('click', () => {
    dbJsonArea.value = exportJson();
    dbJsonArea.focus();
    dbJsonArea.select();
    updateStatus('JSON экспортирован');
  });

  importDbButton.addEventListener('click', () => {
    if (!dbJsonArea.value.trim()) return;
    try {
      importJson(dbJsonArea.value);
      renderConversations();
      if (currentConversationId) {
        renderMessages(getMessages(currentConversationId));
      }
      updateStatus('JSON импортирован');
    } catch (err) {
      alert('Ошибка импорта: ' + err.message);
    }
  });

  resetDbButton.addEventListener('click', () => {
    if (confirm('Сбросить локальные данные?')) {
      resetDb();
      renderConversations();
      currentConversationId = null;
      renderConversationHeader(null);
      renderMessages([]);
      updateStatus('База данных сброшена');
    }
  });

  themeToggle.addEventListener('click', toggleTheme);
  menuButton.addEventListener('click', openWindowManagerOverview);

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearchWindow();
    }
    if (event.key === 'Escape') {
      const last = keyboardState.openWindows.pop();
      if (last) {
        closeWindow(last);
      }
    }
  });

  openChatWindowButton.addEventListener('click', () => openConversationWindow(currentConversationId));
  openRepoWindowButton.addEventListener('click', openRepositoryWindow);

  window.addEventListener('window:opened', (event) => {
    if (event.detail?.id) {
      pushWindow(event.detail.id);
    }
  });

  window.addEventListener('window:closed', (event) => {
    if (event.detail?.id) {
      removeWindow(event.detail.id);
    }
  });
}

function toggleTheme() {
  const current = appRoot.dataset.themeStyle === 'ios' ? 'material' : 'ios';
  appRoot.dataset.themeStyle = current;
  themeToggle.querySelector('.ghost-btn__label').textContent = current === 'ios' ? 'iOS' : 'Material';
  updateStatus(`Тема переключена: ${current}`);
}

function openConversationWindow(conversationId) {
  if (!conversationId) return;
  const conversation = getConversation(conversationId);
  if (!conversation) return;
  const messages = getMessages(conversationId);
  const content = `
    <div class="window-chat" data-conversation-id="${conversationId}">
      <header class="window-chat__header">
        <strong>${escapeHtml(conversation.title)}</strong>
        <span>${escapeHtml(conversation.participants?.join(', ') || '')}</span>
      </header>
      <div class="window-chat__messages">
        ${messages.map((msg) => `<p><span>${escapeHtml(msg.author)}:</span> ${escapeHtml(msg.body)}</p>`).join('')}
      </div>
    </div>
  `;
  createWindow({
    id: `chat-${conversationId}`,
    title: conversation.title,
    contentHtml: content,
    x: 120,
    y: 120,
    w: 360,
    h: 420,
  });
  pushWindow(`chat-${conversationId}`);
}

function openRepositoryWindow() {
  const content = `
    <ul class="window-files">
      ${files.map((file) => `<li><strong>${escapeHtml(file.name)}</strong><br><small>${escapeHtml(file.meta)}</small></li>`).join('')}
    </ul>
  `;
  createWindow({
    id: 'repo-window',
    title: 'Репозиторий файлов',
    contentHtml: content,
    x: 200,
    y: 140,
    w: 320,
    h: 360,
  });
  pushWindow('repo-window');
}

function openProfileWindow() {
  const content = `
    <section class="window-profile">
      <h4>Профиль</h4>
      <p>Имя: Вы</p>
      <p>Роль: Дизайнер прототипов</p>
      <p>Статус: В сети</p>
      <button class="primary-btn" id="profileLogoutBtn">Выйти (демо)</button>
    </section>
  `;
  const record = createWindow({
    id: 'profile-window',
    title: 'Профиль',
    contentHtml: content,
    x: window.innerWidth / 2 - 180,
    y: 140,
    w: 320,
    h: 280,
    modal: true,
  });
  pushWindow('profile-window');
  record.body.querySelector('#profileLogoutBtn').addEventListener('click', () => {
    alert('Пока что это демо. Здесь можно интегрировать real login.');
  });
}

function openSearchWindow() {
  const content = `
    <form class="window-search" id="windowSearchForm">
      <label>Поиск по чатам</label>
      <input type="search" name="query" placeholder="Введите запрос" autofocus />
      <div class="window-search__results" id="windowSearchResults"></div>
    </form>
  `;
  const record = createWindow({
    id: 'search-window',
    title: 'Поиск',
    contentHtml: content,
    x: window.innerWidth / 2 - 220,
    y: 80,
    w: 360,
    h: 320,
  });
  pushWindow('search-window');
  const form = record.body.querySelector('#windowSearchForm');
  const results = record.body.querySelector('#windowSearchResults');
  form.addEventListener('input', (event) => {
    const query = event.target.value.toLowerCase();
    const matches = getConversations().filter((conv) => conv.title.toLowerCase().includes(query));
    results.innerHTML = matches
      .map((conv) => `<button type="button" data-id="${conv.id}" class="ghost-btn">${escapeHtml(conv.title)}</button>`)
      .join('');
  });
  results.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    selectConversation(button.dataset.id);
    focusWindow(`chat-${button.dataset.id}`);
  });
}

function openWindowManagerOverview() {
  const content = `
    <section class="window-overview">
      <h4>Окна</h4>
      <p>Используйте жесты pinch/rotate для изменения размеров и угла.</p>
      <ul>${keyboardState.openWindows.map((id) => `<li>${id}</li>`).join('')}</ul>
      <p>Сочетания клавиш: Ctrl/Cmd+K — поиск, Esc — закрыть активное окно.</p>
    </section>
  `;
  createWindow({
    id: 'window-overview',
    title: 'Менеджер окон',
    contentHtml: content,
    x: 80,
    y: 220,
    w: 300,
    h: 260,
  });
  pushWindow('window-overview');
}

function pushWindow(id) {
  keyboardState.openWindows = keyboardState.openWindows.filter((existing) => existing !== id);
  keyboardState.openWindows.push(id);
}

function removeWindow(id) {
  keyboardState.openWindows = keyboardState.openWindows.filter((existing) => existing !== id);
}

bootstrap();
