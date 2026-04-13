import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { lookupReports, getReportUrl } from "@/lib/neosoft/client";
import { normalizeNeosoftTrendPayload } from "@/lib/trendReports/normalizeNeosoft";
import { evaluateTrendRules } from "@/lib/trendReports/ruleEngine";
import { buildReportFacts } from "@/lib/trendReports/buildReportFacts";

function asText(value) {
  return String(value || "").trim();
}

function normalizePhone10(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-10);
}

function parseDateIso(value) {
  const text = asText(value);
  if (!text) return "";
  const dt = new Date(text);
  if (!Number.isFinite(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

function deriveAgeFromDob(dob) {
  const iso = parseDateIso(dob);
  if (!iso) return null;
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dt.getFullYear();
  const monthDiff = now.getMonth() - dt.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dt.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function safeJson(value) {
  if (value && typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function toTrendSnapshot(facts) {
  const insights = Array.isArray(facts?.insights) ? facts.insights : [];
  const followup = insights.find((item) => String(item?.type || "").toLowerCase() === "followup_window");

  return {
    recommended_followup_date: facts?.recommended_followup_date || null,
    followup_window_label: facts?.followup_window_label || null,
    tests_csv: followup?.tests_csv || "",
    tests_list: Array.isArray(followup?.tests_list) ? followup.tests_list : [],
    summary_by_type: Array.isArray(facts?.summary_by_type) ? facts.summary_by_type : [],
    key_highlights: insights.slice(0, 5).map((item) => ({
      type: item?.type || null,
      title: item?.title || null,
      text: item?.text || null,
      severity: item?.severity || null,
    })),
  };
}

function toTrendDateBuckets(normalizedTrend) {
  const parameters = Array.isArray(normalizedTrend?.parameters) ? normalizedTrend.parameters : [];
  const bucket = new Map();

  const pushRow = (dateIso, row) => {
    if (!dateIso) return;
    if (!bucket.has(dateIso)) bucket.set(dateIso, []);
    bucket.get(dateIso).push(row);
  };

  for (const param of parameters) {
    const testName =
      asText(param?.display_name) ||
      asText(param?.name) ||
      asText(param?.parameter_name) ||
      asText(param?.key) ||
      "Test";

    const unit = asText(param?.unit) || asText(param?.units);
    const timeline = Array.isArray(param?.points)
      ? param.points
      : Array.isArray(param?.timeline)
        ? param.timeline
        : Array.isArray(param?.series)
          ? param.series
          : [];

    for (const point of timeline) {
      const dateIso = parseDateIso(
        point?.date ||
          point?.test_date ||
          point?.report_date ||
          point?.reqdt ||
          point?.collected_at
      );
      if (!dateIso) continue;

      const valueRaw =
        point?.value ??
        point?.result ??
        point?.numeric_value ??
        point?.raw_value ??
        null;
      const value = valueRaw == null ? null : String(valueRaw);
      const lettype = asText(point?.lettype || point?.flag || "");

      pushRow(dateIso, {
        name: testName,
        value,
        unit: unit || null,
        lettype: lettype || null,
      });
    }
  }

  return Array.from(bucket.entries())
    .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    .map(([date, tests]) => ({
      date,
      tests: tests
        .filter((t) => t?.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    }));
}

export async function GET(request) {
  const response = NextResponse.next();
  const session = await getIronSession(request, response, ironOptions);
  const user = session?.user;
  const userType = String(user?.userType || "").trim().toLowerCase();
  const execType = String(user?.executiveType || user?.roleKey || user?.userType || "").trim().toLowerCase();
  const supportPhone = normalizePhone10(session?.support_patient_phone);
  const isDirectorSupportMode =
    (userType === "executive" || userType === "director") &&
    execType === "director" &&
    !!supportPhone;

  if (!user || (userType !== "patient" && !isDirectorSupportMode)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sessionPhone = isDirectorSupportMode ? supportPhone : normalizePhone10(user?.phone);
  if (!sessionPhone) {
    return NextResponse.json({ error: "Patient phone missing in session" }, { status: 400 });
  }

  const url = new URL(request.url);
  const selectedPatientId = asText(url.searchParams.get("patient_id"));

  const { data: patientRows, error: patientError } = await supabase
    .from("patients")
    .select("id, name, phone, email, dob, gender, mrn, created_at")
    .eq("phone", sessionPhone)
    .order("created_at", { ascending: true });

  if (patientError) {
    return NextResponse.json({ error: patientError.message || "Failed to load patients" }, { status: 500 });
  }

  const patients = Array.isArray(patientRows) ? patientRows : [];
  if (patients.length === 0) {
    return NextResponse.json(
      {
        phone: sessionPhone,
        patients: [],
        selected_patient_id: null,
        selected_patient: null,
        reports: [],
        bookings: { quickbook: [], visits: [] },
        reminders: null,
        trend_snapshot: null,
      },
      { status: 200 }
    );
  }

  const patientIdSet = new Set(patients.map((p) => p.id));
  const effectivePatientId = patientIdSet.has(selectedPatientId) ? selectedPatientId : patients[0].id;

  const { data: externalKeyRows } = await supabase
    .from("patient_external_keys")
    .select("patient_id, external_key, created_at")
    .in("patient_id", patients.map((p) => p.id))
    .order("created_at", { ascending: false });

  const latestKeyByPatient = new Map();
  for (const row of externalKeyRows || []) {
    if (!row?.patient_id || latestKeyByPatient.has(row.patient_id)) continue;
    latestKeyByPatient.set(row.patient_id, asText(row.external_key));
  }

  const enrichedPatients = patients.map((p) => {
    const ext = latestKeyByPatient.get(p.id) || "";
    return {
      id: p.id,
      name: asText(p.name),
      phone: normalizePhone10(p.phone),
      email: asText(p.email),
      dob: parseDateIso(p.dob),
      age: deriveAgeFromDob(p.dob),
      gender: asText(p.gender),
      mrn: asText(p.mrn),
      external_key: ext,
      created_at: p.created_at || null,
    };
  });

  const selectedPatient = enrichedPatients.find((p) => p.id === effectivePatientId) || enrichedPatients[0];

  const [quickbookResp, visitsResp] = await Promise.all([
    supabase
      .from("quickbookings")
      .select(
        "id, patient_name, phone, package_name, area, date, status, created_at, home_visit_required, visit_id, request_payload_json"
      )
      .eq("phone", sessionPhone)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("visits")
      .select("id, visit_date, status, address, notes, created_at, patient_id, time_slot:time_slot(slot_name)")
      .in("patient_id", patients.map((p) => p.id))
      .order("visit_date", { ascending: false })
      .limit(80),
  ]);

  const quickbookRows = Array.isArray(quickbookResp.data) ? quickbookResp.data : [];
  const visitRows = Array.isArray(visitsResp.data) ? visitsResp.data : [];

  let reports = [];
  try {
    const reportRows = await lookupReports(sessionPhone);
    reports = (Array.isArray(reportRows) ? reportRows : []).map((r) => {
      const reqid = asText(r?.reqid);
      const reqno = asText(r?.reqno);
      const mrno = asText(r?.mrno);
      return {
        reqid: reqid || null,
        reqno: reqno || null,
        mrno: mrno || null,
        patient_name: asText(r?.patient_name) || selectedPatient?.name || "Patient",
        reqdt: r?.reqdt || null,
        report_url: reqid ? getReportUrl(reqid, { reqno: reqno || undefined }) : null,
      };
    });
  } catch {
    reports = [];
  }

  const latestQuickbook = quickbookRows[0] || null;
  const latestPackage = asText(latestQuickbook?.package_name);
  const latestPayload = safeJson(latestQuickbook?.request_payload_json);
  const payloadItems = Array.isArray(latestPayload?.items) ? latestPayload.items : [];

  const selectedMrno =
    asText(selectedPatient?.external_key) ||
    asText(selectedPatient?.mrn) ||
    asText(reports.find((r) => r?.mrno)?.mrno);

  let trendSnapshot = null;
  let trendDateBuckets = [];
  if (selectedMrno) {
    try {
      const { getTrendDataByMrno } = await import("@/lib/neosoft/client");
      const payload = await getTrendDataByMrno(selectedMrno);
      const normalized = normalizeNeosoftTrendPayload(payload, {
        asOfDate: new Date().toISOString().slice(0, 10),
      });
      trendDateBuckets = toTrendDateBuckets(normalized).slice(0, 120);
      const evaluation = evaluateTrendRules({
        normalizedTrend: normalized,
        asOfDate: new Date().toISOString().slice(0, 10),
      });
      const facts = buildReportFacts({
        normalizedTrend: normalized,
        evaluation,
        maxChartPoints: 5,
        reportMode: "trends",
        psyntaxMode: "neutral",
      });
      trendSnapshot = toTrendSnapshot(facts);
    } catch {
      trendSnapshot = null;
      trendDateBuckets = [];
    }
  }

  const reminders = {
    latest_package_name: latestPackage || null,
    latest_package_items: payloadItems.slice(0, 12),
    trend_followup_window: trendSnapshot?.followup_window_label || null,
    trend_followup_tests: trendSnapshot?.tests_list || [],
  };

  const quickbookLive = quickbookRows.filter((row) => {
    const status = asText(row?.status).toLowerCase();
    return !["closed", "rejected", "disabled", "completed", "resolved"].includes(status);
  });

  return NextResponse.json(
    {
      phone: sessionPhone,
      patients: enrichedPatients,
      selected_patient_id: selectedPatient?.id || null,
      selected_patient: selectedPatient || null,
      selected_mrno: selectedMrno || null,
      reports,
      trend_snapshot: trendSnapshot,
      trend_dates: trendDateBuckets,
      reminders,
      bookings: {
        quickbook: quickbookLive.map((row) => ({
          id: row.id,
          patient_name: row.patient_name || null,
          date: row.date || null,
          status: row.status || null,
          package_name: row.package_name || null,
          area: row.area || null,
          created_at: row.created_at || null,
          home_visit_required: row.home_visit_required !== false,
          visit_id: row.visit_id || null,
        })),
        visits: visitRows.map((row) => ({
          id: row.id,
          visit_date: row.visit_date || null,
          status: row.status || null,
          address: row.address || null,
          notes: row.notes || null,
          time_slot: row?.time_slot?.slot_name || null,
          patient_id: row.patient_id || null,
          created_at: row.created_at || null,
        })),
      },
    },
    { status: 200 }
  );
}
