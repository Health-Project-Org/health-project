const BASE = process.env.REACT_APP_API_BASE || "http://localhost:5050";

function clampPct(n) {
  const v = Math.round(Number(n) || 0);
  return Math.max(0, Math.min(100, v));
}

function mapLogFromServer(doc) {
  if (!doc) return null;
  return { ...doc, dailyGoalPct: doc.weeklyGoalPct ?? doc.dailyGoalPct ?? 0 };
}

function toServerPayload(payload = {}) {
  const p = { ...payload };
  if (Object.prototype.hasOwnProperty.call(p, "dailyGoalPct")) {
    p.weeklyGoalPct = clampPct(p.dailyGoalPct);
    delete p.dailyGoalPct;
  }
  return p;
}

export async function getToday(patientId) {
  const r = await fetch(`${BASE}/api/daily/${encodeURIComponent(patientId)}`);
  const all = await r.json();
  const today = new Date().toISOString().slice(0, 10);
  const doc = all.find((d) => d.date === today) || null;
  return mapLogFromServer(doc);
}

export async function initToday(patientId, payload = {}) {
  const r = await fetch(`${BASE}/api/daily/${encodeURIComponent(patientId)}/today`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toServerPayload(payload)),
  });
  const doc = await r.json();
  return mapLogFromServer(doc);
}

export async function patchToday(patientId, payload) {
  const r = await fetch(`${BASE}/api/daily/${encodeURIComponent(patientId)}/today`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toServerPayload(payload)),
  });
  const doc = await r.json();
  return mapLogFromServer(doc);
}

export async function getRange(patientId, from, to) {
  const q = new URLSearchParams({ from, to });
  const r = await fetch(`${BASE}/api/daily/${encodeURIComponent(patientId)}?${q.toString()}`);
  const rows = await r.json();
  return (rows || []).map(mapLogFromServer);
}

export async function getDailyGoalPct(patientId) {
  const doc = await getToday(patientId);
  return doc?.dailyGoalPct ?? 0;
}

export async function setDailyGoalPct(patientId, pct) {
  const todayDoc = await getToday(patientId);
  const val = clampPct(pct);
  if (!todayDoc) {
    return initToday(patientId, { dailyGoalPct: val });
  }
  return patchToday(patientId, { dailyGoalPct: val });
}

export async function bumpDailyGoalPct(patientId, delta) {
  const current = await getDailyGoalPct(patientId);
  const next = clampPct((current || 0) + (Number(delta) || 0));
  return setDailyGoalPct(patientId, next);
}

export async function getDailyGoalSeries(patientId, from, to) {
  const rows = await getRange(patientId, from, to);
  return (rows || []).map((d) => ({
    date: d.date,
    pct: (d.dailyGoalPct ?? d.weeklyGoalPct ?? 0),
  }));
}

export async function getRewards(patientId) {
  const r = await fetch(`${BASE}/api/rewards/${encodeURIComponent(patientId)}`);
  return r.json();
}

export async function earnPoints(patientId, payload) {
  const r = await fetch(`${BASE}/api/rewards/${encodeURIComponent(patientId)}/earn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function getLeaderboardWeekly() {
  const r = await fetch(`${BASE}/api/leaderboard/weekly`);
  return r.json();
}
