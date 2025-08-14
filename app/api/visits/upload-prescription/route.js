// File: /app/api/visits/upload-prescription/route.js
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { v4 as uuidv4 } from "uuid";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    // ✅ Hard stop if no file or invalid file type
    if (!file || !(file instanceof Blob) || file.size === 0) {
      return NextResponse.json(
        { error: "No valid file uploaded" },
        { status: 400 }
      );
    }

    const fileExt = file.name?.split(".").pop() || "jpg";
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `prescriptions/${fileName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(filePath, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: publicData } = supabase.storage
      .from("uploads")
      .getPublicUrl(filePath);

    return NextResponse.json({ url: publicData.publicUrl }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
