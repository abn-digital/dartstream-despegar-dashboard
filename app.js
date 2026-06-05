// ========== Despegar B2B2C Dashboard — app.js ==========
// Real data from BigQuery: bigquery-388915.despegar_b2b2c.master_results
// Granular by date × device_category × channel_group
// Filters are reactive — all charts re-render on change.

// ========== RAW GRANULAR DATA (from BQ) ==========
// Each row: { date, device_category, channel_group, session_start, search, view_item, begin_checkout, purchase, purchase_revenue, ... }
let RAW_DATA = [];

// ========== STATE ==========
const FILTERS = {
  month: 'all',
  week: 'all',
  device: 'all',
  channel: 'all',
};

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  bindFilters();
  render();
});

// ========== LOAD DATA ==========
async function loadData() {
  // Data loaded from data.js (INLINE_DATA global)
  // Falls back to fetch for served environments
  let json;
  if (typeof INLINE_DATA !== 'undefined') {
    json = INLINE_DATA;
  } else {
    try {
      const resp = await fetch('data.json');
      json = await resp.json();
    } catch (e) {
      console.error('Failed to load data', e);
      json = FALLBACK_DATA;
    }
  }

  RAW_DATA = json.map(row => ({
    date:               row.date,
    device_category:    (row.device_category || 'unknown').toLowerCase(),
    channel_group:      row.channel_group || 'Direct',
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
}

// ========== DATE HELPERS ==========
const MONTH_NAMES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_NAMES_FULL = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function getISOWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function parseMonth(dateStr) {
  // dateStr = "2026-06-04" → "2026-06"
  return dateStr.substring(0, 7);
}

function formatMonthLabel(ym) {
  // ym = "2026-06" → "Jun 2026"
  const [y, m] = ym.split('-');
  return MONTH_NAMES[parseInt(m)] + ' ' + y;
}

// ========== FILTER BINDING ==========
function bindFilters() {
  console.log('[dashboard] bindFilters called. RAW_DATA rows:', RAW_DATA.length);

  // --- Populate Month options from data ---
  const monthSelect = document.getElementById('filterMonth');
  if (monthSelect) {
    const months = [...new Set(RAW_DATA.map(r => parseMonth(r.date)))].sort().reverse();
    monthSelect.innerHTML = '<option value="all">Todos</option>';
    months.forEach(ym => {
      const opt = document.createElement('option');
      opt.value = ym;
      opt.textContent = formatMonthLabel(ym);
      monthSelect.appendChild(opt);
    });
    monthSelect.addEventListener('change', () => {
      FILTERS.month = monthSelect.value;
      render();
    });
  }

  // --- Populate Week options from data ---
  const weekSelect = document.getElementById('filterWeek');
  if (weekSelect) {
    const weeksSet = new Map();
    RAW_DATA.forEach(r => {
      const wn = getISOWeek(r.date);
      const key = 'W' + wn;
      if (!weeksSet.has(key)) weeksSet.set(key, wn);
    });
    const weeks = [...weeksSet.entries()].sort((a, b) => b[1] - a[1]);
    weekSelect.innerHTML = '<option value="all">Todas</option>';
    weeks.forEach(([label]) => {
      const opt = document.createElement('option');
      opt.value = label;
      opt.textContent = label;
      weekSelect.appendChild(opt);
    });
    weekSelect.addEventListener('change', () => {
      FILTERS.week = weekSelect.value;
      render();
    });
  }

  // --- Device filter ---
  const deviceSelect = document.getElementById('filterDevice');
  if (deviceSelect) {
    deviceSelect.addEventListener('change', () => {
      FILTERS.device = deviceSelect.value;
      render();
    });
  }

  // --- Platform filter (maps to device) ---
  const platformSelect = document.getElementById('filterPlatform');
  if (platformSelect) {
    platformSelect.addEventListener('change', () => {
      FILTERS.device = platformSelect.value;
      render();
      if (deviceSelect) {
        const mapBack = { 'site-desktop': 'desktop', 'site-mobile': 'mobile', 'app': 'mobile', 'all': 'all' };
        deviceSelect.value = mapBack[platformSelect.value] || 'all';
      }
    });
  }

  // --- Channel filter (populate dynamically) ---
  const channelSelect = document.getElementById('filterChannel');
  if (channelSelect) {
    const channels = [...new Set(RAW_DATA.map(r => r.channel_group))].sort();
    channelSelect.innerHTML = '<option value="all">Todos</option>';
    channels.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.toLowerCase();
      opt.textContent = ch;
      channelSelect.appendChild(opt);
    });
    channelSelect.addEventListener('change', () => {
      FILTERS.channel = channelSelect.value;
      render();
    });
  }

  // --- Product & Partner (no data dimension yet) ---
  ['filterProduct', 'filterPartner'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => {});
  });

  initSidebar();
  console.log('[dashboard] All filters bound');
}

// ========== FILTER DATA ==========
function getFilteredData() {
  return RAW_DATA.filter(row => {
    // Month filter — e.g. "2026-06"
    if (FILTERS.month !== 'all') {
      if (parseMonth(row.date) !== FILTERS.month) return false;
    }

    // Week filter — e.g. "W23"
    if (FILTERS.week !== 'all') {
      const rowWeek = 'W' + getISOWeek(row.date);
      if (rowWeek !== FILTERS.week) return false;
    }

    // Device filter
    if (FILTERS.device !== 'all') {
      const deviceMap = {
        'desktop': 'desktop', 'mobile': 'mobile', 'tablet': 'tablet',
        'site-desktop': 'desktop', 'site-mobile': 'mobile', 'app': 'mobile',
      };
      const target = deviceMap[FILTERS.device] || FILTERS.device;
      if (row.device_category !== target) return false;
    }

    // Channel filter
    if (FILTERS.channel !== 'all') {
      if (row.channel_group.toLowerCase() !== FILTERS.channel) return false;
    }

    return true;
  });
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

// ========== RENDER ALL ==========
function render() {
  const filtered = getFilteredData();
  const totals = aggregate(filtered);
  const daily = aggregateByDate(filtered);
  const platforms = aggregateByDevice(filtered);

  renderKPIs(totals);
  renderFunnel(totals, daily);
  renderPlatformLegend(platforms);
  renderDonutChart(platforms);
  renderEvolutionChart(daily);
  updatePeriodBadge(filtered);
}

function updatePeriodBadge(filtered) {
  const badge = document.querySelector('.period-badge span');
  if (!badge || filtered.length === 0) return;
  const dates = [...new Set(filtered.map(r => r.date))].sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const fmtDate = (d) => {
    const [y, m, day] = d.split('-');
    return parseInt(day) + ' ' + MONTH_NAMES[parseInt(m)] + ' ' + y;
  };
  badge.textContent = dates.length === 1 ? fmtDate(first) : fmtDate(first) + ' – ' + fmtDate(last);
}

// ========== RENDER KPIs ==========
function renderKPIs(totals) {
  const rows = document.querySelectorAll('.kpi-row');
  if (rows.length < 4) return;

  const kpis = [
    { value: totals.purchase_revenue, prefix: '$', decimals: 0 },
    { value: totals.margin,           prefix: '$', decimals: 0 },
    { value: totals.purchase,         prefix: '',  decimals: 0 },
    { value: totals.asp,              prefix: '$', decimals: 0 },
  ];

  rows.forEach((row, i) => {
    const kpi = kpis[i];
    const valueEl = row.querySelector('.kpi-value');
    if (valueEl) {
      valueEl.textContent = kpi.prefix + formatNumber(Math.round(kpi.value));
    }
    // Animate value change
    valueEl.style.transition = 'none';
    valueEl.style.opacity = '0.4';
    requestAnimationFrame(() => {
      valueEl.style.transition = 'opacity 0.3s ease';
      valueEl.style.opacity = '1';
    });
  });
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

  // CVR strip
  const cvrValues = document.querySelectorAll('.cvr-value');
  if (cvrValues.length >= 3 && daily.length > 0) {
    const firstDayCvr = daily[0].session_start > 0 ? daily[0].purchase / daily[0].session_start * 100 : 0;
    const overallCvr = totals.cvr;
    const vsLw = firstDayCvr > 0 ? ((overallCvr - firstDayCvr) / firstDayCvr * 100).toFixed(1) : '0.0';

    cvrValues[0].textContent = firstDayCvr.toFixed(2) + '%';
    cvrValues[1].textContent = overallCvr.toFixed(2) + '%';
    cvrValues[1].className = 'cvr-value cvr-value-main';
    cvrValues[2].textContent = vsLw + '%';
    cvrValues[2].className = 'cvr-value ' + (parseFloat(vsLw) < 0 ? 'cvr-value-negative' : 'cvr-value-positive');
  }
}

// ========== RENDER PLATFORM LEGEND ==========
function renderPlatformLegend(platforms) {
  const colors = ['#540CEC', '#9D17C9', '#E5337A', '#FF7A33'];
  const totalBookings = platforms.reduce((s, p) => s + p.bookings, 0) || 1;

  const centerVal = document.querySelector('.donut-center-value');
  if (centerVal) centerVal.textContent = formatK(totalBookings);

  const legendContainer = document.querySelector('.platform-legend');
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
  const size = 220;
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
  const outerR = 100, innerR = 68, gap = 0.04;
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

        // Highlight gloss
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
    const months = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return parseInt(parts[2]) + ' ' + months[parseInt(parts[1])];
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

  // Resize handler (debounced)
  if (!canvas._resizeBound) {
    canvas._resizeBound = true;
    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => renderEvolutionChart(daily), 200);
    });
  }
}

// ========== SIDEBAR ==========
function initSidebar() {
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
  toggleBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('active'); });
  mobileBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('active'); });
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

// ========== FALLBACK DATA ==========
const FALLBACK_DATA = [
  {date:"2026-05-31",device_category:"desktop",channel_group:"Direct",session_start:198,search:540,view_item:120,begin_checkout:58,purchase:12,purchase_revenue:3850,user_engagement:490,first_visit:80,page_view:1200,scroll:180,view_search_results:0,click:0,form_start:5,file_download:0},
  {date:"2026-05-31",device_category:"mobile",channel_group:"Direct",session_start:8500,search:10200,view_item:2200,begin_checkout:700,purchase:100,purchase_revenue:35000,user_engagement:14000,first_visit:5000,page_view:40000,scroll:3500,view_search_results:0,click:5,form_start:2,file_download:1},
];
