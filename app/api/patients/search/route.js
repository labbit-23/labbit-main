import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { supabase } from "@/lib/supabaseServer";
import { ironOptions } from "@/lib/session";

const ALLOWED_ROLES = new Set([
  "admin",
  "manager",
  "director",
  "executive",
  "phlebo",
]);

function normalizeRole(user) {
  return String(user?.executiveType || user?.userType || "").trim().toLowerCase();
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function applyTextFilter(query, field, mode, rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return query;
  if (mode === "exact") return query.eq(field, value);
  if (mode === "starts_with") return query.ilike(field, `${value}%`);
  return query.ilike(field, `%${value}%`);
}

function matchesForAnyMode({ q, digits, mode }) {
  const phoneCandidate = digits.length >= 4 ? digits : q;
  if (mode === "exact") {
    return [
      `name.eq.${q}`,
      `mrn.eq.${q}`,
      `email.eq.${q}`,
      `phone.eq.${phoneCandidate}`,
    ];
  }
  if (mode === "starts_with") {
    return [
      `name.ilike.${q}%`,
      `mrn.ilike.${q}%`,
      `email.ilike.${q}%`,
      `phone.ilike.${phoneCandidate}%`,
    ];
  }
  return [
    `name.ilike.%${q}%`,
    `mrn.ilike.%${q}%`,
    `email.ilike.%${q}%`,
    `phone.ilike.%${phoneCandidate}%`,
  ];
}

export async function GET(request) {
  try {
    const response = NextResponse.next();
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user || null;

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = normalizeRole(user);
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const rawQ = String(searchParams.get("q") || "").trim();
    const field = String(searchParams.get("field") || "any").trim().toLowerCase();
    const mode = String(searchParams.get("mode") || "contains").trim().toLowerCase();
    const limitParam = Number(searchParams.get("limit") || 30);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.trunc(limitParam), 1), 100)
      : 30;

    if (!rawQ || rawQ.length < 2) {
      return NextResponse.json({ data: [], total: 0 }, { status: 200 });
    }

    const q = rawQ.replace(/[%(),]/g, " ").trim();
    const digits = normalizeDigits(rawQ);
    const validField = new Set(["any", "name", "phone", "mrn", "email", "external_key"]).has(field) ? field : "any";
    const validMode = new Set(["contains", "starts_with", "exact"]).has(mode) ? mode : "contains";

    let patientQuery = supabase
      .from("patients")
      .select(
        "id,name,phone,mrn,dob,gender,email,created_at,patient_addresses(address_line,is_default,address_index),patient_external_keys(external_key,lab_id)"
      );

    if (validField === "any") {
      const orFilters = matchesForAnyMode({ q, digits, mode: validMode });
      patientQuery = patientQuery.or(orFilters.join(","));
    } else if (validField !== "external_key") {
      const filterValue = validField === "phone" && digits.length >= 4 ? digits : q;
      patientQuery = applyTextFilter(patientQuery, validField, validMode, filterValue);
    }

    const { data, error } = (validField === "external_key")
      ? { data: [], error: null }
      : await patientQuery
          .order("created_at", { ascending: false })
          .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const baseRows = Array.isArray(data)
      ? data.map((row) => {
          const addresses = Array.isArray(row?.patient_addresses)
            ? [...row.patient_addresses].sort((a, b) => {
                if (a?.is_default && !b?.is_default) return -1;
                if (!a?.is_default && b?.is_default) return 1;
                return Number(a?.address_index || 9999) - Number(b?.address_index || 9999);
              })
            : [];
          const externalKeys = Array.isArray(row?.patient_external_keys)
            ? row.patient_external_keys
                .map((k) => String(k?.external_key || "").trim())
                .filter(Boolean)
            : [];

          const defaultAddress = addresses[0]?.address_line || null;

          return {
            id: row.id,
            name: row.name || "",
            phone: row.phone || "",
            mrn: row.mrn || "",
            dob: row.dob || null,
            gender: row.gender || null,
            email: row.email || "",
            created_at: row.created_at,
            address_line: defaultAddress,
            external_keys: externalKeys,
          };
        })
      : [];

    let mergedRows = [...baseRows];

    // Also search by linked external keys (Shivam MRNO stored in patient_external_keys.external_key).
    let keyQuery = supabase
      .from("patient_external_keys")
      .select("patient_id,external_key");

    keyQuery = applyTextFilter(keyQuery, "external_key", validMode, q);

    const { data: keyRows, error: keyError } = ((validField === "any" || validField === "external_key"))
      ? await keyQuery.limit(limit)
      : { data: [], error: null };

    if (keyError) {
      return NextResponse.json({ error: keyError.message }, { status: 500 });
    }

    const keyMatchedPatientIds = Array.from(
      new Set((keyRows || []).map((row) => row?.patient_id).filter(Boolean))
    );
    const existingIds = new Set(mergedRows.map((row) => row.id));
    const missingIds = keyMatchedPatientIds.filter((id) => !existingIds.has(id));

    if (missingIds.length > 0) {
      const { data: extraPatients, error: extraError } = await supabase
        .from("patients")
        .select(
          "id,name,phone,mrn,dob,gender,email,created_at,patient_addresses(address_line,is_default,address_index),patient_external_keys(external_key,lab_id)"
        )
        .in("id", missingIds)
        .limit(limit);

      if (extraError) {
        return NextResponse.json({ error: extraError.message }, { status: 500 });
      }

      const extraRows = (extraPatients || []).map((row) => {
        const addresses = Array.isArray(row?.patient_addresses)
          ? [...row.patient_addresses].sort((a, b) => {
              if (a?.is_default && !b?.is_default) return -1;
              if (!a?.is_default && b?.is_default) return 1;
              return Number(a?.address_index || 9999) - Number(b?.address_index || 9999);
            })
          : [];
        const externalKeys = Array.isArray(row?.patient_external_keys)
          ? row.patient_external_keys
              .map((k) => String(k?.external_key || "").trim())
              .filter(Boolean)
          : [];

        return {
          id: row.id,
          name: row.name || "",
          phone: row.phone || "",
          mrn: row.mrn || "",
          dob: row.dob || null,
          gender: row.gender || null,
          email: row.email || "",
          created_at: row.created_at,
          address_line: addresses[0]?.address_line || null,
          external_keys: externalKeys,
        };
      });

      mergedRows = [...mergedRows, ...extraRows];
    }

    const byRecent = (a, b) =>
      new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
    const rows = mergedRows
      .filter((row, idx, arr) => arr.findIndex((x) => x.id === row.id) === idx)
      .sort(byRecent)
      .slice(0, limit);

    return NextResponse.json({ data: rows, total: rows.length }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
