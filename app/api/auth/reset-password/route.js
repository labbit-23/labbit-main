// File: /app/api/auth/reset-password/route.js

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabaseServer";
import { getPasswordValidationStatus, isValidPassword } from "@/lib/passwordPolicy";

export async function POST(req) {
  try {
    const { identifier, newPassword, confirmPassword } = await req.json();

    // Basic validations
    if (!identifier || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: "Missing identifier, new password, or confirm password." },
        { status: 400 }
      );
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "New password and confirm password do not match." },
        { status: 400 }
      );
    }
    const passwordValidation = getPasswordValidationStatus(newPassword);
    if (!isValidPassword(newPassword)) {
      return NextResponse.json(
        {
          error: "Password does not meet required password rules.",
          passwordValidation,
        },
        { status: 400 }
      );
    }

    // Normalize phone if identifier looks like phone number
    const rawIdentifier = String(identifier || "").trim();
    const identifierDigits = rawIdentifier.replace(/\D/g, "");
    const isPhone = identifierDigits.length >= 10;
    const normalizedIdentifier = isPhone
      ? identifierDigits.slice(-10)
      : rawIdentifier.toLowerCase();

    // Lookup executive by phone or email
    const { data: matches, error } = isPhone
      ? await supabase
          .from("executives")
          .select("id")
          .eq("phone", normalizedIdentifier)
          .limit(2)
      : await supabase
          .from("executives")
          .select("id")
          .ilike("email", normalizedIdentifier)
          .limit(2);

    if (error || !Array.isArray(matches) || matches.length === 0) {
      return NextResponse.json(
        { error: "No executive found with provided identifier." },
        { status: 404 }
      );
    }
    if (matches.length > 1) {
      return NextResponse.json(
        {
          error: isPhone
            ? "Multiple accounts found for this phone. Contact admin."
            : "This email is linked to multiple accounts. Reset using unique mobile number.",
        },
        { status: 409 }
      );
    }

    const executive = matches[0];

    // Hash the new password using bcryptjs
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password_hash in executives table
    const { error: updateError } = await supabase
      .from("executives")
      .update({ password_hash: hashedPassword })
      .eq("id", executive.id);

    if (updateError) {
      console.error("Error updating executive password:", updateError);
      return NextResponse.json(
        { error: "Failed to update password. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Password reset successful." });
  } catch (err) {
    console.error("Reset password error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
