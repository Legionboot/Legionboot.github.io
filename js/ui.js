// UI-функции: рендер списков, сообщений и панели файлов.
// Комментарии подчёркивают точки расширения для будущих интеграций (например, с реальным API).

import { db } from './db.js';
import { windowManager } from './windows.js';
import { animateAvatar, animateWindowOpen } from './animations.js';

const conversationListEl = document.getElementById('conversationList');
const messageViewEl = document.getElementById('messageView');
const conversationTitleEl = document.getElementById('conversationTitle');
const conversationStatusEl = document.getElementById('conversationStatus');
const repoListEl = document.getElementById('repoList');
const templates = {
  conversation: document.getElementById('conversationItemTemplate'),
  message: document.getElementById('messageBubbleTemplate'),
  repo: document.getElementById('repoItemTemplate'),
};

let lastConversationState = null;

export const ui = {
  renderConversations,
  renderMessages,
  renderRepo,
  showRepoWindow,
  openSearchWindow,
  bindProfileAnimation,
  flashConversation,
  enhanceWindow,
};

function renderConversations(state) {
  lastConversationState = state;
  const conversations = db.getConversations();
  conversationListEl.innerHTML = '';
  conversations.forEach((conv) => {
    const node = templates.conversation.content.firstElementChild.cloneNode(true);
    node.querySelector('.conversation-name').textContent = conv.name;
    node.querySelector('.conversation-time').textContent = formatTime(conv.lastMessageAt);
    const unreadEl = node.querySelector('.conversation-unread');
    unreadEl.textContent = conv.unread > 0 ? conv.unread : '';
    node.setAttribute('aria-selected', conv.id === state.activeConversationId ? 'true' : 'false');
    node.dataset.convId = conv.id;
    node.addEventListener('click', () => state.onSelectConversation(conv.id));
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        state.onSelectConversation(conv.id);
      }
    });
    conversationListEl.appendChild(node);
  });
}

function renderMessages(convId) {
  const conversation = db.getConversation(convId);
  const messages = db.getMessages(convId, { limit: 200 });
  conversationTitleEl.textContent = conversation?.name || 'Новая беседа';
  conversationStatusEl.textContent = conversation ? conversation.description : 'Создайте беседу, чтобы начать общение.';
  messageViewEl.innerHTML = '';
  messages.forEach((msg) => {
    const node = templates.message.content.firstElementChild.cloneNode(true);
    node.querySelector('.message-author').textContent = msg.author;
    node.querySelector('.message-time').textContent = formatTime(msg.createdAt);
    node.querySelector('.message-text').innerHTML = msg.text.replaceAll('\n', '<br/>');
    if (msg.author === 'Вы') {
      node.classList.add('self');
    }
    messageViewEl.appendChild(node);
  });
  messageViewEl.scrollTo({ top: messageViewEl.scrollHeight, behavior: 'smooth' });
}

function renderRepo() {
  const files = db.getFiles();
  repoListEl.innerHTML = '';
  files.forEach((file) => {
    const node = templates.repo.content.firstElementChild.cloneNode(true);
    node.querySelector('.repo-name').textContent = file.name;
    node.querySelector('.repo-sub').textContent = `${file.note} · ${file.size}`;
    node.dataset.fileId = file.id;
    node.tabIndex = 0;
    node.addEventListener('dblclick', () => showRepoWindow(file));
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        showRepoWindow(file);
      }
    });
    repoListEl.appendChild(node);
  });
}

function showRepoWindow(fileMeta) {
  const windowId = `repo-${fileMeta?.id || 'list'}`;
  const contentHtml = `
    <div class="repo-window" data-file="${fileMeta?.id || 'all'}">
      <h3>${fileMeta ? fileMeta.name : 'Репозиторий файлов'}</h3>
      <p>${fileMeta ? fileMeta.note : 'Все доступные документы и материалы.'}</p>
      <ul>
        ${db
          .getFiles()
          .map((f) => `<li>${f.name} — <span>${f.note}</span></li>`)
          .join('')}
      </ul>
      <button class="ghost-button" data-action="close">Закрыть</button>
    </div>
  `;
  const existing = windowManager.getWindow(windowId);
  if (existing) {
    windowManager.focusWindow(windowId);
    return existing;
  }
  const win = windowManager.createWindow({
    id: windowId,
    title: fileMeta ? `Файл: ${fileMeta.name}` : 'Репозиторий файлов',
    contentHtml,
    x: 80,
    y: 120,
    w: 320,
    h: 260,
  });
  enhanceWindow(windowId, win);
  animateWindowOpen(win);
  return win;
}

function openSearchWindow() {
  const windowId = 'search-quick';
  if (windowManager.getWindow(windowId)) {
    windowManager.focusWindow(windowId);
    return;
  }
  const contentHtml = `
    <form class="search-window" autocomplete="off">
      <label class="sr-only" for="searchQuery">Поиск</label>
      <input id="searchQuery" type="search" placeholder="Введите запрос…" />
      <p>Поддерживаются команды: <code>/новая</code>, <code>/файл</code>, <code>/сброс</code>.</p>
    </form>
  `;
  const win = windowManager.createWindow({
    id: windowId,
    title: 'Поиск',
    contentHtml,
    x: 120,
    y: 160,
    w: 360,
    h: 200,
  });
  enhanceWindow(windowId, win);
  animateWindowOpen(win);
  const form = win.querySelector('form');
  if (form) setTimeout(() => form.searchQuery.focus(), 50);
}

function bindProfileAnimation(button) {
  button.addEventListener('click', () => animateAvatar(button));
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      animateAvatar(button);
    }
  });
}

function flashConversation(convId) {
  const target = conversationListEl.querySelector(`[data-conv-id="${convId}"]`);
  if (target) {
    target.classList.add('highlight');
    setTimeout(() => target.classList.remove('highlight'), 800);
  }
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function enhanceWindow(id, win) {
  if (!win) return;
  if (id === 'search-quick') {
    const form = win.querySelector('form');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const query = form.searchQuery.value.trim();
        if (query === '/сброс') {
          db.resetDb();
          const state = lastConversationState || { activeConversationId: null, onSelectConversation: () => {} };
          renderConversations(state);
          renderRepo();
        }
      });
    }
  }
  if (id.startsWith('repo-')) {
    const closeBtn = win.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => windowManager.closeWindow(id));
    }
  }
}
