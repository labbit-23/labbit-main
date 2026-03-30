function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(dt);
}

function formatValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  if (Math.abs(n) >= 100) return String(Math.round(n * 10) / 10);
  return String(Math.round(n * 100) / 100);
}

function formatShortDate(value) {
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit"
  }).format(dt);
}

function formatMonthYear(value) {
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric"
  }).format(dt);
}

function renderReferenceText(value) {
  let text = String(value || "").trim();
  if (!text) return "";

  text = text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;lt;/gi, "&lt;")
    .replace(/&amp;gt;/gi, "&gt;")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/&lt;\s*br\s*\/?&gt;/gi, "\n")
    .replace(/\\n/g, "\n");

  return escapeHtml(text).replace(/\n+/g, "<br />");
}

function statusLabel(flag) {
  if (flag === "high") return "High";
  if (flag === "low") return "Low";
  if (flag === "normal") return "Normal";
  return "Unknown";
}

function statusClass(flag) {
  if (flag === "high") return "flag-high";
  if (flag === "low") return "flag-low";
  if (flag === "normal") return "flag-normal";
  return "flag-unknown";
}

function parameterInfoLine(param = {}) {
  const name = String(param?.name || "").toLowerCase();
  const key = String(param?.key || "").toLowerCase();
  const text = `${name} ${key}`;

  if (/\btotal cholesterol\b/.test(text)) return "Total cholesterol in blood; useful for overall lipid risk evaluation.";
  if (/\bldl\b/.test(text)) return "Low-density lipoprotein; higher levels can increase cardiovascular risk.";
  if (/\bhdl\b/.test(text)) return "High-density lipoprotein; generally protective for heart health.";
  if (/\btriglyceride/.test(text)) return "Blood fat linked with metabolic and cardiovascular risk when elevated.";
  if (/\bglucose\b/.test(text) && /\bfast/.test(text)) return "Fasting blood sugar level after an overnight fast.";
  if (/\bglucose\b/.test(text)) return "Blood sugar level at the time of sample collection.";
  if (/\bhba1c|glycosylated/.test(text)) return "Average blood sugar control over the last ~3 months.";
  if (/\bcreatinine\b/.test(text)) return "Kidney filtration marker; helps assess renal function.";
  if (/\burea\b/.test(text)) return "Protein waste marker used in routine kidney function assessment.";
  if (/\buric acid\b/.test(text)) return "Purine metabolism marker; high values may relate to gout/metabolic risk.";
  if (/\bast\b|\bgot\b/.test(text)) return "Liver enzyme; elevation may indicate liver or muscle stress.";
  if (/\balt\b|\bgpt\b/.test(text)) return "Liver enzyme commonly used to track hepatocellular injury.";
  if (/\bggt|gamma/.test(text)) return "Liver/biliary enzyme often used in alcohol and cholestatic assessment.";
  if (/\bbilirubin\b/.test(text)) return "Pigment metabolism marker used in liver and hemolysis evaluation.";
  if (/\bvitamin d|calcidiol/.test(text)) return "Vitamin D status marker important for bone and immune health.";
  if (/\bvitamin b12\b/.test(text)) return "Vitamin B12 level important for blood and nerve function.";
  if (/\bfolic acid|folate\b/.test(text)) return "Folate status marker relevant for red cell production and metabolic health.";
  if (/\bmagnesium\b/.test(text)) return "Essential mineral involved in muscle, nerve, and metabolic function.";
  if (/\binsulin\b/.test(text)) return "Hormone marker that helps assess insulin response and metabolic risk.";
  if (/\bhoma\b/.test(text)) return "Calculated insulin resistance index derived from fasting glucose and insulin.";
  if (/\bprolactin\b/.test(text)) return "Pituitary hormone marker used in reproductive and endocrine evaluation.";
  if (/\bfree t3|ft3|\bt3\b/.test(text)) return "Active thyroid hormone marker used with TSH/T4 for thyroid assessment.";
  if (/\bfree t4|ft4|\bt4\b/.test(text)) return "Thyroxine marker used alongside TSH to assess thyroid status.";
  if (/\banti tpo|microsomal|thyroid peroxidase\b/.test(text)) return "Thyroid autoimmunity marker useful in autoimmune thyroid disease screening.";
  if (/\btsh|thyroid stimulating/.test(text)) return "Primary thyroid-control hormone used for thyroid screening.";
  if (/\btestosterone\b/.test(text)) return "Major androgen hormone involved in reproductive and metabolic health.";
  if (/\bcortisol\b/.test(text)) return "Stress hormone marker that follows a daily biological rhythm.";
  if (/\bapolipoprotein|apo[\s-]?a1|apo[\s-]?b\b/.test(text)) return "Advanced lipid particle marker used for cardiovascular risk stratification.";
  if (/\blipoprotein\s*\(?a\)?\b/.test(text)) return "Inherited lipid-risk marker associated with long-term cardiovascular risk.";
  if (/\bnt[\s-]?pro[\s-]?bnp|natriuretic peptide|pro b type natriuretic\b/.test(text)) return "Cardiac stress marker often used in heart failure risk evaluation.";
  if (/\bcrp|c reactive/.test(text)) return "Inflammation marker often used for infection/inflammatory activity tracking.";
  if (/\besr\b/.test(text)) return "General inflammation marker that changes gradually over time.";
  if (/\bhomocysteine\b/.test(text)) return "Amino acid marker linked with vascular and nutritional risk profiling.";
  if (/\bpsa|prostatic specific antigen/.test(text)) return "Prostate-related screening marker used with clinical correlation.";
  if (/\bige\b/.test(text)) return "Allergy-associated antibody marker that may rise in atopic states.";
  if (/\bhaemoglobin|hemoglobin\b/.test(text)) return "Oxygen-carrying protein in red blood cells.";
  if (/\bwbc|leucocyte/.test(text)) return "White blood cell count indicating immune/infection activity.";
  if (/\bplatelet\b/.test(text)) return "Clotting cell count important for bleeding and thrombotic risk.";

  return "Laboratory marker tracked over time for preventive trend-based health review.";
}

function iconBadge(code) {
  const safe = escapeHtml(String(code || "ALR").slice(0, 5).toUpperCase());
  return `<span class="icon-badge">${safe}</span>`;
}

function absoluteAssetUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return `https://sdrc.in${raw}`;
  return raw;
}

function iconTokenFromUrl(url) {
  const asset = String(url || "").toLowerCase();
  if (asset.includes("heart")) return "HE";
  if (asset.includes("liver")) return "LI";
  if (asset.includes("kidney")) return "KI";
  if (asset.includes("diabetes")) return "DB";
  if (asset.includes("vitamin")) return "VI";
  if (asset.includes("mineral")) return "MN";
  if (asset.includes("thyroid")) return "TH";
  if (asset.includes("hormone")) return "HR";
  if (asset.includes("iron")) return "IR";
  if (asset.includes("std")) return "ST";
  if (asset.includes("imaging")) return "IM";
  if (asset.includes("cbc")) return "GH";
  return "HL";
}

function iconEmojiFromUrl(url) {
  const asset = String(url || "").toLowerCase();
  if (asset.includes("heart")) return "❤️";
  if (asset.includes("liver")) return "🟠";
  if (asset.includes("kidney")) return "🟣";
  if (asset.includes("diabetes")) return "🩸";
  if (asset.includes("vitamin")) return "🟡";
  if (asset.includes("mineral")) return "⚪";
  if (asset.includes("thyroid")) return "🦋";
  if (asset.includes("hormone")) return "⚙️";
  if (asset.includes("iron")) return "🧲";
  if (asset.includes("std")) return "🛡️";
  if (asset.includes("imaging")) return "🩻";
  if (asset.includes("cbc")) return "🧪";
  return "🟡";
}

function iconBadgeFromAsset(url) {
  const resolved = absoluteAssetUrl(url);
  const emoji = iconEmojiFromUrl(resolved || url);
  return `<span class="pkg-icon-wrap" aria-hidden="true">
    ${resolved ? `<img class="pkg-icon-img" data-report-icon="1" src="${escapeHtml(resolved)}" alt="" loading="eager" decoding="sync" onload="this.nextElementSibling.style.display='none';" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';" />` : ""}
    <span class="pkg-icon-fallback"${resolved ? ` style="display:none"` : ""}>${escapeHtml(emoji)}</span>
  </span>`;
}

function sectionFallbackIcon(sectionName) {
  const name = String(sectionName || "").toLowerCase();
  if (name.includes("cardiac")) return "https://sdrc.in/assets/ads/icons/heart.png";
  if (name.includes("diabetes")) return "https://sdrc.in/assets/ads/icons/diabetes.png";
  if (name.includes("kidney")) return "https://sdrc.in/assets/ads/icons/kidney.png";
  if (name.includes("liver")) return "https://sdrc.in/assets/ads/icons/liver.png";
  if (name.includes("vitamin")) return "https://sdrc.in/assets/ads/icons/vitamins.png";
  if (name.includes("hormonal") || name.includes("stress")) return "https://sdrc.in/assets/ads/icons/hormones.png";
  if (name.includes("cancer")) return "https://sdrc.in/assets/ads/icons/cancer.png";
  if (name.includes("inflammation") || name.includes("general")) return "https://sdrc.in/assets/ads/icons/cbc.png";
  return null;
}

function sectionIconUrl(section = {}) {
  const fallback = sectionFallbackIcon(section.name);
  if (fallback) return fallback;
  const counts = new Map();
  for (const param of section.parameters || []) {
    const icon = absoluteAssetUrl(param?.category_icon);
    if (!icon) continue;
    counts.set(icon, (counts.get(icon) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top || null;
}

function ruleIconUrl(item = {}) {
  const code = String(item?.icon || "").toUpperCase();
  if (code.includes("HEART")) return "https://sdrc.in/assets/ads/icons/heart.png";
  if (code.includes("GLU")) return "https://sdrc.in/assets/ads/icons/diabetes.png";
  if (code.includes("KID")) return "https://sdrc.in/assets/ads/icons/kidney.png";
  if (code.includes("THY")) return "https://sdrc.in/assets/ads/icons/thyroid.png";
  if (code.includes("BLO")) return "https://sdrc.in/assets/ads/icons/cbc.png";
  return "https://sdrc.in/assets/ads/icons/cbc.png";
}

function scorePosition(param) {
  const v = Number(param.latest_value);
  const low = Number(param.ref_low);
  const high = Number(param.ref_high);

  if (!Number.isFinite(v)) return 50;

  if (Number.isFinite(low) && Number.isFinite(high) && high > low) {
    const span = high - low;
    const min = low - span * 0.5;
    const max = high + span * 0.5;
    const pos = ((v - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, pos));
  }

  if (Number.isFinite(high) && (!Number.isFinite(low) || param.better_direction === "lower_better")) {
    const max = high * 1.8 || 1;
    const pos = (v / max) * 100;
    return Math.max(0, Math.min(100, pos));
  }

  if (Number.isFinite(low) && (!Number.isFinite(high) || param.better_direction === "higher_better")) {
    const min = low * 0.2;
    const max = low * 2.2 || 1;
    const pos = ((v - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, pos));
  }

  return 50;
}

function referenceBar(param) {
  if (!param?.has_reference_range) {
    const refTextOnly = renderReferenceText(param?.latest_reference_text || "");
    return refTextOnly ? `<div class="ref-wrap ref-wrap-text-only"><div class="ref-text">Reference: ${refTextOnly}</div></div>` : "";
  }

  const pos = scorePosition(param).toFixed(2);
  const lowText = Number.isFinite(Number(param.ref_low)) ? formatValue(param.ref_low) : "-";
  const highText = Number.isFinite(Number(param.ref_high)) ? formatValue(param.ref_high) : "-";
  const better = String(param.better_direction || "range_optimal");
  const betterText = better === "lower_better" ? "Lower is better" : better === "higher_better" ? "Higher is better" : "Target range";
  const trackClass = better === "higher_better" ? "track-higher" : better === "lower_better" ? "track-lower" : "track-range";
  const refText = renderReferenceText(param.latest_reference_text || "");

  return `<div class="ref-wrap">
    <div class="ref-value-tag" style="left:${pos}%">
      <span>${escapeHtml(formatValue(param.latest_value))}</span>
      <i></i>
    </div>
    <div class="ref-track ${escapeHtml(trackClass)}">
      <div class="ref-optimal"></div>
      <div class="ref-marker ${statusClass(param.flag)}" style="left:${pos}%"></div>
    </div>
    <div class="ref-meta">
      <span>Low ${escapeHtml(lowText)}</span>
      <span>${escapeHtml(betterText)}</span>
      <span>High ${escapeHtml(highText)}</span>
    </div>
    ${refText ? `<div class="ref-text">Reference: ${refText}</div>` : ""}
  </div>`;
}

function trendMiniBox(param) {
  const points = (param.last5 || [])
    .slice()
    .map((row) => Number(row.value))
    .filter((n) => Number.isFinite(n));

  if (points.length < 2) {
    return "";
  }

  let min = Math.min(...points);
  let max = Math.max(...points);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const width = 110;
  const height = 34;
  const pad = 4;
  const x = (idx) => pad + (idx / (points.length - 1)) * (width - pad * 2);
  const y = (value) => pad + (1 - (value - min) / (max - min)) * (height - pad * 2);
  const poly = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const color = param.quality_flag === "bad" || param.flag === "high"
    ? "#f46060"
    : param.flag === "low"
      ? "#f2b24d"
      : "#5cb8ac";

  return `<div class="trend-box">
    <svg viewBox="0 0 ${width} ${height}" aria-label="Trend line">
      <polyline points="${poly}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
  </div>`;
}

function historyRibbon(param, rows = [], className = "") {
  const items = rows
    .slice()
    .map((row) => `<span class="hist-chip">
      <b>${escapeHtml(formatDate(row.date))}</b>
      <i>${escapeHtml(formatValue(row.value))}</i>
    </span>`)
    .join("\n");

  if (!items) return "";
  return `<div class="history-line ${escapeHtml(className)}">${items}</div>`;
}

function parameterCard(param) {
  const recentAll = Array.isArray(param.last5)
    ? param.last5.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    : [];
  const recent = recentAll.slice(1, 5);
  const trend = trendMiniBox(param);
  const iconUrl = param.category_icon || sectionFallbackIcon(param.section);

  return `<article class="param-card">
    <div class="param-head">
      <h4>${iconBadgeFromAsset(iconUrl)}${escapeHtml(param.name)}</h4>
      ${param?.analysis_skipped ? "" : `<span class="flag ${statusClass(param.flag)}">${escapeHtml(statusLabel(param.flag))}</span>`}
    </div>
    <p class="param-info">${escapeHtml(parameterInfoLine(param))}</p>
    <div class="param-kpis">
      <div><span>Latest</span><strong>${escapeHtml(formatValue(param.latest_value))} ${escapeHtml(param.unit || "")}</strong></div>
      ${trend ? `<div><span>Trend</span>${trend}</div>` : `<div></div>`}
      <div><span>Last Updated</span><strong>${escapeHtml(formatDate(param.latest_date))}</strong></div>
    </div>
    ${referenceBar(param)}
    ${historyRibbon(param, recent, "recent-history")}
  </article>`;
}

function summaryCards(cards = []) {
  if (!cards.length) return `<p class="muted">No section summary available.</p>`;
  return `<div class="summary-grid">${cards
    .map(
      (card) => `<div class="summary-card">
        <h4>${iconBadgeFromAsset(card.icon)}${escapeHtml(card.type || card.section)}</h4>
        ${Number.isFinite(Number(card.bad)) ? `<div class="count-row"><span>Unfavourable</span><strong>${escapeHtml(card.bad)}</strong></div>` : ""}
        <div class="count-row"><span>High</span><strong>${escapeHtml(card.high ?? 0)}</strong></div>
        <div class="count-row"><span>Low</span><strong>${escapeHtml(card.low ?? 0)}</strong></div>
        <div class="count-row"><span>Normal</span><strong>${escapeHtml(card.normal ?? 0)}</strong></div>
        ${(card.top_parameters || []).length ? `<p class="card-top">${(card.top_parameters || []).map((x) => escapeHtml(x)).join(" • ")}</p>` : ""}
      </div>`
    )
    .join("\n")}</div>`;
}

function insightsList(items = [], reportFacts = {}) {
  const followupLabel = String(
    reportFacts?.followup_window_label || formatMonthYear(reportFacts?.recommended_followup_date)
  ).trim() || "-";
  const severityText = (sev) => {
    const s = String(sev || "").toLowerCase();
    if (s === "high") return "High Risk";
    if (s === "medium") return "Watch";
    if (s === "positive" || s === "low") return "On Track";
    return "Info";
  };

  const valueText = (p) => {
    const v = formatValue(p?.value);
    const u = String(p?.unit || "").trim();
    return u ? `${v} ${u}` : v;
  };

  const dateText = (p) => {
    const date = formatShortDate(p?.date);
    return date && date !== "-" ? date : "";
  };

  const parameterRows = (params = []) => {
    if (!params.length) return "";
    return `<ul class="insight-params">${params.map((p) => {
      const cls = p?.quality_flag === "bad" || p?.flag === "high"
        ? "p-high"
        : p?.flag === "low"
          ? "p-low"
          : "p-normal";
      const marker = p?.is_priority_marker && cls === "p-normal"
        ? `<em class="pm-ok">🔑 Key Marker: On Track</em>`
        : p?.is_priority_marker
          ? `<em class="pm-watch">🔑 Key Marker: Review</em>`
          : "";
      return `<li class="${cls}">
        <span>${escapeHtml(p?.name || "-")}${marker}</span>
        <div class="insight-val">
          <strong>${escapeHtml(valueText(p))}</strong>
          ${dateText(p) ? `<small>${escapeHtml(dateText(p))}</small>` : ""}
        </div>
      </li>`;
    }).join("")}</ul>`;
  };

  if (!items.length) return `<p class="muted">No actionable insights available.</p>`;
  return `<div class="insights">${items
    .map(
      (item) => {
        const typeRaw = String(item.type || "general").toLowerCase();
        const typeLabel = (typeRaw === "category_risk" || typeRaw === "followup_window")
          ? ""
          : String(item.type || "general").replace(/_/g, " ");
        const sevText = typeRaw === "followup_window"
          ? followupLabel
          : severityText(item.severity);
        return `<div class="insight-item insight-${escapeHtml(String(item.severity || "low").toLowerCase())} insight-type-${escapeHtml(typeRaw)} ${item.type === "followup_window" ? "insight-followup-strong" : ""}">
        <div class="insight-top">
          ${typeLabel ? `<span class="insight-tag">${escapeHtml(typeLabel)}</span>` : `<span class="insight-tag insight-tag-hidden"></span>`}
          <span class="insight-sev ${typeRaw === "followup_window" ? "followup-month-tag" : ""}">${escapeHtml(sevText)}</span>
        </div>
        <h5>${iconBadgeFromAsset(item.icon)}${escapeHtml(item.title)}</h5>
        <p>${escapeHtml(item.text)}</p>
        ${item.type === "followup_window" && item.tests_csv ? `<p class="followup-tests-inline">${escapeHtml(item.tests_csv)}</p>` : ""}
        ${parameterRows(item.parameters || [])}
      </div>`;
      }
    )
    .join("\n")}</div>`;
}

function triggerTiles(items = []) {
  if (!items.length) return `<p class="muted">No major rules triggered by current configuration.</p>`;
  return `<div class="trigger-tiles">${items
    .map(
      (item) => `<div class="trigger-tile severity-${escapeHtml(String(item.severity || "low").toLowerCase())}">
        <div class="trigger-head">${iconBadgeFromAsset(ruleIconUrl(item))}<strong>${escapeHtml(item.title)}</strong></div>
        <p>${escapeHtml(item.summary)}</p>
        ${(item.actions || []).length ? `<ul>${item.actions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>` : ""}
      </div>`
    )
    .join("\n")}</div>`;
}

function sectionPage(section) {
  const displayName = String(section?.name || "") === "Cardiac (Lipid)" ? "Cardiac" : String(section?.name || "");
  const sectionClass = String(section?.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const icon = sectionIconUrl(section);
  return `<section class="page detail-page">
    <header class="section-header section-${escapeHtml(sectionClass)}">
      <h2>${iconBadgeFromAsset(icon)}${escapeHtml(displayName)}</h2>
    </header>
    <div class="param-grid">
      ${section.parameters.map(parameterCard).join("\n")}
    </div>
  </section>`;
}

export function renderReportHtml(reportFacts = {}) {
  const isTrendsMode = String(reportFacts?.report_mode || "smart").toLowerCase() === "trends";
  const designVariant = String(reportFacts?.design_variant || reportFacts?.brand?.design_variant || "basic").toLowerCase() === "executive"
    ? "executive"
    : "basic";
  const patientName = reportFacts.patient?.name || "Patient";
  const patientMrno = String(
    reportFacts?.patient?.mrno ||
    reportFacts?.patient?.MRNO ||
    reportFacts?.patient_id ||
    "-"
  ).trim() || "-";
  const patientAge = reportFacts.patient?.age ?? "-";
  const patientGender = reportFacts.patient?.gender || "-";
  const logoUrl = reportFacts.brand?.logo_url || "https://www.sdrc.in/assets/sdrc-logo-full.png";
  const ogUrl = reportFacts.brand?.og_url || "https://www.sdrc.in/assets/og-sdrc.jpg";
  const labName = reportFacts.brand?.lab_name || "SDRC";

  const followupMonthYear = String(
    reportFacts.followup_window_label || formatMonthYear(reportFacts.recommended_followup_date)
  ).trim() || "-";
  const reportTitle = isTrendsMode ? "Trend Report" : "Smart Trend Report";
  const modeBadge = isTrendsMode ? "TRENDS REPORT" : "SMART REPORT";
  const actionableForDisplay = isTrendsMode
    ? (reportFacts.actionable_insights || []).filter((x) => String(x?.type || "").toLowerCase() !== "rule")
    : (reportFacts.actionable_insights || []);
  const summaryPage = `<section class="page summary-page">
    ${logoUrl ? `<img class="hero-top-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(labName)}" />` : ""}
    <header class="hero">
      <div>
        <span class="mode-badge">${escapeHtml(modeBadge)}</span>
        ${isTrendsMode ? "" : `<h1>${escapeHtml(reportTitle)}</h1>`}
        <p class="hero-patient">${escapeHtml(patientName)}</p>
        <p class="hero-demographics">${escapeHtml(String(patientAge))} · ${escapeHtml(String(patientGender))}</p>
        ${isTrendsMode ? "" : `<p>Risk Level: <strong>${escapeHtml(String(reportFacts.risk_level || "low").toUpperCase())}</strong></p>`}
      </div>
      <div class="hero-meta">
        <div><span>First Registered</span><strong>${escapeHtml(formatDate(reportFacts.timeline?.first_registered_date))}</strong></div>
        <div><span>Last Test</span><strong>${escapeHtml(formatDate(reportFacts.timeline?.last_test_date))}</strong></div>
        <div><span>Days Since Last Test</span><strong>${escapeHtml(reportFacts.timeline?.days_since_last_test ?? "-")}</strong></div>
        <div><span>Follow-up Window</span><strong>${escapeHtml(followupMonthYear)}</strong></div>
      </div>
    </header>

    <div class="block">
      <h2>${isTrendsMode ? "Trend Highlights" : "Actionable Summary"}</h2>
      ${insightsList(actionableForDisplay, reportFacts)}
    </div>

    ${isTrendsMode || !(Array.isArray(reportFacts.trigger_insights) && reportFacts.trigger_insights.length)
      ? ""
      : `<div class="block">
      <h2>Triggered Rule Insights</h2>
      ${triggerTiles(reportFacts.trigger_insights || [])}
    </div>`}

    <div class="block">
      <h2>Summary by Type</h2>
      ${summaryCards(reportFacts.summary_by_type || reportFacts.summary_cards || [])}
    </div>

    <footer class="disclaimer">
      This report is for statistical evaluation and trend awareness only. It is not for diagnostic use.
      Do not change lifestyle, supplements, or medication based only on this report. Consult your treating clinician first.
    </footer>
  </section>`;

  const detailPages = (reportFacts.sections || []).map(sectionPage).join("\n");
  const finalRecommendations = (() => {
    const out = [];
    const allParams = (reportFacts.sections || []).flatMap((s) => s.parameters || []);
    const keyMarkers = allParams.filter((p) => p?.is_priority_marker);
    const keyMarkersOutOfRange = keyMarkers.filter((p) => p?.flag === "high" || p?.flag === "low" || p?.quality_flag === "bad");
    for (const item of reportFacts.actionable_insights || []) {
      if (item?.type === "followup_window" && item?.tests_csv) {
        out.push(`Recommended repeat panel(s): ${item.tests_csv}`);
      }
      if (item?.type === "category_risk" && item?.text && !/key markers/i.test(String(item?.title || ""))) {
        out.push(`${item.title || item.category || "Risk"}: ${item.text}`);
      }
    }
    if (keyMarkers.length > 0) {
      if (keyMarkersOutOfRange.length > 0) {
        out.push(`🔑 Key markers should be monitored more frequently when out of range (${keyMarkersOutOfRange.length} currently need closer follow-up).`);
      } else {
        out.push("🔑 Key markers are recommended for annual monitoring as part of preventive health tracking.");
      }
    }
    return [...new Set(out)].slice(0, 8);
  })();
  const endPage = `<section class="page end-page page-break ${isTrendsMode ? "end-page-trends" : ""}">
    <a class="end-og-link" href="https://wa.me/919849110001?text=Hi" target="_blank" rel="noopener noreferrer" aria-label="Open WhatsApp and say Hi">
      <img class="end-og-img" src="${escapeHtml(ogUrl)}" alt="${escapeHtml(labName)}" />
    </a>
    <div class="end-card ${isTrendsMode ? "end-card-trends" : ""}">
      <h2>${isTrendsMode ? "Recommendations & Next Steps" : "End of Report"}</h2>
      <p class="end-next">${isTrendsMode ? "Follow-up Window" : "Recommended Next Test Window"}: <strong>${escapeHtml(followupMonthYear)}</strong></p>
      ${finalRecommendations.length
        ? `<ul class="end-list">${finalRecommendations.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
        : `<p class="muted">No additional follow-up recommendations were generated.</p>`}
      <p class="end-foot">
        This ${escapeHtml(reportTitle)} is for statistical trend awareness and preventive planning only, not diagnosis.
        Always consult your clinician before changing medication, supplements, or treatment.
      </p>
      <p class="end-cta">Need help with follow-up? Reply with <strong>Hi</strong> to book home visits, lab visits, or preventive package guidance.</p>
    </div>
  </section>`;
  const printFooter = `<footer class="report-print-footer" aria-hidden="true">
    <div class="report-print-footer-center">${escapeHtml(patientName)} · MR No. ${escapeHtml(patientMrno)}</div>
    <div class="report-print-footer-right"></div>
  </footer>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    :root {
      --new-teal: #008f82;
      --new-orange: #f26939;
      --std-teal: #3a8c80;
      --active-teal: #5cb8ac;
      --grey: #808080;
      --coral-red: #f46060;
      --ink: #163334;
      --surface: #f5faf9;
      --card: #ffffff;
      --line: #d7e9e6;
      --ok: #1f8a5b;
      --warn: #b76e00;
      --bad: #b00020;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(1200px 380px at 12% -8%, rgba(92, 184, 172, 0.24), transparent 58%),
        radial-gradient(900px 320px at 92% 2%, rgba(242, 105, 57, 0.18), transparent 52%),
        linear-gradient(180deg, #e8f6f4 0%, #fdfdfd 43%, #f7fafb 100%);
      color: var(--ink);
      font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      line-height: 1.35;
    }
    .page {
      width: 100%;
      max-width: 1120px;
      margin: 0 auto;
      padding: 20px 18px 26px;
    }
    .page-break { page-break-before: always; }
    .hero {
      background:
        radial-gradient(1100px 200px at 85% -20%, rgba(242, 105, 57, 0.26), transparent 60%),
        linear-gradient(135deg, #0a6e66 0%, var(--new-teal) 42%, var(--std-teal) 100%);
      color: #fff;
      border-radius: 16px;
      padding: 18px;
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 16px;
      box-shadow: 0 12px 30px rgba(0, 143, 130, 0.25);
      border: 1px solid rgba(255,255,255,0.16);
      position: relative;
      overflow: hidden;
    }
    .hero::after {
      content: "";
      position: absolute;
      inset: auto -10% -40% auto;
      width: 300px;
      height: 160px;
      background: radial-gradient(circle at center, rgba(242,105,57,0.28), transparent 70%);
      pointer-events: none;
    }
    .hero-top-logo {
      width: auto;
      height: auto;
      max-width: 340px;
      max-height: 86px;
      object-fit: contain;
      display: block;
      margin: 0 0 8px;
    }
    .hero h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: 0.01em; font-weight: 700; opacity: 0.95; }
    .hero p { margin: 4px 0; }
    .hero-patient {
      margin: 2px 0 2px;
      font-size: 26px;
      line-height: 1.15;
      font-weight: 600;
      letter-spacing: 0.005em;
      color: #ffffff;
    }
    .hero-demographics {
      margin: 2px 0 4px;
      font-size: 14px;
      font-weight: 500;
      opacity: 0.95;
    }
    .report-print-footer { display: none; }
    .mode-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      letter-spacing: 0.08em;
      font-weight: 800;
      text-transform: uppercase;
      color: #ffffff;
      background: rgba(242, 105, 57, 0.94);
      border: 1px solid rgba(255,255,255,0.42);
      border-radius: 999px;
      padding: 4px 10px;
      margin-bottom: 8px;
    }
    .hero-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .hero-meta div {
      background: rgba(255, 255, 255, 0.14);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 12px;
      padding: 8px 10px;
    }
    .hero-meta span { display: block; font-size: 11px; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.05em; }
    .hero-meta strong { font-size: 14px; }
    .block {
      margin-top: 14px;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      box-shadow: 0 8px 20px rgba(18, 67, 63, 0.06);
    }
    .block h2 {
      margin: 0 0 10px;
      font-size: 18px;
      color: var(--new-teal);
    }
    .muted { color: var(--grey); margin: 0; }

    .insights {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .insight-item {
      border: 1px solid #cce8e4;
      border-left: 4px solid #c9dbd8;
      border-radius: 10px;
      padding: 10px;
      background: #fbfdfd;
    }
    .insight-high {
      border-color: #f7cccc;
      border-left-color: var(--coral-red);
      background: #fff6f6;
    }
    .insight-medium {
      border-color: #ffe1c7;
      border-left-color: var(--new-orange);
      background: #fffaf5;
    }
    .insight-low, .insight-positive {
      border-color: #cce8e4;
      border-left-color: #3a8c80;
      background: #eefaf6;
    }
    .insight-item h5 { margin: 0 0 4px; font-size: 14px; }
    .insight-item p { margin: 0; font-size: 13px; color: #34495e; }
    .insight-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .insight-tag {
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 999px;
      color: #fff;
      background: #2f7b72;
    }
    .insight-tag-hidden {
      visibility: hidden;
      padding: 0;
      min-width: 0;
      width: 1px;
      height: 1px;
      overflow: hidden;
    }
    .insight-sev {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.03em;
      color: #4f5f63;
    }
    .followup-month-tag {
      color: #8a5a17;
      font-weight: 800;
      letter-spacing: 0.02em;
    }
    .insight-type-rule .insight-tag { background: #006d63; }
    .insight-type-parameter .insight-tag { background: #f26939; }
    .insight-type-priority_marker .insight-tag { background: #9e4a2f; }
    .insight-type-category_risk .insight-tag { background: #2f7b72; }
    .insight-type-followup_window .insight-tag { background: #7c5b2f; }
    .insight-followup-strong {
      border: 1px solid #ffd3b5;
      border-left: 6px solid var(--new-orange);
      background: linear-gradient(160deg, #fff6ef, #fff);
      box-shadow: 0 1px 0 rgba(242, 105, 57, 0.2);
    }
    .insight-type-timeline .insight-tag { background: #6a7f7d; }
    .insight-params {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    .insight-params li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-top: 1px dashed #d7e9e6;
      padding-top: 6px;
      margin-top: 6px;
      font-size: 12px;
    }
    .insight-val {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-end;
      min-width: 72px;
      gap: 1px;
      text-align: right;
    }
    .insight-params li strong {
      font-size: 12px;
      line-height: 1.1;
    }
    .insight-params li small {
      font-size: 10px;
      color: #8a959b;
      line-height: 1.1;
      font-weight: 500;
    }
    .insight-params li.p-high strong { color: #b00020; }
    .insight-params li.p-low strong { color: #b76e00; }
    .insight-params li.p-normal strong { color: #1f8a5b; }
    .insight-params li span { color: #3c5158; }
    .insight-params li em {
      font-style: normal;
      margin-left: 6px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .insight-params li em.pm-ok { color: #1f8a5b; }
    .insight-params li em.pm-watch { color: #9e4a2f; }
    .followup-tests-inline {
      margin: 8px 0 0;
      font-size: 12px;
      line-height: 1.45;
      color: #3f4f55;
      font-weight: 600;
    }
    .followup-tests {
      margin: 8px 0 0;
      font-size: 12px;
      line-height: 1.45;
      color: #3f4f55;
      font-weight: 600;
      background: #fff;
      border: 1px dashed #d9e4e2;
      border-radius: 8px;
      padding: 6px 8px;
    }

    .trigger-tiles {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .trigger-tile {
      border-radius: 12px;
      padding: 10px;
      border: 1px solid #c8ddda;
      background: #f8fffd;
    }
    .trigger-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .icon-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 34px;
      height: 24px;
      border-radius: 999px;
      background: var(--new-teal);
      color: white;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .trigger-tile ul { margin: 6px 0 0 16px; }
    .trigger-tile p { margin: 0; font-size: 13px; color: #415f5e; }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .summary-card {
      border: 1px solid #ffd9ca;
      border-radius: 12px;
      padding: 10px;
      background: linear-gradient(160deg, #fff9f6, #fff);
    }
    .summary-card h4 { margin: 0 0 8px; font-size: 14px; }
    .pkg-icon-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      margin-right: 6px;
      vertical-align: -3px;
      overflow: hidden;
    }
    .pkg-icon-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      background: #fff;
    }
    .pkg-icon-fallback {
      width: auto;
      height: auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: #1d4a45;
    }
    .count-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      margin-top: 3px;
    }
    .card-top {
      margin: 8px 0 0;
      color: #995f49;
      font-size: 11px;
      line-height: 1.3;
    }

    .detail-page {
      padding-top: 26px;
    }
    .section-header {
      background: linear-gradient(135deg, #e8fbf7, #f7fcfb);
      border: 1px solid var(--line);
      border-left: 6px solid var(--new-teal);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 10px;
      box-shadow: 0 4px 12px rgba(14, 90, 83, 0.07);
    }
    .section-header.section-cardiac-lipid { border-left-color: #f26939; background: linear-gradient(135deg, #fff3ee, #fffaf8); }
    .section-header.section-diabetes { border-left-color: #cf6a44; background: linear-gradient(135deg, #fff5ef, #fffdfb); }
    .section-header.section-kidney { border-left-color: #7c6cc5; background: linear-gradient(135deg, #f4f2ff, #faf9ff); }
    .section-header.section-liver { border-left-color: #d9863c; background: linear-gradient(135deg, #fff7ef, #fffcf8); }
    .section-header.section-vitamins-minerals { border-left-color: #2f9d8f; background: linear-gradient(135deg, #ecfbf8, #f8fdfc); }
    .section-header.section-hormonal-health,
    .section-header.section-stress { border-left-color: #7365bf; background: linear-gradient(135deg, #f3f1ff, #fbfaff); }
    .section-header.section-inflammation { border-left-color: #d94f4f; background: linear-gradient(135deg, #fff1f1, #fffafa); }
    .section-header.section-cancer-screen { border-left-color: #8b4ea8; background: linear-gradient(135deg, #f8efff, #fcf8ff); }
    .section-header.section-general-health { border-left-color: #4f9086; background: linear-gradient(135deg, #ecf9f7, #f9fdfc); }
    .section-header h2 { margin: 0 0 4px; color: var(--new-teal); }
    .section-header h2 .pkg-icon-wrap {
      width: 20px;
      height: 20px;
      vertical-align: -4px;
    }

    .param-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      grid-auto-flow: row;
      align-items: stretch;
    }
    .param-card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px;
      height: 100%;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 14px rgba(15, 73, 68, 0.06);
    }
    .param-head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .param-head h4 {
      margin: 0;
      font-size: 15px;
      line-height: 1.2;
      min-height: 2.4em;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .param-head h4 .pkg-icon-wrap {
      width: 16px;
      height: 16px;
      vertical-align: -2px;
    }
    .param-info {
      margin: 0 0 8px;
      font-size: 11px;
      color: #5c7071;
      line-height: 1.35;
      min-height: 2.7em;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .flag {
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid transparent;
    }
    .flag-high { background: #fde8e8; border-color: #f8caca; color: var(--bad); }
    .flag-low { background: #fff5df; border-color: #f6ddae; color: var(--warn); }
    .flag-normal { background: #def7ec; border-color: #b8e8cf; color: var(--ok); }
    .flag-unknown { background: #edf2f7; border-color: #dbe3ec; color: #516172; }

    .param-kpis {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 8px;
    }
    .param-kpis span {
      display: block;
      text-transform: uppercase;
      font-size: 10px;
      color: #5f7473;
      letter-spacing: 0.04em;
      margin-bottom: 2px;
    }
    .param-kpis strong { font-size: 13px; }
    .trend-box {
      width: 110px;
      height: 34px;
      border: 1px solid #d8ece7;
      border-radius: 8px;
      background: linear-gradient(180deg, #f9fffe, #f2fbf9);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .trend-box svg {
      width: 108px;
      height: 32px;
      display: block;
    }

    .ref-wrap { margin-bottom: 8px; position: relative; padding-top: 22px; }
    .ref-value-tag {
      position: absolute;
      top: 0;
      transform: translateX(-50%);
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
      pointer-events: none;
    }
    .ref-value-tag span {
      background: #173f3a;
      color: #fff;
      font-size: 10px;
      line-height: 1;
      padding: 3px 6px;
      border-radius: 999px;
      font-weight: 700;
      border: 1px solid rgba(255,255,255,0.7);
    }
    .ref-value-tag i {
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 7px solid #173f3a;
      display: block;
    }
    .ref-track {
      position: relative;
      height: 12px;
      border-radius: 999px;
      overflow: hidden;
      background: linear-gradient(90deg, #f7d9d9 0%, #fff4dd 30%, #dff4eb 55%, #fff4dd 75%, #f7d9d9 100%);
      border: 1px solid #d8d8d8;
    }
    .ref-track.track-lower {
      background: linear-gradient(90deg, #dff4eb 0%, #e8f8ef 40%, #fff4dd 68%, #f7d9d9 100%);
    }
    .ref-track.track-higher {
      background: linear-gradient(90deg, #f7d9d9 0%, #fff4dd 35%, #e8f8ef 62%, #dff4eb 100%);
    }
    .ref-track.track-range {
      background: linear-gradient(90deg, #f7d9d9 0%, #fff4dd 30%, #dff4eb 55%, #fff4dd 75%, #f7d9d9 100%);
    }
    .ref-optimal {
      position: absolute;
      left: 30%;
      right: 30%;
      top: 0;
      bottom: 0;
      background: rgba(92, 184, 172, 0.24);
    }
    .ref-marker {
      position: absolute;
      top: -4px;
      width: 10px;
      height: 20px;
      margin-left: -5px;
      border-radius: 5px;
      border: 2px solid #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
      background: var(--new-orange);
    }
    .ref-marker.flag-high { background: var(--coral-red); }
    .ref-marker.flag-low { background: #f2b24d; }
    .ref-marker.flag-normal { background: var(--active-teal); }

    .ref-meta {
      margin-top: 4px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      color: #5f7473;
      font-size: 11px;
    }
    .ref-text {
      margin-top: 4px;
      font-size: 11px;
      color: #5d6f72;
      text-align: right;
    }
    .ref-wrap-text-only {
      padding-top: 0;
      margin-top: 2px;
      margin-bottom: 6px;
    }

    .history-line {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      padding-bottom: 2px;
      margin-top: auto;
    }
    .hist-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      white-space: nowrap;
      border-radius: 999px;
      padding: 3px 8px;
      border: 1px solid #dcebe8;
      background: #f9fffe;
      font-size: 11px;
      color: #395e5a;
    }
    .hist-chip b {
      font-weight: 500;
      color: #244d48;
    }
    .hist-chip i {
      font-style: normal;
      color: #7a4b3a;
      font-weight: 700;
    }
    .mini-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .mini-table th, .mini-table td {
      border-bottom: 1px solid #ecf2f2;
      text-align: left;
      padding: 5px 4px;
      white-space: nowrap;
    }
    .mini-table th { color: #5a7471; font-weight: 700; }

    .disclaimer {
      margin-top: 14px;
      font-size: 12px;
      color: #6e7676;
      border-top: 1px dashed #c6d9d7;
      padding-top: 8px;
    }
    .end-page {
      padding-top: 18px;
      border-radius: 14px;
      overflow: hidden;
      background: #fff;
    }
    .end-og-link {
      display: block;
      text-decoration: none;
    }
    .end-og-img {
      width: 100%;
      height: auto;
      display: block;
      object-fit: contain;
      border-radius: 12px;
      border: 1px solid #e2ece9;
      margin-bottom: 10px;
    }
    .end-card {
      width: 100%;
      border: 1px solid #d8ece7;
      border-left: 6px solid var(--new-orange);
      border-radius: 14px;
      background: #fff;
      padding: 16px;
    }
    .end-page-trends .end-card-trends {
      border-left-width: 8px;
      border-left-color: #e8602e;
      background: #fffaf5;
      padding: 18px 18px 16px;
    }
    .end-page-trends .end-card-trends h2 {
      font-size: 24px;
      margin-bottom: 10px;
      color: #0e6d65;
      letter-spacing: 0.01em;
    }
    .end-page-trends .end-next {
      font-size: 16px;
      font-weight: 700;
      color: #7c4a1f;
      background: #fff2e7;
      border: 1px solid #ffd9c2;
      border-radius: 10px;
      padding: 8px 10px;
      margin-bottom: 12px;
    }
    .end-page-trends .end-list {
      gap: 8px;
      font-size: 14px;
      line-height: 1.4;
      color: #254b48;
    }
    .end-page-trends .end-list li {
      font-weight: 600;
      background: #ffffff;
      border: 1px solid #f0ddd0;
      border-radius: 8px;
      padding: 8px 10px;
      list-style-position: inside;
    }
    .end-card h2 {
      margin: 0 0 8px;
      color: var(--new-teal);
    }
    .end-next {
      margin: 0 0 10px;
      color: #2f4f4b;
      font-size: 14px;
    }
    .end-list {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 5px;
      font-size: 13px;
      color: #355552;
    }
    .end-foot {
      margin: 12px 0 0;
      font-size: 12px;
      color: #5f7473;
      border-top: 1px dashed #cbdedb;
      padding-top: 8px;
    }
    .end-cta {
      margin: 10px 0 0;
      font-size: 12px;
      color: #2f5753;
      background: #eefaf7;
      border: 1px solid #cfe8e1;
      border-left: 4px solid var(--new-teal);
      border-radius: 8px;
      padding: 8px 10px;
    }

    @media (max-width: 980px) {
      .hero { grid-template-columns: 1fr; }
      .hero-top-logo { max-height: 70px; margin-bottom: 6px; }
      .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .trigger-tiles { grid-template-columns: 1fr; }
      .insights { grid-template-columns: 1fr; }
      .param-grid { grid-template-columns: 1fr; }
      .param-kpis { grid-template-columns: 1.05fr 0.95fr 1fr; gap: 6px; align-items: center; }
      .param-kpis span { font-size: 9px; }
      .param-kpis strong { font-size: 12px; }
      .trend-box { width: 96px; height: 30px; }
      .trend-box svg { width: 94px; height: 28px; }
    }

    @media print {
      @page {
        size: A4;
        margin: 0;
      }
      .page { max-width: none; padding: 6mm 6mm 12mm; }
      .page-break { page-break-before: always; }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .end-page { page-break-before: always; }
      .hero-top-logo { max-height: 62px; margin-bottom: 5px; }
      .detail-page { padding-top: 8px; page-break-before: auto; }
      .section-header {
        padding: 8px 10px;
        margin-bottom: 6px;
        page-break-after: avoid;
        break-after: avoid-page;
      }
      .section-header h2 { font-size: 18px; margin: 0; }
      .param-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        align-items: stretch;
      }
      .param-grid .param-card:first-child {
        page-break-before: avoid;
        break-before: avoid-page;
      }
      .param-card {
        padding: 7px;
        border-radius: 10px;
      }
      .param-head { margin-bottom: 5px; }
      .param-head h4 { font-size: 13px; line-height: 1.2; }
      .param-info {
        display: -webkit-box;
        font-size: 9px;
        line-height: 1.25;
        color: #586d70;
        margin: 0 0 4px;
        min-height: 0;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .param-kpis { gap: 6px; margin-bottom: 5px; }
      .param-kpis span { font-size: 9px; margin-bottom: 1px; }
      .param-kpis strong { font-size: 11px; }
      .trend-box { width: 82px; height: 26px; }
      .trend-box svg { width: 80px; height: 24px; }
      .ref-wrap { margin-bottom: 5px; padding-top: 17px; }
      .ref-value-tag span { font-size: 8px; padding: 2px 5px; }
      .ref-track { height: 9px; }
      .ref-marker { width: 8px; height: 15px; top: -3px; margin-left: -4px; }
      .ref-meta { margin-top: 3px; font-size: 9px; }
      .ref-text { margin-top: 3px; font-size: 9px; }
      .history-line { gap: 4px; }
      .hist-chip { padding: 2px 6px; font-size: 9px; }
      .history-line .hist-chip:nth-child(n+4) { display: none; }
      .summary-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
      .insights { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .param-card, .block, .hero, .summary-card, .trigger-tile, .insight-item {
        page-break-inside: avoid;
      }
      .report-print-footer {
        display: flex;
        position: fixed;
        left: 6mm;
        right: 6mm;
        bottom: 3.5mm;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        line-height: 1.1;
        color: #5c6f73;
        z-index: 999;
        pointer-events: none;
      }
      .report-print-footer-center {
        text-align: center;
        font-weight: 500;
      }
      .report-print-footer-right {
        position: absolute;
        right: 0;
        font-weight: 600;
        display: none;
      }
    }

    .theme-executive {
      background:
        radial-gradient(1200px 420px at 8% -10%, rgba(92,184,172,0.3), transparent 58%),
        radial-gradient(980px 360px at 94% 0%, rgba(242,105,57,0.22), transparent 56%),
        linear-gradient(180deg, #e2f4f1 0%, #fbfcfc 42%, #f3f8fb 100%);
    }
    .theme-executive .hero {
      background:
        radial-gradient(980px 220px at 88% -22%, rgba(242,105,57,0.34), transparent 60%),
        linear-gradient(135deg, #0c655e 0%, #0f8277 42%, #3a8c80 100%);
      box-shadow: 0 16px 34px rgba(0, 108, 98, 0.28);
    }
    .theme-executive .block {
      border-color: #cfe6e2;
      box-shadow: 0 10px 24px rgba(14, 75, 69, 0.09);
    }
    .theme-executive .section-header {
      border-color: #c9e1dd;
      box-shadow: 0 8px 18px rgba(14, 82, 76, 0.1);
    }
    .theme-executive .param-card {
      border-color: #d3e6e2;
      box-shadow: 0 8px 20px rgba(16, 79, 73, 0.09);
    }
    .theme-executive .mode-badge {
      background: linear-gradient(90deg, #f26939, #ea7a40);
      box-shadow: 0 2px 8px rgba(242,105,57,0.35);
    }
    .theme-executive .end-card {
      border-left-color: #e6602f;
      box-shadow: 0 10px 24px rgba(17, 82, 75, 0.1);
    }
  </style>
</head>
<body class="theme-${escapeHtml(designVariant)}">
  ${summaryPage}
  ${detailPages}
  ${endPage}
  ${printFooter}
  <script>
    window.__smartReportImagesReady = new Promise((resolve) => {
      const icons = Array.from(document.querySelectorAll("img[data-report-icon='1']"));
      if (!icons.length) { resolve(true); return; }
      let done = 0;
      let finished = false;
      const mark = () => {
        done += 1;
        if (!finished && done >= icons.length) {
          finished = true;
          resolve(true);
        }
      };
      icons.forEach((img) => {
        if (img.complete) {
          mark();
          return;
        }
        img.addEventListener("load", mark, { once: true });
        img.addEventListener("error", mark, { once: true });
      });
      setTimeout(() => {
        if (!finished) resolve(true);
      }, 2500);
    });
  </script>
</body>
</html>`;
}
