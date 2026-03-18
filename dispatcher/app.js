/* =========================================================
   ZAS‑TRAC — Dispatcher UI
   ШАГ 6: Telegram‑workflow (с учётом правил из ТЗ)
   События:
     - ticket_created
     - ticket_overdue_new
     - ticket_assigned
     - ticket_started
     - ticket_paused        (кроме "паузы в конце смены")
     - ticket_resumed
     - ticket_closed
     - ticket_moved_next_month
   Исключения:
     - НЕ слать предиктивные "за 30 дней"
     - НЕ слать "пауза в конце смены"
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* =========================================================
     СПРАВОЧНИКИ И КОНСТАНТЫ
     ========================================================= */
  const STATUS = {
    new: 'new',
    assigned: 'assigned',
    inwork: 'inwork',
    paused: 'paused',
    closed: 'closed'
  };

  const STATUS_RU = {
    new: 'Новые',
    assigned: 'Назначенные',
    inwork: 'В работе',
    paused: 'На паузе',
    closed: 'Закрытые'
  };

  const PRIORITY = {
    emergency: 'emergency',
    high: 'high',
    medium: 'medium',
    low: 'low',
    long: 'long'
  };

  const PRIORITY_RU = {
    emergency: 'Аварийный',
    high: 'Высокий',
    medium: 'Средний',
    low: 'Низкий',
    long: 'Долгосрочный'
  };

  const PRIORITY_WEIGHT = {
    emergency: 0,
    high: 1,
    medium: 2,
    low: 3,
    long: 4
  };

  /* =========================================================
     TELEGRAM WORKFLOW — конфиг
     ========================================================= */
  const TG_ENDPOINT = localStorage.getItem('tgEndpoint') || '/tg/notify';
  const TG_ENABLED  = true; // можно временно выключить при отладке
  // Имя текущего пользователя (исполнителя/диспетчера) — попадёт в события
  const CURRENT_USER = localStorage.getItem('userName') || 'Dispatcher';

  /* ---------------------------------------------------------
     РОЛИ (локально; позже — Auth)
     --------------------------------------------------------- */
  const CURRENT_ROLE = localStorage.getItem('role') || 'dispatcher';

  const ROLE_ACTIONS = {
    admin:      ['assign', 'start', 'pause', 'resume', 'close'],
    dispatcher: ['assign', 'start', 'pause', 'resume', 'close'],
    worker:     ['start', 'pause', 'resume', 'close'],
    viewer:     []
  };

  const STATUS_ACTIONS = {
    new:      ['assign', 'start', 'close'],
    assigned: ['start', 'pause', 'close'],
    inwork:   ['pause', 'close'],
    paused:   ['resume', 'close'],
    closed:   []
  };

  /* ---------------------------------------------------------
     ПРИВЯЗКА DOM ЭЛЕМЕНТОВ
     --------------------------------------------------------- */
  const LIST_EL = {
    new: document.getElementById('list-new'),
    assigned: document.getElementById('list-assigned'),
    inwork: document.getElementById('list-inwork'),
    paused: document.getElementById('list-paused'),
    closed: document.getElementById('list-closed')
  };

  const COUNT_EL = {
    new: document.getElementById('count-new'),
    assigned: document.getElementById('count-assigned'),
    inwork: document.getElementById('count-inwork'),
    paused: document.getElementById('count-paused'),
    closed: document.getElementById('count-closed')
  };

  // Панель месяцев
  const monthSelect = document.getElementById('month-select');
  const monthStats = document.getElementById('month-stats');

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

  let activeTicket = null;

  /* =========================================================
     МОК-ДАННЫЕ (пример; в проде — из API)
     ========================================================= */
  const MOCK_TICKETS = [
    { id: 101, title: 'Не горит свет в коридоре L2',
      description: 'Зона L2, предположительно перегорел автомат или блок питания.',
      status: 'new', priority: 'emergency',
      createdAt: '2026-03-17T08:12:00+03:00',
      location: 'Корпус А — этаж 2', requester: 'Иван Петров'
    },
    { id: 102, title: 'Замена фильтров на AHU-03',
      description: 'Плановая замена фильтров, требуется доступ в машинное отделение.',
      status: 'assigned', priority: 'medium',
      createdAt: '2026-03-16T09:00:00+03:00', updatedAt: '2026-03-16T10:30:00+03:00',
      location: 'Машинное отделение — AHU-03', requester: 'Служба эксплуатации',
      assignees: ['Семенов', 'Орлов']
    },
    { id: 103, title: 'Калибровка датчиков температуры',
      description: 'Калибровка 12 датчиков в зоне B1.',
      status: 'inwork', priority: 'high',
      createdAt: '2026-03-15T13:25:00+03:00', updatedAt: '2026-03-17T11:45:00+03:00',
      location: 'Зона B1', requester: 'Диспетчер', assignees: ['Кузнецов']
    },
    { id: 104, title: 'Ремонт насоса P-22',
      description: 'Плановый ремонт, ожидание запасных частей.',
      status: 'paused', priority: 'long',
      createdAt: '2026-03-10T16:10:00+03:00', updatedAt: '2026-03-12T09:05:00+03:00',
      location: 'Насосная — секция 2', requester: 'Технолог', assignees: ['Сергеев']
    },
    { id: 105, title: 'Устранение протечки на коллекторе',
      description: 'Заявка закрыта после замены прокладки.',
      status: 'closed', priority: 'high',
      createdAt: '2026-03-12T08:00:00+03:00',
      closedAt: '2026-03-12T11:10:00+03:00',
      location: 'Котельная — коллектор №1', requester: 'ОТиК',
      assignees: ['Борисов', 'Миронов']
    },
    { id: 108, title: 'Проверка системы аварийного освещения',
      description: 'Ежеквартальная проверка.',
      status: 'closed', priority: 'long',
      createdAt: '2026-02-28T09:00:00+03:00',
      closedAt: '2026-03-01T11:50:00+03:00',
      location: 'Все корпуса', requester: 'HSE', assignees: ['Команда А']
    }
  ];

  let tickets = [...MOCK_TICKETS];

  /* =========================================================
     ДАТЫ, МЕСЯЦЫ
     ========================================================= */
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  const fmtMonthRu = new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric', month: 'long'
  });

  function toMonthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }

  function monthFromISO(iso) {
    const d = new Date(iso);
    return toMonthKey(d);
  }

  function monthHuman(key) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m-1, 1);
    return fmtMonthRu.format(d);
  }

  const now = new Date();
  const CURRENT_MONTH = toMonthKey(now);
  const PREVIOUS_MONTH = toMonthKey(new Date(now.getFullYear(), now.getMonth()-1, 1));
  let selectedMonth = CURRENT_MONTH;

  /* =========================================================
     УТИЛИТЫ
     ========================================================= */
  function formatDateTime(iso) {
    if (!iso) return '—';
    return fmt.format(new Date(iso));
  }

  function byPriority(a, b) {
    const aw = PRIORITY_WEIGHT[a.priority] ?? 999;
    const bw = PRIORITY_WEIGHT[b.priority] ?? 999;
    if (aw !== bw) return aw - bw;
    return new Date(b.createdAt) - new Date(a.createdAt);
  }

  function byClosedAtDesc(a, b) {
    return new Date(b.closedAt || 0) - new Date(a.closedAt || 0);
  }

  function ensureArray(x) {
    return Array.isArray(x) ? x : (x ? [x] : []);
  }

  function truncate(t, max=160) {
    return t?.length > max ? t.slice(0,max-1)+'…' : t;
  }

  function daysBetween(aISO, bISO) {
    const a = new Date(aISO).getTime();
    const b = new Date(bISO).getTime();
    return Math.floor((b-a)/(1000*60*60*24));
  }

  // "Хвост": >30 дней незакрытой заявки — только визуальная отметка; уведомлений НЕ шлём
  function isTail(t) {
    if (t.status === 'closed') return false;
    return daysBetween(t.createdAt, new Date().toISOString()) > 30;
  }

  // Просрочка определяется ТОЛЬКО по dueAt и ТОЛЬКО для новых заявок (status:new)
  function isOverdue(t) {
    if (t.status !== 'new') return false;
    if (!t.dueAt) return false;
    try { return new Date(t.dueAt).getTime() < Date.now(); } catch { return false; }
  }

  /* =========================================================
     TELEGRAM WORKFLOW — отправка и сборка сообщений
     ========================================================= */
  async function postJSON(url, body) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json().catch(() => ({}));
    } catch (e) {
      console.warn('[TG] Ошибка отправки:', e.message);
      return null;
    }
  }

  /**
   * emitWorkflowEvent(event, ticket, extra)
   * event: 'ticket_created'|'ticket_overdue_new'|'ticket_assigned'|'ticket_started'|'ticket_paused'|'ticket_resumed'|'ticket_closed'|'ticket_moved_next_month'
   */
  async function emitWorkflowEvent(event, ticket, extra = {}) {
    if (!TG_ENABLED) return;
    const payload = {
      event,
      ticket: {
        id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        requester: ticket.requester || null,
        assignees: ticket.assignees || [],
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt || null,
        closedAt: ticket.closedAt || null,
        dueAt: ticket.dueAt || null,
        month: ticket.month || null,
        location: ticket.location || null
      },
      extra,
      sentAt: new Date().toISOString()
    };
    await postJSON(TG_ENDPOINT, payload);
  }

  /* =========================================================
     Просрочки новых заявок — уведомлять ОДИН раз на тикет
     ========================================================= */
  const overdueNotified = new Set(
    JSON.parse(localStorage.getItem('overdueNotified') || '[]')
  );

  function markOverdueNotified(ticketId) {
    overdueNotified.add(ticketId);
    localStorage.setItem('overdueNotified', JSON.stringify([...overdueNotified]));
  }

  async function scanOverdueNewTicketsAndNotify() {
    for (const t of tickets) {
      if (isOverdue(t) && !overdueNotified.has(t.id)) {
        await emitWorkflowEvent('ticket_overdue_new', t, {});
        markOverdueNotified(t.id);
      }
    }
  }

  /* =========================================================
     МЕСЯЧНАЯ МИГРАЦИЯ (с уведомлением о переносе)
     ========================================================= */
  function ensureMonthFieldsAndMigrate() {
    // Проставить month
    for (const t of tickets) {
      if (!t.month) {
        t.month = (t.status === 'closed')
          ? monthFromISO(t.closedAt || t.updatedAt || t.createdAt)
          : monthFromISO(t.createdAt);
      }
    }

    // Перенос незакрытых в новый месяц — один раз в месяц
    const lastProcessed = localStorage.getItem('lastProcessedMonth');
    if (lastProcessed !== CURRENT_MONTH) {
      for (const t of tickets) {
        if (t.status !== 'closed' && t.month !== CURRENT_MONTH) {
          const fromMonth = t.month;
          t.month = CURRENT_MONTH;

          // Защита от повторных уведомлений (ключ на тикет+месяц)
          const migKey = `migrated:${t.id}:${CURRENT_MONTH}`;
          if (!localStorage.getItem(migKey)) {
            emitWorkflowEvent('ticket_moved_next_month', t, { fromMonth, toMonth: CURRENT_MONTH });
            localStorage.setItem(migKey, '1');
          }
        }
      }
      localStorage.setItem('lastProcessedMonth', CURRENT_MONTH);
    }
  }

  /* =========================================================
     РЕНДЕР
     ========================================================= */
  function renderAll() {
    Object.values(LIST_EL).forEach(el => el.innerHTML = '');

    const groups = {
      new: [],
      assigned: [],
      inwork: [],
      paused: [],
      closed: []
    };

    for (const t of tickets) {
      // Закрытые тоже по месяцам (как было согласовано)
      if (t.status === 'closed') {
        if (t.month === selectedMonth) groups.closed.push(t);
        continue;
      }
      if (t.month === selectedMonth) groups[t.status].push(t);
    }

    groups.closed.sort(byClosedAtDesc);
    groups.new.sort(byPriority);
    groups.assigned.sort(byPriority);
    groups.inwork.sort(byPriority);
    groups.paused.sort(byPriority);

    for (const st in groups) {
      COUNT_EL[st].textContent = groups[st].length;
    }

    for (const st in groups) {
      const list = LIST_EL[st];
      const arr = groups[st];

      if (arr.length === 0) {
        const div = document.createElement('div');
        div.className = 'dim';
        div.textContent = 'Пока нет заявок';
        list.appendChild(div);
        continue;
      }

      for (const t of arr) list.appendChild(renderTicketTile(t));
    }

    updateMonthStats(groups);
  }

  function updateMonthStats(g) {
    const openTotal = g.new.length + g.assigned.length + g.inwork.length + g.paused.length;
    monthStats.textContent =
      `Месяц: ${monthHuman(selectedMonth)} • ` +
      `Открытых: ${openTotal} • ` +
      `Закрытые: ${g.closed.length}`;
  }

  // Плитка заявки (с цветовой маркировкой и мигающей просрочкой)
  function renderTicketTile(t) {
    const div = document.createElement('div');
    div.className = 'ticket';
    div.dataset.id = t.id;
    div.dataset.status = t.status;
    div.dataset.priority = t.priority;

    // Цветовая маркировка по статусу (полоса слева/подложка)
    div.classList.add(`status-${t.status}`);

    // Просрочка (только для новых по dueAt) — мигающая рамка; "хвост" — пунктир
    if (isOverdue(t)) {
      div.classList.add('overdue', 'blink');
    } else if (isTail(t)) {
      div.classList.add('tail');
    }

    // Заголовок
    const title = document.createElement('div');
    title.className = 'ticket-title';
    title.textContent = `#${t.id} — ${t.title}`;
    div.appendChild(title);

    // Правый блок: статус + приоритет
    const actions = document.createElement('div');
    actions.className = 'ticket-actions';

    const st = document.createElement('span');
    st.className = `status-tag status-${t.status}`;
    st.textContent = STATUS_RU[t.status] || t.status;
    actions.appendChild(st);

    const badge = document.createElement('span');
    badge.className = `badge ${t.priority}`;
    badge.innerHTML = `<span class="dot"></span> ${PRIORITY_RU[t.priority] || t.priority}`;
    actions.appendChild(badge);

    div.appendChild(actions);

    // Метаданные
    const meta = document.createElement('div');
    meta.className = 'ticket-meta';
    const parts = [
      `Создана: ${formatDateTime(t.createdAt)}`,
      `Месяц: ${monthHuman(t.month)}`
    ];
    if (t.dueAt && t.status !== 'closed') {
      parts.push(`Дедлайн: ${formatDateTime(t.dueAt)}`);
    }
    meta.textContent = parts.join(' • ');
    div.appendChild(meta);

    // Краткое описание
    if (t.description) {
      const d = document.createElement('div');
      d.className = 'ticket-meta';
      d.textContent = truncate(t.description, 180);
      div.appendChild(d);
    }

    // Клик — открыть модалку
    div.addEventListener('click', () => openModal(t));
    return div;
  }

  /* =========================================================
     АККОРДЕОНЫ
     ========================================================= */
  function setupAccordions() {
    const sections = document.querySelectorAll('.accordion');

    sections.forEach(section => {
      const header = section.querySelector('.accordion-header');
      const body = section.querySelector('.accordion-body');

      const isNew = section.dataset.status === 'new';
      section.classList.toggle('open', isNew);
      body.toggleAttribute('hidden', !isNew);
      header.setAttribute('aria-expanded', String(isNew));

      header.addEventListener('click', () => {
        const expanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', String(!expanded));
        section.classList.toggle('open', !expanded);
        body.toggleAttribute('hidden', expanded);
      });

      header.setAttribute('tabindex', '0');
      header.addEventListener('keydown', (ev) => {
        if (ev.code === 'Enter' || ev.code === 'Space') {
          ev.preventDefault();
          header.click();
        }
      });
    });
  }

  /* =========================================================
     МОДАЛКА
     ========================================================= */
  function openModal(t) {
    activeTicket = t;
    mTitle.textContent = `Заявка #${t.id}`;
    mCreated.textContent = formatDateTime(t.createdAt);
    mStatus.textContent = STATUS_RU[t.status] || t.status;
    mPriority.textContent = PRIORITY_RU[t.priority] || t.priority;
    mDescription.textContent = t.description || '—';
    mWorkers.textContent = ensureArray(t.assignees).join(', ') || '—';

    applyRoleButtonsVisibility(t);
    modal.classList.remove('hidden');
  }

  function closeModal() {
    modal.classList.add('hidden');
    activeTicket = null;
  }

  modalCloseBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
  });

  function allowedActionsFor(t) {
    const byRole = new Set(ROLE_ACTIONS[CURRENT_ROLE] || []);
    const byStatus = new Set(STATUS_ACTIONS[t.status] || []);
    return [...byRole].filter(a => byStatus.has(a));
  }

  function applyRoleButtonsVisibility(t) {
    const allowed = new Set(allowedActionsFor(t));
    btnAssign.classList.toggle('hide', !allowed.has('assign'));
    btnStart.classList.toggle('hide', !allowed.has('start'));
    btnPause.classList.toggle('hide', !allowed.has('pause'));
    btnResume.classList.toggle('hide', !allowed.has('resume'));
    btnClose.classList.toggle('hide', !allowed.has('close'));
  }

  /* =========================================================
     ДЕЙСТВИЯ (с отправкой Telegram‑событий)
     ========================================================= */
  btnAssign.addEventListener('click', async () => {
    if (!activeTicket) return;
    activeTicket.status = 'assigned';
    activeTicket.updatedAt = new Date().toISOString();
    await emitWorkflowEvent('ticket_assigned', activeTicket, {
      assignees: activeTicket.assignees || []
    });
    rerender();
  });

  btnStart.addEventListener('click', async () => {
    if (!activeTicket) return;
    activeTicket.status = 'inwork';
    activeTicket.updatedAt = new Date().toISOString();
    await emitWorkflowEvent('ticket_started', activeTicket, { actor: CURRENT_USER });
    rerender();
  });

  // Пауза (поддержка режима "конец смены" без уведомления)
  async function pauseAction(endOfShift = false) {
    if (!activeTicket) return;
    activeTicket.status = 'paused';
    activeTicket.updatedAt = new Date().toISOString();
    if (!endOfShift) {
      await emitWorkflowEvent('ticket_paused', activeTicket, { actor: CURRENT_USER });
    }
    rerender();
  }
  btnPause.addEventListener('click', () => { pauseAction(false); });

  btnResume.addEventListener('click', async () => {
    if (!activeTicket) return;
    activeTicket.status = 'inwork';
    activeTicket.updatedAt = new Date().toISOString();
    await emitWorkflowEvent('ticket_resumed', activeTicket, { actor: CURRENT_USER });
    rerender();
  });

  btnClose.addEventListener('click', async () => {
    if (!activeTicket) return;
    const nowISO = new Date().toISOString();
    activeTicket.status = 'closed';
    activeTicket.updatedAt = nowISO;
    activeTicket.closedAt = nowISO;
    activeTicket.month = monthFromISO(activeTicket.closedAt);
    await emitWorkflowEvent('ticket_closed', activeTicket, { actor: CURRENT_USER });
    rerender();
  });

  function rerender() {
    renderAll();
    if (activeTicket) {
      const fresh = tickets.find(x => x.id === activeTicket.id);
      if (fresh) openModal(fresh);
    }
  }

  /* =========================================================
     СОБЫТИЕ СОЗДАНИЯ ПОЛЬЗОВАТЕЛЕМ (вызов из формы/бэка)
     ========================================================= */
  async function onTicketCreatedByUser(ticket) {
    tickets.push(ticket);
    if (!ticket.month && ticket.status !== 'closed') {
      ticket.month = monthFromISO(ticket.createdAt);
    }
    await emitWorkflowEvent('ticket_created', ticket, { createdBy: ticket.requester || 'user' });
    renderAll();
  }
  // Пример вызова (после успешного POST /api/tickets):
  // onTicketCreatedByUser(createdTicketFromServer);

  /* =========================================================
     МЕСЯЧНАЯ ПАНЕЛЬ
     ========================================================= */
  function setupMonthToolbar() {
    monthSelect.innerHTML = '';
    const opts = [
      { key: CURRENT_MONTH, label: monthHuman(CURRENT_MONTH) + ' (текущий)' },
      { key: PREVIOUS_MONTH, label: monthHuman(PREVIOUS_MONTH) }
    ];
    for (const o of opts) {
      const op = document.createElement('option');
      op.value = o.key;
      op.textContent = o.label;
      if (o.key === selectedMonth) op.selected = true;
      monthSelect.appendChild(op);
    }
    monthSelect.addEventListener('change', () => {
      selectedMonth = monthSelect.value;
      renderAll();
    });
  }

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================= */
  async function loadTickets() {
    tickets = [...MOCK_TICKETS];
  }

  (async function init() {
    setupAccordions();
    setupMonthToolbar();
    await loadTickets();
    ensureMonthFieldsAndMigrate();

    // Сразу проверим просрочки новых заявок и запустим периодический скан (раз в минуту)
    await scanOverdueNewTicketsAndNotify();
    setInterval(scanOverdueNewTicketsAndNotify, 60 * 1000);

    renderAll();

    // --- Необязательное демо "мигающей" просрочки (закомментировано, чтобы не слать тестовые события)
    /*
    const nowMs = Date.now();
    const demo = {
      id: 199,
      title: '🔥 Проверка: просроченная новая заявка',
      description: 'Демо для проверки мигающей рамки и оповещения ticket_overdue_new',
      status: 'new',
      priority: 'high',
      createdAt: new Date(nowMs - 45*60*1000).toISOString(),
      dueAt: new Date(nowMs - 30*60*1000).toISOString(),
      location: 'Демо‑зона',
      requester: 'System'
    };
    demo.month = monthFromISO(demo.createdAt);
    tickets.push(demo);
    renderAll();
    */
  })();

});
