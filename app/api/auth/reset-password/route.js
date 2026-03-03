// File: /app/api/auth/reset-password/route.js

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabaseServer";

export async function POST(req) {
  try {
    const { identifier, newPassword } = await req.json();

    // Basic validations
    if (!identifier || !newPassword) {
      return NextResponse.json(
        { error: "Missing identifier or new password." },
        { status: 400 }
      );
    }
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    // Normalize phone if identifier looks like phone number
    const rawIdentifier = String(identifier || "").trim();
    const isPhone = /^\d{10}$/.test(rawIdentifier);
    const normalizedIdentifier = isPhone
      ? rawIdentifier.replace(/\D/g, "")
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
