import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { appHubAuthorized } from "@/lib/appHubAuth";
import { boneClassify, parseRaw, findTotalRegion } from "@/lib/bmdSummary";

// GET /api/internal/app-bmd/summary/{mrn}
//
// BMD/DEXA summary for the Labit App hub's Home screen. bmd_patients/
// bmd_scans/bmd_results live in this SAME Supabase project (public schema,
// same supabaseServer.js client this repo's own patients/lab_tests/visits
// routes already use) -- a separate app (sdrc-dexa-worker/sdrc-dexa-app)
// owns writing them, but it's one physical database, so no new credentials
// are needed here (director, 2026-09-23: "unnecessary to add another key").
//
// Two independent halves, either or both may be absent for a given patient:
//
// 1. Bone density (scan_type='osteo'): worst T-score across bmd_results
//    rows on the latest osteo scan, classified with the SAME thresholds/
//    labels sdrc-dexa-app's own boneClassify() uses (lib/bmd-compute.js).
//
// 2. Body composition (scan_type='total_body'): director, 2026-09-23 --
//    "you have to see mdb values, not xps values. Those are deprecated (it
//    was reading from XPS not the DB and gave inconsistent incomplete
//    data)." Confirmed live: raw_json.xps_composition is populated on only
//    3 of 47 total_body scans ever recorded (all from May); raw_json.
//    mdb_snapshot.composition is populated on all 47. Pure parsing lives in
//    lib/bmdSummary.js (findTotalRegion) -- see its own comment for the
//    label-7/bone_mass entry-selection subtlety.
//
// Auth: APP_HUB_INTERNAL_TOKEN, same as app-catalog/app-patients/app-booking.

export async function GET(request, { params }) {
  if (!appHubAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mrn = String((await params)?.mrn || "").trim();
  if (!mrn) return NextResponse.json({ error: "mrn is required" }, { status: 400 });

  try {
    const { data: patient, error: pErr } = await supabase
      .from("bmd_patients").select("id").eq("mrn", mrn).maybeSingle();
    if (pErr) throw pErr;
    if (!patient) return NextResponse.json({ boneDensity: null, bodyComposition: null });

    const { data: osteoScan, error: oErr } = await supabase
      .from("bmd_scans").select("id, scan_date")
      .eq("patient_id", patient.id).eq("scan_type", "osteo")
      .order("scan_date", { ascending: false }).limit(1).maybeSingle();
    if (oErr) throw oErr;

    let boneDensity = null;
    if (osteoScan) {
      const { data: results, error: rErr } = await supabase
        .from("bmd_results").select("t_score").eq("scan_id", osteoScan.id);
      if (rErr) throw rErr;
      const scores = (results || []).map((r) => r.t_score).filter((t) => t != null);
      if (scores.length) {
        const worstT = Math.min(...scores);
        boneDensity = { scanDate: osteoScan.scan_date, worstTScore: worstT, classification: boneClassify(worstT) };
      }
    }

    const { data: tbScan, error: tErr } = await supabase
      .from("bmd_scans").select("scan_date, raw_json")
      .eq("patient_id", patient.id).eq("scan_type", "total_body")
      .order("scan_date", { ascending: false }).limit(1).maybeSingle();
    if (tErr) throw tErr;

    let bodyComposition = null;
    if (tbScan) {
      const rawJson = parseRaw(tbScan.raw_json);
      const region = rawJson ? findTotalRegion(rawJson) : null;
      if (region) bodyComposition = { scanDate: tbScan.scan_date, ...region };
    }

    return NextResponse.json({ boneDensity, bodyComposition });
  } catch (err) {
    console.error("[app-bmd/summary] error", err);
    return NextResponse.json({ error: "Failed to load BMD summary" }, { status: 500 });
  }
}
