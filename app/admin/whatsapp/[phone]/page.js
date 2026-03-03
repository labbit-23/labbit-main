import { redirect } from "next/navigation";

export default async function LegacyWhatsappPhonePage({ params }) {
  const { phone } = await params;
  const query = phone ? `?phone=${encodeURIComponent(phone)}` : "";
  redirect(`/admin/whatsapp${query}`);
}

