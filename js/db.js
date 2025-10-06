// Локальная "БД" поверх localStorage с простой схемой.
// TODO: заменить на реальную синхронизацию или REST/WebSocket API при подключении бэкенда.

const DB_KEY = 'local_messenger_db_v1';

const clone = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const seedData = {
  conversations: [
    {
      id: 'conv-ux-lab',
      name: 'UX-лаборатория',
      description: 'Дизайнеры и исследователи',
      unread: 2,
      lastMessageAt: Date.now() - 1000 * 60 * 12,
    },
    {
      id: 'conv-quantum',
      name: 'Квантовый поток',
      description: 'Обсуждаем гипотезы и эксперименты',
      unread: 0,
      lastMessageAt: Date.now() - 1000 * 60 * 45,
    },
  ],
  messages: {
    'conv-ux-lab': [
      {
        id: 'm1',
        author: 'Анна',
        text: 'Всем привет! Готовим монохромную тему для демо.',
        createdAt: Date.now() - 1000 * 60 * 60,
      },
      {
        id: 'm2',
        author: 'Илья',
        text: 'Добавил новые прототипы жестов, проверьте в Figma.',
        createdAt: Date.now() - 1000 * 60 * 40,
      },
      {
        id: 'm3',
        author: 'Вы',
        text: 'Приму во внимание. Сейчас тестирую анимации.',
        createdAt: Date.now() - 1000 * 60 * 12,
      },
    ],
    'conv-quantum': [
      {
        id: 'm4',
        author: 'Мария',
        text: 'Сегодня созвон по статусу эксперимента в 18:00.',
        createdAt: Date.now() - 1000 * 60 * 55,
      },
      {
        id: 'm5',
        author: 'Вы',
        text: 'Уточнил график у лаборатории, всё подтверждено.',
        createdAt: Date.now() - 1000 * 60 * 45,
      },
    ],
  },
  files: [
    { id: 'file-roadmap', name: 'Дорожная карта.pdf', note: 'План на квартал', size: '2.4 МБ' },
    { id: 'file-brand', name: 'Бренд-гайд.fig', note: 'Компоненты UI', size: '1.2 МБ' },
    { id: 'file-audio', name: 'Стенограмма.m4a', note: 'Интервью с пользователями', size: '8.5 МБ' },
  ],
  windows: {},
};

function readDb() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Ошибка чтения БД, будет выполнен сброс', err);
    return null;
  }
}

function writeDb(data) {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
}

function ensureDb(seed = false) {
  let db = readDb();
  if (!db && seed) {
    db = clone(seedData);
    writeDb(db);
  }
  return db || clone(seedData);
}

function init(seed = false) {
  const db = ensureDb(seed);
  writeDb(db);
  return db;
}

function getDb() {
  return ensureDb(true);
}

function updateDb(mutator) {
  const db = getDb();
  mutator(db);
  writeDb(db);
  return db;
}

function getConversations() {
  const db = getDb();
  return [...db.conversations].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

function getConversation(id) {
  const db = getDb();
  return db.conversations.find((c) => c.id === id) || null;
}

function getMessages(convId, opts = {}) {
  const { limit = 50 } = opts;
  const db = getDb();
  const messages = db.messages[convId] || [];
  return messages.slice(-limit);
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2, 8)}`;
}

function saveMessage(convId, message) {
  const safeMessage = {
    ...message,
    id: message.id || createId('msg'),
    createdAt: message.createdAt || Date.now(),
    text: escapeHtml(message.text || ''),
  };
  return updateDb((db) => {
    if (!db.messages[convId]) {
      db.messages[convId] = [];
    }
    db.messages[convId].push(safeMessage);
    const conversation = db.conversations.find((c) => c.id === convId);
    if (conversation) {
      conversation.lastMessageAt = safeMessage.createdAt;
      if (safeMessage.author !== 'Вы') {
        conversation.unread = (conversation.unread || 0) + 1;
      }
    }
  });
}

function createConversation(meta) {
  const newConv = {
    id: createId('conv'),
    name: escapeHtml(meta.name || 'Новая беседа'),
    description: escapeHtml(meta.description || 'Без описания'),
    unread: 0,
    lastMessageAt: Date.now(),
  };
  return updateDb((db) => {
    db.conversations.push(newConv);
    db.messages[newConv.id] = [];
  });
}

function markRead(convId) {
  return updateDb((db) => {
    const conv = db.conversations.find((c) => c.id === convId);
    if (conv) {
      conv.unread = 0;
    }
  });
}

function resetDb() {
  writeDb(clone(seedData));
  return getDb();
}

function exportJson() {
  const db = getDb();
  return JSON.stringify(db, null, 2);
}

function importJson(json) {
  try {
    const parsed = JSON.parse(json);
    writeDb(parsed);
    return parsed;
  } catch (err) {
    throw new Error('Не удалось импортировать JSON: ' + err.message);
  }
}

function getFiles() {
  const db = getDb();
  return db.files || [];
}

function saveWindowState(id, data) {
  return updateDb((db) => {
    db.windows[id] = { ...db.windows[id], ...data };
  });
}

function getWindowState(id) {
  const db = getDb();
  return db.windows?.[id] || null;
}

function getAllWindowStates() {
  const db = getDb();
  return db.windows || {};
}

function removeWindowState(id) {
  return updateDb((db) => {
    if (db.windows) {
      delete db.windows[id];
    }
  });
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export const db = {
  init,
  getConversations,
  getConversation,
  getMessages,
  saveMessage,
  createConversation,
  markRead,
  resetDb,
  exportJson,
  importJson,
  getFiles,
  saveWindowState,
  getWindowState,
  getAllWindowStates,
  removeWindowState,
};
