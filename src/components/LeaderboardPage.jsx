import React, { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5050";
const LS_KEY = "hh_summary_v1";

function thisWeekUTCRange() {
  const now = new Date();
  const dow = now.getUTCDay();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow, 0, 0, 0));
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { startISO: iso(start), endISO: iso(end) };
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

const PTS = { steps10k: 5, hydration100: 5, medsAll: 8, goal100: 10 };
function dailyFlags(doc = {}) {
  const steps10k = (doc.steps || 0) >= 10000;
  const hydration100 = (doc.hydrationPct || 0) >= 100;
  const medsAll = (doc.medsTotal || 0) > 0 && (doc.medsTaken || 0) >= (doc.medsTotal || 0);
  const goal100 = (doc.dailyGoalPct || doc.weeklyGoalPct || 0) >= 100;
  return { steps10k, hydration100, medsAll, goal100 };
}
function dailyPoints(doc = {}) {
  const f = dailyFlags(doc);
  return (f.steps10k ? PTS.steps10k : 0)
       + (f.hydration100 ? PTS.hydration100 : 0)
       + (f.medsAll ? PTS.medsAll : 0)
       + (f.goal100 ? PTS.goal100 : 0);
}

function hydrationTargetOz(patient) {
  const g = (patient?.gender || "").toLowerCase();
  if (g === "male") return 104;
  if (g === "female") return 72;
  return 88;
}
function fmt(n) {
  try { return Intl.NumberFormat().format(Math.round(n ?? 0)); }
  catch { return String(Math.round(n ?? 0)); }
}
function displayNameOf(patient) {
  const n = patient?.name?.[0];
  const text = n?.text;
  const structured = [Array.isArray(n?.given) ? n.given.join(" ") : null, n?.family]
    .filter(Boolean)
    .join(" ");
  return text || structured || "—";
}

export default function Leaderboard({ patient }) {
  const pid = patient?.id;
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState({ name: "—", steps: 0, waterOz: 0, points: 0 });

  const name = useMemo(() => displayNameOf(patient), [patient]);

  useEffect(() => {
    if (!pid) return;
    let ignore = false;

    (async () => {
      setLoading(true);
      const { startISO, endISO } = thisWeekUTCRange();
      const targetOz = hydrationTargetOz(patient);

      try {
        const r = await fetch(`${API_BASE}/api/daily/${encodeURIComponent(pid)}`);
        const docs = r.ok ? await r.json() : [];

        const weekDocs = docs.filter(d => d.date >= startISO && d.date <= endISO);
        const stepsTotal = weekDocs.reduce((s, d) => s + (d.steps || 0), 0);
        const waterOzTotal = weekDocs.reduce((s, d) => s + ((d.hydrationPct || 0) / 100) * targetOz, 0);
        const pointsTotal = weekDocs.reduce((s, d) => s + dailyPoints(d), 0);

        const tISO = todayISO();
        const tDoc = docs.find(d => d.date === tISO);
        if (tDoc) {
          const stampKey = `hh_points_claim_${pid}_${tISO}`;
          let claimed = {};
          try { claimed = JSON.parse(localStorage.getItem(stampKey) || "{}"); } catch {}

          const flags = dailyFlags(tDoc);
          const candidates = [
            { id: "steps10k", ok: flags.steps10k, pts: PTS.steps10k, title: "Walk 10,000 steps" },
            { id: "hydration100", ok: flags.hydration100, pts: PTS.hydration100, title: "Hit 100% hydration" },
            { id: "medsAll", ok: flags.medsAll, pts: PTS.medsAll, title: "Take all medications today" },
            { id: "goal100", ok: flags.goal100, pts: PTS.goal100, title: "Daily goal at 100%" },
          ];
          let wrote = false;
          for (const c of candidates) {
            if (!c.ok || claimed[c.id]) continue;
            try {
              await fetch(`${API_BASE}/api/rewards/${encodeURIComponent(pid)}/earn`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ points: c.pts, reason: c.title, date: tISO, source: "leaderboard-auto" }),
              });
              claimed[c.id] = true;
              wrote = true;
            } catch {}
          }
          if (wrote) localStorage.setItem(stampKey, JSON.stringify(claimed));
        }

        if (!ignore) {
          let steps = stepsTotal;
          let water = waterOzTotal;
          let points = pointsTotal;

          if (steps === 0 && water === 0 && points === 0 && docs.length === 0) {
            const demo = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch { return null; } })();
            if (demo) {
              steps = Number(demo.steps || 0);
              water = ((Number(demo.hydrationPct || 0) / 100) * targetOz);
              points = 0;
            }
          }

          setRow({
            name,
            steps: Math.max(0, Math.round(steps)),
            waterOz: Math.max(0, Math.round(water)),
            points: Math.max(0, Math.round(points)),
          });
        }
      } catch {
        if (!ignore) setRow({ name, steps: 0, waterOz: 0, points: 0 });
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => { ignore = true; };
  }, [pid, patient, name]);

  return (
    <section className="summary" style={{ marginTop: 0 }}>
      <h2 className="summary__title">Leaderboard</h2>
      <p className="summary__subtitle">Compete with friends and keep each other motivated.</p>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel__header"><h3>Invite a friend</h3></div>
        <div style={{ display: "flex", gap: 10 }}>
          <input className="input" type="email" placeholder="friend@email.com" style={{ flex: 1 }} />
          <button className="chip">Send invite</button>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel__header"><h3>This week (Sun–Sat)</h3></div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Rank</th>
              <th style={th}>Name</th>
              <th style={th}>Steps (total)</th>
              <th style={th}>Water (oz, total)</th>
              <th style={th}>Points (total)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}>1</td>
              <td style={td}>{row.name}</td>
              <td style={td}>{loading ? "…" : fmt(row.steps)}</td>
              <td style={td}>{loading ? "…" : fmt(row.waterOz)}</td>
              <td style={td}>{loading ? "…" : fmt(row.points)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

const th = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #eaeaea",
  fontWeight: 700,
  fontSize: 14,
};
const td = {
  padding: "10px 8px",
  borderBottom: "1px solid #f1f1f1",
  fontSize: 14,
};
