// Локальная база данных на основе localStorage.
// В этом модуле можно перейти на IndexedDB или реальный REST API, сохранив интерфейс функций.

const STORAGE_KEY = 'local_messenger_db_v1';

const defaultData = {
  conversations: [
    {
      id: 'team-design',
      title: 'Команда дизайна',
      subtitle: 'Визуальные апдейты для iOS 17',
      unreadCount: 2,
      participants: ['Вы', 'Алина', 'Макс'],
      lastMessageAt: Date.now() - 1000 * 60 * 3,
    },
    {
      id: 'infra-sync',
      title: 'Infra Sync',
      subtitle: 'Обновления инфраструктуры',
      unreadCount: 0,
      participants: ['Вы', 'Павел', 'Света'],
      lastMessageAt: Date.now() - 1000 * 60 * 45,
    },
  ],
  messages: {
    'team-design': [
      {
        id: 'm1',
        author: 'Алина',
        body: 'Привет! Новая версия макета готова, посмотри во вложении.',
        createdAt: Date.now() - 1000 * 60 * 60,
        outgoing: false,
      },
      {
        id: 'm2',
        author: 'Вы',
        body: 'Отлично! Отмечу пару комментариев и заапрувлю.',
        createdAt: Date.now() - 1000 * 60 * 55,
        outgoing: true,
      },
      {
        id: 'm3',
        author: 'Макс',
        body: 'Добавил жест pinch для увеличения артбордов, проверьте.',
        createdAt: Date.now() - 1000 * 60 * 45,
        outgoing: false,
      },
    ],
    'infra-sync': [
      {
        id: 'm4',
        author: 'Павел',
        body: 'Катим обновление серверов в 23:00, давайте протестим резервный кластер.',
        createdAt: Date.now() - 1000 * 60 * 240,
        outgoing: false,
      },
      {
        id: 'm5',
        author: 'Вы',
        body: 'Ок, я проверю скрипты для health-check и отпишусь.',
        createdAt: Date.now() - 1000 * 60 * 180,
        outgoing: true,
      },
      {
        id: 'm6',
        author: 'Света',
        body: 'Добавила отчёт в репозиторий файлов. См. раздел «Мониторинг».',
        createdAt: Date.now() - 1000 * 60 * 120,
        outgoing: false,
      },
    ],
  },
};

function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Не удалось прочитать localStorage, используем дефолтные данные', error);
    return null;
  }
}

function persistDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  return db;
}

function ensureDb(seed = false) {
  let db = loadDb();
  if (!db || seed) {
    const clone = typeof structuredClone === 'function'
      ? structuredClone(defaultData)
      : JSON.parse(JSON.stringify(defaultData));
    db = clone;
    // При желании можно подтягивать данные с бэкенда:
    // fetch('/api/conversations').then(...)
    persistDb(db);
  }
  return db;
}

function nextMessageId(convId, messages) {
  const index = messages.length + 1;
  return `${convId}-${index}-${Date.now()}`;
}

export function init(seed = false) {
  return ensureDb(seed);
}

export function getConversations() {
  const db = ensureDb();
  return [...db.conversations].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export function getConversation(convId) {
  const db = ensureDb();
  return db.conversations.find((conv) => conv.id === convId) || null;
}

export function getMessages(convId) {
  const db = ensureDb();
  return db.messages[convId] ? [...db.messages[convId]] : [];
}

export function saveMessage(convId, message) {
  const db = ensureDb();
  if (!db.messages[convId]) {
    db.messages[convId] = [];
  }
  const entry = {
    id: nextMessageId(convId, db.messages[convId]),
    author: message.author || 'Вы',
    body: String(message.body || ''),
    createdAt: message.createdAt || Date.now(),
    outgoing: message.outgoing !== false,
  };
  db.messages[convId].push(entry);
  const conversation = db.conversations.find((conv) => conv.id === convId);
  if (conversation) {
    conversation.lastMessageAt = entry.createdAt;
    conversation.subtitle = entry.body.slice(0, 72);
    conversation.unreadCount = 0;
  }
  persistDb(db);
  return entry;
}

export function createConversation(meta) {
  const db = ensureDb();
  const id = meta?.id || `conv-${Date.now()}`;
  const conversation = {
    id,
    title: meta?.title || 'Новая беседа',
    subtitle: meta?.subtitle || 'Пока нет сообщений',
    unreadCount: meta?.unreadCount ?? 0,
    participants: meta?.participants || ['Вы'],
    lastMessageAt: meta?.lastMessageAt || Date.now(),
  };
  db.conversations.unshift(conversation);
  db.messages[id] = meta?.messages ? [...meta.messages] : [];
  persistDb(db);
  return conversation;
}

export function markRead(convId) {
  const db = ensureDb();
  const conversation = db.conversations.find((conv) => conv.id === convId);
  if (conversation) {
    conversation.unreadCount = 0;
    persistDb(db);
  }
}

export function exportJson() {
  const db = ensureDb();
  return JSON.stringify(db, null, 2);
}

export function importJson(json) {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Некорректный JSON');
    }
    persistDb(parsed);
    return parsed;
  } catch (error) {
    console.error('Ошибка импорта JSON', error);
    throw error;
  }
}

export function resetDb() {
  localStorage.removeItem(STORAGE_KEY);
  return ensureDb(true);
}

// Возможное расширение: добавить функции синхронизации через WebSocket/Service Worker.
