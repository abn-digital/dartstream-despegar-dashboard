// ========== Despegar B2B2C Dashboard — app.js ==========
// Macro-to-Micro architecture: Overview → Funnel & Journey → Detalle Táctico
// Real data from BigQuery: bigquery-388915.despegar_b2b2c.master_results

// ========== STATE ==========
let RAW_DATA = [];
let currentTab = 'overview';

const FILTERS = {
  month: 'all',
  week: 'all',
  device: 'all',
  channel: 'all',
};

// Cached computed data (recomputed on filter change)
let COMPUTED = { filtered: [], totals: {}, daily: [], platforms: [] };

// Data table state
const DT = {
  sortCol: 'date',
  sortDir: 'desc',
  page: 1,
  perPage: 50,
  searchQuery: '',
};

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  bindFilters();
  bindTabs();
  bindSidebar();
  bindDataTable();
  recomputeAndRender();
});

// ========== LOAD DATA ==========
async function loadData() {
  let json;
  if (typeof INLINE_DATA !== 'undefined') {
    json = INLINE_DATA;
  } else {
    try {
      const resp = await fetch('data.json');
      json = await resp.json();
    } catch (e) {
      console.error('Failed to load data', e);
      json = [];
    }
  }

  RAW_DATA = json.map(row => ({
    date:               row.date,
    device_category:    (row.device_category || 'unknown').toLowerCase(),
    channel_group:      row.channel_group || 'Direct',
    campaign_name:      row.campaign_name || '(not set)',
    source_medium:      row.source_medium || '(not set)',
    session_start:      num(row.session_start),
    first_visit:        num(row.first_visit),
    page_view:          num(row.page_view),
    search:             num(row.search),
    view_search_results:num(row.view_search_results),
    view_item:          num(row.view_item),
    begin_checkout:     num(row.begin_checkout),
    purchase:           num(row.purchase),
    purchase_revenue:   numF(row.purchase_revenue),
    user_engagement:    num(row.user_engagement),
    scroll:             num(row.scroll),
    click:              num(row.click),
    form_start:         num(row.form_start),
    file_download:      num(row.file_download),
  }));

  // Update footer with data freshness
  const dates = [...new Set(RAW_DATA.map(r => r.date))].sort();
  if (dates.length > 0) {
    const el = document.getElementById('lastUpdated');
    if (el) el.textContent = 'Hasta ' + formatDateShort(dates[dates.length - 1]);
  }
}

// ========== DATE HELPERS ==========
const MONTH_NAMES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function getISOWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function parseMonth(dateStr) {
  return dateStr.substring(0, 7);
}

function formatMonthLabel(ym) {
  const [y, m] = ym.split('-');
  return MONTH_NAMES[parseInt(m)] + ' ' + y;
}

function formatDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return parseInt(d) + ' ' + MONTH_NAMES[parseInt(m)] + ' ' + y;
}

// ========== TAB SYSTEM ==========
function bindTabs() {
  // Topbar tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  // Sidebar nav items (mirror)
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  currentTab = tabId;

  // Update topbar tab buttons
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });

  // Update sidebar nav items
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });

  // Show/hide tab panels
  const panelId = 'panel' + tabId.charAt(0).toUpperCase() + tabId.slice(1);
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === panelId);
  });

  // Render the active tab with current data
  renderActiveTab();
}

// ========== FILTER BINDING ==========
function bindFilters() {
  // --- Populate Month options ---
  const monthSelect = document.getElementById('filterMonth');
  if (monthSelect) {
    const months = [...new Set(RAW_DATA.map(r => parseMonth(r.date)))].sort().reverse();
    monthSelect.innerHTML = '<option value="all">Mes: Todos</option>';
    months.forEach(ym => {
      const opt = document.createElement('option');
      opt.value = ym;
      opt.textContent = formatMonthLabel(ym);
      monthSelect.appendChild(opt);
    });
    monthSelect.addEventListener('change', () => {
      FILTERS.month = monthSelect.value;
      onFilterChange();
    });
  }

  // --- Populate Week options ---
  const weekSelect = document.getElementById('filterWeek');
  if (weekSelect) {
    const weeksSet = new Map();
    RAW_DATA.forEach(r => {
      const wn = getISOWeek(r.date);
      const key = 'W' + wn;
      if (!weeksSet.has(key)) weeksSet.set(key, wn);
    });
    const weeks = [...weeksSet.entries()].sort((a, b) => b[1] - a[1]);
    weekSelect.innerHTML = '<option value="all">Semana: Todas</option>';
    weeks.forEach(([label]) => {
      const opt = document.createElement('option');
      opt.value = label;
      opt.textContent = label;
      weekSelect.appendChild(opt);
    });
    weekSelect.addEventListener('change', () => {
      FILTERS.week = weekSelect.value;
      onFilterChange();
    });
  }

  // --- Device filter ---
  const deviceSelect = document.getElementById('filterDevice');
  if (deviceSelect) {
    deviceSelect.addEventListener('change', () => {
      FILTERS.device = deviceSelect.value;
      onFilterChange();
    });
  }

  // --- Channel filter (populate dynamically) ---
  const channelSelect = document.getElementById('filterChannel');
  if (channelSelect) {
    const channels = [...new Set(RAW_DATA.map(r => r.channel_group))].sort();
    channelSelect.innerHTML = '<option value="all">Canal: Todos</option>';
    channels.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.toLowerCase();
      opt.textContent = ch;
      channelSelect.appendChild(opt);
    });
    channelSelect.addEventListener('change', () => {
      FILTERS.channel = channelSelect.value;
      onFilterChange();
    });
  }
}

// ========== FILTER DATA ==========
function getFilteredData() {
  return RAW_DATA.filter(row => {
    if (FILTERS.month !== 'all') {
      if (parseMonth(row.date) !== FILTERS.month) return false;
    }
    if (FILTERS.week !== 'all') {
      const rowWeek = 'W' + getISOWeek(row.date);
      if (rowWeek !== FILTERS.week) return false;
    }
    if (FILTERS.device !== 'all') {
      if (row.device_category !== FILTERS.device) return false;
    }
    if (FILTERS.channel !== 'all') {
      if (row.channel_group.toLowerCase() !== FILTERS.channel) return false;
    }
    return true;
  });
}

// ========== COMPUTE & RENDER ==========
function recomputeAndRender() {
  COMPUTED.filtered = getFilteredData();
  COMPUTED.totals = aggregate(COMPUTED.filtered);
  COMPUTED.daily = aggregateByDate(COMPUTED.filtered);
  COMPUTED.platforms = aggregateByDevice(COMPUTED.filtered);
  updatePeriodBadge(COMPUTED.filtered);
  renderActiveTab();
}

function onFilterChange() {
  DT.page = 1; // Reset pagination on filter change
  recomputeAndRender();
}

function renderActiveTab() {
  const { filtered, totals, daily, platforms } = COMPUTED;

  if (currentTab === 'overview') {
    renderBANs(totals);
    renderPlatformLegend(platforms);
    renderDonutChart(platforms);
    renderCVRSummary(totals, daily);
  } else if (currentTab === 'funnel') {
    renderFunnel(totals, daily);
    // Delay canvas render to ensure container is visible
    requestAnimationFrame(() => renderEvolutionChart(daily));
  } else if (currentTab === 'detail') {
    renderDataTable(filtered);
  }
}

// ========== AGGREGATE ==========
function aggregate(data) {
  const totals = {
    session_start: 0, first_visit: 0, page_view: 0, search: 0,
    view_search_results: 0, view_item: 0, begin_checkout: 0,
    purchase: 0, purchase_revenue: 0, user_engagement: 0,
    scroll: 0, click: 0, form_start: 0, file_download: 0,
  };
  data.forEach(row => {
    Object.keys(totals).forEach(k => { totals[k] += row[k]; });
  });
  totals.asp = totals.purchase > 0 ? totals.purchase_revenue / totals.purchase : 0;
  totals.cvr = totals.session_start > 0 ? totals.purchase / totals.session_start * 100 : 0;
  totals.margin = totals.purchase_revenue * 0.0224;
  return totals;
}

function aggregateByDate(data) {
  const byDate = {};
  data.forEach(row => {
    if (!byDate[row.date]) {
      byDate[row.date] = { date: row.date, session_start: 0, search: 0, view_item: 0, begin_checkout: 0, purchase: 0, purchase_revenue: 0 };
    }
    const d = byDate[row.date];
    d.session_start += row.session_start;
    d.search += row.search;
    d.view_item += row.view_item;
    d.begin_checkout += row.begin_checkout;
    d.purchase += row.purchase;
    d.purchase_revenue += row.purchase_revenue;
  });
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateByDevice(data) {
  const byDev = {};
  data.forEach(row => {
    const dev = row.device_category;
    if (!byDev[dev]) byDev[dev] = { label: capitalize(dev), bookings: 0, revenue: 0, sessions: 0 };
    byDev[dev].bookings += row.purchase;
    byDev[dev].revenue += row.purchase_revenue;
    byDev[dev].sessions += row.session_start;
  });
  return Object.values(byDev).sort((a, b) => b.bookings - a.bookings);
}

// ========== RENDER BANs (Overview) ==========
function renderBANs(totals) {
  const items = [
    { id: 'banGBValue',     value: totals.purchase_revenue, prefix: '$', decimals: 0 },
    { id: 'banMarginValue', value: totals.margin,           prefix: '$', decimals: 0 },
    { id: 'banOrdersValue', value: totals.purchase,         prefix: '',  decimals: 0 },
    { id: 'banASPValue',    value: totals.asp,              prefix: '$', decimals: 0 },
  ];

  items.forEach(item => {
    const el = document.getElementById(item.id);
    if (el) {
      el.textContent = item.prefix + formatNumber(Math.round(item.value));
      // Animate
      el.style.transition = 'none';
      el.style.opacity = '0.4';
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.3s ease';
        el.style.opacity = '1';
      });
    }
  });
}

// ========== RENDER CVR SUMMARY (Overview) ==========
function renderCVRSummary(totals, daily) {
  const cvrHero = document.getElementById('cvrHeroValue');
  if (cvrHero) cvrHero.textContent = totals.cvr.toFixed(2) + '%';

  const sessionsEl = document.getElementById('cvrSessions');
  if (sessionsEl) sessionsEl.textContent = formatNumber(totals.session_start);

  const bookingsEl = document.getElementById('cvrBookings');
  if (bookingsEl) bookingsEl.textContent = formatNumber(totals.purchase);

  if (daily.length > 0) {
    const firstDay = daily[0];
    const firstDayCvr = firstDay.session_start > 0 ? firstDay.purchase / firstDay.session_start * 100 : 0;

    const cvrFirstEl = document.getElementById('cvrFirstDate');
    if (cvrFirstEl) cvrFirstEl.textContent = firstDayCvr.toFixed(2) + '%';

    const vsFirstEl = document.getElementById('cvrVsFirst');
    if (vsFirstEl) {
      const delta = firstDayCvr > 0 ? ((totals.cvr - firstDayCvr) / firstDayCvr * 100).toFixed(1) : '0.0';
      const sign = parseFloat(delta) >= 0 ? '+' : '';
      vsFirstEl.textContent = sign + delta + '%';
      vsFirstEl.className = 'cvr-meta-value ' + (parseFloat(delta) < 0 ? 'negative' : 'positive');
    }
  }
}

// ========== RENDER FUNNEL ==========
function renderFunnel(totals, daily) {
  const steps = [
    { name: 'Usuarios (Sessions)', count: totals.session_start },
    { name: 'Searchers',           count: totals.search },
    { name: 'Detail (View Item)',   count: totals.view_item },
    { name: 'Checkout',            count: totals.begin_checkout },
    { name: 'Bookings (Purchase)', count: totals.purchase },
  ];

  const colors = ['#540CEC', '#7A0FD6', '#9D17C9', '#C42B6B', '#E5337A'];
  const total = steps[0].count || 1;

  const funnelChart = document.getElementById('funnelChart');
  if (!funnelChart) return;
  funnelChart.innerHTML = '';

  steps.forEach((step, i) => {
    const pct = step.count / total * 100;
    const visualWidth = pct < 3 ? Math.max(pct * 6, 3) : pct;

    const stepEl = document.createElement('div');
    stepEl.className = 'funnel-step funnel-step-animated';
    stepEl.style.animationDelay = (i * 0.08) + 's';
    stepEl.innerHTML = `
      <div class="funnel-step-label">
        <span class="funnel-step-name">${step.name}</span>
        <span class="funnel-step-count">${formatNumber(step.count)}</span>
      </div>
      <div class="funnel-bar-track">
        <div class="funnel-bar ${i === steps.length - 1 ? 'funnel-bar-final' : ''}"
             style="width: ${visualWidth}%; --color: ${colors[i]};"></div>
      </div>
      <span class="funnel-pct">${pct.toFixed(1)}%</span>
    `;
    funnelChart.appendChild(stepEl);

    if (i < steps.length - 1) {
      const nextCount = steps[i + 1].count;
      const drop = step.count > 0 ? ((step.count - nextCount) / step.count * 100).toFixed(1) : '0.0';
      const dropEl = document.createElement('div');
      dropEl.className = 'funnel-drop-indicator';
      dropEl.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        <span class="funnel-drop-text">-${drop}% drop</span>
      `;
      funnelChart.appendChild(dropEl);
    }
  });

  // CVR Strip
  const cvrLW = document.getElementById('cvrLW');
  const cvrActual = document.getElementById('cvrActual');
  const cvrVsLW = document.getElementById('cvrVsLW');

  if (cvrLW && cvrActual && cvrVsLW && daily.length > 0) {
    const firstDayCvr = daily[0].session_start > 0 ? daily[0].purchase / daily[0].session_start * 100 : 0;
    const overallCvr = totals.cvr;
    const vsLw = firstDayCvr > 0 ? ((overallCvr - firstDayCvr) / firstDayCvr * 100).toFixed(1) : '0.0';

    cvrLW.textContent = firstDayCvr.toFixed(2) + '%';
    cvrActual.textContent = overallCvr.toFixed(2) + '%';
    cvrVsLW.textContent = (parseFloat(vsLw) >= 0 ? '+' : '') + vsLw + '%';
    cvrVsLW.className = 'cvr-chip-value ' + (parseFloat(vsLw) < 0 ? 'negative' : 'positive');
  }
}

// ========== RENDER PLATFORM LEGEND ==========
function renderPlatformLegend(platforms) {
  const colors = ['#540CEC', '#9D17C9', '#E5337A', '#FF7A33'];
  const totalBookings = platforms.reduce((s, p) => s + p.bookings, 0) || 1;

  const centerVal = document.getElementById('donutCenterValue');
  if (centerVal) centerVal.textContent = formatK(totalBookings);

  const legendContainer = document.getElementById('platformLegend');
  if (!legendContainer) return;
  legendContainer.innerHTML = '';

  platforms.forEach((p, i) => {
    const pct = (p.bookings / totalBookings * 100).toFixed(1);
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <div class="legend-color" style="background: ${colors[i % colors.length]};"></div>
      <div class="legend-info">
        <div class="legend-name">${p.label}</div>
        <div class="legend-detail">
          <span class="legend-value">${formatK(p.bookings)}</span>
          <span class="legend-pct">${pct}%</span>
        </div>
      </div>
    `;
    legendContainer.appendChild(item);
  });
}

// ========== DONUT CHART ==========
let donutAnimId = null;
function renderDonutChart(platforms) {
  if (donutAnimId) cancelAnimationFrame(donutAnimId);

  const canvas = document.getElementById('donutChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 200;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const colors = ['#540CEC', '#9D17C9', '#E5337A', '#FF7A33'];
  const totalBookings = platforms.reduce((s, p) => s + p.bookings, 0) || 1;
  const segments = platforms.map((p, i) => ({
    value: p.bookings / totalBookings * 100,
    color: colors[i % colors.length],
  }));

  const cx = size / 2, cy = size / 2;
  const outerR = 90, innerR = 62, gap = 0.04;
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;

  let startTime = null;

  function drawDonut(timestamp) {
    if (!startTime) startTime = timestamp;
    const progress = Math.min((timestamp - startTime) / 800, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    ctx.clearRect(0, 0, size, size);
    let angle = -Math.PI / 2;

    segments.forEach(seg => {
      const segAngle = (seg.value / total) * 2 * Math.PI * eased;
      const sA = angle + gap / 2;
      const eA = angle + segAngle - gap / 2;

      if (segAngle > gap) {
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, sA, eA);
        ctx.arc(cx, cy, innerR, eA, sA, true);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();

        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, sA, eA);
        ctx.arc(cx, cy, innerR, eA, sA, true);
        ctx.closePath();
        const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
        grad.addColorStop(0, 'rgba(255,255,255,0.15)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }
      angle += segAngle;
    });

    if (progress < 1) donutAnimId = requestAnimationFrame(drawDonut);
  }

  donutAnimId = requestAnimationFrame(drawDonut);
}

// ========== EVOLUTION CHART ==========
let evoAnimId = null;
function renderEvolutionChart(daily) {
  if (evoAnimId) cancelAnimationFrame(evoAnimId);

  const canvas = document.getElementById('evolutionChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const container = canvas.parentElement;
  const w = container.clientWidth;
  const h = 280;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  if (daily.length === 0) {
    ctx.fillStyle = '#8E8AA3';
    ctx.font = '500 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos para este filtro', w / 2, h / 2);
    return;
  }

  const days = daily.map(d => {
    const parts = d.date.split('-');
    return parseInt(parts[2]) + ' ' + MONTH_NAMES[parseInt(parts[1])];
  });
  const searches = daily.map(d => d.search);
  const cvr = daily.map(d => d.session_start > 0 ? d.purchase / d.session_start * 100 : 0);

  const pad = { top: 44, right: 56, bottom: 50, left: 56 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const maxSearchers = Math.max(...searches) * 1.2 || 1;
  const maxCvr = Math.max(...cvr) * 1.4 || 1;
  const barWidth = Math.min(chartW / days.length * 0.5, 44);

  let startTime = null;

  function draw(timestamp) {
    if (!startTime) startTime = timestamp;
    const progress = Math.min((timestamp - startTime) / 800, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(20,28,44,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    // Y left
    ctx.fillStyle = '#8E8AA3';
    ctx.font = '500 10px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.fillText(formatK(maxSearchers - (maxSearchers / 4) * i), pad.left - 8, y + 3);
    }

    // Y right
    ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.fillText((maxCvr - (maxCvr / 4) * i).toFixed(2) + '%', w - pad.right + 8, y + 3);
    }

    const points = [];
    days.forEach((day, i) => {
      const x = pad.left + (chartW / days.length) * (i + 0.5);
      const barH = (searches[i] / maxSearchers) * chartH * eased;
      const barY = pad.top + chartH - barH;

      const grad = ctx.createLinearGradient(0, barY, 0, pad.top + chartH);
      grad.addColorStop(0, '#540CEC');
      grad.addColorStop(1, '#7A0FD6');
      ctx.fillStyle = grad;
      roundedRect(ctx, x - barWidth / 2, barY, barWidth, barH, 5);
      ctx.fill();

      if (progress > 0.5) {
        ctx.fillStyle = '#141C2C';
        ctx.font = '600 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.globalAlpha = Math.min((progress - 0.5) * 2, 1);
        ctx.fillText(formatK(searches[i]), x, barY - 6);
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = '#8E8AA3';
      ctx.font = '600 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(day, x, pad.top + chartH + 18);

      points.push({ x, y: pad.top + chartH - (cvr[i] / maxCvr) * chartH * eased });
    });

    // CVR line
    ctx.beginPath();
    ctx.strokeStyle = '#E5337A';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    points.forEach((pt, i) => { if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
    ctx.stroke();

    points.forEach((pt, i) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(229,51,122,0.12)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#E5337A';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (progress > 0.6) {
        ctx.fillStyle = '#E5337A';
        ctx.font = '700 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.globalAlpha = Math.min((progress - 0.6) * 2.5, 1);
        ctx.fillText(cvr[i].toFixed(2) + '%', pt.x, pt.y - 12);
        ctx.globalAlpha = 1;
      }
    });

    // Legend
    ctx.fillStyle = '#540CEC';
    ctx.fillRect(pad.left, h - 14, 12, 8);
    ctx.fillStyle = '#56526A';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Búsquedas', pad.left + 16, h - 7);

    ctx.beginPath();
    ctx.moveTo(pad.left + 100, h - 10);
    ctx.lineTo(pad.left + 114, h - 10);
    ctx.strokeStyle = '#E5337A';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pad.left + 107, h - 10, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#E5337A';
    ctx.fill();
    ctx.fillStyle = '#56526A';
    ctx.fillText('CVR %', pad.left + 120, h - 7);

    if (progress < 1) evoAnimId = requestAnimationFrame(draw);
  }

  evoAnimId = requestAnimationFrame(draw);

  if (!canvas._resizeBound) {
    canvas._resizeBound = true;
    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (currentTab === 'funnel') renderEvolutionChart(COMPUTED.daily);
      }, 200);
    });
  }
}

// ========== DATA TABLE (Nivel 4) ==========
function bindDataTable() {
  // Sort headers
  document.querySelectorAll('.data-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (DT.sortCol === col) {
        DT.sortDir = DT.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        DT.sortCol = col;
        DT.sortDir = 'desc';
      }
      // Update header classes
      document.querySelectorAll('.data-table th').forEach(h => {
        h.classList.remove('sorted-asc', 'sorted-desc');
      });
      th.classList.add(DT.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      renderDataTable(COMPUTED.filtered);
    });
  });

  // Search
  const searchInput = document.getElementById('dtSearch');
  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        DT.searchQuery = searchInput.value;
        DT.page = 1;
        renderDataTable(COMPUTED.filtered);
      }, 250);
    });
  }

  // CSV Export
  const btnCSV = document.getElementById('btnExportCSV');
  if (btnCSV) {
    btnCSV.addEventListener('click', () => exportCSV());
  }
}

function renderDataTable(filtered) {
  let rows = filtered.map(r => ({
    ...r,
    cvr: r.session_start > 0 ? r.purchase / r.session_start * 100 : 0,
  }));

  // Search filter
  if (DT.searchQuery) {
    const q = DT.searchQuery.toLowerCase();
    rows = rows.filter(r =>
      r.channel_group.toLowerCase().includes(q) ||
      r.device_category.toLowerCase().includes(q) ||
      r.campaign_name.toLowerCase().includes(q) ||
      r.source_medium.toLowerCase().includes(q) ||
      r.date.includes(q)
    );
  }

  // Sort
  rows.sort((a, b) => {
    let va = a[DT.sortCol], vb = b[DT.sortCol];
    if (typeof va === 'string') {
      return DT.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return DT.sortDir === 'asc' ? va - vb : vb - va;
  });

  // Paginate
  const totalRows = rows.length;
  const totalPages = Math.ceil(totalRows / DT.perPage) || 1;
  DT.page = Math.min(DT.page, totalPages);
  const start = (DT.page - 1) * DT.perPage;
  const pageRows = rows.slice(start, start + DT.perPage);

  // Render body
  const tbody = document.getElementById('dtBody');
  if (!tbody) return;

  tbody.innerHTML = pageRows.map(r => `
    <tr class="${r.purchase > 0 ? 'has-bookings' : ''}">
      <td>${r.date}</td>
      <td>${capitalize(r.device_category)}</td>
      <td>${escHtml(r.channel_group)}</td>
      <td class="td-campaign" title="${escHtml(r.campaign_name)}">${escHtml(r.campaign_name)}</td>
      <td title="${escHtml(r.source_medium)}">${escHtml(r.source_medium)}</td>
      <td class="num">${formatNumber(r.session_start)}</td>
      <td class="num">${formatNumber(r.search)}</td>
      <td class="num">${formatNumber(r.view_item)}</td>
      <td class="num">${formatNumber(r.begin_checkout)}</td>
      <td class="num">${formatNumber(r.purchase)}</td>
      <td class="num">$${formatNumber(Math.round(r.purchase_revenue))}</td>
      <td class="num">${r.cvr.toFixed(2)}%</td>
    </tr>
  `).join('');

  // Row count
  const countEl = document.getElementById('dtRowCount');
  if (countEl) countEl.textContent = totalRows.toLocaleString() + ' registros';

  // Page info
  const pageInfoEl = document.getElementById('dtPageInfo');
  if (pageInfoEl) {
    const end = Math.min(start + DT.perPage, totalRows);
    pageInfoEl.textContent = `${start + 1}–${end} de ${totalRows.toLocaleString()}`;
  }

  // Pagination
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const container = document.getElementById('dtPagination');
  if (!container) return;
  container.innerHTML = '';

  if (totalPages <= 1) return;

  // Prev button
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '‹';
  prevBtn.disabled = DT.page <= 1;
  prevBtn.addEventListener('click', () => { DT.page--; renderDataTable(COMPUTED.filtered); });
  container.appendChild(prevBtn);

  // Page buttons (max 7 visible)
  const maxVisible = 7;
  let startPage = Math.max(1, DT.page - 3);
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

  for (let p = startPage; p <= endPage; p++) {
    const btn = document.createElement('button');
    btn.textContent = p;
    btn.classList.toggle('active', p === DT.page);
    btn.addEventListener('click', () => { DT.page = p; renderDataTable(COMPUTED.filtered); });
    container.appendChild(btn);
  }

  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.textContent = '›';
  nextBtn.disabled = DT.page >= totalPages;
  nextBtn.addEventListener('click', () => { DT.page++; renderDataTable(COMPUTED.filtered); });
  container.appendChild(nextBtn);
}

// ========== CSV EXPORT ==========
function exportCSV() {
  const filtered = COMPUTED.filtered;
  const headers = ['Date', 'Device', 'Channel', 'Campaign', 'Source/Medium', 'Sessions', 'Searches', 'Views', 'Checkout', 'Bookings', 'Revenue', 'CVR%'];
  const rows = filtered.map(r => [
    r.date,
    r.device_category,
    r.channel_group,
    '"' + (r.campaign_name || '').replace(/"/g, '""') + '"',
    '"' + (r.source_medium || '').replace(/"/g, '""') + '"',
    r.session_start,
    r.search,
    r.view_item,
    r.begin_checkout,
    r.purchase,
    r.purchase_revenue.toFixed(2),
    (r.session_start > 0 ? r.purchase / r.session_start * 100 : 0).toFixed(2),
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'despegar_dashboard_export_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ========== PERIOD BADGE ==========
function updatePeriodBadge(filtered) {
  const badge = document.getElementById('periodBadgeText');
  if (!badge || filtered.length === 0) return;
  const dates = [...new Set(filtered.map(r => r.date))].sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  badge.textContent = dates.length === 1 ? formatDateShort(first) : formatDateShort(first) + ' – ' + formatDateShort(last);
}

// ========== SIDEBAR ==========
function bindSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  const mobileBtn = document.getElementById('mobileMenuBtn');

  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }

  const close = () => { sidebar.classList.remove('open'); overlay.classList.remove('active'); };
  if (toggleBtn) toggleBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('active'); });
  if (mobileBtn) mobileBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('active'); });
  overlay.addEventListener('click', close);
}

// ========== HELPERS ==========
function num(v) { return parseInt(v) || 0; }
function numF(v) { return parseFloat(v) || 0; }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function formatNumber(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function formatK(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toString();
}
function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
function roundedRect(ctx, x, y, w, h, r) {
  if (h <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
