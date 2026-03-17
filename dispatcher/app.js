/* =========================================================
   ZAS‑TRAC — Dispatcher UI: ШАГ 4 (МЕСЯЧНАЯ ЛОГИКА)
   Версия: архив тоже делится по месяцам
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

  /* ---------------------------------------------------------
     РОЛИ (пока локально, позже — Auth)
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

  const monthSelect = document.getElementById('month-select');
  const monthStats = document.getElementById('month-stats');

  /* --- Модалка --- */
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
     МОК-ДАННЫЕ (ticket.month будет добавлен автоматически)
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

  /* =========================================================
     МЕСЯЧНАЯ МИГРАЦИЯ
     ========================================================= */
  function ensureMonthFieldsAndMigrate() {
    for (const t of tickets) {
      if (!t.month) {
        if (t.status === 'closed') {
          t.month = monthFromISO(t.closedAt);
        } else {
          t.month = monthFromISO(t.createdAt);
        }
      }
    }

    const lastProcessed = localStorage.getItem('lastProcessedMonth');
    if (lastProcessed !== CURRENT_MONTH) {
      for (const t of tickets) {
        if (t.status !== 'closed') {
          t.month = CURRENT_MONTH;
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

      // ------ 🔥 ВАЖНО: архив теперь по месяцам ------
      if (t.status === 'closed') {
        if (t.month === selectedMonth) {
          groups.closed.push(t);
        }
        continue;
      }

      // остальные — тоже фильтруем по месяцу
      if (t.month === selectedMonth) {
        groups[t.status].push(t);
      }
    }

    // ------ сортировки ------
    groups.closed.sort(byClosedAtDesc);  // архив внутри месяца
    groups.new.sort(byPriority);
    groups.assigned.sort(byPriority);
    groups.inwork.sort(byPriority);
    groups.paused.sort(byPriority);

    // ------ счётчики ------
    for (const st in groups) {
      COUNT_EL[st].textContent = groups[st].length;
    }

    // ------ рендер плиток ------
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

      for (const t of arr) {
        list.appendChild(renderTicketTile(t));
      }
    }

    updateMonthStats(groups);
  }

  function isTail(t) {
    if (t.status === 'closed') return false;
    return daysBetween(t.createdAt, new Date().toISOString()) > 30;
  }

  function renderTicketTile(t) {
    const div = document.createElement('div');
    div.className = 'ticket';
    div.dataset.id = t.id;

    if (isTail(t)) {
      div.style.outline = '2px solid #e11d48';
      div.title = 'Хвост: заявке больше 30 дней';
    }

    const title = document.createElement('div');
    title.className = 'ticket-title';
    title.textContent = `#${t.id} — ${t.title}`;
    div.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'ticket-actions';
    const badge = document.createElement('span');
    badge.className = `badge ${t.priority}`;
    badge.innerHTML = `<span class="dot"></span> ${PRIORITY_RU[t.priority]}`;
    actions.appendChild(badge);
    div.appendChild(actions);

    const meta = document.createElement('div');
    meta.className = 'ticket-meta';
    meta.textContent =
      `Создана: ${formatDateTime(t.createdAt)} • Месяц: ${monthHuman(t.month)}`;
    div.appendChild(meta);

    if (t.description) {
      const d = document.createElement('div');
      d.className = 'ticket-meta';
      d.textContent = truncate(t.description, 180);
      div.appendChild(d);
    }

    div.addEventListener('click', () => openModal(t));
    return div;
  }

  function updateMonthStats(g) {
    const openTotal = g.new.length + g.assigned.length + g.inwork.length + g.paused.length;

    monthStats.textContent =
      `Месяц: ${monthHuman(selectedMonth)} • ` +
      `Открытых: ${openTotal} • ` +
      `Закрытые: ${g.closed.length}`;
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
    });
  }

  /* =========================================================
     МОДАЛКА
     ========================================================= */
  function openModal(t) {
    activeTicket = t;
    mTitle.textContent = `Заявка #${t.id}`;
    mCreated.textContent = formatDateTime(t.createdAt);
    mStatus.textContent = STATUS_RU[t.status];
    mPriority.textContent = PRIORITY_RU[t.priority];
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
    const byRole = new Set(ROLE_ACTIONS[CURRENT_ROLE]);
    const byStatus = new Set(STATUS_ACTIONS[t.status]);
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
     ДЕЙСТВИЯ (локально, потом API + Telegram)
     ========================================================= */
  btnAssign.addEventListener('click', () => {
    activeTicket.status = 'assigned';
    activeTicket.updatedAt = new Date().toISOString();
    rerender();
  });

  btnStart.addEventListener('click', () => {
    activeTicket.status = 'inwork';
    activeTicket.updatedAt = new Date().toISOString();
    rerender();
  });

  btnPause.addEventListener('click', () => {
    activeTicket.status = 'paused';
    activeTicket.updatedAt = new Date().toISOString();
    rerender();
  });

  btnResume.addEventListener('click', () => {
    activeTicket.status = 'inwork';
    activeTicket.updatedAt = new Date().toISOString();
    rerender();
  });

  btnClose.addEventListener('click', () => {
    const nowISO = new Date().toISOString();
    activeTicket.status = 'closed';
    activeTicket.updatedAt = nowISO;
    activeTicket.closedAt = nowISO;
    activeTicket.month = monthFromISO(activeTicket.closedAt);   // важное обновление
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
    renderAll();
  })();
});
