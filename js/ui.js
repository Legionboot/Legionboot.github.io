// UI-утилиты для рендера DOM-структур.
// При необходимости можно заменить на шаблонизатор или React, сохранив эти функции как адаптер.

const gestureIcon = `
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 26l6-7 3 3 5-6 7 10" />
  </svg>
`;

export function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function renderConversationList(container, conversations, activeId) {
  container.innerHTML = conversations
    .map((conversation) => {
      const selected = conversation.id === activeId;
      return `
        <article class="list__item" role="listitem" data-id="${conversation.id}" aria-selected="${selected}">
          <div>
            <div class="list__item-title">${escapeHTML(conversation.title)}</div>
            <div class="list__item-subtitle">${escapeHTML(conversation.subtitle || '')}</div>
          </div>
          ${conversation.unreadCount > 0 ? `<span class="unread-badge" aria-label="${conversation.unreadCount} непрочитанных">${conversation.unreadCount}</span>` : ''}
        </article>
      `;
    })
    .join('');
}

export function renderMessages(container, messages) {
  container.innerHTML = messages
    .map(
      (message) => `
        <div class="message ${message.outgoing ? 'message--outgoing' : ''}" data-id="${message.id}">
          <div class="message__author">${escapeHTML(message.author)}</div>
          <div class="message__body">${escapeHTML(message.body)}</div>
          <div class="message__meta">${formatTime(message.createdAt)}</div>
        </div>
      `,
    )
    .join('');
  container.scrollTop = container.scrollHeight;
}

export function renderFileRepository(container) {
  const files = [
    { name: 'Гайд по жестам.pdf', size: '1.4 MB', updated: 'Сегодня' },
    { name: 'Concept-ios17.fig', size: '22 MB', updated: 'Вчера' },
    { name: 'Material-you-variables.json', size: '6 KB', updated: '3 дня назад' },
  ];
  container.innerHTML = `
    <div class="file-list" role="list">
      ${files
        .map(
          (file) => `
            <article class="file-card" role="listitem">
              <div class="file-card__name">${escapeHTML(file.name)}</div>
              <div class="file-card__meta">Размер: ${file.size} · Обновлено: ${file.updated}</div>
            </article>
          `,
        )
        .join('')}
    </div>
    <p class="gesture-hint" aria-hidden="true">${gestureIcon}Жест «pinch» масштабирует активное окно.</p>
  `;
}

export function renderProfile(container) {
  container.innerHTML = `
    <div class="card">
      <h3>Профиль</h3>
      <p>MonoFlow — экспериментальный клиент без сервера. Все данные остаются на вашем устройстве.</p>
      <ul class="list" role="list">
        <li class="list__item" role="listitem">
          <span class="list__item-title">Режим</span>
          <span class="list__item-subtitle">iOS / Material</span>
        </li>
        <li class="list__item" role="listitem">
          <span class="list__item-title">Синхронизация</span>
          <span class="list__item-subtitle">Локально (можно подключить WebSocket)</span>
        </li>
      </ul>
    </div>
  `;
}

export function renderSearch(container) {
  container.innerHTML = `
    <form class="card" id="searchForm">
      <label for="searchInput" class="list__item-title">Поиск по сообщениям</label>
      <input id="searchInput" name="search" type="search" placeholder="Введите запрос" class="search-input" aria-label="Поиск" />
      <p class="list__item-subtitle">Совет: трипальный свайп влево/вправо переключает окна.</p>
    </form>
    <div id="searchResults" class="message-list" aria-live="polite"></div>
  `;
}

export function renderSettings(container) {
  container.innerHTML = `
    <div class="card">
      <h3>Настройки</h3>
      <p>Здесь можно подключить реальные сервисы: push-уведомления, WebRTC-звонки, управление с клавиатуры.</p>
      <div class="list" role="list">
        <label class="list__item" role="listitem">
          <div>
            <div class="list__item-title">Вибрация</div>
            <div class="list__item-subtitle">Использовать тактильную отдачу на мобильных</div>
          </div>
          <input type="checkbox" name="haptics" />
        </label>
        <label class="list__item" role="listitem">
          <div>
            <div class="list__item-title">Синхронизация окон</div>
            <div class="list__item-subtitle">Сохранять позиции в localStorage</div>
          </div>
          <input type="checkbox" name="persist-windows" checked />
        </label>
      </div>
    </div>
  `;
}

export function renderImportExportModal(container, { initialJson = '' } = {}) {
  container.innerHTML = `
    <div class="card">
      <h3>Импорт / Экспорт JSON</h3>
      <p>Скопируйте содержимое localStorage или вставьте подготовленный JSON и нажмите «Импортировать».</p>
      <textarea id="modalJsonArea" class="import-export__textarea" placeholder="Вставьте JSON">${escapeHTML(initialJson)}</textarea>
      <div class="window__actions">
        <button class="ghost-btn" type="button" data-action="export">Экспортировать</button>
        <button class="primary-btn" type="button" data-action="import">Импортировать</button>
      </div>
    </div>
  `;
}

export function renderComposerHint(container) {
  container.innerHTML = `
    <p class="list__item-subtitle">Enter — отправка · Shift+Enter — новая строка · Esc — закрыть активное окно.</p>
  `;
}

// Можно расширить: добавить шаблоны для голосовых сообщений, вложений, live reactions.
