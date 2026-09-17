#!/usr/bin/env node
/** Copy clips/today.json → clips/days/YYYY-MM-DD.json and rebuild history.json. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TODAY = path.join(ROOT, "clips", "today.json");
const DAYS = path.join(ROOT, "clips", "days");
const HIST = path.join(ROOT, "clips", "history.json");

function slimClip(c) {
  return {
    id: c.id,
    category: c.category,
    topic_zh: c.topic_zh || "",
    topic_en: c.topic_en || "",
    text_zh: c.text_zh || "",
    text_en_b1: c.text_en_b1 || "",
    text_en_b2: c.text_en_b2 || "",
    text_en_c1: c.text_en_c1 || "",
    text_en_c2: c.text_en_c2 || "",
    source_url: c.source_url || "",
    source_hint: c.source_hint || "",
  };
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.warn("skip", p, e.message);
    return null;
  }
}

fs.mkdirSync(DAYS, { recursive: true });

const today = readJson(TODAY);
if (today && today.date && Array.isArray(today.clips) && today.clips.length) {
  const dest = path.join(DAYS, today.date + ".json");
  fs.writeFileSync(dest, JSON.stringify({
    date: today.date,
    source: today.source || "ai",
    clips: today.clips.map(slimClip),
  }, null, 2) + "\n");
  console.log("archived", dest);
}

const byDate = new Map();

const histOld = readJson(HIST);
if (histOld && Array.isArray(histOld.days)) {
  for (const d of histOld.days) {
    if (d && d.date && Array.isArray(d.clips) && d.clips.length) byDate.set(d.date, d);
  }
}

for (const name of fs.readdirSync(DAYS)) {
  if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
  const pack = readJson(path.join(DAYS, name));
  if (pack && pack.date && Array.isArray(pack.clips) && pack.clips.length) {
    byDate.set(pack.date, {
      date: pack.date,
      source: pack.source || "ai",
      clips: pack.clips.map(slimClip),
    });
  }
}

if (today && today.date && Array.isArray(today.clips) && today.clips.length) {
  byDate.set(today.date, {
    date: today.date,
    source: today.source || "ai",
    clips: today.clips.map(slimClip),
  });
}

const days = [...byDate.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 45);
const updated = days[0] ? days[0].date : new Date().toISOString().slice(0, 10);
fs.writeFileSync(HIST, JSON.stringify({ updated, days }, null, 2) + "\n");
console.log("history.json days=", days.length, days.map((d) => d.date).slice(0, 8).join(","));
