//app/admin/whatsapp/page.js

import { supabase } from "@/lib/supabaseServer";
import Link from "next/link";

export default async function WhatsAppAdminPage() {

  const { data: sessions } = await supabase
    .from("chat_sessions")
    .select("*")
    .order("last_message_at", { ascending: false });

  const { data: lastMessages } = await supabase
    .from("whatsapp_messages")
    .select("phone, message, created_at")
    .order("created_at", { ascending: false });

  const lastMap = {};
  lastMessages?.forEach(m => {
    if (!lastMap[m.phone]) {
      lastMap[m.phone] = m;
    }
  });

  const now = new Date();

  const group = (session) => {
    if (session.status === "completed") return "completed";
    if (!session.last_user_message_at) return "dormant";

    const diff = now - new Date(session.last_user_message_at);
    return diff < 24 * 60 * 60 * 1000 ? "active" : "dormant";
  };

  return (
    <div className="flex h-screen bg-gray-100">

      {/* Sidebar */}
      <div className="w-1/3 bg-white border-r flex flex-col">

        <div className="p-4 font-bold text-lg border-b">
          WhatsApp Dashboard
        </div>

        <div className="flex-1 overflow-y-auto">

          {sessions?.map(session => {
            const status = group(session);
            const last = lastMap[session.phone];

            return (
              <Link key={session.id} href={`/admin/whatsapp/${session.phone}`}>
                <div className="p-4 border-b hover:bg-gray-50 cursor-pointer">
                  <div className="flex justify-between">
                    <div className="font-semibold">
                      {session.phone}
                    </div>
                    {last && (
                      <div className="text-xs text-gray-500">
                        {new Date(last.created_at).toLocaleTimeString()}
                      </div>
                    )}
                  </div>

                  {last && (
                    <div className="text-sm text-gray-600 truncate">
                      {last.message}
                    </div>
                  )}

                  <div className="text-xs mt-1">
                    {status === "active" && <span className="text-green-600">● Active</span>}
                    {status === "dormant" && <span className="text-gray-500">Dormant</span>}
                    {status === "completed" && <span className="text-blue-500">Completed</span>}
                  </div>
                </div>
              </Link>
            );
          })}

        </div>
      </div>

      {/* Empty State */}
      <div className="w-2/3 flex items-center justify-center text-gray-400">
        Select a conversation
      </div>

    </div>
  );
}