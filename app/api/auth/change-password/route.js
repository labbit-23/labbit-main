import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import bcrypt from "bcryptjs";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { getPasswordValidationStatus, isValidPassword } from "@/lib/passwordPolicy";

export async function POST(req) {
  const res = NextResponse.next();

  try {
    const session = await getIronSession(req, res, ironOptions);
    const sessionUser = session?.user || null;
    const sessionUserType = String(sessionUser?.userType || "").toLowerCase();
    const isExecutiveSession = sessionUserType === "executive" || Boolean(sessionUser?.executiveType);
    const executiveId = sessionUser?.id || null;

    if (!sessionUser || !isExecutiveSession || !executiveId) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { oldPassword, newPassword, confirmPassword } = await req.json();

    if (!oldPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: "Old password, new password, and confirmation are required." },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "New password and confirm password do not match." },
        { status: 400 }
      );
    }

    if (oldPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from the old password." },
        { status: 400 }
      );
    }

    const passwordValidation = getPasswordValidationStatus(newPassword);
    if (!isValidPassword(newPassword)) {
      return NextResponse.json(
        {
          error: "New password does not meet required password rules.",
          passwordValidation,
        },
        { status: 400 }
      );
    }

    const { data: executive, error: executiveError } = await supabase
      .from("executives")
      .select("id, password_hash, active, status")
      .eq("id", executiveId)
      .maybeSingle();

    if (executiveError) {
      console.error("Change password executive lookup error:", executiveError);
      return NextResponse.json({ error: "Unable to verify account." }, { status: 500 });
    }

    if (!executive) {
      return NextResponse.json({ error: "Executive account not found." }, { status: 404 });
    }

    const normalizedStatus = String(executive?.status || "").trim().toLowerCase();
    if (
      executive?.active === false ||
      ["inactive", "disabled", "blocked", "suspended"].includes(normalizedStatus)
    ) {
      return NextResponse.json({ error: "This account is inactive." }, { status: 403 });
    }

    if (!executive?.password_hash) {
      return NextResponse.json(
        { error: "Password is not set. Use forgot password flow." },
        { status: 400 }
      );
    }

    const oldPasswordMatches = await bcrypt.compare(oldPassword, executive.password_hash);
    if (!oldPasswordMatches) {
      return NextResponse.json({ error: "Old password is incorrect." }, { status: 401 });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const { error: updateError } = await supabase
      .from("executives")
      .update({ password_hash: hashedPassword })
      .eq("id", executive.id);

    if (updateError) {
      console.error("Change password update error:", updateError);
      return NextResponse.json({ error: "Failed to update password." }, { status: 500 });
    }

    return NextResponse.json({ message: "Password changed successfully." }, { status: 200 });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
