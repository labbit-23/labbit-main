// Live catalogue lookup for package / price questions: public.packages (patient-facing wellness packages) first, then lab_tests
// (patient-visible, priced). Never returns a zero or guessed price.
const LAB_ID = () => String(process.env.DEFAULT_SDRC_LAB_ID || process.env.DEFAULT_LAB_ID || "b539c161-1e2b-480b-9526-d4b37bd37b1e").trim();
const clean = (q) => String(q || "").replace(/[%_,()*\\]/g, " ").trim();

export async function searchCatalog(db, term, max = 3) {
  const q = clean(term);
  const out = [];
  let pk = db.from("packages").select("name,price,group_name").eq("lab_id", LAB_ID()).not("source", "is", null).gt("price", 0);
  if (q.length >= 2) pk = pk.ilike("name", `%${q}%`);
  const { data: pkgs } = await pk.order("display_order", { ascending: true }).limit(max);
  for (const p of pkgs || []) out.push({ kind: "package", name: p.name, price: Math.round(Number(p.price)) });
  if (q.length >= 2 && out.length < max) {
    const { data: tests } = await db.from("lab_tests").select("lab_test_name,price,is_most_popular").eq("lab_id", LAB_ID()).eq("is_active", true).eq("is_patient_visible", true)
      .gt("price", 0).ilike("lab_test_name", `%${q}%`).order("is_most_popular", { ascending: false }).limit(max - out.length);
    for (const t of tests || []) out.push({ kind: "test", name: t.lab_test_name, price: Math.round(Number(t.price)) });
  }
  return out.filter((r) => r.price > 0).slice(0, max);
}
