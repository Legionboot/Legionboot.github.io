// Отвечает за отрисовку элементов интерфейса и связывается с app.js.
// При необходимости здесь можно подключить реальный шаблонизатор или UI-библиотеку.

const conversationListEl = document.getElementById('conversationList');
const messageListEl = document.getElementById('messageList');
const conversationTitleEl = document.getElementById('conversationTitle');
const conversationSubtitleEl = document.getElementById('conversationSubtitle');
const fileRepositoryEl = document.getElementById('fileRepository');
const statusIndicatorEl = document.getElementById('statusIndicator');

let handlers = {
  onSelectConversation: () => {},
  onOpenConversationWindow: () => {},
  onOpenRepoWindow: () => {},
  onAvatarClick: () => {},
};

export function initUI(options = {}) {
  handlers = { ...handlers, ...options };

  conversationListEl.addEventListener('click', (event) => {
    const target = event.target.closest('[data-conversation-id]');
    if (target) {
      const { conversationId } = target.dataset;
      handlers.onSelectConversation?.(conversationId);
    }
  });

  conversationListEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target.closest('[data-conversation-id]');
      if (target) {
        event.preventDefault();
        handlers.onSelectConversation?.(target.dataset.conversationId);
      }
    }
  });

  document.getElementById('openChatWindowButton')?.addEventListener('click', () => {
    handlers.onOpenConversationWindow?.();
  });

  document.getElementById('openRepoWindowButton')?.addEventListener('click', () => {
    handlers.onOpenRepoWindow?.();
  });

  document.getElementById('avatarButton')?.addEventListener('click', () => {
    handlers.onAvatarClick?.();
  });
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

export function renderConversationList(conversations, activeId) {
  if (!Array.isArray(conversations)) {
    conversationListEl.innerHTML = '<p role="status">Нет бесед</p>';
    return;
  }
  conversationListEl.innerHTML = conversations
    .map((conv) => {
      const unread = conv.unreadCount ? `<span class="badge" aria-hidden="true">${conv.unreadCount}</span>` : '';
      return `
        <article class="conversation-card" role="listitem" tabindex="0" data-conversation-id="${conv.id}" aria-selected="${conv.id === activeId}">
          <div class="conversation-card__meta">
            <h3 class="conversation-card__title">${escapeHtml(conv.title)}</h3>
            <p class="conversation-card__preview">${escapeHtml(conv.subtitle || '')}</p>
          </div>
          ${unread}
        </article>
      `;
    })
    .join('');
}

export function renderConversationHeader(conversation) {
  if (!conversation) {
    conversationTitleEl.textContent = 'Выберите чат';
    conversationSubtitleEl.textContent = 'История сообщений отобразится здесь';
    return;
  }
  conversationTitleEl.textContent = conversation.title;
  const participants = conversation.participants?.join(', ');
  conversationSubtitleEl.textContent = participants
    ? `Участники: ${participants}`
    : conversation.subtitle || '';
}

export function renderMessages(messages, { smoothScroll = true } = {}) {
  if (!messages || !messages.length) {
    messageListEl.innerHTML = '<p role="status">Пока нет сообщений</p>';
    return;
  }

  messageListEl.innerHTML = messages
    .map((msg) => messageTemplate(msg))
    .join('');

  if (smoothScroll) {
    scrollMessagesToBottom();
  }
}

export function appendMessage(message) {
  messageListEl.insertAdjacentHTML('beforeend', messageTemplate(message));
  scrollMessagesToBottom();
}

function messageTemplate(message) {
  const time = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(message.createdAt);
  const classes = ['message'];
  if (message.outgoing) classes.push('message--outgoing');
  return `
    <article class="${classes.join(' ')}" role="article">
      <div class="message__avatar" aria-hidden="true"></div>
      <div class="message__bubble">
        <p>${escapeHtml(message.body)}</p>
        <p class="message__meta">${escapeHtml(message.author || 'Вы')} · ${time}</p>
      </div>
    </article>
  `;
}

function scrollMessagesToBottom() {
  requestAnimationFrame(() => {
    messageListEl.scrollTo({ top: messageListEl.scrollHeight, behavior: 'smooth' });
  });
}

export function updateFiles(files) {
  if (!files || !files.length) {
    fileRepositoryEl.innerHTML = '<p role="status">Файлы не найдены</p>';
    return;
  }
  fileRepositoryEl.innerHTML = files
    .map(
      (file) => `
        <article class="file-item" role="listitem">
          <span class="file-item__name">${escapeHtml(file.name)}</span>
          <span class="file-item__meta">${escapeHtml(file.meta)}</span>
        </article>
      `
    )
    .join('');
}

export function updateStatus(text) {
  statusIndicatorEl.textContent = text;
}
