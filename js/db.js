// Локальная "БД" на основе localStorage. Здесь можно подключить реальный API.
const STORAGE_KEY = 'local_messenger_db_v1';

const seedData = () => ({
  conversations: [
    {
      id: 'design-team',
      title: 'Дизайн-команда',
      subtitle: 'Синхронизация по макетам',
      unreadCount: 2,
      participants: ['Мария', 'Антон', 'Вы'],
      lastMessageAt: Date.now() - 1000 * 60 * 3,
    },
    {
      id: 'support',
      title: 'Служба поддержки',
      subtitle: 'Обратная связь клиентов',
      unreadCount: 0,
      participants: ['Тимур', 'Кира', 'Вы'],
      lastMessageAt: Date.now() - 1000 * 60 * 45,
    },
  ],
  messages: {
    'design-team': [
      {
        id: 'm1',
        author: 'Мария',
        body: 'Привет! Готовы к демонстрации iPhone-подобных карточек? 🎨',
        createdAt: Date.now() - 1000 * 60 * 60,
        outgoing: false,
      },
      {
        id: 'm2',
        author: 'Вы',
        body: 'Да, я собираю прототип MonoFlow. Добавлю мультитач.',
        createdAt: Date.now() - 1000 * 60 * 40,
        outgoing: true,
      },
      {
        id: 'm3',
        author: 'Антон',
        body: 'Супер! Проверь, чтобы окна снапились к сетке.',
        createdAt: Date.now() - 1000 * 60 * 15,
        outgoing: false,
      },
    ],
    support: [
      {
        id: 's1',
        author: 'Кира',
        body: 'Поступила просьба добавить экспорт чатов.',
        createdAt: Date.now() - 1000 * 60 * 90,
        outgoing: false,
      },
      {
        id: 's2',
        author: 'Вы',
        body: 'Экспортируем локальную БД в JSON и рассылаем.',
        createdAt: Date.now() - 1000 * 60 * 70,
        outgoing: true,
      },
    ],
  },
});

function readDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch (err) {
    console.warn('Ошибка чтения localStorage', err);
    return null;
  }
}

function writeDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function init(seed = false) {
  if (seed) {
    const data = seedData();
    writeDb(data);
    return data;
  }
  let db = readDb();
  if (!db) {
    db = seedData();
    writeDb(db);
  }
  return db;
}

function ensureDb() {
  const db = readDb();
  if (!db) {
    return init(true);
  }
  return db;
}

export function getConversations() {
  const db = ensureDb();
  return db.conversations
    .slice()
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export function getConversation(id) {
  const db = ensureDb();
  return db.conversations.find((conv) => conv.id === id) || null;
}

export function getMessages(convId, opts = {}) {
  const { limit = 200, offset = 0 } = opts;
  const db = ensureDb();
  const all = db.messages[convId] || [];
  return all.slice(Math.max(0, all.length - limit - offset), all.length - offset);
}

export function saveMessage(convId, message) {
  const db = ensureDb();
  const list = db.messages[convId] || (db.messages[convId] = []);
  const stored = {
    id: `m-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    author: message.author || 'Вы',
    body: message.body,
    createdAt: message.createdAt || Date.now(),
    outgoing: Boolean(message.outgoing),
  };
  list.push(stored);

  const conv = db.conversations.find((c) => c.id === convId);
  if (conv) {
    conv.lastMessageAt = stored.createdAt;
    if (!stored.outgoing) {
      conv.unreadCount = (conv.unreadCount || 0) + 1;
    }
  }

  writeDb(db);
  return stored;
}

export function createConversation(meta) {
  const db = ensureDb();
  const id = meta.id || `conv-${Date.now().toString(16)}`;
  const conversation = {
    id,
    title: meta.title || 'Новая беседа',
    subtitle: meta.subtitle || 'Описание будет позже',
    unreadCount: 0,
    participants: meta.participants || ['Вы'],
    lastMessageAt: Date.now(),
  };
  db.conversations.push(conversation);
  db.messages[id] = meta.messages || [];
  writeDb(db);
  return conversation;
}

export function markRead(convId) {
  const db = ensureDb();
  const conv = db.conversations.find((c) => c.id === convId);
  if (conv) {
    conv.unreadCount = 0;
    writeDb(db);
  }
}

export function resetDb() {
  const data = seedData();
  writeDb(data);
  return data;
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
    if (!Array.isArray(parsed.conversations) || typeof parsed.messages !== 'object') {
      throw new Error('Не хватает обязательных полей');
    }
    writeDb(parsed);
    return parsed;
  } catch (err) {
    console.error('Ошибка импорта JSON', err);
    throw err;
  }
}
