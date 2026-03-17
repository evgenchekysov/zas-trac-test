/* =========================================================
   ZAS‑TRAC — Dispatcher UI: ШАГ 3 (app.js)
   Функционал:
   - мок‑данные заявок
   - группировка по статусам
   - сортировка: приоритеты (все кроме архива), архив — по дате закрытия
   - счётчики
   - аккордеоны (раскрыть/свернуть, мобильный friendly)
   - модальное окно (просмотр, кнопки по ролям)
   - обработчики смены статуса (локально; позже — API + Telegram)
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  // -----------------------------
  // Конфигурация и справочники
  // -----------------------------
  const STATUS = {
    new: 'new',
    assigned: 'assigned',
    inwork: 'inwork',
    paused: 'paused',
    closed: 'closed'
  };

  const STATUS_RU = {
    [STATUS.new]: 'Новые',
    [STATUS.assigned]: 'Назначенные',
    [STATUS.inwork]: 'В работе',
    [STATUS.paused]: 'На паузе',
    [STATUS.closed]: 'Закрытые (архив)'
  };

  // Приоритеты: сверху вниз как ты указал
  const PRIORITY = {
    emergency: 'emergency', // аварийный
    high: 'high',           // высокий
    medium: 'medium',       // средний
    low: 'low',             // низкий
    long: 'long'            // долгосрочный
  };

  const PRIORITY_RU = {
    [PRIORITY.emergency]: 'Аварийный',
    [PRIORITY.high]: 'Высокий',
    [PRIORITY.medium]: 'Средний',
    [PRIORITY.low]: 'Низкий',
    [PRIORITY.long]: 'Долгосрочный'
  };

  // Чем МЕНЬШЕ вес — тем ВЫШЕ в списке
  const PRIORITY_WEIGHT = {
    [PRIORITY.emergency]: 0,
    [PRIORITY.high]: 1,
    [PRIORITY.medium]: 2,
    [PRIORITY.low]: 3,
    [PRIORITY.long]: 4
  };

  // Роли: определяем доступные действия (потом заменим на реальные роли пользователя)
  const CURRENT_ROLE = localStorage.getItem('role') || 'dispatcher';
  const ROLE_ACTIONS = {
    admin:      ['assign', 'start', 'pause', 'resume', 'close'],
    dispatcher: ['assign', 'start', 'pause', 'resume', 'close'],
    worker:     ['start', 'pause', 'resume', 'close'],
    viewer:     []
  };

  // По статусу — какие действия допустимы контекстно
  const STATUS_ACTIONS = {
    [STATUS.new]:      ['assign', 'start', 'close'],
    [STATUS.assigned]: ['start', 'pause', 'close'],
    [STATUS.inwork]:   ['pause', 'close'],
    [STATUS.paused]:   ['resume', 'close'],
    [STATUS.closed]:   []
  };

  // Привязки DOM контейнеров
  const LIST_EL = {
    [STATUS.new]: document.getElementById('list-new'),
    [STATUS.assigned]: document.getElementById('list-assigned'),
    [STATUS.inwork]: document.getElementById('list-inwork'),
    [STATUS.paused]: document.getElementById('list-paused'),
    [STATUS.closed]: document.getElementById('list-closed')
  };

  const COUNT_EL = {
    [STATUS.new]: document.getElementById('count-new'),
    [STATUS.assigned]: document.getElementById('count-assigned'),
    [STATUS.inwork]: document.getElementById('count-inwork'),
    [STATUS.paused]: document.getElementById('count-paused'),
    [STATUS.closed]: document.getElementById('count-closed')
  };

  // Модалка
  const modal = document.getElementById('modal');
  const modalCloseBtn = document.getElementById('modal-close');
  const mTitle = document.getElementById('modal-title');
  const mCreated = document.getElementById('m-created');
  const mStatus = document.getElementById('m-status');
  const mPriority = document.getElementById('m-priority');
  const mDescription = document.getElementById('m-description');
  const mWorkers = document.getElementById('m-workers');

  const btnAssign = document.getElementById('btn-assign');
  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnResume = document.getElementById('btn-resume');
  const btnClose = document.getElementById('btn-close');

  // Текущая выбранная заявка в модалке
  let activeTicket = null;

  // -----------------------------
  // Мок‑данные (потом заменим на API)
  // -----------------------------
  /** Структура тикета:
   * {
   *   id: number,
   *   title: string,
   *   description: string,
   *   status: 'new'|'assigned'|'inwork'|'paused'|'closed',
   *   priority: 'emergency'|'high'|'medium'|'low'|'long',
   *   createdAt: ISOString,
   *   updatedAt?: ISOString,
   *   closedAt?: ISOString,
   *   location?: string,
   *   requester?: string,
   *   assignees?: string[]
   * }
   */
  const MOCK_TICKETS = [
    {
      id: 101,
      title: 'Не горит свет в коридоре L2',
      description: 'Зона L2, предположительно перегорел автомат или блок питания.',
      status: STATUS.new,
      priority: PRIORITY.emergency,
      createdAt: '2026-03-17T08:12:00+03:00',
      location: 'Корпус А — этаж 2',
      requester: 'Иван Петров'
    },
    {
      id: 102,
      title: 'Замена фильтров на AHU-03',
      description: 'Плановая замена фильтров, требуется доступ в машинное отделение.',
      status: STATUS.assigned,
      priority: PRIORITY.medium,
      createdAt: '2026-03-16T09:00:00+03:00',
      updatedAt: '2026-03-16T10:30:00+03:00',
      location: 'Машинное отделение — AHU-03',
      requester: 'Служба эксплуатации',
      assignees: ['Семенов', 'Орлов']
    },
    {
      id: 103,
      title: 'Калибровка датчиков температуры',
      description: 'Калибровка 12 датчиков в зоне B1.',
      status: STATUS.inwork,
      priority: PRIORITY.high,
      createdAt: '2026-03-15T13:25:00+03:00',
      updatedAt: '2026-03-17T11:45:00+03:00',
      location: 'Зона B1',
      requester: 'Диспетчер',
      assignees: ['Кузнецов']
    },
    {
      id: 104,
      title: 'Ремонт насоса P-22',
      description: 'Плановый ремонт, ожидание запасных частей.',
      status: STATUS.paused,
      priority: PRIORITY.long,
      createdAt: '2026-03-10T16:10:00+03:00',
      updatedAt: '2026-03-12T09:05:00+03:00',
      location: 'Насосная — секция 2',
      requester: 'Технолог',
      assignees: ['Сергеев']
    },
    {
      id: 105,
      title: 'Устранение протечки на коллекторе',
      description: 'Заявка закрыта после замены прокладки и подтяжки фланцев.',
      status: STATUS.closed,
      priority: PRIORITY.high,
      createdAt: '2026-03-12T08:00:00+03:00',
      updatedAt: '2026-03-12T11:15:00+03:00',
      closedAt: '2026-03-12T11:10:00+03:00',
      location: 'Котельная — коллектор №1',
      requester: 'ОТиК',
      assignees: ['Борисов', 'Миронов']
    },
    {
      id: 106,
      title: 'Плановый осмотр электрощитов НН',
      description: 'Ежемесячный осмотр и протяжка клемм в секциях 1–4.',
      status: STATUS.assigned,
      priority: PRIORITY.low,
      createdAt: '2026-03-13T10:00:00+03:00',
      updatedAt: '2026-03-16T15:20:00+03:00',
      location: 'Распред. пункт — НН',
      requester: 'Инженер по Э',
      assignees: ['Соболев']
    },
    {
      id: 107,
      title: 'Замена ламп на парковке P3',
      description: '20 шт. светильников — периодическая замена.',
      status: STATUS.new,
      priority: PRIORITY.medium,
      createdAt: '2026-03-17T10:40:00+03:00',
      location: 'Парковка P3',
      requester: 'Охрана'
    },
    {
      id: 108,
      title: 'Проверка системы аварийного освещения',
      description: 'Ежеквартальная проверка, отчет в конце.',
      status: STATUS.closed,
      priority: PRIORITY.long,
      createdAt: '2026-02-28T09:00:00+03:00',
      updatedAt: '2026-03-01T12:00:00+03:00',
      closedAt: '2026-03-01T11:50:00+03:00',
      location: 'Все корпуса',
      requester: 'HSE',
      assignees: ['Команда А']
    }
  ];

  // Текущее состояние (в реале — будет из API)
  let tickets = [...MOCK_TICKETS];

  // -----------------------------
  // Утилиты
  // -----------------------------
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return fmt.format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function byPriority(a, b) {
    const aw = PRIORITY_WEIGHT[a.priority] ?? 999;
    const bw = PRIORITY_WEIGHT[b.priority] ?? 999;
    if (aw !== bw) return aw - bw;
    // вторичная сортировка — по созданию (свежее выше)
    return new Date(b.createdAt) - new Date(a.createdAt);
  }

  function byClosedAtDesc(a, b) {
    return new Date(b.closedAt || 0) - new Date(a.closedAt || 0);
  }

  function truncate(text, max = 160) {
    if (!text) return '';
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  function ensureArray(x) {
    return Array.isArray(x) ? x : (x ? [x] : []);
  }

  // -----------------------------
  // Рендер карточек в списках
  // -----------------------------
  function renderAll() {
    // Очистим все контейнеры
    Object.values(LIST_EL).forEach(el => el && (el.innerHTML = ''));

    const groups = {
      [STATUS.new]: [],
      [STATUS.assigned]: [],
      [STATUS.inwork]: [],
      [STATUS.paused]: [],
      [STATUS.closed]: []
    };

    // Разложим по статусам
    for (const t of tickets) {
      if (!groups[t.status]) groups[t.status] = [];
      groups[t.status].push(t);
    }

    // Отсортируем и отрисуем
    for (const st of Object.keys(groups)) {
      const arr = groups[st];

      if (st === STATUS.closed) {
        arr.sort(byClosedAtDesc);
      } else {
        arr.sort(byPriority);
      }

      // Счётчик
      if (COUNT_EL[st]) COUNT_EL[st].textContent = String(arr.length);

      // Рендер списка
      const container = LIST_EL[st];
      if (!container) continue;

      if (arr.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'dim';
        empty.textContent = 'Пока нет заявок';
        container.appendChild(empty);
        continue;
      }

      for (const t of arr) {
        container.appendChild(renderTicketTile(t));
      }
    }
  }

  function renderTicketTile(t) {
    const tile = document.createElement('div');
    tile.className = 'ticket';
    tile.dataset.id = String(t.id);
    tile.dataset.status = t.status;
    tile.dataset.priority = t.priority;
    tile.dataset.clickable = 'true';

    // Заголовок
    const title = document.createElement('div');
    title.className = 'ticket-title';
    title.textContent = `#${t.id} — ${t.title}`;
    tile.appendChild(title);

    // Бейдж приоритета (справа)
    const actions = document.createElement('div');
    actions.className = 'ticket-actions';
    const badge = document.createElement('span');
    badge.className = `badge ${t.priority}`;
    badge.innerHTML = `<span class="dot"></span> ${PRIORITY_RU[t.priority] || t.priority}`;
    actions.appendChild(badge);
    tile.appendChild(actions);

    // Метаданные
    const meta = document.createElement('div');
    meta.className = 'ticket-meta';
    const created = `Создана: ${formatDateTime(t.createdAt)}`;
    const loc = t.location ? ` • Место: ${t.location}` : '';
    const req = t.requester ? ` • Заявитель: ${t.requester}` : '';
    meta.textContent = `${created}${loc}${req}`;
    tile.appendChild(meta);

    // Краткое описание (необязательно, но удобно)
    if (t.description) {
      const brief = document.createElement('div');
      brief.className = 'ticket-meta';
      brief.textContent = truncate(t.description, 180);
      tile.appendChild(brief);
    }

    // Открываем модалку по клику на плитку
    tile.addEventListener('click', (e) => {
      // Если будем добавлять кнопки в плитке — не открывать модалку при их клике:
      // if (e.target.closest('.button,.action')) return;
      openModal(t);
    });

    return tile;
  }

  // -----------------------------
  // Аккордеоны
  // -----------------------------
  function setupAccordions() {
    const sections = document.querySelectorAll('.accordion');
    sections.forEach(section => {
      const header = section.querySelector('.accordion-header');
      const body = section.querySelector('.accordion-body');
      if (!header || !body) return;

      // Изначально закрыты, кроме "Новые"
      const isNew = section.dataset.status === STATUS.new;
      section.classList.toggle('open', isNew);
      body.toggleAttribute('hidden', !isNew);
      header.setAttribute('aria-expanded', String(isNew));

      header.addEventListener('click', () => {
        const expanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', String(!expanded));
        section.classList.toggle('open', !expanded);
        body.toggleAttribute('hidden', expanded);
      });

      // Доступность — Enter/Space
      header.setAttribute('tabindex', '0');
      header.addEventListener('keydown', (ev) => {
        if (ev.code === 'Enter' || ev.code === 'Space') {
          ev.preventDefault();
          header.click();
        }
      });
    });
  }

  // -----------------------------
  // Модалка: открыть/закрыть и наполнение
  // -----------------------------
  function openModal(ticket) {
    activeTicket = ticket;
    mTitle.textContent = `Заявка #${ticket.id}`;
    mCreated.textContent = formatDateTime(ticket.createdAt);
    mStatus.textContent = STATUS_RU[ticket.status] || ticket.status;
    mPriority.textContent = PRIORITY_RU[ticket.priority] || ticket.priority;
    mDescription.textContent = ticket.description || '—';
    const assignees = ensureArray(ticket.assignees).join(', ');
    mWorkers.textContent = assignees || '—';

    // Показать/спрятать кнопки по роли и статусу
    applyRoleButtonsVisibility(ticket);

    modal.classList.remove('hidden');
  }

  function closeModal() {
    modal.classList.add('hidden');
    activeTicket = null;
  }

  modalCloseBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(); // клик по подложке
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  function allowedActionsFor(ticket) {
    const byRole = new Set(ROLE_ACTIONS[CURRENT_ROLE] || []);
    const byStatus = new Set(STATUS_ACTIONS[ticket.status] || []);
    return [...byRole].filter(a => byStatus.has(a));
  }

  function applyRoleButtonsVisibility(ticket) {
    const allowed = new Set(allowedActionsFor(ticket));

    btnAssign.classList.toggle('hide', !allowed.has('assign'));
    btnStart.classList.toggle('hide', !allowed.has('start'));
    btnPause.classList.toggle('hide', !allowed.has('pause'));
    btnResume.classList.toggle('hide', !allowed.has('resume'));
    btnClose.classList.toggle('hide', !allowed.has('close'));
  }

  // -----------------------------
  // Обработчики действий (локально)
  // На следующих шагах заменим на запросы к API + Telegram workflow
  // -----------------------------
  btnAssign.addEventListener('click', () => {
    if (!activeTicket) return;
    // TODO: диалог выбора исполнителей
    activeTicket.status = STATUS.assigned;
    activeTicket.updatedAt = new Date().toISOString();
    rerenderAfterAction('Назначена');
  });

  btnStart.addEventListener('click', () => {
    if (!activeTicket) return;
    activeTicket.status = STATUS.inwork;
    activeTicket.updatedAt = new Date().toISOString();
    rerenderAfterAction('В работу');
  });

  btnPause.addEventListener('click', () => {
    if (!activeTicket) return;
    activeTicket.status = STATUS.paused;
    activeTicket.updatedAt = new Date().toISOString();
    rerenderAfterAction('Пауза');
  });

  btnResume.addEventListener('click', () => {
    if (!activeTicket) return;
    activeTicket.status = STATUS.inwork;
    activeTicket.updatedAt = new Date().toISOString();
    rerenderAfterAction('Возобновлена');
  });

  btnClose.addEventListener('click', () => {
    if (!activeTicket) return;
    activeTicket.status = STATUS.closed;
    const now = new Date().toISOString();
    activeTicket.updatedAt = now;
    activeTicket.closedAt = now;
    rerenderAfterAction('Закрыта');
  });

  function rerenderAfterAction(actionName) {
    // На шагах 5–6 тут пойдут: цветовая маркировка + Telegram-оповещение
    renderAll();
    // Оставим модалку открытой и обновим поля — так удобнее
    if (activeTicket) {
      const fresh = tickets.find(t => t.id === activeTicket.id);
      if (fresh) openModal(fresh);
    }
    // console.info(`[Workflow] ${actionName} → ${activeTicket?.id}`);
  }

  // -----------------------------
  // Загрузка данных (заглушка)
  // -----------------------------
  async function loadTickets() {
    // На проде:
    // const res = await fetch('/api/tickets');
    // tickets = await res.json();
    // Пока — мок:
    tickets = [...MOCK_TICKETS];
  }

  // -----------------------------
  // Инициализация
  // -----------------------------
  (async function init() {
    setupAccordions();
    await loadTickets();
    renderAll();
    // Можно заранее запомнить роль, если хочешь:
    // localStorage.setItem('role', 'dispatcher'); // admin|dispatcher|worker|viewer
  })();
});
