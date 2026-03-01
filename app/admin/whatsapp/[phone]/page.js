//app/admin/whatsapp/[phone]/page.js

import { supabase } from "@/lib/supabaseServer";

export default async function ChatPage({ params }) {

  const { phone } = params;

  const { data: messages } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("phone", phone)
    .order("created_at", { ascending: true });

  return (
    <div className="flex h-screen bg-gray-100">

      <div className="w-full flex flex-col">

        {/* Header */}
        <div className="bg-white p-4 border-b flex justify-between items-center">
          <div className="font-bold">{phone}</div>

          <form action={`/api/admin/complete`} method="POST">
            <input type="hidden" name="phone" value={phone} />
            <button
              className="text-sm bg-blue-500 text-white px-3 py-1 rounded"
              type="submit"
            >
              Mark Completed
            </button>
          </form>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">

          {messages?.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs p-3 rounded-lg shadow ${
                  msg.direction === "outbound"
                    ? "bg-green-200"
                    : "bg-white"
                }`}
              >
                <div className="text-sm">{msg.message}</div>
                <div className="text-[10px] text-gray-500 mt-1 text-right">
                  {new Date(msg.created_at).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}

        </div>

        {/* Reply Box */}
        <form
          action={`/api/admin/reply`}
          method="POST"
          className="p-4 bg-white border-t flex gap-2"
        >
          <input type="hidden" name="phone" value={phone} />

          <input
            name="message"
            required
            placeholder="Type a message"
            className="flex-1 border rounded px-3 py-2"
          />

          <button
            type="submit"
            className="bg-green-600 text-white px-4 rounded"
          >
            Send
          </button>
        </form>

      </div>
    </div>
  );
}