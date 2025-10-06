// Точка входа. Инициализация локальной БД, связывание UI и менеджера окон.
// В этом файле можно подключать будущий роутер или интеграции с push-уведомлениями.

import { db } from './db.js';
import { ui } from './ui.js';
import { windowManager } from './windows.js';

const state = {
  activeConversationId: null,
  onSelectConversation: handleSelectConversation,
};

document.addEventListener('DOMContentLoaded', () => {
  db.init(true);
  hydrateTheme();
  restoreWindows();
  ui.renderConversations(state);
  ui.renderRepo();
  bindUi();
});

function bindUi() {
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');
  const newConversationBtn = document.getElementById('newConversation');
  const themeToggle = document.getElementById('themeToggle');
  const openRepoWindowBtn = document.getElementById('openRepoWindow');
  const exportBtn = document.getElementById('exportDb');
  const importBtn = document.getElementById('importDb');
  const resetBtn = document.getElementById('resetDb');
  const dbJson = document.getElementById('dbJson');
  const profileButton = document.getElementById('profileButton');
  const openSearch = document.getElementById('openSearch');

  ui.bindProfileAnimation(profileButton);

  messageForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.activeConversationId) return;
    const text = messageInput.value.trim();
    if (!text) return;
    db.saveMessage(state.activeConversationId, { author: 'Вы', text });
    messageInput.value = '';
    autoSizeTextarea(messageInput);
    ui.renderMessages(state.activeConversationId);
    ui.renderConversations(state);
  });

  messageInput.addEventListener('input', () => autoSizeTextarea(messageInput));
  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      messageForm.requestSubmit();
    }
  });

  newConversationBtn.addEventListener('click', () => {
    const name = prompt('Название беседы');
    if (!name) return;
    db.createConversation({ name });
    ui.renderConversations(state);
  });

  themeToggle.addEventListener('click', toggleTheme);
  openRepoWindowBtn.addEventListener('click', () => ui.showRepoWindow({}));
  exportBtn.addEventListener('click', () => {
    dbJson.value = db.exportJson();
    dbJson.focus();
    dbJson.select();
  });
  importBtn.addEventListener('click', () => {
    try {
      db.importJson(dbJson.value);
      ui.renderConversations(state);
      if (state.activeConversationId) ui.renderMessages(state.activeConversationId);
      ui.renderRepo();
    } catch (err) {
      alert(err.message);
    }
  });
  resetBtn.addEventListener('click', () => {
    db.resetDb();
    ui.renderConversations(state);
    ui.renderRepo();
    state.activeConversationId = null;
  });

  openSearch.addEventListener('click', ui.openSearchWindow);

  document.addEventListener('keydown', handleGlobalShortcuts);
}

function handleSelectConversation(convId) {
  state.activeConversationId = convId;
  db.markRead(convId);
  ui.renderMessages(convId);
  ui.renderConversations(state);
}

function autoSizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function handleGlobalShortcuts(event) {
  const isMac = navigator.platform.includes('Mac');
  const metaKey = isMac ? event.metaKey : event.ctrlKey;
  if (metaKey && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    ui.openSearchWindow();
  }
  if (event.key === 'Escape') {
    const activeWindow = document.querySelector('.floating-window[data-active="true"]');
    if (activeWindow) {
      windowManager.closeWindow(activeWindow.dataset.id);
    }
  }
}

function hydrateTheme() {
  const stored = localStorage.getItem('legion-theme-style');
  if (stored) {
    document.documentElement.dataset.theme = stored;
  }
  document.documentElement.setAttribute('data-theme', document.documentElement.dataset.theme || 'ios');
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || 'ios';
  const next = current === 'ios' ? 'material' : 'ios';
  document.documentElement.dataset.theme = next;
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('legion-theme-style', next);
  document.querySelectorAll('.floating-window').forEach((win) => {
    win.dataset.theme = next;
  });
}

function restoreWindows() {
  const stored = db.getAllWindowStates();
  Object.entries(stored).forEach(([id, rect]) => {
    const win = windowManager.createWindow({
      id,
      title: rect.title || 'Окно',
      contentHtml: rect.contentHtml || '<p>Содержимое окна потеряно</p>',
      x: rect.x ?? 80,
      y: rect.y ?? 120,
      w: rect.w ?? 320,
      h: rect.h ?? 240,
    });
    ui.enhanceWindow(id, win);
  });
}
