// File: /app/api/auth/user-login/route.js

import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import bcrypt from "bcryptjs";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

export async function POST(req) {
  try {
    const { identifier, password, rememberMe } = await req.json();

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Missing identifier or password.", exists: false },
        { status: 400 }
      );
    }

    const isPhone = /^\d{10}$/.test(identifier);
    const normalizedIdentifier = isPhone ? identifier.replace(/\D/g, '') : identifier;

    // Lookup executive by phone or email
    let executive;
    if (isPhone) {
      const { data, error } = await supabase
        .from("executives")
        .select("*")
        .eq("phone", normalizedIdentifier)
        .limit(1)
        .single();
      if (error || !data) {
        return NextResponse.json(
          { error: "Invalid email/phone or password.", exists: false },
          { status: 401 }
        );
      }
      executive = data;
    } else {
      const { data, error } = await supabase
        .from("executives")
        .select("*")
        .ilike("email", normalizedIdentifier)
        .limit(1)
        .single();
      if (error || !data) {
        return NextResponse.json(
          { error: "Invalid email/phone or password.", exists: false },
          { status: 401 }
        );
      }
      executive = data;
    }

    // Fetch assigned labs for executive (always, even if password is invalid)
    const { data: labsData, error: labsError } = await supabase
      .from("executives_labs")
      .select("lab_id")
      .eq("executive_id", executive.id);

    if (labsError) {
      return NextResponse.json(
        { error: "Failed to retrieve lab information.", exists: true, labIds: [] },
        { status: 500 }
      );
    }

    const labIds = labsData ? labsData.map((row) => row.lab_id) : [];

    // Check password hash exists
    if (!executive.password_hash) {
      return NextResponse.json(
        {
          error: "Invalid email/phone or password.",
          exists: true,
          labIds,
        },
        { status: 401 }
      );
    }

    // Verify password using bcrypt.compare
    const isValidPassword = await bcrypt.compare(password, executive.password_hash);
    if (!isValidPassword) {
      return NextResponse.json(
        {
          error: "Invalid email/phone or password.",
          exists: true,
          labIds,
        },
        { status: 401 }
      );
    }

    // Determine redirect URL based on normalized executive type
    const execType = (executive.type || '').trim().toLowerCase();
    const adminTypes = ['admin', 'manager', 'director'];
    const collectionRoles = ['logistics', 'b2b', 'b2badmin'];

    let redirectUrl = '/'; // fallback

    if (adminTypes.includes(execType)) {
      redirectUrl = '/admin';
    } else if (execType === 'phlebo') {
      redirectUrl = '/phlebo';
    } else if (collectionRoles.includes(execType)) {
      redirectUrl = '/collection-centre';
    }

    // Prepare response with redirectUrl and executiveType info
    const res = NextResponse.json({
      message: "Login successful.",
      labIds,
      redirectUrl,
      executiveType: execType,
    });

    // Create and save session with iron-session
    const session = await getIronSession(req, res, {
      ...ironOptions,
      cookieOptions: {
        ...ironOptions.cookieOptions,
        maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 6, // 30 days or 6 hours
      },
    });

    session.user = {
      id: executive.id,
      name: executive.name,
      email: executive.email,
      phone: executive.phone,
      labIds,
      userType: "executive",         // 
      roleKey: execType,          // <- actual role from DB (lowercased) <- for RequireAuth
      executiveType: execType,    // <- actual role from DB (lowercased) <- optional for legacy code
    };


    await session.save();

    return res;

  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during login." },
      { status: 500 }
    );
  }
}
