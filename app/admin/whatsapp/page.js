//app/admin/whatsapp/page.js

import { createClient } from "@/lib/supabaseServer";
import Link from "next/link";

export default async function WhatsAppAdminPage() {
  const supabase = createClient();

  // Fetch sessions
  const { data: sessions } = await supabase
    .from("chat_sessions")
    .select("*")
    .order("last_message_at", { ascending: false });

  const now = new Date();

  const active = [];
  const dormant = [];
  const completed = [];

  sessions?.forEach((s) => {
    if (s.status === "completed") {
      completed.push(s);
      return;
    }

    if (!s.last_user_message_at) {
      dormant.push(s);
      return;
    }

    const diff =
      now.getTime() - new Date(s.last_user_message_at).getTime();

    if (diff < 24 * 60 * 60 * 1000) {
      active.push(s);
    } else {
      dormant.push(s);
    }
  });

  return (
    <div className="flex h-screen">
      {/* LEFT PANEL */}
      <div className="w-1/3 border-r overflow-y-auto p-4">
        <h2 className="font-bold mb-2">🟢 Active</h2>
        {active.map((s) => (
          <Link key={s.id} href={`/admin/whatsapp/${s.phone}`}>
            <div className="p-2 hover:bg-gray-100 cursor-pointer">
              {s.phone}
            </div>
          </Link>
        ))}

        <h2 className="font-bold mt-6 mb-2">⚪ Dormant</h2>
        {dormant.map((s) => (
          <Link key={s.id} href={`/admin/whatsapp/${s.phone}`}>
            <div className="p-2 hover:bg-gray-100 cursor-pointer">
              {s.phone}
            </div>
          </Link>
        ))}

        <h2 className="font-bold mt-6 mb-2">✅ Completed</h2>
        {completed.map((s) => (
          <Link key={s.id} href={`/admin/whatsapp/${s.phone}`}>
            <div className="p-2 hover:bg-gray-100 cursor-pointer">
              {s.phone}
            </div>
          </Link>
        ))}
      </div>

      {/* RIGHT PANEL */}
      <div className="w-2/3 flex items-center justify-center">
        <div>Select a conversation</div>
      </div>
    </div>
  );
}