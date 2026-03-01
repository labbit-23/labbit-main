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
    <div className="flex flex-col h-screen">
      <div className="border-b p-4 font-bold">
        Chat with {phone}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages?.map((msg) => (
          <div
            key={msg.id}
            className={`max-w-xs p-2 rounded ${
              msg.direction === "inbound"
                ? "bg-gray-200 self-start"
                : "bg-green-200 self-end"
            }`}
          >
            {msg.message}
          </div>
        ))}
      </div>

      <form
        action={`/api/admin/reply`}
        method="POST"
        className="p-4 border-t flex"
      >
        <input type="hidden" name="phone" value={phone} />
        <input
          name="message"
          className="flex-1 border p-2 rounded"
          placeholder="Type message..."
        />
        <button
          type="submit"
          className="ml-2 bg-green-500 text-white px-4 rounded"
        >
          Send
        </button>
      </form>
    </div>
  );
}