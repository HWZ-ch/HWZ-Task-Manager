/* =========================================================
   HWZ Task Manager — application logic
   ========================================================= */
(() => {
  'use strict';

  const STORAGE_KEY = 'hwz-task-manager:v1';
  const PREFS_KEY = 'hwz-task-manager:prefs';
  const EPOCH = '1970-01-01T00:00:00.000Z';

  const STATUS_META = {
    todo: { label: '待办', short: '待办' },
    progress: { label: '进行中', short: '进行中' },
    done: { label: '已完成', short: '已完成' }
  };
  const PRIORITY_META = {
    high: { label: '高优先级', short: '高', order: 0 },
    medium: { label: '中优先级', short: '中', order: 1 },
    low: { label: '低优先级', short: '低', order: 2 }
  };
  const VIEW_META = {
    today: { title: '今天的任务', kicker: '今日清单', crumb: '今天' },
    upcoming: { title: '即将到来', kicker: '未来 7 天', crumb: '即将到来' },
    all: { title: '全部任务', kicker: '所有事项', crumb: '全部任务' },
    completed: { title: '已完成的任务', kicker: '完成归档', crumb: '已完成' }
  };
  const WEEKDAYS_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const WEEKDAYS_SHORT = ['日', '一', '二', '三', '四', '五', '六'];
  const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const PROJECT_COLORS = ['#3f7a56', '#5277a6', '#c28645', '#8969a8', '#b65e58', '#6e7f3e', '#4b8b84', '#a96e8d'];
  const MAX_TAGS = 8;
  const MAX_SUBTASKS = 40;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function uid(prefix = 'task') {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${prefix}_${window.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) { return escapeHTML(value); }

  function icon(name, extra = '') {
    return `<svg class="icon${extra ? ` ${extra}` : ''}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function startOfDay(date = new Date()) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function addDays(days, base = new Date()) {
    const next = startOfDay(base);
    next.setDate(next.getDate() + days);
    return next;
  }

  function toISODate(date) {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseISODate(value) {
    if (!value || typeof value !== 'string') return null;
    const parts = value.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function todayISO() { return toISODate(new Date()); }
  function offsetISO(days) { return toISODate(addDays(days)); }

  function dayDiff(isoA, isoB) {
    const a = parseISODate(isoA);
    const b = parseISODate(isoB);
    if (!a || !b) return 0;
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  }

  function isSameWeek(isoTimestamp) {
    if (!isoTimestamp) return false;
    const date = new Date(isoTimestamp);
    if (Number.isNaN(date.getTime())) return false;
    const start = startOfWeek(new Date());
    const end = addDays(7, start);
    return date >= start && date < end;
  }

  function startOfWeek(base = new Date()) {
    const date = startOfDay(base);
    const day = date.getDay();
    const distance = day === 0 ? 6 : day - 1;
    date.setDate(date.getDate() - distance);
    return date;
  }

  function formatDateTitle(isoDate) {
    const date = parseISODate(isoDate);
    if (!date) return '';
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAYS_FULL[date.getDay()]}`;
  }

  function formatDateTime(isoTimestamp) {
    if (!isoTimestamp) return '—';
    const date = new Date(isoTimestamp);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function formatShortDate(isoDate) {
    const date = parseISODate(isoDate);
    if (!date) return '';
    const now = new Date();
    const year = date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}年`;
    return `${year}${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function greetingForHour(hour) {
    if (hour < 5) return '夜深了';
    if (hour < 9) return '早上好';
    if (hour < 12) return '上午好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }

  function timeOfDayFocus() {
    const hour = new Date().getHours();
    if (hour < 6) return '宜休息';
    if (hour < 11) return '宜专注';
    if (hour < 14) return '宜蓄力';
    if (hour < 18) return '宜推进';
    return '宜收尾';
  }

  function buildSeedData() {
    const now = new Date();
    const created = (daysAgo, hour = 9) => {
      const date = addDays(-daysAgo);
      date.setHours(hour, 20, 0, 0);
      return date.toISOString();
    };
    const completed = (daysAgo, hour = 10, minute = 30) => {
      const date = addDays(-daysAgo);
      date.setHours(hour, minute, 0, 0);
      return date.toISOString();
    };
    const due = (offset) => offsetISO(offset);
    const projects = [
      { id: 'p_design', name: '产品设计', color: '#3f7a56' },
      { id: 'p_work', name: '工作', color: '#5277a6' },
      { id: 'p_growth', name: '个人成长', color: '#c28645' },
      { id: 'p_life', name: '生活', color: '#8969a8' }
    ];
    const tasks = [
      {
        id: 'seed_website', title: '完成产品官网改版视觉稿',
        description: '完善首屏视觉层次，确认品牌色与字体规范，准备周五的设计评审。',
        projectId: 'p_design', status: 'progress', priority: 'high', dueDate: due(0),
        tags: ['设计', '官网'], subtasks: [
          { id: 'sub_1', title: '梳理首屏信息层级', done: true },
          { id: 'sub_2', title: '完成主视觉方案', done: true },
          { id: 'sub_3', title: '补齐移动端适配', done: false },
          { id: 'sub_4', title: '输出设计规范', done: false }
        ],
        createdAt: created(5, 8), updatedAt: completed(0, 9), completedAt: null
      },
      {
        id: 'seed_interviews', title: '整理本周用户访谈记录',
        description: '把 6 位用户的反馈归纳成机会点，标注影响范围与优先级。',
        projectId: 'p_work', status: 'todo', priority: 'medium', dueDate: due(0),
        tags: ['研究', '用户'], subtasks: [],
        createdAt: created(1, 14), updatedAt: created(1, 14), completedAt: null
      },
      {
        id: 'seed_review_mail', title: '回复设计评审邮件',
        description: '同步评审结论与后续修改分工。',
        projectId: 'p_work', status: 'done', priority: 'medium', dueDate: due(0),
        tags: ['沟通'], subtasks: [],
        createdAt: created(2, 9), updatedAt: completed(0, 9, 20), completedAt: completed(0, 9, 20)
      },
      {
        id: 'seed_reading', title: '阅读《高效能人士的七个习惯》第三章',
        description: '记录 3 条可以立刻实践的原则，写进本周复盘。',
        projectId: 'p_growth', status: 'done', priority: 'low', dueDate: due(0),
        tags: ['阅读'], subtasks: [
          { id: 'sub_5', title: '完成第三章阅读', done: true },
          { id: 'sub_6', title: '摘录核心观点', done: true }
        ],
        createdAt: created(5, 21), updatedAt: completed(0, 7, 50), completedAt: completed(0, 7, 50)
      },
      {
        id: 'seed_onboarding', title: '优化移动端 onboarding 流程',
        description: '减少首次使用步骤，重点验证新手引导的完成率。',
        projectId: 'p_design', status: 'progress', priority: 'high', dueDate: due(-1),
        tags: ['体验', '移动端'], subtasks: [
          { id: 'sub_7', title: '梳理现有流程节点', done: true },
          { id: 'sub_8', title: '绘制新版流程图', done: false },
          { id: 'sub_9', title: '组织快速可用性测试', done: false }
        ],
        createdAt: created(6, 10), updatedAt: created(1, 16), completedAt: null
      },
      {
        id: 'seed_q4_sync', title: '与团队同步 Q4 目标进展',
        description: '同步关键指标、风险与下阶段资源需求。',
        projectId: 'p_work', status: 'todo', priority: 'medium', dueDate: due(1),
        tags: ['会议'], subtasks: [],
        createdAt: created(2, 11), updatedAt: created(2, 11), completedAt: null
      },
      {
        id: 'seed_run', title: '跑步 5 公里',
        description: '轻松跑，保持呼吸节奏，结束后拉伸。',
        projectId: 'p_growth', status: 'todo', priority: 'low', dueDate: due(2),
        tags: ['运动'], subtasks: [],
        createdAt: created(1, 19), updatedAt: created(1, 19), completedAt: null
      },
      {
        id: 'seed_dashboard', title: '输出新版 Dashboard 交互说明',
        description: '覆盖数据卡片、筛选器和空状态，附上关键交互状态。',
        projectId: 'p_design', status: 'todo', priority: 'high', dueDate: due(2),
        tags: ['交互', '文档'], subtasks: [
          { id: 'sub_10', title: '整理组件清单', done: false },
          { id: 'sub_11', title: '补充状态流转说明', done: false }
        ],
        createdAt: created(1, 15), updatedAt: created(1, 15), completedAt: null
      },
      {
        id: 'seed_groceries', title: '购买周末食材',
        description: '列好清单，顺便补充一些水果和咖啡豆。',
        projectId: 'p_life', status: 'todo', priority: 'low', dueDate: due(3),
        tags: ['生活'], subtasks: [],
        createdAt: created(0, 8), updatedAt: created(0, 8), completedAt: null
      },
      {
        id: 'seed_retro', title: '整理季度复盘笔记',
        description: '从目标、过程、结果三个维度记录复盘，提炼可复用的方法。',
        projectId: 'p_growth', status: 'todo', priority: 'medium', dueDate: due(4),
        tags: ['复盘'], subtasks: [],
        createdAt: created(8, 10), updatedAt: created(3, 12), completedAt: null
      },
      {
        id: 'seed_competitor', title: '输出竞品体验分析报告',
        description: '对比核心路径与信息架构，给出可落地的改进建议。',
        projectId: 'p_design', status: 'todo', priority: 'high', dueDate: due(5),
        tags: ['研究', '竞品'], subtasks: [
          { id: 'sub_12', title: '完成竞品清单', done: true },
          { id: 'sub_13', title: '记录关键路径截图', done: false },
          { id: 'sub_14', title: '整理机会点结论', done: false }
        ],
        createdAt: created(3, 9), updatedAt: created(1, 18), completedAt: null
      },
      {
        id: 'seed_portfolio', title: '更新个人作品集',
        description: '补上最近的项目，重写项目背景与个人贡献。',
        projectId: 'p_growth', status: 'todo', priority: 'medium', dueDate: '',
        tags: ['作品集'], subtasks: [],
        createdAt: created(12, 20), updatedAt: created(12, 20), completedAt: null
      },
      {
        id: 'seed_requirements', title: '更新需求池优先级',
        description: '结合本周数据表现，重新排列下一迭代的需求。',
        projectId: 'p_work', status: 'todo', priority: 'high', dueDate: due(6),
        tags: ['需求'], subtasks: [],
        createdAt: created(2, 10), updatedAt: created(2, 10), completedAt: null
      },
      {
        id: 'seed_plant', title: '给阳台的植物浇水',
        description: '',
        projectId: 'p_life', status: 'todo', priority: 'low', dueDate: due(0),
        tags: ['生活'], subtasks: [],
        createdAt: created(0, 7), updatedAt: created(0, 7), completedAt: null
      },
      {
        id: 'seed_button', title: '修复按钮状态样式',
        description: '统一 hover、focus 与 disabled 状态，补齐设计变量。',
        projectId: 'p_design', status: 'done', priority: 'low', dueDate: due(-2),
        tags: ['设计系统'], subtasks: [],
        createdAt: created(6, 9), updatedAt: completed(2, 16), completedAt: completed(2, 16)
      },
      {
        id: 'seed_weekly', title: '完成周报与项目同步',
        description: '',
        projectId: 'p_work', status: 'done', priority: 'medium', dueDate: due(-3),
        tags: ['沟通'], subtasks: [],
        createdAt: created(7, 9), updatedAt: completed(3, 17, 10), completedAt: completed(3, 17, 10)
      },
      {
        id: 'seed_bookmarks', title: '整理桌面与浏览器书签',
        description: '归档旧资料，清空不再需要的收藏。',
        projectId: 'p_life', status: 'done', priority: 'low', dueDate: '',
        tags: ['整理'], subtasks: [],
        createdAt: created(14, 20), updatedAt: completed(4, 21, 5), completedAt: completed(4, 21, 5)
      },
      {
        id: 'seed_cssgrid', title: '学习 CSS Grid 布局',
        description: '完成三个小练习，并用 Grid 重构一个有代表性的页面。',
        projectId: 'p_growth', status: 'done', priority: 'low', dueDate: due(-1),
        tags: ['学习', '前端'], subtasks: [],
        createdAt: created(8, 20), updatedAt: completed(1, 22, 15), completedAt: completed(1, 22, 15)
      }
    ];
    return { projects, tasks };
  }
  function normalizeSubtask(raw) {
    if (!raw || typeof raw.title !== 'string') return null;
    return {
      id: String(raw.id || uid('sub')),
      title: raw.title.slice(0, 120),
      done: Boolean(raw.done)
    };
  }

  function normalizeTask(raw) {
    if (!raw || typeof raw.title !== 'string' || !raw.title.trim()) return null;
    const status = Object.prototype.hasOwnProperty.call(STATUS_META, raw.status) ? raw.status : 'todo';
    const priority = Object.prototype.hasOwnProperty.call(PRIORITY_META, raw.priority) ? raw.priority : 'medium';
    const dueDate = typeof raw.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate) ? raw.dueDate : '';
    const tags = Array.isArray(raw.tags)
      ? [...new Set(raw.tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim().replace(/^#/, '').slice(0, 18)).filter(Boolean))].slice(0, MAX_TAGS)
      : [];
    const subtasks = Array.isArray(raw.subtasks) ? raw.subtasks.map(normalizeSubtask).filter(Boolean).slice(0, MAX_SUBTASKS) : [];
    const createdAt = raw.createdAt && !Number.isNaN(new Date(raw.createdAt).getTime()) ? new Date(raw.createdAt).toISOString() : new Date().toISOString();
    const updatedAt = raw.updatedAt && !Number.isNaN(new Date(raw.updatedAt).getTime()) ? new Date(raw.updatedAt).toISOString() : createdAt;
    let completedAt = raw.completedAt && !Number.isNaN(new Date(raw.completedAt).getTime()) ? new Date(raw.completedAt).toISOString() : null;
    if (status === 'done' && !completedAt) completedAt = updatedAt;
    if (status !== 'done') completedAt = null;
    return {
      id: String(raw.id || uid('task')),
      title: raw.title.trim().slice(0, 160),
      description: typeof raw.description === 'string' ? raw.description.slice(0, 800) : '',
      projectId: typeof raw.projectId === 'string' ? raw.projectId : '',
      status,
      priority,
      dueDate,
      tags,
      subtasks,
      createdAt,
      updatedAt,
      completedAt
    };
  }

  function normalizeProjects(rawProjects) {
    if (!Array.isArray(rawProjects)) return [];
    const seen = new Set();
    const list = [];
    rawProjects.forEach((raw) => {
      if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) return;
      const id = String(raw.id || uid('project'));
      if (seen.has(id)) return;
      seen.add(id);
      list.push({
        id,
        name: raw.name.trim().slice(0, 20),
        color: /^#[0-9a-f]{6}$/i.test(raw.color || '') ? raw.color : PROJECT_COLORS[list.length % PROJECT_COLORS.length]
      });
    });
    return list;
  }

  function normalizeData(raw) {
    if (!raw || !Array.isArray(raw.tasks)) throw new Error('Invalid data');
    const projects = normalizeProjects(raw.projects);
    const projectIds = new Set(projects.map((project) => project.id));
    const tasks = raw.tasks.map(normalizeTask).filter(Boolean).map((task) => {
      if (task.projectId && !projectIds.has(task.projectId)) task.projectId = '';
      return task;
    });
    return { projects, tasks };
  }

  function readStoredData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalizeData(JSON.parse(raw));
    } catch (error) {
      console.warn('HWZ Task Manager: could not read local data.', error);
      return null;
    }
  }

  function readPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return {};
      const prefs = JSON.parse(raw);
      return prefs && typeof prefs === 'object' ? prefs : {};
    } catch (error) {
      return {};
    }
  }

  const storedData = readStoredData();
  const initialPrefs = readPrefs();
  const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const preferredTheme = initialPrefs.theme === 'dark' || initialPrefs.theme === 'light'
    ? initialPrefs.theme
    : (systemPrefersDark ? 'dark' : 'light');

  const state = {
    data: storedData || buildSeedData(),
    view: 'today',
    projectId: null,
    tag: null,
    search: '',
    status: 'all',
    sort: ['smart', 'due', 'priority', 'created'].includes(initialPrefs.sort) ? initialPrefs.sort : 'smart',
    display: initialPrefs.display === 'board' ? 'board' : 'list',
    theme: preferredTheme,
    draft: null,
    editingId: null,
    lastFocus: null,
    toastTimer: null,
    toastAction: null,
    searchTimer: null,
    resetArmed: false,
    resetTimer: null,
    justDraggedAt: 0,
    storageWarningShown: false
  };
  if (state.display === 'board') state.status = 'all';

  const els = {
    html: document.documentElement,
    body: document.body,
    sidebar: $('#sidebar'),
    sidebarScrim: $('#sidebar-scrim'),
    menuBtn: $('#menu-btn'),
    sidebarClose: $('#sidebar-close'),
    navItems: $$('.nav-item'),
    projectList: $('#project-list'),
    tagCloud: $('#tag-cloud'),
    tagsSection: $('#tags-section'),
    clearTagBtn: $('#clear-tag-btn'),
    newProjectBtn: $('#new-project-btn'),
    themeBtn: $('#theme-btn'),
    searchInput: $('#search-input'),
    searchClear: $('#search-clear'),
    newTaskBtn: $('#new-task-btn'),
    dateLabel: $('#date-label'),
    greeting: $('#greeting'),
    heroSummary: $('#hero-summary'),
    focusChip: $('.focus-chip'),
    dateTileMonth: $('#date-tile-month'),
    dateTileDay: $('#date-tile-day'),
    dateTileWeekday: $('#date-tile-weekday'),
    focusLineLabel: $('.focus-line span:first-child'),
    focusTime: $('#focus-time'),
    statGrid: $('#stat-grid'),
    taskPanel: $('#task-panel'),
    quickAdd: $('#quick-add'),
    quickInput: $('#quick-input'),
    filterTabs: $('#filter-tabs'),
    sortSelect: $('#sort-select'),
    taskView: $('#task-view'),
    listKicker: $('#list-kicker'),
    listHeading: $('#list-heading'),
    listSubtitle: $('#list-subtitle'),
    crumbCurrent: $('#crumb-current'),
    viewButtons: $$('.view-btn'),
    progressBadge: $('#progress-badge'),
    progressRing: $('#progress-ring'),
    ringPercent: $('#ring-percent'),
    doneToday: $('#done-today'),
    totalToday: $('#total-today'),
    progressBars: $('#progress-bars'),
    overdueStrip: $('#overdue-strip'),
    overdueLabel: $('#overdue-label'),
    weekDoneCount: $('#week-done-count'),
    weekChart: $('#week-chart'),
    weekCaption: $('#week-caption'),
    upcomingList: $('#upcoming-list'),
    viewUpcomingBtn: $('#view-upcoming-btn'),
    sheetLayer: $('#sheet-layer'),
    sheetBackdrop: $('#sheet-backdrop'),
    sheetClose: $('#sheet-close'),
    sheetKicker: $('#sheet-kicker'),
    sheetHeading: $('#sheet-heading'),
    taskForm: $('#task-form'),
    taskTitle: $('#task-title'),
    titleError: $('#title-error'),
    taskDesc: $('#task-desc'),
    taskStatus: $('#task-status'),
    taskPriority: $('#task-priority'),
    taskDue: $('#task-due'),
    clearDateBtn: $('#clear-date-btn'),
    taskProject: $('#task-project'),
    tagInput: $('#tag-input'),
    tagPills: $('#tag-pills'),
    subtaskList: $('#subtask-list'),
    subtaskInput: $('#subtask-input'),
    subtaskAddBtn: $('#subtask-add-btn'),
    subtaskProgressText: $('#subtask-progress-text'),
    subtaskProgressBar: $('#subtask-progress-bar'),
    createMeta: $('#create-meta'),
    deleteTaskBtn: $('#delete-task-btn'),
    cancelTaskBtn: $('#cancel-task-btn'),
    saveTaskBtn: $('#save-task-btn'),
    projectLayer: $('#project-layer'),
    projectForm: $('#project-form'),
    projectName: $('#project-name'),
    colorOptions: $('#color-options'),
    dataLayer: $('#data-layer'),
    dataMeta: $('#data-meta'),
    exportDataBtn: $('#export-data-btn'),
    importDataBtn: $('#import-data-btn'),
    importFile: $('#import-file'),
    resetDataBtn: $('#reset-data-btn'),
    dataLink: $('#data-link'),
    dataBtn: $('#data-btn'),
    toast: $('#toast'),
    toastMessage: $('#toast-message'),
    toastAction: $('#toast-action'),
    toastClose: $('#toast-close'),
    toastIcon: $('.toast-icon use'),
    overlayCloseButtons: $$('[data-close-modal]')
  };

  let selectedProjectColor = PROJECT_COLORS[0];

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        tasks: state.data.tasks,
        projects: state.data.projects
      }));
    } catch (error) {
      console.warn('HWZ Task Manager: could not save local data.', error);
      if (!state.storageWarningShown) {
        state.storageWarningShown = true;
        showToast('浏览器阻止了本地存储，改动可能不会保留');
      }
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        theme: state.theme,
        display: state.display,
        sort: state.sort
      }));
    } catch (error) {
      /* Preferences are non-critical. */
    }
  }

  function getProject(projectId) {
    return state.data.projects.find((project) => project.id === projectId) || null;
  }

  function getTask(taskId) {
    return state.data.tasks.find((task) => task.id === taskId) || null;
  }

  function applyTheme(theme) {
    state.theme = theme === 'dark' ? 'dark' : 'light';
    els.html.dataset.theme = state.theme;
    const isDark = state.theme === 'dark';
    els.themeBtn.setAttribute('aria-label', isDark ? '切换到浅色模式' : '切换到深色模式');
    els.themeBtn.setAttribute('title', isDark ? '切换到浅色模式' : '切换到深色模式');
    const themeColor = isDark ? '#101410' : '#f2f1ea';
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', themeColor);
    savePrefs();
  }

  function matchesQuery(task, query) {
    if (!query) return true;
    const project = getProject(task.projectId);
    const haystack = [
      task.title,
      task.description,
      ...task.tags,
      ...task.subtasks.map((subtask) => subtask.title),
      project ? project.name : ''
    ].join('\n').toLowerCase();
    return query.split(/\s+/).filter(Boolean).every((part) => haystack.includes(part));
  }

  function getBaseTasks() {
    const tasks = state.data.tasks;
    const today = todayISO();
    const query = state.search.trim().toLowerCase();
    if (query) return tasks.filter((task) => matchesQuery(task, query));
    if (state.projectId) return tasks.filter((task) => task.projectId === state.projectId);
    if (state.tag) return tasks.filter((task) => task.tags.includes(state.tag));
    if (state.view === 'today') {
      return tasks.filter((task) => task.dueDate && task.dueDate <= today && (task.status !== 'done' || task.dueDate === today));
    }
    if (state.view === 'upcoming') {
      const end = offsetISO(7);
      return tasks.filter((task) => task.dueDate && task.dueDate > today && task.dueDate <= end);
    }
    if (state.view === 'completed') return tasks.filter((task) => task.status === 'done');
    return tasks;
  }

  function getVisibleTasks() {
    const base = getBaseTasks();
    if (state.view === 'completed' && !state.search && !state.projectId && !state.tag) return base;
    if (state.status === 'all') return base;
    return base.filter((task) => task.status === state.status);
  }

  function getStatusCounts(tasks) {
    const counts = { all: tasks.length, todo: 0, progress: 0, done: 0 };
    tasks.forEach((task) => { counts[task.status] += 1; });
    return counts;
  }

  function sortTasks(tasks) {
    const list = [...tasks];
    const byDue = (a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    };
    if (state.view === 'completed' && !state.search && !state.projectId && !state.tag) {
      return list.sort((a, b) => new Date(b.completedAt || EPOCH) - new Date(a.completedAt || EPOCH));
    }
    if (state.sort === 'due') {
      return list.sort((a, b) => byDue(a, b) || PRIORITY_META[a.priority].order - PRIORITY_META[b.priority].order);
    }
    if (state.sort === 'priority') {
      return list.sort((a, b) => PRIORITY_META[a.priority].order - PRIORITY_META[b.priority].order || byDue(a, b));
    }
    if (state.sort === 'created') {
      return list.sort((a, b) => new Date(b.createdAt || EPOCH) - new Date(a.createdAt || EPOCH));
    }
    return list.sort((a, b) => {
      const aDone = a.status === 'done' ? 1 : 0;
      const bDone = b.status === 'done' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      if (aDone && bDone) return new Date(b.completedAt || EPOCH) - new Date(a.completedAt || EPOCH);
      const dueSort = byDue(a, b);
      if (dueSort !== 0) return dueSort;
      const prioritySort = PRIORITY_META[a.priority].order - PRIORITY_META[b.priority].order;
      if (prioritySort !== 0) return prioritySort;
      return new Date(b.createdAt || EPOCH) - new Date(a.createdAt || EPOCH);
    });
  }

  function computeCounts() {
    const tasks = state.data.tasks;
    const today = todayISO();
    const weekStart = startOfWeek();
    const weekEnd = addDays(7, weekStart);
    const active = tasks.filter((task) => task.status !== 'done');
    const todayDue = tasks.filter((task) => task.dueDate === today);
    const todayDone = todayDue.filter((task) => task.status === 'done');
    const pendingTodayTasks = todayDue.filter((task) => task.status !== 'done');
    const pendingToday = pendingTodayTasks.length;
    const progressTasks = tasks.filter((task) => task.status === 'progress');
    const overdueTasks = active.filter((task) => task.dueDate && task.dueDate < today);
    const weekCompleted = tasks.filter((task) => {
      if (task.status !== 'done' || !task.completedAt) return false;
      const completed = new Date(task.completedAt);
      return completed >= weekStart && completed < weekEnd;
    });
    const upcomingActive = active.filter((task) => task.dueDate && task.dueDate > today && task.dueDate <= offsetISO(7));
    const openSubtasks = progressTasks.reduce((sum, task) => sum + task.subtasks.filter((subtask) => !subtask.done).length, 0);
    return {
      today,
      active,
      todayDue,
      todayDone,
      pendingTodayTasks,
      pendingToday,
      progressTasks,
      progress: progressTasks.length,
      overdueTasks,
      overdue: overdueTasks.length,
      weekCompleted,
      weekDone: weekCompleted.length,
      upcomingActive,
      highPendingToday: pendingTodayTasks.filter((task) => task.priority === 'high').length,
      todayRate: todayDue.length ? Math.round((todayDone.length / todayDue.length) * 100) : 0,
      openSubtasks,
      menuCounts: {
        today: active.filter((task) => task.dueDate && task.dueDate <= today).length,
        upcoming: upcomingActive.length,
        all: active.length,
        completed: tasks.filter((task) => task.status === 'done').length
      }
    };
  }

  function renderDateAndGreeting(counts) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    els.dateLabel.textContent = `${month}月${day}日 · ${WEEKDAYS_FULL[now.getDay()]}`;
    els.dateTileMonth.textContent = MONTHS_SHORT[now.getMonth()];
    els.dateTileDay.textContent = String(day).padStart(2, '0');
    els.dateTileWeekday.textContent = WEEKDAYS_FULL[now.getDay()];
    els.greeting.innerHTML = `${greetingForHour(now.getHours())}，HWZ<span class="title-dot">.</span>`;
    els.focusChip.innerHTML = `${icon('spark')}${timeOfDayFocus()}`;
    if (els.focusLineLabel) els.focusLineLabel.textContent = '今日待办';
    els.focusTime.textContent = `${counts.pendingToday} 项`;

    let summary = '';
    if (counts.pendingToday > 0) {
      summary = `今天还有 <b>${counts.pendingToday}</b> 项任务`;
      const activeProgress = counts.progressTasks.filter((task) => task.dueDate === counts.today).length;
      if (activeProgress > 0) summary += `，其中 <b>${activeProgress}</b> 项正在进行`;
      summary += '。';
      if (counts.overdue > 0) {
        summary += `另有 <b>${counts.overdue}</b> 项已逾期，记得重新安排。`;
      } else {
        summary += '保持节奏，一件件完成。';
      }
    } else if (counts.todayDue.length > 0) {
      summary = '今天的任务已经全部完成。给自己留一点空白，也是一种效率。';
    } else if (counts.active.length > 0) {
      summary = `今天还没有安排任务，清单里还有 <b>${counts.active.length}</b> 项待办。可以从最重要的一件开始。`;
    } else {
      summary = '清单很轻盈。写下第一件想完成的事，让今天有一个清晰的开始。';
    }
    els.heroSummary.innerHTML = summary;
  }

  function renderStats(counts) {
    const cards = [
      {
        label: '今日待办',
        value: counts.pendingToday,
        iconName: 'sun',
        accent: true,
        hint: counts.pendingToday === 0
          ? (counts.todayDue.length ? '今天已全部完成' : '今天还没有任务')
          : (counts.highPendingToday > 0 ? `其中 ${counts.highPendingToday} 项高优先级` : '按自己的节奏完成')
      },
      {
        label: '进行中',
        value: counts.progress,
        iconName: 'target',
        iconClass: 'is-info',
        hint: counts.openSubtasks > 0 ? `${counts.openSubtasks} 个待推进子任务` : '保持专注，逐步推进'
      },
      {
        label: '本周完成',
        value: counts.weekDone,
        iconName: 'check-circle',
        hint: counts.todayRate > 0 ? `今日完成率 ${counts.todayRate}%` : '每一步都算数'
      },
      {
        label: '已逾期',
        value: counts.overdue,
        iconName: 'clock',
        iconClass: 'is-danger',
        danger: counts.overdue > 0,
        hint: counts.overdue > 0 ? '建议优先重新安排' : '暂未逾期，节奏不错'
      }
    ];
    els.statGrid.innerHTML = cards.map((card) => `
      <article class="stat-card${card.accent ? ' is-accent' : ''}${card.danger ? ' is-danger' : ''}">
        <div class="stat-top">
          <span class="stat-label">${card.label}</span>
          <span class="stat-icon ${card.iconClass || ''}">${icon(card.iconName)}</span>
        </div>
        <div class="stat-main">
          <strong class="stat-number">${card.value}</strong>
        </div>
        <p class="stat-hint">${card.hint}</p>
      </article>
    `).join('');
  }

  function renderSidebar(counts) {
    const noFilter = !state.projectId && !state.tag && !state.search;
    els.navItems.forEach((item) => {
      const isActive = noFilter && item.dataset.view === state.view;
      item.classList.toggle('is-active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    Object.entries(counts.menuCounts).forEach(([key, value]) => {
      const node = document.querySelector(`[data-count="${key}"]`);
      if (node) node.textContent = value;
    });

    els.projectList.innerHTML = state.data.projects.length
      ? state.data.projects.map((project) => {
        const openCount = state.data.tasks.filter((task) => task.projectId === project.id && task.status !== 'done').length;
        return `
          <button class="project-item${state.projectId === project.id ? ' is-active' : ''}" type="button" data-project-id="${escapeAttr(project.id)}" aria-label="${escapeAttr(project.name)}，${openCount} 项待完成">
            <span class="project-dot" style="--project-color:${project.color}"></span>
            <span class="project-name">${escapeHTML(project.name)}</span>
            <span class="project-count">${openCount}</span>
          </button>`;
      }).join('')
      : '<p class="project-empty">还没有项目，点击 + 开始整理。</p>';

    const tagCounts = new Map();
    state.data.tasks.forEach((task) => {
      if (task.status === 'done') return;
      task.tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
    });
    const tags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, 9)
      .map(([tag]) => tag);
    if (state.tag && !tags.includes(state.tag)) tags.unshift(state.tag);
    els.tagCloud.innerHTML = tags.length
      ? tags.map((tag) => `<button class="tag-chip${state.tag === tag ? ' is-active' : ''}" type="button" data-tag="${escapeAttr(tag)}" aria-label="标签 ${escapeAttr(tag)}，${tagCounts.get(tag) || 0} 项待完成">${escapeHTML(tag)}</button>`).join('')
      : '<span class="tag-empty">给任务加上标签，更容易找到它们。</span>';
    els.clearTagBtn.hidden = !state.tag;
  }

  function renderFilterTabs() {
    const counts = getStatusCounts(getBaseTasks());
    const hide = state.display === 'board' || (state.view === 'completed' && !state.search && !state.projectId && !state.tag);
    els.filterTabs.hidden = hide;
    els.filterTabs.innerHTML = [
      ['all', '全部'],
      ['todo', '待办'],
      ['progress', '进行中'],
      ['done', '已完成']
    ].map(([key, label]) => `
      <button class="filter-tab${state.status === key ? ' is-active' : ''}" type="button" data-status="${key}" aria-pressed="${state.status === key}">
        ${label}<span>${counts[key]}</span>
      </button>
    `).join('');
    const tools = $('.task-tools');
    if (tools) tools.classList.toggle('is-single', hide);
  }

  function getContextInfo() {
    const base = getBaseTasks();
    const openCount = base.filter((task) => task.status !== 'done').length;
    const doneCount = base.length - openCount;
    const query = state.search.trim();
    if (query) {
      return {
        title: '搜索结果',
        kicker: '全局搜索',
        crumb: '搜索',
        subtitle: `在全部任务中找到 ${base.length} 项与 “${query}” 相关的结果`
      };
    }
    if (state.projectId) {
      const project = getProject(state.projectId);
      return {
        title: project ? project.name : '项目',
        kicker: '项目清单',
        crumb: project ? project.name : '项目',
        subtitle: `共 ${base.length} 项 · ${openCount} 项待完成`
      };
    }
    if (state.tag) {
      return {
        title: `# ${state.tag}`,
        kicker: '标签筛选',
        crumb: `# ${state.tag}`,
        subtitle: `共 ${base.length} 项 · ${openCount} 项待完成`
      };
    }
    const meta = VIEW_META[state.view] || VIEW_META.today;
    let subtitle = `共 ${base.length} 项 · ${openCount} 项待完成`;
    if (state.view === 'today') {
      subtitle = base.length
        ? `今天到期与逾期共 ${base.length} 项 · 已完成 ${doneCount} 项`
        : '今天没有安排，留一点时间给自己';
    } else if (state.view === 'upcoming') {
      subtitle = base.length ? `未来 7 天有 ${base.length} 项安排 · ${openCount} 项待完成` : '未来 7 天暂时没有安排';
    } else if (state.view === 'completed') {
      subtitle = `共 ${base.length} 项已完成 · 记录每一步进展`;
    } else if (state.view === 'all') {
      subtitle = `全部 ${base.length} 项 · ${openCount} 项待完成`;
    }
    return { title: meta.title, kicker: meta.kicker, crumb: meta.crumb, subtitle };
  }

  function renderPanelHeader() {
    const context = getContextInfo();
    els.listKicker.textContent = context.kicker;
    els.listHeading.textContent = context.title;
    els.crumbCurrent.textContent = context.crumb;
    const visible = getVisibleTasks();
    let subtitle = context.subtitle;
    if (state.status !== 'all' && !(state.view === 'completed' && !state.search && !state.projectId && !state.tag)) {
      subtitle += ` · 当前筛选 ${visible.length} 项`;
    }
    els.listSubtitle.textContent = subtitle;
    els.taskPanel.classList.toggle('is-board', state.display === 'board');
    els.viewButtons.forEach((button) => {
      const active = button.dataset.display === state.display;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    els.sortSelect.value = state.sort;
    els.quickInput.placeholder = state.view === 'completed'
      ? '添加一项新任务，从今天开始…'
      : '快速添加任务，按 Enter 保存…';
  }

  function dueInfo(task) {
    if (!task.dueDate) return null;
    const today = todayISO();
    const diff = dayDiff(task.dueDate, today);
    const date = parseISODate(task.dueDate);
    let text = '';
    let cls = '';
    if (task.status === 'done') {
      text = formatShortDate(task.dueDate);
    } else if (diff < 0) {
      text = `逾期 ${Math.abs(diff)} 天`;
      cls = 'is-overdue';
    } else if (diff === 0) {
      text = '今天';
      cls = 'is-today';
    } else if (diff === 1) {
      text = '明天';
    } else if (diff <= 6) {
      text = `周${WEEKDAYS_SHORT[date.getDay()]}`;
    } else {
      text = formatShortDate(task.dueDate);
    }
    return { text, cls, title: formatDateTitle(task.dueDate), diff };
  }

  function priorityPill(priority) {
    const meta = PRIORITY_META[priority] || PRIORITY_META.medium;
    return `<span class="priority-pill priority-${priority}" title="${meta.label}">${meta.short}</span>`;
  }

  function taskSubtaskMeta(task) {
    if (!task.subtasks.length) return '';
    const done = task.subtasks.filter((subtask) => subtask.done).length;
    const percent = Math.round((done / task.subtasks.length) * 100);
    return `<span class="meta-item meta-subtasks" title="子任务进度">${icon('check-square')}<span class="mini-progress"><i style="width:${percent}%"></i></span>${done}/${task.subtasks.length}</span>`;
  }

  function taskRowHTML(task) {
    const project = getProject(task.projectId);
    const due = dueInfo(task);
    const tags = task.tags.slice(0, 2).map((tag) => `<span class="task-tag">#${escapeHTML(tag)}</span>`).join('');
    const moreTags = task.tags.length > 2 ? `<span class="task-tag">+${task.tags.length - 2}</span>` : '';
    const statusChip = task.status === 'progress' ? '<span class="status-chip">进行中</span>' : '';
    const title = escapeHTML(task.title);
    const rowLabel = `${task.title}${due ? `，${due.text}` : ''}${task.status === 'done' ? '，已完成' : ''}`;
    return `
      <article class="task-row${task.status === 'done' ? ' is-done' : ''}" data-task-id="${escapeAttr(task.id)}" tabindex="0" aria-label="${escapeAttr(rowLabel)}">
        <button class="task-check" type="button" data-action="toggle" aria-label="${task.status === 'done' ? '标记为未完成' : '标记完成'}" aria-pressed="${task.status === 'done'}">
          ${icon('check')}
        </button>
        <div class="task-body">
          <div class="task-title-line">
            <h3 class="task-title">${title}</h3>
            ${statusChip}
          </div>
          ${task.description ? `<p class="task-desc">${escapeHTML(task.description)}</p>` : ''}
          <div class="task-meta">
            ${project ? `<span class="meta-item meta-project"><span class="project-dot" style="--project-color:${project.color}"></span>${escapeHTML(project.name)}</span>` : '<span class="meta-item meta-project"><span class="project-dot" style="--project-color:#9aa88d"></span>未分类</span>'}
            ${due ? `<span class="meta-item meta-date ${due.cls}" title="${escapeAttr(due.title)}">${icon('calendar')}${escapeHTML(due.text)}</span>` : ''}
            ${taskSubtaskMeta(task)}
            ${tags || moreTags ? `<span class="task-tags">${tags}${moreTags}</span>` : ''}
          </div>
        </div>
        <div class="task-side">
          ${priorityPill(task.priority)}
          <span class="row-open" aria-hidden="true">${icon('arrow-up-right')}</span>
        </div>
      </article>
    `;
  }

  function emptyStateHTML() {
    if (state.search.trim()) {
      return {
        iconName: 'search',
        title: '没有找到相关任务',
        text: '试试换一个关键词，或者清除搜索查看全部任务。',
        action: 'clear-search',
        actionLabel: '清除搜索'
      };
    }
    if (state.status !== 'all') {
      return {
        iconName: 'layers',
        title: '这个筛选下暂无任务',
        text: '切换其他状态，看看有没有被遗漏的事项。',
        action: 'clear-status',
        actionLabel: '查看全部'
      };
    }
    if (state.view === 'completed') {
      return {
        iconName: 'check-circle',
        title: '还没有完成的任务',
        text: '完成一项任务后，它会安安静静地出现在这里。',
        action: 'new-task',
        actionLabel: '新建任务'
      };
    }
    if (state.view === 'today') {
      return {
        iconName: 'sun',
        title: '今天的清单很轻盈',
        text: '可以做点喜欢的事，或者为明天留一点余地。',
        action: 'new-task',
        actionLabel: '新建任务'
      };
    }
    if (state.projectId) {
      return {
        iconName: 'folder',
        title: '这个项目还没有任务',
        text: '把想法写下来，让项目开始运转。',
        action: 'new-task',
        actionLabel: '新建任务'
      };
    }
    return {
      iconName: 'spark',
      title: '从一件小事开始',
      text: '写下第一件想完成的事，让思绪变得清晰。',
      action: 'new-task',
      actionLabel: '新建任务'
    };
  }

  function renderList(tasks) {
    if (!tasks.length) {
      const empty = emptyStateHTML();
      return `
        <div class="empty-state">
          <div class="empty-illustration">${icon(empty.iconName)}</div>
          <h3>${empty.title}</h3>
          <p>${empty.text}</p>
          <button class="btn btn-soft" type="button" data-action="${empty.action}">${icon(empty.action === 'new-task' ? 'plus' : 'arrow-right')}${empty.actionLabel}</button>
        </div>`;
    }
    return `<div class="task-list">${tasks.map(taskRowHTML).join('')}</div>`;
  }

  function boardCardHTML(task) {
    const project = getProject(task.projectId);
    const due = dueInfo(task);
    const tags = task.tags.slice(0, 2).map((tag) => `<span>#${escapeHTML(tag)}</span>`).join('');
    return `
      <article class="board-card" draggable="true" data-task-id="${escapeAttr(task.id)}" tabindex="0" aria-label="${escapeAttr(task.title)}">
        <div class="board-card-top">
          <h4>${escapeHTML(task.title)}</h4>
          <span class="board-grip" aria-hidden="true">${icon('grip')}</span>
        </div>
        ${task.description ? `<p>${escapeHTML(task.description)}</p>` : ''}
        <div class="board-card-meta">
          ${project ? `<span class="meta-item meta-project"><span class="project-dot" style="--project-color:${project.color}"></span>${escapeHTML(project.name)}</span>` : ''}
          ${due ? `<span class="meta-item meta-date ${due.cls}">${icon('calendar')}${escapeHTML(due.text)}</span>` : ''}
          ${task.subtasks.length ? `<span class="meta-item">${icon('check-square')}${task.subtasks.filter((subtask) => subtask.done).length}/${task.subtasks.length}</span>` : ''}
          ${priorityPill(task.priority)}
        </div>
        ${tags ? `<div class="board-card-tags">${tags}</div>` : ''}
      </article>
    `;
  }

  function renderBoard(tasks) {
    const columns = [
      { status: 'todo', label: '待办' },
      { status: 'progress', label: '进行中' },
      { status: 'done', label: '已完成' }
    ];
    return `
      <div class="board">
        ${columns.map((column) => {
          const columnTasks = tasks.filter((task) => task.status === column.status);
          return `
            <section class="board-col" data-status="${column.status}">
              <header class="board-head">
                <h3><span class="board-status-dot"></span>${column.label}<span class="board-count">${columnTasks.length}</span></h3>
                <button class="board-add" type="button" data-action="new-in-status" data-status="${column.status}" aria-label="在${column.label}中新建任务">${icon('plus')}</button>
              </header>
              <div class="board-list" data-drop-status="${column.status}">
                ${columnTasks.length ? columnTasks.map(boardCardHTML).join('') : `<div class="board-empty">${icon('plus')}<span>拖拽任务到这里</span></div>`}
              </div>
            </section>`;
        }).join('')}
      </div>
    `;
  }

  function renderTaskView() {
    const visible = sortTasks(getVisibleTasks());
    if (!visible.length) {
      const empty = emptyStateHTML();
      els.taskView.innerHTML = `
        <div class="empty-state">
          <div class="empty-illustration">${icon(empty.iconName)}</div>
          <h3>${empty.title}</h3>
          <p>${empty.text}</p>
          <button class="btn btn-soft" type="button" data-action="${empty.action}">${icon(empty.action === 'new-task' ? 'plus' : 'arrow-right')}${empty.actionLabel}</button>
        </div>`;
      return;
    }
    els.taskView.innerHTML = state.display === 'board' ? renderBoard(visible) : `<div class="task-list">${visible.map(taskRowHTML).join('')}</div>`;
  }

  function renderTaskArea() {
    renderPanelHeader();
    renderFilterTabs();
    renderTaskView();
  }

  function renderRail(counts) {
    const total = counts.todayDue.length;
    const done = counts.todayDone.length;
    const rate = total ? Math.round((done / total) * 100) : 0;
    els.progressBadge.textContent = `${rate}%`;
    els.ringPercent.innerHTML = `${rate}<span>%</span>`;
    els.doneToday.textContent = done;
    els.totalToday.textContent = total;
    const ringCircle = els.progressRing.querySelector('.ring-fill');
    if (ringCircle) ringCircle.style.strokeDashoffset = String(326.73 * (1 - rate / 100));

    const breakdown = [
      { key: 'todo', label: '待办', color: '#c8d2c1' },
      { key: 'progress', label: '进行中', color: '#9ab8dd' },
      { key: 'done', label: '已完成', color: '#d9f99d' }
    ];
    const countsByStatus = {
      todo: counts.todayDue.filter((task) => task.status === 'todo').length,
      progress: counts.todayDue.filter((task) => task.status === 'progress').length,
      done: counts.todayDone.length
    };
    els.progressBars.innerHTML = breakdown.map((row) => {
      const value = countsByStatus[row.key];
      const width = total ? Math.max(value > 0 ? 6 : 0, (value / total) * 100) : 0;
      return `
        <div class="progress-bar-row">
          <div class="progress-bar-label"><span><i style="--bar-color:${row.color}"></i>${row.label}</span><span>${value}</span></div>
          <div class="progress-bar-track"><span style="--bar-color:${row.color};width:${width}%"></span></div>
        </div>`;
    }).join('');

    if (counts.overdue > 0) {
      els.overdueStrip.hidden = false;
      els.overdueLabel.textContent = `${counts.overdue} 项任务已逾期`;
    } else {
      els.overdueStrip.hidden = true;
    }

    const weekStart = startOfWeek();
    const weekValues = [];
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(index, weekStart);
      const iso = toISODate(date);
      const value = counts.weekCompleted.filter((task) => toISODate(new Date(task.completedAt)) === iso).length;
      weekValues.push({ date, iso, value, label: WEEKDAYS_SHORT[date.getDay()] });
    }
    const max = Math.max(1, ...weekValues.map((item) => item.value));
    els.weekDoneCount.textContent = counts.weekDone;
    els.weekChart.innerHTML = weekValues.map((item) => {
      const isToday = item.iso === counts.today;
      const height = item.value === 0 ? 0 : Math.max(18, Math.round((item.value / max) * 100));
      return `
        <div class="week-day${isToday ? ' is-today' : ''}${item.value ? ' has-count' : ''}" title="${item.iso}：完成 ${item.value} 项">
          <div class="week-bar-wrap">
            <span class="week-count">${item.value}</span>
            <span class="week-bar" style="height:${height}%"></span>
          </div>
          <span class="week-label">${item.label}</span>
        </div>`;
    }).join('');
    const todayIndex = weekValues.findIndex((item) => item.iso === counts.today);
    if (counts.weekDone === 0) {
      els.weekCaption.textContent = '这一周还在展开，完成一件小事就会有记录。';
    } else if (todayIndex >= 6) {
      els.weekCaption.textContent = `本周已完成 ${counts.weekDone} 项，给这一周一个漂亮的收尾。`;
    } else {
      els.weekCaption.textContent = `本周已完成 ${counts.weekDone} 项，还有 ${6 - todayIndex} 天可以继续推进。`;
    }

    const upcoming = state.data.tasks
      .filter((task) => task.status !== 'done' && task.dueDate && task.dueDate >= counts.today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || PRIORITY_META[a.priority].order - PRIORITY_META[b.priority].order)
      .slice(0, 4);
    els.upcomingList.innerHTML = upcoming.length
      ? upcoming.map((task) => {
        const project = getProject(task.projectId);
        const date = parseISODate(task.dueDate);
        const diff = dayDiff(task.dueDate, counts.today);
        const dueText = diff === 0 ? '今天' : diff === 1 ? '明天' : `周${WEEKDAYS_SHORT[date.getDay()]}`;
        const dotColor = task.priority === 'high' ? 'var(--danger)' : task.priority === 'medium' ? 'var(--warning)' : 'var(--faint)';
        return `
          <button class="upcoming-item" type="button" data-upcoming-id="${escapeAttr(task.id)}" aria-label="${escapeAttr(task.title)}，${dueText}">
            <span class="upcoming-date"><span>${MONTHS_SHORT[date.getMonth()]}</span><strong>${date.getDate()}</strong></span>
            <span class="upcoming-copy">
              <strong>${escapeHTML(task.title)}</strong>
              <small>${project ? `<span class="project-dot" style="--project-color:${project.color}"></span>${escapeHTML(project.name)}` : '未分类'} · ${dueText}</small>
            </span>
            <span class="upcoming-dot" style="background:${dotColor}"></span>
          </button>`;
      }).join('')
      : '<div class="upcoming-empty">接下来没有截止任务，<br>享受这段留白。</div>';
  }

  function renderAll() {
    if (state.projectId && !getProject(state.projectId)) state.projectId = null;
    const counts = computeCounts();
    renderDateAndGreeting(counts);
    renderStats(counts);
    renderSidebar(counts);
    renderTaskArea();
    renderRail(counts);
    document.body.classList.add('ui-ready');
  }

  function showToast(message, actionLabel = '', actionCallback = null, options = {}) {
    if (!els.toast) return;
    clearTimeout(state.toastTimer);
    els.toast.hidden = false;
    els.toastMessage.textContent = message;
    els.toast.classList.toggle('is-error', options.icon === 'error');
    els.toastAction.hidden = !actionLabel;
    els.toastAction.textContent = actionLabel || '';
    state.toastAction = typeof actionCallback === 'function' ? actionCallback : null;
    const iconUse = els.toast.querySelector('.toast-icon use');
    if (iconUse) iconUse.setAttribute('href', options.icon === 'error' ? '#i-x' : '#i-check');
    els.toast.classList.remove('is-visible');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => els.toast.classList.add('is-visible'));
    });
    state.toastTimer = setTimeout(hideToast, options.duration || 4600);
  }

  function hideToast() {
    if (!els.toast) return;
    clearTimeout(state.toastTimer);
    els.toast.classList.remove('is-visible');
    state.toastAction = null;
    setTimeout(() => {
      if (!els.toast.classList.contains('is-visible')) els.toast.hidden = true;
    }, 230);
  }

  function shortTitle(title, limit = 22) {
    return title.length > limit ? `${title.slice(0, limit)}…` : title;
  }

  function lockBodyForOverlay() {
    const open = [els.sheetLayer, els.projectLayer, els.dataLayer].some((layer) => layer && !layer.hidden);
    els.body.style.overflow = open ? 'hidden' : '';
  }

  function openLayer(layer) {
    state.lastFocus = document.activeElement;
    layer.hidden = false;
    lockBodyForOverlay();
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('is-open')));
  }

  function closeLayer(layer, callback) {
    layer.classList.remove('is-open');
    setTimeout(() => {
      if (!layer.classList.contains('is-open')) layer.hidden = true;
      lockBodyForOverlay();
      if (typeof callback === 'function') callback();
      if (state.lastFocus && typeof state.lastFocus.focus === 'function' && document.contains(state.lastFocus)) {
        try { state.lastFocus.focus({ preventScroll: true }); } catch (error) { /* noop */ }
      }
    }, 340);
  }

  function openSidebar() {
    els.sidebar.classList.add('is-open');
    els.sidebarScrim.classList.add('is-visible');
    els.body.classList.add('is-menu-open');
    els.menuBtn.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    els.sidebar.classList.remove('is-open');
    els.sidebarScrim.classList.remove('is-visible');
    els.body.classList.remove('is-menu-open');
    els.menuBtn.setAttribute('aria-expanded', 'false');
  }

  function autoSizeTitle() {
    els.taskTitle.style.height = 'auto';
    els.taskTitle.style.height = `${Math.max(42, els.taskTitle.scrollHeight)}px`;
  }

  function renderProjectOptions(selectedId) {
    els.taskProject.innerHTML = [
      `<option value="">未分类</option>`,
      ...state.data.projects.map((project) => `<option value="${escapeAttr(project.id)}">${escapeHTML(project.name)}</option>`)
    ].join('');
    els.taskProject.value = selectedId || '';
  }

  function renderTagPills() {
    if (!state.draft) return;
    els.tagPills.innerHTML = state.draft.tags.map((tag) => `
      <span class="editor-tag">${escapeHTML(tag)}<button type="button" data-remove-tag="${escapeAttr(tag)}" aria-label="移除标签 ${escapeAttr(tag)}">${icon('x')}</button></span>
    `).join('');
  }

  function updateSubtaskProgressDisplay() {
    if (!state.draft) return;
    const total = state.draft.subtasks.length;
    const done = state.draft.subtasks.filter((subtask) => subtask.done).length;
    els.subtaskProgressText.textContent = `${done} / ${total}`;
    els.subtaskProgressBar.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
  }

  function renderSubtaskList() {
    if (!state.draft) return;
    const subtasks = state.draft.subtasks;
    els.subtaskList.innerHTML = subtasks.length
      ? subtasks.map((subtask) => `
        <div class="subtask-row${subtask.done ? ' is-done' : ''}" data-subtask-id="${escapeAttr(subtask.id)}">
          <button class="subtask-check" type="button" data-subtask-action="toggle" aria-label="${subtask.done ? '标记子任务未完成' : '完成子任务'}" aria-pressed="${subtask.done}">${icon('check')}</button>
          <input class="subtask-text" type="text" value="${escapeAttr(subtask.title)}" data-subtask-text maxlength="120" aria-label="子任务内容">
          <button class="subtask-remove" type="button" data-subtask-action="remove" aria-label="删除子任务">${icon('x')}</button>
        </div>`).join('')
      : '<p class="subtask-empty">把任务拆小一点，开始会更容易。</p>';
    updateSubtaskProgressDisplay();
  }

  function defaultDueForNew() {
    if (state.view === 'today' || state.view === 'completed') return todayISO();
    if (state.view === 'upcoming') return offsetISO(1);
    return '';
  }

  function openTaskSheet(taskId = null, options = {}) {
    const task = taskId ? getTask(taskId) : null;
    if (taskId && !task) return;
    state.editingId = task ? task.id : null;
    state.draft = task
      ? {
        title: task.title,
        description: task.description,
        projectId: task.projectId,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        tags: [...task.tags],
        subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      }
      : {
        title: '',
        description: '',
        projectId: state.projectId || '',
        status: options.status || 'todo',
        priority: 'medium',
        dueDate: defaultDueForNew(),
        tags: state.tag ? [state.tag] : [],
        subtasks: [],
        createdAt: null,
        updatedAt: null
      };

    els.sheetKicker.textContent = task ? '任务详情' : '新建任务';
    els.sheetHeading.textContent = task ? '编辑这项任务' : '添加一项新任务';
    els.taskTitle.value = state.draft.title;
    els.taskDesc.value = state.draft.description;
    els.taskStatus.value = state.draft.status;
    els.taskPriority.value = state.draft.priority;
    els.taskDue.value = state.draft.dueDate;
    els.clearDateBtn.hidden = !state.draft.dueDate;
    renderProjectOptions(state.draft.projectId);
    renderTagPills();
    renderSubtaskList();
    els.tagInput.value = '';
    els.subtaskInput.value = '';
    els.titleError.hidden = true;
    els.taskTitle.classList.remove('is-invalid');
    els.deleteTaskBtn.hidden = !task;
    els.saveTaskBtn.textContent = task ? '保存更改' : '创建任务';
    els.createMeta.textContent = task
      ? `创建于 ${formatDateTime(task.createdAt)} · 更新于 ${formatDateTime(task.updatedAt)}`
      : '新任务会保存在当前浏览器中。';
    autoSizeTitle();
    openLayer(els.sheetLayer);
    setTimeout(() => {
      if (els.sheetLayer.classList.contains('is-open')) {
        els.taskTitle.focus();
        const length = els.taskTitle.value.length;
        try { els.taskTitle.setSelectionRange(length, length); } catch (error) { /* noop */ }
      }
    }, 260);
  }

  function closeTaskSheet() {
    if (els.sheetLayer.hidden) return;
    closeLayer(els.sheetLayer, () => {
      state.draft = null;
      state.editingId = null;
    });
  }

  function commitPendingTag() {
    if (!state.draft) return;
    const value = els.tagInput.value.trim().replace(/^#/, '').slice(0, 18);
    if (value && !state.draft.tags.includes(value)) {
      if (state.draft.tags.length >= MAX_TAGS) {
        showToast(`最多添加 ${MAX_TAGS} 个标签`, '', null, { icon: 'error' });
      } else {
        state.draft.tags.push(value);
        renderTagPills();
      }
    }
    els.tagInput.value = '';
  }

  function addTagFromInput() {
    if (!state.draft) return;
    const value = els.tagInput.value.trim().replace(/^#/, '');
    if (!value) return;
    if (state.draft.tags.includes(value)) {
      els.tagInput.value = '';
      return;
    }
    if (state.draft.tags.length >= MAX_TAGS) {
      showToast(`最多添加 ${MAX_TAGS} 个标签`, '', null, { icon: 'error' });
      return;
    }
    state.draft.tags.push(value.slice(0, 18));
    els.tagInput.value = '';
    renderTagPills();
    els.tagInput.focus();
  }

  function addSubtaskFromInput() {
    if (!state.draft) return;
    const value = els.subtaskInput.value.trim();
    if (!value) return;
    if (state.draft.subtasks.length >= MAX_SUBTASKS) {
      showToast(`最多添加 ${MAX_SUBTASKS} 个子任务`, '', null, { icon: 'error' });
      return;
    }
    state.draft.subtasks.push({ id: uid('sub'), title: value.slice(0, 120), done: false });
    els.subtaskInput.value = '';
    renderSubtaskList();
    els.subtaskInput.focus();
  }

  function saveTask(event) {
    if (event) event.preventDefault();
    if (!state.draft) return;
    commitPendingTag();
    if (els.subtaskInput.value.trim()) {
      const pending = els.subtaskInput.value.trim();
      if (state.draft.subtasks.length < MAX_SUBTASKS) {
        state.draft.subtasks.push({ id: uid('sub'), title: pending.slice(0, 120), done: false });
      }
      els.subtaskInput.value = '';
    }
    const title = els.taskTitle.value.trim();
    if (!title) {
      els.titleError.hidden = false;
      els.taskTitle.classList.add('is-invalid');
      els.taskTitle.focus();
      return;
    }
    els.titleError.hidden = true;
    els.taskTitle.classList.remove('is-invalid');

    const status = Object.prototype.hasOwnProperty.call(STATUS_META, els.taskStatus.value) ? els.taskStatus.value : 'todo';
    const priority = Object.prototype.hasOwnProperty.call(PRIORITY_META, els.taskPriority.value) ? els.taskPriority.value : 'medium';
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(els.taskDue.value) ? els.taskDue.value : '';
    const projectId = getProject(els.taskProject.value) ? els.taskProject.value : '';
    const tags = state.draft.tags.slice(0, MAX_TAGS);
    const subtasks = state.draft.subtasks
      .filter((subtask) => subtask.title.trim())
      .map((subtask) => ({ ...subtask, title: subtask.title.trim().slice(0, 120) }));
    const now = new Date().toISOString();

    if (state.editingId) {
      const existing = getTask(state.editingId);
      if (!existing) { closeTaskSheet(); return; }
      const wasDone = existing.status === 'done';
      existing.title = title.slice(0, 160);
      existing.description = els.taskDesc.value.trim().slice(0, 800);
      existing.status = status;
      existing.priority = priority;
      existing.dueDate = dueDate;
      existing.projectId = projectId;
      existing.tags = tags;
      existing.subtasks = subtasks;
      existing.updatedAt = now;
      if (status === 'done') existing.completedAt = wasDone ? existing.completedAt || now : now;
      else existing.completedAt = null;
      saveData();
      closeTaskSheet();
      renderAll();
      showToast('任务已更新');
    } else {
      const newTask = {
        id: uid('task'),
        title: title.slice(0, 160),
        description: els.taskDesc.value.trim().slice(0, 800),
        projectId,
        status,
        priority,
        dueDate,
        tags,
        subtasks,
        createdAt: now,
        updatedAt: now,
        completedAt: status === 'done' ? now : null
      };
      state.data.tasks.unshift(newTask);
      if (state.view === 'completed') {
        state.view = 'today';
        state.status = 'all';
      }
      saveData();
      closeTaskSheet();
      renderAll();
      showToast(`已创建「${shortTitle(newTask.title)}」`, '查看', () => openTaskSheet(newTask.id));
    }
  }

  function deleteCurrentTask() {
    if (!state.draft) return;
    if (!state.editingId) { closeTaskSheet(); return; }
    const task = getTask(state.editingId);
    if (!task) { closeTaskSheet(); return; }
    const snapshot = JSON.parse(JSON.stringify(task));
    const index = state.data.tasks.findIndex((item) => item.id === task.id);
    state.data.tasks = state.data.tasks.filter((item) => item.id !== task.id);
    saveData();
    closeTaskSheet();
    renderAll();
    showToast(`已删除「${shortTitle(task.title)}」`, '撤销', () => {
      state.data.tasks.splice(Math.max(0, index), 0, snapshot);
      saveData();
      renderAll();
      showToast('任务已恢复');
    });
  }

  function toggleTask(taskId) {
    const task = getTask(taskId);
    if (!task) return;
    const previousStatus = task.status;
    const previousCompletedAt = task.completedAt;
    const now = new Date().toISOString();
    task.status = task.status === 'done' ? 'todo' : 'done';
    task.completedAt = task.status === 'done' ? now : null;
    task.updatedAt = now;
    saveData();
    renderAll();
    if (previousStatus !== 'done') {
      showToast(`已完成「${shortTitle(task.title)}」`, '撤销', () => {
        task.status = previousStatus;
        task.completedAt = previousCompletedAt;
        task.updatedAt = new Date().toISOString();
        saveData();
        renderAll();
      });
    } else {
      showToast(`「${shortTitle(task.title)}」已恢复`, '撤销', () => {
        task.status = previousStatus;
        task.completedAt = previousCompletedAt;
        task.updatedAt = new Date().toISOString();
        saveData();
        renderAll();
      });
    }
  }

  function createQuickTask() {
    const raw = els.quickInput.value.trim();
    if (!raw) {
      els.quickAdd.classList.remove('is-shaking');
      void els.quickAdd.offsetWidth;
      els.quickAdd.classList.add('is-shaking');
      setTimeout(() => els.quickAdd.classList.remove('is-shaking'), 420);
      els.quickInput.focus();
      return;
    }
    if (state.search) {
      state.search = '';
      els.searchInput.value = '';
      els.searchClear.hidden = true;
    }
    if (state.view === 'completed') {
      state.view = 'today';
      state.status = 'all';
    }
    const now = new Date().toISOString();
    let dueDate = '';
    if (state.view === 'today') dueDate = todayISO();
    else if (state.view === 'upcoming') dueDate = offsetISO(1);
    const newTask = {
      id: uid('task'),
      title: raw.slice(0, 160),
      description: '',
      projectId: state.projectId || '',
      status: 'todo',
      priority: 'medium',
      dueDate,
      tags: state.tag ? [state.tag] : [],
      subtasks: [],
      createdAt: now,
      updatedAt: now,
      completedAt: null
    };
    state.data.tasks.unshift(newTask);
    saveData();
    els.quickInput.value = '';
    renderAll();
    els.quickInput.focus();
    showToast(`已添加「${shortTitle(newTask.title)}」`, '查看', () => openTaskSheet(newTask.id));
  }

  function clearSearchState({ focus = false } = {}) {
    clearTimeout(state.searchTimer);
    state.search = '';
    els.searchInput.value = '';
    els.searchClear.hidden = true;
    if (focus) els.searchInput.focus();
  }

  function setView(view, { keepScroll = false } = {}) {
    if (!Object.prototype.hasOwnProperty.call(VIEW_META, view)) return;
    state.view = view;
    state.projectId = null;
    state.tag = null;
    state.status = 'all';
    clearSearchState();
    if (view === 'completed' && state.display === 'board') {
      state.display = 'list';
      savePrefs();
    }
    closeSidebar();
    renderAll();
    if (!keepScroll) {
      const anchor = $('.task-panel');
      if (anchor && window.scrollY > anchor.offsetTop - 80) {
        anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function selectProject(projectId) {
    if (state.projectId === projectId) {
      state.projectId = null;
      state.view = 'all';
    } else {
      state.projectId = projectId;
      state.view = 'all';
      state.tag = null;
    }
    state.status = 'all';
    clearSearchState();
    closeSidebar();
    renderAll();
  }

  function selectTag(tag) {
    if (state.tag === tag) {
      state.tag = null;
      state.view = 'all';
    } else {
      state.tag = tag;
      state.view = 'all';
      state.projectId = null;
    }
    state.status = 'all';
    clearSearchState();
    renderAll();
  }

  function renderColorOptions() {
    els.colorOptions.innerHTML = PROJECT_COLORS.map((color) => `
      <button class="color-option${selectedProjectColor === color ? ' is-selected' : ''}" type="button" style="--swatch:${color}" data-color="${color}" role="radio" aria-checked="${selectedProjectColor === color}" aria-label="项目颜色 ${color}"></button>
    `).join('');
  }

  function openProjectModal() {
    closeSidebar();
    els.projectName.value = '';
    els.projectName.classList.remove('is-invalid');
    selectedProjectColor = PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
    renderColorOptions();
    openLayer(els.projectLayer);
    setTimeout(() => {
      if (els.projectLayer.classList.contains('is-open')) els.projectName.focus();
    }, 220);
  }

  function closeProjectModal() {
    if (els.projectLayer.hidden) return;
    closeLayer(els.projectLayer);
  }

  function createProject(event) {
    event.preventDefault();
    const name = els.projectName.value.trim();
    if (!name) {
      els.projectName.classList.add('is-invalid');
      els.projectName.focus();
      return;
    }
    if (state.data.projects.some((project) => project.name.toLowerCase() === name.toLowerCase())) {
      showToast('已经有同名项目了', '', null, { icon: 'error' });
      els.projectName.focus();
      return;
    }
    const project = { id: uid('project'), name: name.slice(0, 20), color: selectedProjectColor };
    state.data.projects.push(project);
    state.projectId = project.id;
    state.view = 'all';
    state.tag = null;
    state.status = 'all';
    clearSearchState();
    saveData();
    closeProjectModal();
    renderAll();
    showToast(`项目「${project.name}」已创建`);
  }

  function updateDataMeta() {
    if (!els.dataMeta) return;
    const tasks = state.data.tasks.length;
    const projects = state.data.projects.length;
    const done = state.data.tasks.filter((task) => task.status === 'done').length;
    els.dataMeta.textContent = `当前 ${tasks} 项任务 · ${projects} 个项目 · ${done} 项已完成 · 数据保存在本机浏览器`;
  }

  function setResetArmed(armed) {
    state.resetArmed = armed;
    clearTimeout(state.resetTimer);
    const button = els.resetDataBtn;
    const label = button.querySelector('strong');
    button.classList.toggle('is-confirming', armed);
    label.textContent = armed ? '再次点击确认重置' : '重置示例数据';
    if (armed) {
      state.resetTimer = setTimeout(() => setResetArmed(false), 3500);
    }
  }

  function openDataModal() {
    closeSidebar();
    setResetArmed(false);
    updateDataMeta();
    openLayer(els.dataLayer);
  }

  function closeDataModal() {
    if (els.dataLayer.hidden) return;
    setResetArmed(false);
    closeLayer(els.dataLayer);
  }

  function exportData() {
    const payload = {
      app: 'HWZ Task Manager',
      version: 1,
      exportedAt: new Date().toISOString(),
      projects: state.data.projects,
      tasks: state.data.tasks
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `hwz-task-manager-${todayISO()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast('数据备份已下载');
  }

  function importDataFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const imported = normalizeData(parsed);
        const previous = state.data;
        state.data = imported;
        state.projectId = null;
        state.tag = null;
        state.view = 'today';
        state.status = 'all';
        clearSearchState();
        saveData();
        closeDataModal();
        renderAll();
        showToast(`已导入 ${imported.tasks.length} 项任务`, '撤销', () => {
          state.data = previous;
          saveData();
          renderAll();
          showToast('已恢复导入前的数据');
        });
      } catch (error) {
        showToast('导入失败，请选择有效的 JSON 备份文件', '', null, { icon: 'error', duration: 5200 });
      } finally {
        els.importFile.value = '';
      }
    };
    reader.onerror = () => {
      showToast('读取文件失败，请重试', '', null, { icon: 'error' });
      els.importFile.value = '';
    };
    reader.readAsText(file, 'utf-8');
  }

  function resetToSeedData() {
    if (!state.resetArmed) {
      setResetArmed(true);
      return;
    }
    setResetArmed(false);
    const previous = state.data;
    state.data = buildSeedData();
    state.view = 'today';
    state.projectId = null;
    state.tag = null;
    state.status = 'all';
    state.sort = 'smart';
    state.display = 'list';
    clearSearchState();
    saveData();
    savePrefs();
    closeDataModal();
    renderAll();
    showToast('已重新载入示例数据', '撤销', () => {
      state.data = previous;
      saveData();
      renderAll();
      showToast('已恢复重置前的数据');
    });
  }

  function handleTaskViewClick(event) {
    const addStatusButton = event.target.closest('[data-action="new-in-status"]');
    if (addStatusButton) {
      event.stopPropagation();
      openTaskSheet(null, { status: addStatusButton.dataset.status });
      return;
    }
    const toggleButton = event.target.closest('[data-action="toggle"]');
    if (toggleButton) {
      event.stopPropagation();
      const row = toggleButton.closest('[data-task-id]');
      if (row) toggleTask(row.dataset.taskId);
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === 'new-task') {
        openTaskSheet();
        return;
      }
      if (action === 'clear-status') {
        state.status = 'all';
        renderTaskArea();
        return;
      }
      if (action === 'clear-search') {
        clearSearchState();
        renderAll();
        return;
      }
    }
    const card = event.target.closest('[data-task-id]');
    if (card) {
      if (Date.now() - state.justDraggedAt < 280) return;
      openTaskSheet(card.dataset.taskId);
    }
  }

  function handleTaskViewKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-task-id]');
    if (!card) return;
    if (event.target.closest('button, input, textarea, select')) return;
    event.preventDefault();
    openTaskSheet(card.dataset.taskId);
  }

  function handleTaskDragStart(event) {
    const card = event.target.closest('.board-card');
    if (!card) return;
    state.justDraggedAt = Date.now();
    card.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.dataset.taskId);
  }

  function clearBoardDropStyles() {
    $$('.board-card.is-dragging').forEach((card) => card.classList.remove('is-dragging'));
    $$('.board-col.is-over').forEach((column) => column.classList.remove('is-over'));
  }

  function handleBoardDrop(event) {
    const column = event.target.closest('.board-col');
    if (!column) return;
    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/plain');
    const status = column.dataset.status;
    const task = getTask(taskId);
    if (!task || !STATUS_META[status]) { clearBoardDropStyles(); return; }
    if (task.status !== status) {
      task.status = status;
      task.completedAt = status === 'done' ? new Date().toISOString() : null;
      task.updatedAt = new Date().toISOString();
      saveData();
      clearBoardDropStyles();
      renderAll();
      const label = STATUS_META[status].label;
      showToast(`已移到「${label}」`);
    } else {
      clearBoardDropStyles();
    }
  }

  function attachEvents() {
    els.navItems.forEach((item) => {
      item.addEventListener('click', () => setView(item.dataset.view));
    });

    els.projectList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-project-id]');
      if (button) selectProject(button.dataset.projectId);
    });

    els.tagCloud.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tag]');
      if (button) selectTag(button.dataset.tag);
    });

    els.clearTagBtn.addEventListener('click', () => {
      state.tag = null;
      state.view = 'all';
      renderAll();
    });

    els.menuBtn.addEventListener('click', openSidebar);
    els.sidebarClose.addEventListener('click', closeSidebar);
    els.sidebarScrim.addEventListener('click', closeSidebar);
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) closeSidebar();
    });

    els.newProjectBtn.addEventListener('click', openProjectModal);
    els.projectForm.addEventListener('submit', createProject);
    els.colorOptions.addEventListener('click', (event) => {
      const option = event.target.closest('[data-color]');
      if (!option) return;
      selectedProjectColor = option.dataset.color;
      renderColorOptions();
    });

    els.newTaskBtn.addEventListener('click', () => openTaskSheet());
    els.quickAdd.addEventListener('submit', (event) => {
      event.preventDefault();
      createQuickTask();
    });
    els.taskView.addEventListener('click', handleTaskViewClick);
    els.taskView.addEventListener('keydown', handleTaskViewKeydown);

    els.filterTabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-status]');
      if (!button) return;
      state.status = button.dataset.status;
      renderTaskArea();
    });

    els.sortSelect.addEventListener('change', () => {
      state.sort = els.sortSelect.value;
      savePrefs();
      renderTaskView();
    });

    els.viewButtons.forEach((button) => {
      button.addEventListener('click', () => {
        state.display = button.dataset.display;
        if (state.display === 'board') state.status = 'all';
        savePrefs();
        renderTaskArea();
      });
    });

    els.themeBtn.addEventListener('click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'));

    els.searchInput.addEventListener('input', () => {
      const value = els.searchInput.value;
      els.searchClear.hidden = !value;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        state.search = value.trim();
        renderAll();
      }, 140);
    });
    els.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (els.searchInput.value) {
          clearSearchState({ focus: true });
          renderAll();
        } else {
          els.searchInput.blur();
        }
      }
    });
    els.searchClear.addEventListener('click', () => {
      clearSearchState({ focus: true });
      renderAll();
    });

    els.taskView.addEventListener('dragstart', handleTaskDragStart);
    els.taskView.addEventListener('dragend', clearBoardDropStyles);
    els.taskView.addEventListener('dragover', (event) => {
      const column = event.target.closest('.board-col');
      if (!column) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      $$('.board-col.is-over').forEach((item) => { if (item !== column) item.classList.remove('is-over'); });
      column.classList.add('is-over');
    });
    els.taskView.addEventListener('dragleave', (event) => {
      const column = event.target.closest('.board-col');
      if (!column) return;
      if (!event.relatedTarget || !column.contains(event.relatedTarget)) column.classList.remove('is-over');
    });
    els.taskView.addEventListener('drop', handleBoardDrop);

    els.overdueStrip.addEventListener('click', () => {
      state.view = 'all';
      state.projectId = null;
      state.tag = null;
      state.status = 'all';
      state.sort = 'due';
      clearSearchState();
      renderAll();
      showToast('已展示全部任务，逾期项排在前面');
    });

    els.viewUpcomingBtn.addEventListener('click', () => setView('upcoming'));

    els.upcomingList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-upcoming-id]');
      if (button) openTaskSheet(button.dataset.upcomingId);
    });

    els.taskForm.addEventListener('submit', saveTask);
    els.taskTitle.addEventListener('input', () => {
      autoSizeTitle();
      if (els.taskTitle.value.trim()) {
        els.titleError.hidden = true;
        els.taskTitle.classList.remove('is-invalid');
      }
    });
    els.taskDue.addEventListener('change', () => {
      els.clearDateBtn.hidden = !els.taskDue.value;
    });
    els.clearDateBtn.addEventListener('click', () => {
      els.taskDue.value = '';
      els.clearDateBtn.hidden = true;
      els.taskDue.focus();
    });
    els.tagInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        addTagFromInput();
      } else if (event.key === 'Backspace' && !els.tagInput.value && state.draft && state.draft.tags.length) {
        state.draft.tags.pop();
        renderTagPills();
      }
    });
    els.tagInput.addEventListener('blur', () => {
      if (els.tagInput.value.trim()) commitPendingTag();
    });
    els.tagPills.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-tag]');
      if (!button || !state.draft) return;
      state.draft.tags = state.draft.tags.filter((tag) => tag !== button.dataset.removeTag);
      renderTagPills();
    });

    els.subtaskAddBtn.addEventListener('click', addSubtaskFromInput);
    els.subtaskInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addSubtaskFromInput();
      }
    });
    els.subtaskList.addEventListener('click', (event) => {
      if (!state.draft) return;
      const row = event.target.closest('[data-subtask-id]');
      if (!row) return;
      const action = event.target.closest('[data-subtask-action]');
      if (!action) return;
      const subtask = state.draft.subtasks.find((item) => item.id === row.dataset.subtaskId);
      if (!subtask) return;
      if (action.dataset.subtaskAction === 'toggle') {
        subtask.done = !subtask.done;
      } else if (action.dataset.subtaskAction === 'remove') {
        state.draft.subtasks = state.draft.subtasks.filter((item) => item.id !== subtask.id);
      }
      renderSubtaskList();
    });
    els.subtaskList.addEventListener('input', (event) => {
      const input = event.target.closest('[data-subtask-text]');
      if (!input || !state.draft) return;
      const row = input.closest('[data-subtask-id]');
      const subtask = state.draft.subtasks.find((item) => item.id === row.dataset.subtaskId);
      if (subtask) subtask.title = input.value;
    });

    els.deleteTaskBtn.addEventListener('click', deleteCurrentTask);
    els.cancelTaskBtn.addEventListener('click', closeTaskSheet);
    els.sheetClose.addEventListener('click', closeTaskSheet);
    els.sheetBackdrop.addEventListener('click', closeTaskSheet);

    els.overlayCloseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.closeModal === 'project') closeProjectModal();
        if (button.dataset.closeModal === 'data') closeDataModal();
      });
    });

    els.exportDataBtn.addEventListener('click', exportData);
    els.importDataBtn.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', () => importDataFromFile(els.importFile.files[0]));
    els.resetDataBtn.addEventListener('click', resetToSeedData);
    els.dataLink.addEventListener('click', openDataModal);
    els.dataBtn.addEventListener('click', openDataModal);

    els.toastAction.addEventListener('click', () => {
      const callback = state.toastAction;
      hideToast();
      if (callback) callback();
    });
    els.toastClose.addEventListener('click', hideToast);
    els.toast.addEventListener('mouseenter', () => clearTimeout(state.toastTimer));

    document.addEventListener('keydown', (event) => {
      const escape = event.key === 'Escape';
      if (escape) {
        if (!els.sheetLayer.hidden) { closeTaskSheet(); return; }
        if (!els.projectLayer.hidden) { closeProjectModal(); return; }
        if (!els.dataLayer.hidden) { closeDataModal(); return; }
        if (els.sidebar.classList.contains('is-open')) { closeSidebar(); return; }
      }
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      const typing = /INPUT|TEXTAREA|SELECT/.test(activeTag) || (document.activeElement && document.activeElement.isContentEditable);
      if (!els.sheetLayer.hidden) {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          saveTask();
        }
        return;
      }
      if (!els.projectLayer.hidden || !els.dataLayer.hidden) return;
      if (typing) return;
      if ((event.key === '/' || event.key === '／') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        els.searchInput.focus();
        els.searchInput.select();
      } else if ((event.key === 'n' || event.key === 'N') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        openTaskSheet();
      }
    });

    window.addEventListener('beforeunload', () => {
      clearTimeout(state.searchTimer);
      clearTimeout(state.toastTimer);
      clearTimeout(state.resetTimer);
    });
  }

  function init() {
    applyTheme(preferredTheme);
    attachEvents();
    renderAll();
    if (!storedData) saveData();
    els.sortSelect.value = state.sort;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
