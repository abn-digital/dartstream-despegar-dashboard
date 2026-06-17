// ========== Despegar B2B2C Dashboard — app.js v3 ==========
// Improvements: Date range filter, Campaigns tab, interactive chart, fixed tooltips

// ========== STATE ==========
let RAW_DATA = [];
let currentTab = 'overview';

const FILTERS = {
  dateFrom: '',
  dateTo: '',
  device: 'all',
  channel: 'all',
};

let COMPUTED = { filtered: [], totals: {}, daily: [], platforms: [], campaigns: [] };


// Campaign table state
const CT = { sortCol: 'purchase_revenue', sortDir: 'desc', page: 1, perPage: 30, searchQuery: '' };

// Funnel tab state (campaign scope)
const FUNNEL = { campaign: 'all' };

// Metric base: 'sessions' = sum(session_start) | 'devices' = distinct upa_id count
let VIEW_BASE = 'sessions';

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  bindFilters();
  bindTabs();
  bindBaseToggle();
  bindCampaignTable();
  bindFunnelControls();
  initTooltipSystem();
  bindSparkModal();
  recomputeAndRender();
});

// ========== LOAD DATA ==========
async function loadData() {
  let json;
  if (typeof INLINE_DATA !== 'undefined') {
    json = INLINE_DATA;
  } else {
    try { const resp = await fetch('data.json'); json = await resp.json(); } catch (e) { json = []; }
  }

  RAW_DATA = json.map(row => ({
    date:               row.date,
    device_category:    (row.device_category || 'unknown').toLowerCase(),
    channel_group:      row.channel_group || 'Direct',
    campaign_name:      row.campaign_name || '(not set)',
    source_medium:      row.source_medium || '(not set)',
    upa_id:             row.upa_id || '(not set)',
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

  // Set date range defaults from data
  const dates = [...new Set(RAW_DATA.map(r => r.date))].sort();
  if (dates.length > 0) {
    FILTERS.dateFrom = dates[0];
    FILTERS.dateTo = dates[dates.length - 1];

    const fromInput = document.getElementById('filterDateFrom');
    const toInput = document.getElementById('filterDateTo');
    if (fromInput) { fromInput.value = dates[0]; fromInput.min = dates[0]; fromInput.max = dates[dates.length - 1]; }
    if (toInput) { toInput.value = dates[dates.length - 1]; toInput.min = dates[0]; toInput.max = dates[dates.length - 1]; }

    const el = document.getElementById('lastUpdated');
    if (el) el.textContent = 'Hasta ' + formatDateShort(dates[dates.length - 1]);
  }
}

// ========== DATE HELPERS ==========
const MONTH_NAMES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return parseInt(d) + ' ' + MONTH_NAMES[parseInt(m)] + ' ' + y;
}
function formatDateCompact(dateStr) {
  const [, m, d] = dateStr.split('-');
  return parseInt(d) + '/' + parseInt(m);
}

// ========== TAB SYSTEM ==========
function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
}

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  const panelId = 'panel' + tabId.charAt(0).toUpperCase() + tabId.slice(1);
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === panelId));
  renderActiveTab();
}

// ========== FILTER BINDING ==========
function bindFilters() {
  const allDates = [...new Set(RAW_DATA.map(r => r.date))].sort();
  const minDate = allDates[0], maxDate = allDates[allDates.length - 1];

  // --- Date Range ---
  const dateBtn = document.getElementById('dateRangeBtn');
  const dateDropdown = document.getElementById('dateDropdown');
  const fromInput = document.getElementById('filterDateFrom');
  const toInput = document.getElementById('filterDateTo');
  const dateLabel = document.getElementById('dateRangeLabel');
  const applyBtn = document.getElementById('dateApplyBtn');

  if (fromInput) { fromInput.value = FILTERS.dateFrom; fromInput.min = minDate; fromInput.max = maxDate; }
  if (toInput) { toInput.value = FILTERS.dateTo; toInput.min = minDate; toInput.max = maxDate; }
  updateDateLabel();

  dateBtn.addEventListener('click', () => toggleDropdown(dateBtn, dateDropdown));

  // Presets
  document.querySelectorAll('.date-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.days);
      document.querySelectorAll('.date-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (days === 0) {
        fromInput.value = minDate; toInput.value = maxDate;
      } else {
        const end = new Date(maxDate);
        const start = new Date(end); start.setDate(start.getDate() - days + 1);
        fromInput.value = start.toISOString().slice(0, 10); toInput.value = maxDate;
      }
    });
  });

  applyBtn.addEventListener('click', () => {
    FILTERS.dateFrom = fromInput.value;
    FILTERS.dateTo = toInput.value;
    updateDateLabel();
    closeAllDropdowns();
    onFilterChange();
  });

  function updateDateLabel() {
    dateLabel.textContent = formatDateCompact2(FILTERS.dateFrom) + ' — ' + formatDateCompact2(FILTERS.dateTo);
  }

  // --- Device ---
  const deviceBtn = document.getElementById('deviceFilterBtn');
  const deviceDropdown = document.getElementById('deviceDropdown');
  const deviceLabel = document.getElementById('deviceLabel');

  deviceBtn.addEventListener('click', () => toggleDropdown(deviceBtn, deviceDropdown));
  deviceDropdown.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      FILTERS.device = item.dataset.value;
      deviceDropdown.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      deviceLabel.textContent = item.dataset.value === 'all' ? 'Device: Todos' : capitalize(item.dataset.value);
      closeAllDropdowns();
      onFilterChange();
    });
  });

  // --- Channel ---
  const channelBtn = document.getElementById('channelFilterBtn');
  const channelDropdown = document.getElementById('channelDropdown');
  const channelLabel = document.getElementById('channelLabel');

  const channels = [...new Set(RAW_DATA.map(r => r.channel_group))].sort();
  channelDropdown.innerHTML = '<button class="dropdown-item active" data-value="all">Todos</button>';
  channels.forEach(ch => {
    channelDropdown.innerHTML += `<button class="dropdown-item" data-value="${ch.toLowerCase()}">${ch}</button>`;
  });

  channelBtn.addEventListener('click', () => toggleDropdown(channelBtn, channelDropdown));
  channelDropdown.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      FILTERS.channel = item.dataset.value;
      channelDropdown.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      channelLabel.textContent = item.dataset.value === 'all' ? 'Canal: Todos' : item.textContent;
      closeAllDropdowns();
      onFilterChange();
    });
  });

  // --- Global close ---
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-group')) closeAllDropdowns();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllDropdowns(); });
}

function toggleDropdown(btn, dropdown) {
  const isOpen = dropdown.classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) { btn.classList.add('open'); dropdown.classList.add('open'); }
}

function closeAllDropdowns() {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('open'));
  document.querySelectorAll('.filter-dropdown').forEach(d => d.classList.remove('open'));
}

function formatDateCompact2(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return parseInt(d) + ' ' + MONTH_NAMES[parseInt(m)];
}

// ========== FILTER DATA ==========
function getFilteredData() {
  return RAW_DATA.filter(row => {
    if (FILTERS.dateFrom && row.date < FILTERS.dateFrom) return false;
    if (FILTERS.dateTo && row.date > FILTERS.dateTo) return false;
    if (FILTERS.device !== 'all' && row.device_category !== FILTERS.device) return false;
    if (FILTERS.channel !== 'all' && row.channel_group.toLowerCase() !== FILTERS.channel) return false;
    return true;
  });
}

// ========== COMPUTE & RENDER ==========
function recomputeAndRender() {
  COMPUTED.filtered = getFilteredData();
  COMPUTED.totals = aggregate(COMPUTED.filtered);
  COMPUTED.daily = aggregateByDate(COMPUTED.filtered);
  COMPUTED.platforms = aggregateByDevice(COMPUTED.filtered);
  COMPUTED.campaigns = aggregateByCampaign(COMPUTED.filtered);
  renderActiveTab();
}

function onFilterChange() {

  CT.page = 1;
  recomputeAndRender();
}

function renderActiveTab() {
  const { filtered, totals, daily, platforms, campaigns } = COMPUTED;
  if (currentTab === 'overview') { renderBANs(totals); renderPlatformLegend(platforms); renderDonutChart(platforms); renderCVRSummary(totals, daily); }
  else if (currentTab === 'funnel') {
    const scoped = getFunnelScopedData();
    const fTotals = aggregate(scoped);
    const fDaily = aggregateByDate(scoped);
    renderFunnel(fTotals, fDaily);
    requestAnimationFrame(() => renderEvolutionChart(fDaily));
  }
  else if (currentTab === 'campaigns') { renderCampaignBars(campaigns); renderCampaignTable(campaigns); }
}

// Restrict the (already date/device/channel-filtered) data to the selected funnel campaign
function getFunnelScopedData() {
  if (FUNNEL.campaign === 'all') return COMPUTED.filtered;
  return COMPUTED.filtered.filter(r => r.campaign_name === FUNNEL.campaign);
}

// ========== BASE TOGGLE (Sessions vs Dispositivos) ==========
function bindBaseToggle() {
  document.querySelectorAll('.base-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      VIEW_BASE = btn.dataset.base;
      document.querySelectorAll('.base-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.base === VIEW_BASE));
      recomputeAndRender();
    });
  });
}

// ========== FUNNEL CONTROLS (campaign scope) ==========
function bindFunnelControls() {
  const select = document.getElementById('funnelCampaignSelect');
  if (!select) return;

  // Build campaign list ordered by total revenue (most relevant first)
  const byCamp = {};
  RAW_DATA.forEach(r => { byCamp[r.campaign_name] = (byCamp[r.campaign_name] || 0) + r.purchase_revenue; });
  const campaigns = Object.keys(byCamp).sort((a, b) => byCamp[b] - byCamp[a]);

  select.innerHTML = '<option value="all">Todas las campañas</option>' +
    campaigns.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');

  select.addEventListener('change', () => {
    FUNNEL.campaign = select.value;
    const hint = document.getElementById('funnelScopeHint');
    if (hint) hint.textContent = FUNNEL.campaign === 'all' ? 'Mostrando todas las campañas' : 'Funnel de: ' + FUNNEL.campaign;
    if (currentTab === 'funnel') renderActiveTab();
  });
}

// ========== AGGREGATE ==========
function aggregate(data) {
  const keys = ['session_start','first_visit','page_view','search','view_search_results','view_item','begin_checkout','purchase','purchase_revenue','user_engagement','scroll','click','form_start','file_download'];
  const t = Object.fromEntries(keys.map(k => [k, 0]));
  const upaSet = new Set();
  data.forEach(row => {
    keys.forEach(k => { t[k] += row[k]; });
    if (row.upa_id && row.upa_id !== '(not set)') upaSet.add(row.upa_id);
  });
  t.devices = upaSet.size;
  t.asp = t.purchase > 0 ? t.purchase_revenue / t.purchase : 0;
  const base = VIEW_BASE === 'devices' ? t.devices : t.session_start;
  t.cvr = base > 0 ? t.purchase / base * 100 : 0;
  t.margin = t.purchase_revenue * 0.0224;
  return t;
}

function aggregateByDate(data) {
  const byDate = {};
  data.forEach(row => {
    if (!byDate[row.date]) byDate[row.date] = { date: row.date, session_start:0, search:0, view_item:0, begin_checkout:0, purchase:0, purchase_revenue:0, _upa: new Set() };
    const d = byDate[row.date];
    d.session_start += row.session_start; d.search += row.search; d.view_item += row.view_item;
    d.begin_checkout += row.begin_checkout; d.purchase += row.purchase; d.purchase_revenue += row.purchase_revenue;
    if (row.upa_id && row.upa_id !== '(not set)') d._upa.add(row.upa_id);
  });
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({ ...d, devices: d._upa.size }));
}

function aggregateByDevice(data) {
  const byDev = {};
  data.forEach(row => {
    const dev = row.device_category;
    if (!byDev[dev]) byDev[dev] = { label: capitalize(dev), bookings:0, revenue:0, sessions:0, _upa: new Set() };
    byDev[dev].bookings += row.purchase; byDev[dev].revenue += row.purchase_revenue; byDev[dev].sessions += row.session_start;
    if (row.upa_id && row.upa_id !== '(not set)') byDev[dev]._upa.add(row.upa_id);
  });
  return Object.values(byDev).map(d => ({ ...d, devices: d._upa.size })).sort((a, b) => b.bookings - a.bookings);
}

function aggregateByCampaign(data) {
  const byCamp = {};
  data.forEach(row => {
    const key = row.campaign_name + '||' + row.source_medium;
    if (!byCamp[key]) byCamp[key] = { campaign_name: row.campaign_name, source_medium: row.source_medium, session_start:0, search:0, view_item:0, begin_checkout:0, purchase:0, purchase_revenue:0 };
    const c = byCamp[key];
    c.session_start += row.session_start; c.search += row.search; c.view_item += row.view_item;
    c.begin_checkout += row.begin_checkout; c.purchase += row.purchase; c.purchase_revenue += row.purchase_revenue;
  });
  return Object.values(byCamp).map(c => ({
    ...c,
    cvr: c.session_start > 0 ? c.purchase / c.session_start * 100 : 0,
    asp: c.purchase > 0 ? c.purchase_revenue / c.purchase : 0,
  })).sort((a, b) => b.purchase_revenue - a.purchase_revenue);
}

// ========== RENDER BANs ==========
function renderBANs(totals) {
  const items = [
    { id: 'banGBValue', value: totals.purchase_revenue, prefix: '$' },
    { id: 'banMarginValue', value: totals.margin, prefix: '$' },
    { id: 'banOrdersValue', value: totals.purchase, prefix: '' },
    { id: 'banASPValue', value: totals.asp, prefix: '$' },
  ];
  items.forEach(item => {
    const el = document.getElementById(item.id);
    if (el) {
      el.textContent = item.prefix + formatNumber(Math.round(item.value));
      el.style.transition = 'none'; el.style.opacity = '0.4';
      requestAnimationFrame(() => { el.style.transition = 'opacity 0.3s ease'; el.style.opacity = '1'; });
    }
  });
  renderSparklines(COMPUTED.daily);
}

// ========== SPARKLINES ==========
function renderSparklines(daily) {
  if (daily.length < 2) return;

  const sparkConfigs = [
    { id: 'sparkGB', key: 'purchase_revenue', color: '#540CEC' },
    { id: 'sparkMargin', key: 'purchase_revenue', color: '#12B886', multiplier: 0.0224 },
    { id: 'sparkOrders', key: 'purchase', color: '#9D17C9' },
    { id: 'sparkASP', key: null, color: '#E5337A' }, // computed: revenue / orders
  ];

  sparkConfigs.forEach(cfg => {
    const svg = document.getElementById(cfg.id);
    if (!svg) return;

    const values = daily.map(d => {
      if (cfg.key === null) return d.purchase > 0 ? d.purchase_revenue / d.purchase : 0;
      return (d[cfg.key] || 0) * (cfg.multiplier || 1);
    });

    const W = 120, H = 28, pad = 1;
    const max = Math.max(...values) || 1;
    const min = Math.min(...values);
    const range = max - min || 1;

    const points = values.map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (W - 2 * pad);
      const y = pad + (1 - (v - min) / range) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const gradId = cfg.id + 'Grad';
    svg.innerHTML = `
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${cfg.color}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${cfg.color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${points[0].split(',')[0]},${H} ${points.join(' ')} ${points[points.length-1].split(',')[0]},${H}" fill="url(#${gradId})" />
      <polyline points="${points.join(' ')}" fill="none" stroke="${cfg.color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    `;
  });
}

// ========== RENDER CVR SUMMARY ==========
function renderCVRSummary(totals, daily) {
  const cvrHero = document.getElementById('cvrHeroValue');
  if (cvrHero) cvrHero.textContent = totals.cvr.toFixed(2) + '%';

  const sessionsEl = document.getElementById('cvrSessions');
  if (sessionsEl) sessionsEl.textContent = formatNumber(VIEW_BASE === 'devices' ? totals.devices : totals.session_start);
  const sessionsLabelEl = document.getElementById('cvrSessionsLabel');
  if (sessionsLabelEl) sessionsLabelEl.textContent = VIEW_BASE === 'devices' ? 'Dispositivos' : 'Sessions';

  const bookingsEl = document.getElementById('cvrBookings');
  if (bookingsEl) bookingsEl.textContent = formatNumber(totals.purchase);
}

// ========== RENDER FUNNEL ==========
function renderFunnel(totals, daily) {
  const baseCount = VIEW_BASE === 'devices' ? totals.devices : totals.session_start;
  const steps = [
    { name: VIEW_BASE === 'devices' ? 'Dispositivos' : 'Sessions', count: baseCount },
    { name: 'Búsquedas', count: totals.search },
    { name: 'Detalle', count: totals.view_item },
    { name: 'Checkout', count: totals.begin_checkout },
    { name: 'Bookings', count: totals.purchase },
  ];
  const colors = ['#540CEC', '#6B0ED4', '#9D17C9', '#C42B6B', '#E5337A'];
  const total = steps[0].count || 1;
  const funnelChart = document.getElementById('funnelChart');
  if (!funnelChart) return;
  funnelChart.innerHTML = '';

  const W = 500, stepH = 56, gap = 4;
  const totalH = steps.length * stepH + (steps.length - 1) * gap;
  const minW = 80;

  // Build SVG funnel
  let svgContent = '';
  steps.forEach((step, i) => {
    const pct = step.count / total;
    const nextPct = i < steps.length - 1 ? (steps[i+1].count / total) : pct;
    const topW = Math.max(pct * W, minW);
    const botW = Math.max(nextPct * W, minW);
    const y = i * (stepH + gap);
    const topL = (W - topW) / 2;
    const topR = (W + topW) / 2;
    const botL = (W - botW) / 2;
    const botR = (W + botW) / 2;

    svgContent += `
      <polygon points="${topL},${y} ${topR},${y} ${botR},${y + stepH} ${botL},${y + stepH}"
        fill="${colors[i]}" opacity="0.92" class="funnel-trap" style="animation-delay:${i * 0.1}s"/>
      <polygon points="${topL},${y} ${topR},${y} ${botR},${y + stepH} ${botL},${y + stepH}"
        fill="url(#funnelShine)" />
    `;

    // Drop indicator between steps
    if (i < steps.length - 1) {
      const drop = step.count > 0 ? ((step.count - steps[i+1].count) / step.count * 100).toFixed(1) : '0.0';
      svgContent += `<text x="${W + 16}" y="${y + stepH + gap/2 + 2}" class="funnel-drop-label" fill="#6B6880" font-size="10" font-weight="600" font-family="Inter, sans-serif">-${drop}%</text>`;
    }
  });

  // Labels on the left, values in center
  steps.forEach((step, i) => {
    const y = i * (stepH + gap);
    const cy = y + stepH / 2;
    svgContent += `
      <text x="${W/2}" y="${cy - 6}" text-anchor="middle" fill="white" font-size="11" font-weight="700" font-family="Inter, sans-serif">${step.name}</text>
      <text x="${W/2}" y="${cy + 12}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="15" font-weight="800" font-family="Poppins, sans-serif">${formatNumber(step.count)}</text>
    `;
    // Percentage on the right
    const pctVal = (step.count / total * 100).toFixed(1);
    svgContent += `<text x="${W + 16}" y="${cy + 4}" fill="#6B6880" font-size="12" font-weight="700" font-family="Inter, sans-serif">${pctVal}%</text>`;
  });

  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('viewBox', `0 0 ${W + 70} ${totalH}`);
  svgEl.setAttribute('class', 'funnel-svg');
  svgEl.innerHTML = `
    <defs>
      <linearGradient id="funnelShine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="white" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${svgContent}
  `;
  funnelChart.appendChild(svgEl);

  // CVR Strip
  const cvrActual = document.getElementById('cvrActual');
  if (cvrActual) cvrActual.textContent = totals.cvr.toFixed(2) + '%';
}

// ========== PLATFORM LEGEND ==========
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
    item.innerHTML = `<div class="legend-color" style="background:${colors[i%colors.length]}"></div><div class="legend-info"><div class="legend-name">${p.label}</div><div class="legend-detail"><span class="legend-value">${formatK(p.bookings)}</span><span class="legend-pct">${pct}%</span></div></div>`;
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
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr, dpr);

  const colors = ['#540CEC', '#9D17C9', '#E5337A', '#FF7A33'];
  const totalBookings = platforms.reduce((s, p) => s + p.bookings, 0) || 1;
  const segments = platforms.map((p, i) => ({ value: p.bookings / totalBookings * 100, color: colors[i % colors.length] }));
  const cx = size/2, cy = size/2, outerR = 90, innerR = 62, gap = 0.04;
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;
  let startTime = null;

  function drawDonut(ts) {
    if (!startTime) startTime = ts;
    const progress = Math.min((ts - startTime) / 800, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    ctx.clearRect(0, 0, size, size);
    let angle = -Math.PI / 2;
    segments.forEach(seg => {
      const segAngle = (seg.value / total) * 2 * Math.PI * eased;
      const sA = angle + gap/2, eA = angle + segAngle - gap/2;
      if (segAngle > gap) {
        ctx.beginPath(); ctx.arc(cx, cy, outerR, sA, eA); ctx.arc(cx, cy, innerR, eA, sA, true); ctx.closePath(); ctx.fillStyle = seg.color; ctx.fill();
      }
      angle += segAngle;
    });
    if (progress < 1) donutAnimId = requestAnimationFrame(drawDonut);
  }
  donutAnimId = requestAnimationFrame(drawDonut);
}

// ========== INTERACTIVE EVOLUTION CHART ==========
let evoChart = null; // stores geometry for interaction

function renderEvolutionChart(daily) {
  const canvas = document.getElementById('evolutionChart');
  if (!canvas) return;
  const container = document.getElementById('evolutionContainer');
  const tooltip = document.getElementById('chartTooltip');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth;
  const h = 320;

  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr, dpr);

  if (daily.length === 0) {
    ctx.fillStyle = '#8E8AA3'; ctx.font = '500 14px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Sin datos para este filtro', w/2, h/2);
    return;
  }

  const isDeviceBase = VIEW_BASE === 'devices';
  const barValues = daily.map(d => isDeviceBase ? d.devices : d.search);
  const barLabel = isDeviceBase ? 'Dispositivos' : 'Búsquedas';
  const cvr = daily.map(d => {
    const base = isDeviceBase ? d.devices : d.session_start;
    return base > 0 ? d.purchase / base * 100 : 0;
  });
  const pad = { top: 44, right: 60, bottom: 56, left: 60 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const maxSearchers = Math.max(...barValues) * 1.2 || 1;
  const maxCvr = Math.max(...cvr) * 1.4 || 1;
  const barWidth = Math.min(chartW / daily.length * 0.55, 40);
  const labelStep = Math.max(1, Math.ceil(daily.length / 14));

  // Store geometry for interaction
  const geo = { bars: [], points: [], daily, barValues, cvr, w, h, pad, chartW, chartH, maxSearchers, maxCvr, barWidth, labelStep };

  function drawChart(highlightIdx) {
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(20,28,44,0.06)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    }

    // Y-axis left labels (searches)
    ctx.fillStyle = '#8E8AA3'; ctx.font = '500 10px Inter, sans-serif'; ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.fillText(formatK(maxSearchers - (maxSearchers / 4) * i), pad.left - 8, y + 3);
    }

    // Y-axis right labels (CVR)
    ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.fillText((maxCvr - (maxCvr / 4) * i).toFixed(1) + '%', w - pad.right + 8, y + 3);
    }

    const points = [];
    daily.forEach((d, i) => {
      const x = pad.left + (chartW / daily.length) * (i + 0.5);
      const barH = (barValues[i] / maxSearchers) * chartH;
      const barY = pad.top + chartH - barH;
      const isActive = highlightIdx === i;
      const dimmed = highlightIdx >= 0 && !isActive;

      // Vertical crosshair for active bar
      if (isActive) {
        ctx.save();
        ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(84,12,236,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + chartH); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
      }

      // Bar
      ctx.globalAlpha = dimmed ? 0.25 : 1;
      const grad = ctx.createLinearGradient(0, barY, 0, pad.top + chartH);
      grad.addColorStop(0, isActive ? '#7A0FD6' : '#540CEC');
      grad.addColorStop(1, isActive ? '#9D17C9' : '#7A0FD6');
      ctx.fillStyle = grad;
      roundedRect(ctx, x - barWidth/2, barY, barWidth, barH, 4);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Date label — only show every Nth or if active
      if (i % labelStep === 0 || isActive) {
        ctx.fillStyle = isActive ? '#540CEC' : '#8E8AA3';
        ctx.font = (isActive ? '700' : '500') + ' 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatDateCompact(d.date), x, pad.top + chartH + 18);
      }

      const cvrY = pad.top + chartH - (cvr[i] / maxCvr) * chartH;
      points.push({ x, y: cvrY });
      geo.bars[i] = { x, barY, barW: barWidth, barH };
      geo.points[i] = { x, y: cvrY };
    });

    // CVR line
    ctx.beginPath(); ctx.strokeStyle = '#E5337A'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    points.forEach((pt, i) => { if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
    ctx.stroke();

    // CVR dots
    points.forEach((pt, i) => {
      const isActive = highlightIdx === i;
      const dimmed = highlightIdx >= 0 && !isActive;
      ctx.globalAlpha = dimmed ? 0.2 : 1;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, isActive ? 7 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? 'rgba(229,51,122,0.15)' : 'rgba(229,51,122,0.1)'; ctx.fill();
      ctx.beginPath(); ctx.arc(pt.x, pt.y, isActive ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = '#E5337A'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // Legend at bottom
    const legendY = h - 10;
    ctx.fillStyle = '#540CEC'; ctx.fillRect(pad.left, legendY - 6, 12, 8);
    ctx.fillStyle = '#56526A'; ctx.font = '600 10px Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(barLabel, pad.left + 16, legendY);
    const legendLineX = pad.left + 16 + ctx.measureText(barLabel).width + 16;
    ctx.beginPath(); ctx.moveTo(legendLineX, legendY - 2); ctx.lineTo(legendLineX + 14, legendY - 2);
    ctx.strokeStyle = '#E5337A'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(legendLineX + 7, legendY - 2, 3, 0, Math.PI * 2); ctx.fillStyle = '#E5337A'; ctx.fill();
    ctx.fillStyle = '#56526A'; ctx.fillText('CVR %', legendLineX + 20, legendY);
  }

  // Initial draw (no highlight)
  drawChart(-1);

  // Mouse interaction
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    let closestIdx = -1, minDist = Infinity;
    geo.bars.forEach((bar, i) => {
      const dist = Math.abs(bar.x - mouseX);
      if (dist < minDist) { minDist = dist; closestIdx = i; }
    });

    const maxDist = chartW / daily.length * 0.7;
    if (closestIdx >= 0 && minDist < maxDist) {
      drawChart(closestIdx);
      const d = daily[closestIdx];
      tooltip.innerHTML = `
        <div class="ct-date">${formatDateShort(d.date)}</div>
        <div class="ct-row"><span class="ct-dot" style="background:#540CEC"></span>${barLabel}<strong>${formatNumber(barValues[closestIdx])}</strong></div>
        <div class="ct-row"><span class="ct-dot" style="background:#E5337A"></span>CVR<strong>${cvr[closestIdx].toFixed(2)}%</strong></div>
        <div class="ct-row"><span class="ct-dot" style="background:#9D17C9"></span>Bookings<strong>${formatNumber(d.purchase)}</strong></div>
        <div class="ct-row"><span class="ct-dot" style="background:#12B886"></span>Revenue<strong>$${formatNumber(Math.round(d.purchase_revenue))}</strong></div>
      `;
      tooltip.style.display = 'block';
      let tipX = e.clientX - rect.left + 16;
      let tipY = e.clientY - rect.top - 80;
      if (tipX + 190 > rect.width) tipX = e.clientX - rect.left - 200;
      if (tipY < 0) tipY = 10;
      tooltip.style.left = tipX + 'px';
      tooltip.style.top = tipY + 'px';
    } else {
      drawChart(-1);
      tooltip.style.display = 'none';
    }
  };

  canvas.onmouseleave = () => { drawChart(-1); tooltip.style.display = 'none'; };

  // Resize
  if (!canvas._resizeBound) {
    canvas._resizeBound = true;
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (currentTab === 'funnel') renderActiveTab(); }, 200); });
  }
}

// ========== CAMPAIGN BARS (Top 10) ==========
function renderCampaignBars(campaigns) {
  const container = document.getElementById('campaignBars');
  if (!container) return;

  // Aggregate by campaign_name only (sum across sources)
  const byCampName = {};
  campaigns.forEach(c => {
    if (!byCampName[c.campaign_name]) byCampName[c.campaign_name] = { campaign_name: c.campaign_name, purchase_revenue: 0, purchase: 0, session_start: 0 };
    byCampName[c.campaign_name].purchase_revenue += c.purchase_revenue;
    byCampName[c.campaign_name].purchase += c.purchase;
    byCampName[c.campaign_name].session_start += c.session_start;
  });
  const top10 = Object.values(byCampName).sort((a, b) => b.purchase_revenue - a.purchase_revenue).slice(0, 10);
  const maxRev = top10[0]?.purchase_revenue || 1;

  container.innerHTML = top10.map((c, i) => {
    const pct = (c.purchase_revenue / maxRev * 100).toFixed(1);
    return `
      <div class="campaign-bar-row" style="animation-delay:${i * 0.05}s" title="${escHtml(c.campaign_name)}">
        <div class="campaign-bar-name">${escHtml(c.campaign_name)}</div>
        <div class="campaign-bar-track"><div class="campaign-bar-fill" style="width:${pct}%"></div></div>
        <div class="campaign-bar-revenue">$${formatK(c.purchase_revenue)}</div>
        <div class="campaign-bar-bookings">${formatNumber(c.purchase)} bkgs</div>
      </div>`;
  }).join('');
}

// ========== CAMPAIGN TABLE ==========
function bindCampaignTable() {
  document.querySelectorAll('[data-table="ct"].sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (CT.sortCol === col) CT.sortDir = CT.sortDir === 'asc' ? 'desc' : 'asc';
      else { CT.sortCol = col; CT.sortDir = 'desc'; }
      document.querySelectorAll('[data-table="ct"]').forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
      th.classList.add(CT.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      renderCampaignTable(COMPUTED.campaigns);
    });
  });
  const searchInput = document.getElementById('ctSearch');
  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => { CT.searchQuery = searchInput.value; CT.page = 1; renderCampaignTable(COMPUTED.campaigns); }, 250); });
  }
  const btnCSV = document.getElementById('btnExportCampaignCSV');
  if (btnCSV) btnCSV.addEventListener('click', () => exportCampaignCSV());
}

function renderCampaignTable(campaigns) {
  let rows = [...campaigns];
  if (CT.searchQuery) {
    const q = CT.searchQuery.toLowerCase();
    rows = rows.filter(r => r.campaign_name.toLowerCase().includes(q) || r.source_medium.toLowerCase().includes(q));
  }
  rows.sort((a, b) => {
    let va = a[CT.sortCol], vb = b[CT.sortCol];
    if (typeof va === 'string') return CT.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return CT.sortDir === 'asc' ? va - vb : vb - va;
  });
  const totalRows = rows.length;
  const totalPages = Math.ceil(totalRows / CT.perPage) || 1;
  CT.page = Math.min(CT.page, totalPages);
  const start = (CT.page - 1) * CT.perPage;
  const pageRows = rows.slice(start, start + CT.perPage);

  const tbody = document.getElementById('ctBody');
  if (!tbody) return;
  tbody.innerHTML = pageRows.map(r => `
    <tr class="${r.purchase > 0 ? 'has-bookings' : ''}">
      <td class="td-campaign" title="${escHtml(r.campaign_name)}">${escHtml(r.campaign_name)}</td>
      <td title="${escHtml(r.source_medium)}">${escHtml(r.source_medium)}</td>
      <td class="num">${formatNumber(r.session_start)}</td>
      <td class="num">${formatNumber(r.search)}</td>
      <td class="num">${formatNumber(r.purchase)}</td>
      <td class="num">$${formatNumber(Math.round(r.purchase_revenue))}</td>
      <td class="num">${r.cvr.toFixed(2)}%</td>
      <td class="num">$${formatNumber(Math.round(r.asp))}</td>
    </tr>`).join('');

  const countEl = document.getElementById('ctRowCount');
  if (countEl) countEl.textContent = totalRows.toLocaleString() + ' campañas';
  const pageInfoEl = document.getElementById('ctPageInfo');
  if (pageInfoEl) pageInfoEl.textContent = `${start + 1}–${Math.min(start + CT.perPage, totalRows)} de ${totalRows.toLocaleString()}`;
  renderTablePagination('ctPagination', CT, totalPages, () => renderCampaignTable(COMPUTED.campaigns));
}

function exportCampaignCSV() {
  const rows = COMPUTED.campaigns;
  const headers = ['Campaign', 'Source/Medium', 'Sessions', 'Searches', 'Bookings', 'Revenue', 'CVR%', 'ASP'];
  const csv = [headers.join(','), ...rows.map(r => [
    '"' + (r.campaign_name || '').replace(/"/g, '""') + '"',
    '"' + (r.source_medium || '').replace(/"/g, '""') + '"',
    r.session_start, r.search, r.purchase, r.purchase_revenue.toFixed(2), r.cvr.toFixed(2), r.asp.toFixed(2),
  ].join(','))].join('\n');
  downloadCSV(csv, 'despegar_campaigns_' + new Date().toISOString().slice(0, 10) + '.csv');
}



// ========== SHARED PAGINATION ==========
function renderTablePagination(containerId, state, totalPages, renderFn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (totalPages <= 1) return;
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '‹'; prevBtn.disabled = state.page <= 1;
  prevBtn.addEventListener('click', () => { state.page--; renderFn(); });
  container.appendChild(prevBtn);
  const maxVisible = 7;
  let startPage = Math.max(1, state.page - 3);
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
  for (let p = startPage; p <= endPage; p++) {
    const btn = document.createElement('button');
    btn.textContent = p; btn.classList.toggle('active', p === state.page);
    btn.addEventListener('click', () => { state.page = p; renderFn(); });
    container.appendChild(btn);
  }
  const nextBtn = document.createElement('button');
  nextBtn.textContent = '›'; nextBtn.disabled = state.page >= totalPages;
  nextBtn.addEventListener('click', () => { state.page++; renderFn(); });
  container.appendChild(nextBtn);
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ========== JS TOOLTIP SYSTEM (fixes cutoff) ==========
function initTooltipSystem() {
  const tip = document.getElementById('sharedTooltip');
  if (!tip) return;

  document.querySelectorAll('.info-tip').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const text = el.getAttribute('data-tooltip');
      if (!text) return;
      tip.textContent = text;
      tip.classList.add('visible');

      // Position relative to the triggering element
      const rect = el.getBoundingClientRect();
      const tipW = tip.offsetWidth;
      const tipH = tip.offsetHeight;

      let left = rect.left + rect.width / 2 - tipW / 2;
      let top = rect.bottom + 10;

      // Clamp horizontally
      if (left < 8) left = 8;
      if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;

      // Flip above if overflows bottom
      if (top + tipH > window.innerHeight - 8) {
        top = rect.top - tipH - 10;
      }

      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    });

    el.addEventListener('mouseleave', () => {
      tip.classList.remove('visible');
    });
  });
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
function escHtml(s) { const div = document.createElement('div'); div.textContent = s; return div.innerHTML; }
function roundedRect(ctx, x, y, w, h, r) {
  if (h <= 0) return;
  r = Math.min(r, w/2, h/2);
  ctx.beginPath(); ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r); ctx.lineTo(x+w, y+h);
  ctx.lineTo(x, y+h); ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
}

// ========== SPARKLINE DETAIL MODAL ==========
const SPARK_METRICS = [
  { index: 0, key: 'purchase_revenue', label: 'Gross Bookings', sub: 'Revenue total · USD', color: '#540CEC', bgColor: 'rgba(84,12,236,0.08)', prefix: '$', icon: 'gb' },
  { index: 1, key: 'margin', label: 'Margen', sub: 'Rentabilidad estimada · USD', color: '#12B886', bgColor: 'rgba(18,184,134,0.08)', prefix: '$', icon: 'margin' },
  { index: 2, key: 'purchase', label: 'Orders', sub: 'Reservas completadas', color: '#9D17C9', bgColor: 'rgba(157,23,201,0.08)', prefix: '', icon: 'orders' },
  { index: 3, key: 'asp', label: 'ASP', sub: 'Ticket promedio · USD', color: '#E5337A', bgColor: 'rgba(229,51,122,0.08)', prefix: '$', icon: 'asp' },
];

function bindSparkModal() {
  const cards = document.querySelectorAll('.ban-card');
  const overlay = document.getElementById('sparkModalOverlay');
  const closeBtn = document.getElementById('sparkModalClose');

  cards.forEach((card, i) => {
    if (i < SPARK_METRICS.length) {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.info-tip')) return; // don't open on tooltip click
        openSparkModal(SPARK_METRICS[i]);
      });
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', closeSparkModal);
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSparkModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSparkModal(); });
}

function openSparkModal(metric) {
  const overlay = document.getElementById('sparkModalOverlay');
  const titleEl = document.getElementById('sparkModalTitle');
  const subEl = document.getElementById('sparkModalSubtitle');
  const iconEl = document.getElementById('sparkModalIcon');
  const footerEl = document.getElementById('sparkModalFooter');

  titleEl.textContent = metric.label;
  subEl.textContent = metric.sub;
  iconEl.style.background = metric.bgColor;
  iconEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${metric.color}" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/></svg>`;

  const daily = COMPUTED.daily;
  if (daily.length > 0) {
    const startDate = formatDateShort(daily[0].date);
    const endDate = formatDateShort(daily[daily.length - 1].date);
    footerEl.textContent = `Período: ${startDate} — ${endDate} · ${daily.length} días`;
  }

  overlay.classList.add('active');
  requestAnimationFrame(() => renderSparkModalChart(metric));
}

function closeSparkModal() {
  document.getElementById('sparkModalOverlay').classList.remove('active');
  document.getElementById('sparkModalTooltip').style.display = 'none';
}

function renderSparkModalChart(metric) {
  const canvas = document.getElementById('sparkModalCanvas');
  const tooltip = document.getElementById('sparkModalTooltip');
  if (!canvas) return;

  const daily = COMPUTED.daily;
  if (daily.length < 2) return;

  const values = daily.map(d => {
    if (metric.key === 'margin') return d.purchase_revenue * 0.0224;
    if (metric.key === 'asp') return d.purchase > 0 ? d.purchase_revenue / d.purchase : 0;
    return d[metric.key] || 0;
  });

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height - 8;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const padL = 54, padR = 16, padT = 16, padB = 32;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const max = Math.max(...values) * 1.08;
  const min = Math.min(...values) * 0.92;
  const range = max - min || 1;

  // Grid lines + Y axis labels
  const gridLines = 5;
  ctx.strokeStyle = 'rgba(20,28,44,0.06)';
  ctx.lineWidth = 1;
  ctx.font = '10px Inter, sans-serif';
  ctx.fillStyle = '#6B6880';
  ctx.textAlign = 'right';
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + (i / gridLines) * chartH;
    const val = max - (i / gridLines) * range;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    const label = metric.prefix + formatK(val);
    ctx.fillText(label, padL - 8, y + 3);
  }

  // X axis labels (dates)
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6B6880';
  const step = Math.max(1, Math.floor(daily.length / 7));
  for (let i = 0; i < daily.length; i += step) {
    const x = padL + (i / (daily.length - 1)) * chartW;
    ctx.fillText(formatDateShort(daily[i].date), x, H - 6);
  }
  // Always show last date
  const lastX = padL + chartW;
  ctx.fillText(formatDateShort(daily[daily.length - 1].date), lastX, H - 6);

  // Compute points
  const points = values.map((v, i) => ({
    x: padL + (i / (values.length - 1)) * chartW,
    y: padT + (1 - (v - min) / range) * chartH,
    value: v,
    date: daily[i].date,
  }));

  // Fill area
  const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
  grad.addColorStop(0, metric.color + '30');
  grad.addColorStop(1, metric.color + '03');
  ctx.beginPath();
  ctx.moveTo(points[0].x, padT + chartH);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, padT + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = metric.color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Dots
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = metric.color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  });

  // Hover interaction
  canvas.onmousemove = (e) => {
    const canvasRect = canvas.getBoundingClientRect();
    const mx = e.clientX - canvasRect.left;
    let closest = null, closestDist = Infinity;
    points.forEach(p => {
      const dist = Math.abs(p.x - mx);
      if (dist < closestDist) { closestDist = dist; closest = p; }
    });
    if (closest && closestDist < 40) {
      const formatted = metric.prefix + formatNumber(Math.round(closest.value));
      tooltip.innerHTML = `<div style="font-size:10px;color:rgba(255,255,255,0.6);margin-bottom:2px">${formatDateShort(closest.date)}</div><div style="font-size:14px;font-weight:700;color:${metric.color}">${formatted}</div>`;
      tooltip.style.display = 'block';

      const body = canvas.parentElement;
      const bodyRect = body.getBoundingClientRect();
      let tipX = closest.x + 12;
      let tipY = closest.y - 10;
      if (tipX + 120 > bodyRect.width) tipX = closest.x - 130;
      tooltip.style.left = tipX + 'px';
      tooltip.style.top = tipY + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  };
  canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
}
