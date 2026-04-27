import { NextResponse } from "next/server";
import { checkPermission, deny, getSessionUser } from "@/lib/uac/authz";
import { getShivamDemographicsByMrno, updateShivamDemographics } from "@/lib/neosoft/client";
import { writeAuditLog } from "@/lib/audit/logger";

function clean(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function cleanAllowEmptyString(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim();
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function isDirectorOrAdminUser(user, roleKey = "") {
  const rk = String(roleKey || "").toLowerCase().trim();
  if (rk === "director" || rk === "admin") return true;
  const execType = String(user?.executiveType || user?.roleKey || "").toLowerCase().trim();
  const userType = String(user?.userType || "").toLowerCase().trim();
  return execType === "director" || execType === "admin" || userType === "director" || userType === "admin";
}

function pick(source, keys = []) {
  if (!source || typeof source !== "object") return null;
  for (const key of keys) {
    const direct = source?.[key];
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") return direct;
    const found = Object.entries(source).find(
      ([k, v]) => String(k || "").toLowerCase() === String(key || "").toLowerCase() && v !== undefined && v !== null
    );
    if (found && String(found[1]).trim() !== "") return found[1];
  }
  return null;
}

function normalizeDemographics(raw, mrno) {
  const root = raw?.data && typeof raw.data === "object" ? raw.data : raw;
  const fromRootPatient = root?.patient && typeof root.patient === "object" ? root.patient : null;
  const fromRootResult =
    root?.result && typeof root.result === "object"
      ? (Array.isArray(root.result) ? root.result[0] : root.result)
      : null;
  const fromRootDataArray = Array.isArray(root?.data) ? root.data[0] : null;
  const obj =
    fromRootPatient ||
    fromRootResult ||
    fromRootDataArray ||
    (Array.isArray(root) ? root[0] : root);
  const normalizeDateForInput = (value) => {
    const text = String(value || "").trim();
    if (!text) return null;
    const m = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    return text;
  };
  const rawSex = asNumber(pick(obj, ["sex", "SEX"]));
  const normalizedGender =
    rawSex === 1
      ? "Male"
      : rawSex === 0
        ? "Female"
        : clean(pick(obj, ["gender", "GENDER"]));
  return {
    mrno: clean(pick(obj, ["mrno", "MRNO", "cregno", "CREGNO", "external_key"])) || clean(mrno),
    patient_name: clean(
      pick(obj, [
        "patient_name",
        "PATIENT_NAME",
        "name",
        "NAME",
        "patientnm",
        "PATIENTNM",
        "fname",
        "FNAME"
      ])
    ),
    mobile_no: clean(
      pick(obj, [
        "mobile_no",
        "MOBILE_NO",
        "phoneno",
        "PHONENO",
        "phone",
        "PHONE",
        "phone2",
        "PHONE2"
      ])
    ),
    age: asNumber(pick(obj, ["age", "AGE"])),
    dob: normalizeDateForInput(pick(obj, ["dob", "DOB", "date_of_birth", "DATE_OF_BIRTH"])),
    gender: normalizedGender,
    sex: rawSex,
    email: clean(pick(obj, ["email", "EMAIL"])),
    pincode: clean(pick(obj, ["pincode", "PINCODE"])),
    ageyrs: asNumber(pick(obj, ["ageyrs", "AGEYRS"])),
    agemonths: asNumber(pick(obj, ["agemonths", "AGEMONTHS"])),
    agedays: asNumber(pick(obj, ["agedays", "AGEDAYS"]))
  };
}

function normalizedName(value) {
  return String(value ?? "").trim();
}

function normalizedPhone(value) {
  return digitsOnly(value);
}

export async function GET(request) {
  let user = null;
  let roleKey = "viewer";
  try {
    user = await getSessionUser(request);
    if (!user) return deny("Not authenticated", 401);

    const viewPermission = await checkPermission(user, "shivam.tools.view");
    roleKey = viewPermission.roleKey;
    const roleBypass = isDirectorOrAdminUser(user, roleKey);
    if (!viewPermission.ok && !roleBypass) {
      return deny("Forbidden", 403, { permission: "shivam.tools.view" });
    }

    const url = new URL(request.url);
    const mrno = clean(url.searchParams.get("mrno"));
    if (!mrno) {
      return NextResponse.json({ error: "mrno is required" }, { status: 400 });
    }

    const raw = await getShivamDemographicsByMrno(mrno);
    return NextResponse.json({
      ok: true,
      demographics: normalizeDemographics(raw, mrno),
      raw
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch demographics" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  let user = null;
  let roleKey = "viewer";
  try {
    user = await getSessionUser(request);
    if (!user) return deny("Not authenticated", 401);

    const updatePermission = await checkPermission(user, "shivam.demographics.update");
    roleKey = updatePermission.roleKey;
    const roleBypass = isDirectorOrAdminUser(user, roleKey);
    if (!updatePermission.ok && !roleBypass) {
      return deny("You do not have permission to update Shivam demographics.", 403, {
        permission: "shivam.demographics.update"
      });
    }

    const body = await request.json();
    const mrno = clean(body?.mrno);

    if (!mrno) {
      return NextResponse.json(
        { error: "mrno is required for demographics update." },
        { status: 400 }
      );
    }
    const mrnoDigits = digitsOnly(mrno);
    const mobileDigits = digitsOnly(body?.mobile_no);
    if (mrnoDigits && mobileDigits && mrnoDigits === mobileDigits) {
      return NextResponse.json(
        { error: "MRNO cannot be same as mobile number. Please enter valid MRNO." },
        { status: 400 }
      );
    }

    const payload = {
      mrno,
      patient_name: clean(body?.patient_name),
      mobile_no: clean(body?.mobile_no),
      age: asNumber(body?.age),
      dob: clean(body?.dob),
      gender: clean(body?.gender),
      sex: asNumber(body?.sex),
      email: cleanAllowEmptyString(body?.email),
      pincode: clean(body?.pincode),
      ageyrs: asNumber(body?.ageyrs),
      agemonths: asNumber(body?.agemonths),
      agedays: asNumber(body?.agedays),
      actor: {
        id: user?.id || null,
        name: user?.name || null,
        role: roleKey
      }
    };

    let identityTouched = false;
    if (payload.patient_name !== null || payload.mobile_no !== null) {
      const existingRaw = await getShivamDemographicsByMrno(mrno);
      const existing = normalizeDemographics(existingRaw, mrno);
      const nameChanged =
        payload.patient_name !== null &&
        normalizedName(payload.patient_name) !== normalizedName(existing?.patient_name);
      const mobileChanged =
        payload.mobile_no !== null &&
        normalizedPhone(payload.mobile_no) !== normalizedPhone(existing?.mobile_no);
      identityTouched = nameChanged || mobileChanged;
    }

    if (identityTouched) {
      const identityPermission = await checkPermission(user, "shivam.demographics.update_identity");
      if (!identityPermission.ok && !roleBypass) {
        await writeAuditLog({
          request,
          user,
          roleKey,
          action: "shivam.demographics.update_identity",
          entityType: "shivam_demographics",
          entityId: mrno || null,
          status: "denied",
          metadata: {
            reason: "missing shivam.demographics.update_identity",
            mrno
          }
        });
        return deny(
          "You do not have permission to update identity fields (name/mobile).",
          403,
          { permission: "shivam.demographics.update_identity" }
        );
      }
    }

    const hasAtLeastOneField = [
      "patient_name",
      "mobile_no",
      "age",
      "dob",
      "gender",
      "sex",
      "email",
      "pincode",
      "ageyrs",
      "agemonths",
      "agedays"
    ].some(
      (key) => payload[key] !== null
    );
    if (!hasAtLeastOneField) {
      return NextResponse.json({ error: "No demographic fields provided for update." }, { status: 400 });
    }

    const response = await updateShivamDemographics(payload);

    await writeAuditLog({
      request,
      user,
      roleKey,
      action: identityTouched ? "shivam.demographics.update_identity" : "shivam.demographics.update",
      entityType: "shivam_demographics",
      entityId: mrno || null,
      status: "success",
      after: payload,
      metadata: {
        mrno,
        upstream_ok: true
      }
    });

    return NextResponse.json({
      ok: true,
      result: response
    });
  } catch (error) {
    await writeAuditLog({
      request,
      user,
      roleKey,
      action: "shivam.demographics.update",
      entityType: "shivam_demographics",
      entityId: null,
      status: "error",
      metadata: {
        error: error?.message || "unknown"
      }
    });
    return NextResponse.json(
      { error: error?.message || "Failed to update Shivam demographics" },
      { status: 500 }
    );
  }
}
