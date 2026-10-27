"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { useUser } from "@/app/context/UserContext";
import { canSeeMarketing } from "@/lib/marketingUi/helpers";
import "@/components/marketing/marketing.css";

const ENGINE_TABS = [
  ["/marketing", "Overview"], ["/marketing/campaigns", "Campaigns"], ["/marketing/audience", "Audience"], ["/marketing/offers", "Offers"], ["/marketing/audit", "Audit log"]
];
const BOT_TABS = [["/marketing/tracker", "Patient tracker"], ["/marketing/inbox", "Staff inbox"], ["/marketing/bot", "Bot settings"]];

function Shell({ children }) {
  const { user } = useUser();
  const path = usePathname() || "";
  const engine = canSeeMarketing(user);
  const tabs = [...(engine ? ENGINE_TABS : []), ...BOT_TABS];
  const on = (href) => (href === "/marketing" ? path === "/marketing" : path.startsWith(href));
  return (
    <div className="mk">
      <h1>Marketing</h1>
      <p className="mk-sub">Labit Hub &middot; campaigns, audience, bot and inbox</p>
      <nav className="mk-nav" aria-label="Marketing sections">
        {tabs.map(([href, label]) => <Link key={href} href={href} className={on(href) ? "on" : ""}>{label}</Link>)}
      </nav>
      {!engine && !BOT_TABS.some(([h]) => on(h)) ? (
        <div className="mk-note bad">Campaign tools are limited to director and admin accounts (or users added to MARKETING_ADMIN_USERS). Use the tabs above for the bot, inbox and tracker.</div>
      ) : children}
    </div>
  );
}

export default function MarketingLayout({ children }) {
  return <RequireAuth roles={["director", "admin", "manager"]}><Shell>{children}</Shell></RequireAuth>;
}
