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
  renderConversationList,
  renderMessages,
  renderFileRepository,
  renderProfile,
  renderSearch,
  renderSettings,
  renderImportExportModal,
  renderComposerHint,
  escapeHTML,
} from './ui.js';
import {
  createWindow,
  focusWindow,
  closeWindow,
  persistState,
  listWindows,
} from './windows.js';
import { animateAvatarPulse, animateMessageSend } from './animations.js';

const CORE_WINDOWS = new Set(['window-chats', 'window-chat', 'window-repo']);
const state = {
  activeConversationId: null,
  windows: {},
};

function selectConversation(conversationId) {
  state.activeConversationId = conversationId;
  if (conversationId) {
    markRead(conversationId);
  }
  updateConversationList();
  updateMessageWindow();
}

function updateConversationList() {
  const conversations = getConversations();
  const container = state.windows.chats?.querySelector('#conversationList');
  if (container) {
    renderConversationList(container, conversations, state.activeConversationId);
  }
}

function updateMessageWindow() {
  const titleEl = state.windows.chat?.querySelector('#conversationTitle');
  const subtitleEl = state.windows.chat?.querySelector('#conversationSubtitle');
  const messageList = state.windows.chat?.querySelector('#messageList');
  if (!titleEl || !subtitleEl || !messageList) return;

  const conversation = state.activeConversationId ? getConversation(state.activeConversationId) : null;
  if (!conversation) {
    titleEl.textContent = 'Выберите чат';
    subtitleEl.textContent = 'История сообщений отобразится здесь';
    messageList.innerHTML = '';
    return;
  }
  titleEl.textContent = conversation.title;
  subtitleEl.textContent = conversation.subtitle || 'Без описания';
  const messages = getMessages(conversation.id);
  renderMessages(messageList, messages);
  const lastMessage = messageList.lastElementChild;
  if (lastMessage) {
    animateMessageSend(lastMessage);
  }
}

function updateRepository() {
  const repoContainer = state.windows.repo?.querySelector('#repoList');
  if (repoContainer) {
    renderFileRepository(repoContainer);
  }
}

function bindConversationInteractions() {
  const list = state.windows.chats?.querySelector('#conversationList');
  if (!list) return;
  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-id]');
    if (!item) return;
    const convId = item.dataset.id;
    selectConversation(convId);
    focusWindow('window-chat');
    if (window.innerWidth < 900) {
      const chatWindow = state.windows.chat;
      if (chatWindow) {
        chatWindow.dataset.state = 'normal';
      }
    }
  });
}

function bindComposer() {
  const form = state.windows.chat?.querySelector('#messageForm');
  const input = state.windows.chat?.querySelector('#messageInput');
  if (!form || !input) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value || !state.activeConversationId) return;
    const message = saveMessage(state.activeConversationId, {
      body: value,
      author: 'Вы',
      outgoing: true,
    });
    input.value = '';
    updateConversationList();
    updateMessageWindow();
    const messageEl = state.windows.chat?.querySelector(`[data-id="${message.id}"]`);
    if (messageEl) {
      animateMessageSend(messageEl);
    }
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
}

function bindRepoControls() {
  const repoWindow = state.windows.repo;
  if (!repoWindow) return;
  repoWindow.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    if (action === 'open-import-export') {
      openImportExportModal();
    } else if (action === 'open-settings') {
      openSettingsWindow();
    } else if (action === 'export-json') {
      openImportExportModal({ presetExport: true });
    } else if (action === 'reset-db') {
      if (confirm('Сбросить локальную базу данных? Это удалит все сообщения.')) {
        resetDb();
        selectConversation(getConversations()[0]?.id || null);
        updateConversationList();
        updateMessageWindow();
        updateRepository();
      }
    }
  });
}

function openImportExportModal(options = {}) {
  const modal = createWindow({
    id: 'window-import-export',
    title: 'Импорт / Экспорт',
    modal: true,
    x: window.innerWidth / 2 - 220,
    y: 120,
    w: 420,
    h: 420,
    contentHtml: '<div id="importExportContainer"></div>',
  });
  const container = modal.querySelector('#importExportContainer');
  const initialJson = options.presetExport ? exportJson() : '';
  renderImportExportModal(container, { initialJson });

  if (!container.dataset.bound) {
    container.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      const textarea = container.querySelector('#modalJsonArea');
      if (action === 'export') {
        textarea.value = exportJson();
        textarea.select();
        if (document.queryCommandSupported?.('copy')) {
          document.execCommand('copy');
        }
      }
      if (action === 'import') {
        try {
          importJson(textarea.value);
          updateConversationList();
          updateMessageWindow();
          alert('Импорт выполнен.');
          closeWindow('window-import-export');
        } catch (error) {
          alert('Ошибка импорта: ' + error.message);
        }
      }
    });
    container.dataset.bound = 'true';
  }
}

function openSearchWindow() {
  const win = createWindow({
    id: 'window-search',
    title: 'Поиск',
    x: window.innerWidth / 2 - 210,
    y: 180,
    w: 420,
    h: 480,
    contentHtml: '<div id="searchWindowContent"></div>',
  });
  const container = win.querySelector('#searchWindowContent');
  if (!win.dataset.initialized) {
    renderSearch(container);
    const form = container.querySelector('#searchForm');
    const results = container.querySelector('#searchResults');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = form.search.value.trim().toLowerCase();
      if (!query) {
        results.innerHTML = '';
        return;
      }
      const conversations = getConversations();
      const matches = conversations
        .flatMap((conversation) => {
          const messages = getMessages(conversation.id);
          return messages
            .filter((message) => message.body.toLowerCase().includes(query))
            .map((message) => ({ conversation, message }));
        });
      if (matches.length === 0) {
        results.innerHTML = '<p class="list__item-subtitle">Ничего не найдено.</p>';
        return;
      }
      results.innerHTML = matches
        .map((match) => `
          <article class="message" role="listitem">
            <div class="message__author">${escapeHTML(match.conversation.title)}</div>
            <div class="message__body">${escapeHTML(match.message.body)}</div>
            <div class="message__meta">${new Date(match.message.createdAt).toLocaleString('ru-RU')}</div>
          </article>
        `)
        .join('');
    });
    results?.setAttribute('role', 'list');
    win.dataset.initialized = 'true';
  }
}

function openSettingsWindow() {
  const win = createWindow({
    id: 'window-settings',
    title: 'Настройки',
    x: window.innerWidth / 2 - 180,
    y: 220,
    w: 360,
    h: 420,
    contentHtml: '<div id="settingsContent"></div>',
  });
  const container = win.querySelector('#settingsContent');
  if (!win.dataset.initialized) {
    renderSettings(container);
    win.dataset.initialized = 'true';
  }
}

function openProfileWindow() {
  const win = createWindow({
    id: 'window-profile',
    title: 'Профиль',
    x: window.innerWidth - 420,
    y: 140,
    w: 360,
    h: 360,
    contentHtml: '<div id="profileContent"></div>',
  });
  const container = win.querySelector('#profileContent');
  if (!win.dataset.initialized) {
    renderProfile(container);
    win.dataset.initialized = 'true';
  }
}

function openNewChatWindow() {
  const id = `window-new-chat-${Date.now()}`;
  const win = createWindow({
    id,
    title: 'Новый чат',
    x: window.innerWidth / 2 - 180,
    y: 200,
    w: 360,
    h: 320,
    contentHtml: `
      <form id="newChatForm" class="card">
        <label class="list__item-title" for="newChatTitle">Название чата</label>
        <input id="newChatTitle" name="title" required placeholder="Например, Проект Альфа" />
        <label class="list__item-title" for="newChatDescription">Описание</label>
        <textarea id="newChatDescription" name="description" rows="3" placeholder="Краткое описание"></textarea>
        <div class="window__actions">
          <button type="submit" class="primary-btn">Создать</button>
          <button type="button" class="ghost-btn" data-action="cancel">Отмена</button>
        </div>
      </form>
    `,
  });
  const form = win.querySelector('#newChatForm');
  const cancelButton = win.querySelector('[data-action="cancel"]');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = form.title.value.trim();
    if (!title) return;
    const subtitle = form.description.value.trim();
    const conversation = createConversation({
      title,
      subtitle,
    });
    updateConversationList();
    selectConversation(conversation.id);
    closeWindow(id);
  });
  cancelButton.addEventListener('click', () => closeWindow(id));
}

function bindWindowGesturesEvents() {
  window.addEventListener('window:swipe', (event) => {
    const { direction } = event.detail;
    const windows = listWindows();
    const activeIndex = windows.findIndex((win) => win.dataset.focused === 'true');
    if (activeIndex === -1) return;
    const offset = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
    if (offset === 0) return;
    const nextIndex = (activeIndex + offset + windows.length) % windows.length;
    focusWindow(windows[nextIndex].id);
  });
}

function bindTopbarControls() {
  const themeToggle = document.getElementById('themeToggle');
  const appRoot = document.getElementById('appRoot');
  themeToggle?.addEventListener('click', () => {
    const current = appRoot.dataset.themeStyle || 'ios';
    const next = current === 'ios' ? 'material' : 'ios';
    appRoot.dataset.themeStyle = next;
    themeToggle.querySelector('.ghost-btn__label').textContent = next === 'ios' ? 'iOS' : 'Material';
    themeToggle.setAttribute('aria-pressed', String(next === 'material'));
  });

  document.getElementById('openSearchButton')?.addEventListener('click', () => openSearchWindow());
  document.getElementById('newChatButton')?.addEventListener('click', () => openNewChatWindow());
  document.getElementById('avatarButton')?.addEventListener('click', () => {
    const avatar = document.getElementById('avatarButton');
    animateAvatarPulse(avatar);
    openProfileWindow();
  });
  document.getElementById('menuButton')?.addEventListener('click', () => {
    const chatsWindow = state.windows.chats;
    if (window.innerWidth < 900 && chatsWindow) {
      const nextState = chatsWindow.dataset.state === 'minimized' ? 'normal' : 'minimized';
      chatsWindow.dataset.state = nextState;
      focusWindow('window-chats');
    } else {
      openSettingsWindow();
    }
  });
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearchWindow();
    }
    if (event.key === 'Escape') {
      const focused = listWindows().find((win) => win.dataset.focused === 'true');
      if (!focused) return;
      if (CORE_WINDOWS.has(focused.id)) {
        if (focused.dataset.state === 'minimized') {
          focused.dataset.state = 'normal';
        } else {
          focused.dataset.state = 'minimized';
        }
      } else {
        closeWindow(focused.id);
      }
    }
  });
}

function handleResize() {
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 900) {
      CORE_WINDOWS.forEach((id) => {
        const win = document.getElementById(id);
        if (win) {
          win.dataset.state = 'normal';
        }
      });
    } else {
      state.windows.repo?.setAttribute('data-state', 'minimized');
      state.windows.chats?.setAttribute('data-state', 'minimized');
    }
  });
}

function setupCoreWindows() {
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 16;
  const isMobile = window.innerWidth < 900;
  const chatsX = isMobile ? gap : 24;
  const chatX = isMobile ? gap : 360;
  const repoX = isMobile ? gap : window.innerWidth - 360 - 32;
  const chats = createWindow({
    id: 'window-chats',
    title: 'Чаты',
    slot: window.innerWidth >= 900 ? 'left' : '',
    x: chatsX,
    y: 140,
    w: 320,
    h: 520,
    contentHtml: `
      <section class="pane" aria-label="Список бесед">
        <header class="pane__header">
          <h2 class="pane__title">Чаты</h2>
        </header>
        <div class="pane__content pane__content--scrollable">
          <div id="conversationList" class="list" role="list" aria-live="polite"></div>
        </div>
        <footer class="window__footer">
          <button class="primary-btn" type="button" data-action="new-chat">Новый чат</button>
        </footer>
      </section>
    `,
  });
  chats.dataset.core = 'true';
  state.windows.chats = chats;

  const chat = createWindow({
    id: 'window-chat',
    title: 'Сообщения',
    slot: window.innerWidth >= 900 ? 'center' : '',
    x: chatX,
    y: 140,
    w: 520,
    h: 580,
    contentHtml: `
      <section class="pane" aria-label="Окно сообщений">
        <header class="pane__header">
          <div>
            <h2 class="pane__title" id="conversationTitle">Чат не выбран</h2>
            <p class="pane__subtitle" id="conversationSubtitle">Выберите беседу слева</p>
          </div>
        </header>
        <div class="pane__content pane__content--messages">
          <div id="messageList" class="message-list" role="log" aria-live="polite" aria-relevant="additions text"></div>
        </div>
        <form class="composer" id="messageForm" autocomplete="off">
          <label class="sr-only" for="messageInput">Введите сообщение</label>
          <textarea id="messageInput" name="message" placeholder="Напишите сообщение…" rows="2" required></textarea>
          <div class="composer__actions">
            <button type="submit" class="primary-btn">Отправить</button>
          </div>
          <div id="composerHint"></div>
        </form>
      </section>
    `,
  });
  chat.dataset.core = 'true';
  state.windows.chat = chat;
  renderComposerHint(chat.querySelector('#composerHint'));

  const repo = createWindow({
    id: 'window-repo',
    title: 'Файлы',
    slot: window.innerWidth >= 900 ? 'right' : '',
    x: repoX,
    y: 140,
    w: 360,
    h: 520,
    contentHtml: `
      <section class="pane" aria-label="Репозиторий файлов">
        <header class="pane__header">
          <h2 class="pane__title">Репозиторий</h2>
          <button class="ghost-btn" type="button" data-action="open-settings" aria-label="Открыть настройки">⚙</button>
        </header>
        <div class="pane__content pane__content--scrollable">
          <div id="repoList"></div>
          <div class="import-export" aria-labelledby="importExportTitle">
            <h3 id="importExportTitle">Данные</h3>
            <div class="import-export__controls">
              <button class="ghost-btn" type="button" data-action="open-import-export">Импорт / Экспорт</button>
              <button class="ghost-btn" type="button" data-action="export-json">Копировать JSON</button>
              <button class="ghost-btn ghost-btn--danger" type="button" data-action="reset-db">Сбросить БД</button>
            </div>
          </div>
        </div>
      </section>
    `,
  });
  repo.dataset.core = 'true';
  state.windows.repo = repo;

  const newChatButton = chats.querySelector('[data-action="new-chat"]');
  newChatButton?.addEventListener('click', () => openNewChatWindow());

  focusWindow('window-chat');
}

function initialize() {
  initDb();
  const firstConversation = getConversations()[0];
  if (firstConversation) {
    state.activeConversationId = firstConversation.id;
  }
  setupCoreWindows();
  updateConversationList();
  updateMessageWindow();
  updateRepository();
  bindConversationInteractions();
  bindComposer();
  bindRepoControls();
  bindWindowGesturesEvents();
  bindTopbarControls();
  setupKeyboardShortcuts();
  handleResize();

  window.addEventListener('beforeunload', () => {
    persistState();
  });

  if (window.innerWidth < 900) {
    state.windows.repo.dataset.state = 'minimized';
    state.windows.chats.dataset.state = 'minimized';
  }
}

initialize();
