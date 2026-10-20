// Groups a package's plain-text test names into body systems, using the
// catalog's own testCategoryMap (the same one the website uses). Matching
// ignores case, punctuation and the "*" footnote marker. A test the map
// doesn't know goes under "Other tests" rather than being guessed at.
const norm = (s) => String(s).toLowerCase().replace(/\*/g, "").replace(/[^a-z0-9]/g, "");

// `testCategoryMap` is the catalog JSON's own { testName: category } map; the
// caller passes it in (route imports the JSON, tests read the file).
export function groupTestsBySystem(testNames, testCategoryMap) {
  const CATEGORY_BY_TEST = new Map(Object.entries(testCategoryMap || {}).map(([name, cat]) => [norm(name), cat]));
  const order = [];
  const bySystem = new Map();
  for (const name of testNames) {
    const system = CATEGORY_BY_TEST.get(norm(name)) || "Other tests";
    if (!bySystem.has(system)) { bySystem.set(system, []); order.push(system); }
    bySystem.get(system).push(String(name).replace(/\*/g, "").trim());
  }
  // "Other tests" always last; the rest keep the package's own order.
  order.sort((a, b) => (a === "Other tests") - (b === "Other tests"));
  return order.map((system) => ({ system, tests: bySystem.get(system) }));
}
