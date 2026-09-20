// Resolves the app's "@/..." path alias (jsconfig.json) for plain `node
// --test` runs -- Next.js/webpack understand this alias at build time,
// but the source files themselves (e.g. lib/appAuth/*) use it directly,
// so tests importing them unmodified need the same resolution. No test
// framework/dependency added; this is ~10 lines using Node's built-in
// module customization hooks (node:module `register`).
import { pathToFileURL } from "node:url";
import path from "node:path";

const rootUrl = pathToFileURL(path.resolve(import.meta.dirname, "..") + "/").href;

export async function resolve(specifier, context, nextResolve) {
  const target = specifier.startsWith("@/") ? rootUrl + specifier.slice(2) : specifier;
  // Next.js/webpack resolve extensionless deep imports automatically
  // (both this app's own "@/..." alias and package subpaths like
  // "next/server"); plain Node ESM doesn't, so retry with .js appended.
  try {
    return await nextResolve(target, context);
  } catch (err) {
    if (err?.code === "ERR_MODULE_NOT_FOUND" && !/\.[a-z]+$/i.test(target)) {
      return nextResolve(`${target}.js`, context);
    }
    throw err;
  }
}
