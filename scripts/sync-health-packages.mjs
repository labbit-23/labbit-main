#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.resolve(ROOT, "lib/data/health-packages.json");

const REMOTE_URL =
  process.env.HEALTH_PACKAGES_SOURCE_URL ||
  process.env.WEBSITE_HEALTH_PACKAGES_URL ||
  "";

const LOCAL_SOURCE_PATH =
  process.env.HEALTH_PACKAGES_SOURCE_PATH ||
  process.env.WEBSITE_HEALTH_PACKAGES_SOURCE_PATH ||
  "/Users/pav/projects/sdrc-website/data/health-packages.json";

async function readJsonFromRemote(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Remote fetch failed: ${res.status}`);
  return res.json();
}

async function readJsonFromFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeTarget(json) {
  const serialized = `${JSON.stringify(json, null, 2)}\n`;
  await fs.writeFile(TARGET, serialized, "utf8");
}

function validateShape(json) {
  if (!json || typeof json !== "object") throw new Error("Invalid JSON root");
  if (!Array.isArray(json.packages)) throw new Error("Missing packages[]");
  if (!json.testCategoryMap || typeof json.testCategoryMap !== "object") {
    throw new Error("Missing testCategoryMap");
  }
}

async function main() {
  let source = "";
  let data = null;
  const errors = [];

  if (REMOTE_URL) {
    try {
      data = await readJsonFromRemote(REMOTE_URL);
      source = `remote:${REMOTE_URL}`;
    } catch (err) {
      errors.push(`remote failed: ${err?.message || String(err)}`);
    }
  }

  if (!data) {
    try {
      data = await readJsonFromFile(LOCAL_SOURCE_PATH);
      source = `file:${LOCAL_SOURCE_PATH}`;
    } catch (err) {
      errors.push(`file failed: ${err?.message || String(err)}`);
    }
  }

  if (!data) {
    throw new Error(`No source succeeded. ${errors.join(" | ")}`);
  }

  validateShape(data);
  await writeTarget(data);

  console.log(`[sync-health-packages] updated ${TARGET}`);
  console.log(`[sync-health-packages] source=${source}`);
  if (errors.length) {
    console.log(`[sync-health-packages] fallbacks: ${errors.join(" | ")}`);
  }
}

main().catch((err) => {
  console.error(`[sync-health-packages] error: ${err?.message || String(err)}`);
  process.exit(1);
});
