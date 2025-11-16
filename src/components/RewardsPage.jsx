import React, { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5050";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function currentWeekUTCRange() {
  const now = new Date();
  const day = now.getUTCDay();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day, 0, 0, 0));
  const labels = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    labels.push({ iso, label: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][i] });
  }
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  return { startISO: labels[0].iso, endISO: labels[6].iso, labels };
}
function fmtNumber(n) { try { return Intl.NumberFormat().format(n); } catch { return String(n); } }
function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  const i = (s) => (s ? s[0].toUpperCase() : "");
  if (!parts.length) return "U";
  if (parts.length === 1) return i(parts[0]);
  return i(parts[0]) + i(parts[parts.length - 1]);
}
function getPatientName(patient) {
  const n = patient?.name?.[0];
  if (!n) return "";
  const text = n.text;
  const structured = [Array.isArray(n.given) ? n.given.join(" ") : null, n.family]
    .filter(Boolean)
    .join(" ");
  return text || structured || "";
}

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
function weekPoints(docs, startISO, endISO) {
  return (docs || [])
    .filter(d => d.date >= startISO && d.date <= endISO)
    .reduce((sum, d) => sum + dailyPoints(d), 0);
}

function pct(value, goal) {
  if (!goal || value == null) return 0;
  return Math.max(0, Math.min(100, Math.round((value / goal) * 100)));
}
function prettySteps(n) {
  if (n >= 1_000_000) return `${n / 1_000_000}M steps`;
  if (n >= 1000) return `${n / 1000}k steps`;
  return `${n} steps`;
}
function nextMilestone(current = 0, milestones = []) {
  return milestones.find((m) => current < m) ?? null;
}
function getBadgeImage(id) {
  const map = {
    "steps-100000": `${process.env.PUBLIC_URL}/badges/steps-100000.png`,
    "steps-500000": `${process.env.PUBLIC_URL}/badges/steps-500000.png`,
    "steps-1000000": `${process.env.PUBLIC_URL}/badges/steps-1000000.png`,
    "streak30": `${process.env.PUBLIC_URL}/badges/streak-30.png`,
    "streak365": `${process.env.PUBLIC_URL}/badges/streak-365.png`,
    default: `${process.env.PUBLIC_URL}/badges/default-badge.png`,
  };
  return map[id] || map.default;
}

export default function RewardsPage({ patient, onBack }) {
  const pid = patient?.id;

  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);      
  const [today, setToday] = useState({});  
  const [weeklyPts, setWeeklyPts] = useState(0);
  const [tab, setTab] = useState("challenges");

  const profile = useMemo(() => {
    const displayName = getPatientName(patient) || "User";
    return { name: displayName };
  }, [patient]);

  const refreshDaily = async () => {
    if (!pid) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/daily/${encodeURIComponent(pid)}`);
      const rows = r.ok ? await r.json() : [];
      setDocs(rows);

      const tStr = todayISO();
      const tDoc = rows.find(d => d.date === tStr) || {};
      setToday({
        steps: tDoc.steps ?? 0,
        hydrationPct: tDoc.hydrationPct ?? 0,
        medsTaken: tDoc.medsTaken ?? 0,
        medsTotal: tDoc.medsTotal ?? 0,
        dailyGoalPct: (tDoc.dailyGoalPct ?? tDoc.weeklyGoalPct ?? 0),
      });

      const { startISO, endISO } = currentWeekUTCRange();
      setWeeklyPts(weekPoints(rows, startISO, endISO));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshDaily(); }, [pid]);

  useEffect(() => {
    if (!pid) return;
    const dateKey = todayISO();
    const stampKey = `hh_points_claim_${pid}_${dateKey}`;
    let claimed = {};
    try { claimed = JSON.parse(localStorage.getItem(stampKey) || "{}"); } catch {}

    const f = dailyFlags(today);
    const candidates = [
      { id: "steps10k", ok: f.steps10k, pts: PTS.steps10k, title: "Walk 10,000 steps" },
      { id: "hydration100", ok: f.hydration100, pts: PTS.hydration100, title: "Hit 100% hydration" },
      { id: "medsAll", ok: f.medsAll, pts: PTS.medsAll, title: "Take all medications today" },
      { id: "goal100", ok: f.goal100, pts: PTS.goal100, title: "Daily goal at 100%" },
    ];

    (async () => {
      let wrote = false;
      for (const c of candidates) {
        if (!c.ok || claimed[c.id]) continue;
        try {
          await fetch(`${API_BASE}/api/rewards/${encodeURIComponent(pid)}/earn`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ points: c.pts, reason: c.title, date: dateKey, source: "rewards-auto" }),
          });
          claimed[c.id] = true;
          wrote = true;
        } catch {}
      }
      if (wrote) {
        localStorage.setItem(stampKey, JSON.stringify(claimed));
        refreshDaily();
      }
    })();
  }, [pid, today]);
  
  const flags = dailyFlags(today);
  const challenges = [
    { id: "steps10k", title: "Walk 10,000 steps", footnote: `${fmtNumber(today.steps)} today`, done: flags.steps10k, points: PTS.steps10k },
    { id: "hydration100", title: "Hit 100% hydration", footnote: `${today.hydrationPct ?? 0}%`, done: flags.hydration100, points: PTS.hydration100 },
    {
      id: "medsAll",
      title: "Take all medications today",
      footnote: today.medsTotal > 0 ? `${today.medsTaken || 0}/${today.medsTotal} taken` : "No active meds",
      done: flags.medsAll,
      points: PTS.medsAll,
    },
    { id: "goal100", title: "Daily goal at 100%", footnote: `${today.dailyGoalPct ?? 0}%`, done: flags.goal100, points: PTS.goal100 },
  ];

  const stepsTotal = (docs || []).reduce((acc, d) => acc + (d.steps || 0), 0);
  const STREAK_MILESTONES = [7, 14, 30, 90, 180, 365];
  const STEP_MILESTONES  = [100_000, 500_000, 1_000_000];
  const HYDRATION_MILESTONES = [7, 30, 90];
  const MED_MILESTONES = [7, 30, 90];
  const GOAL100_MILESTONES = [7, 30, 90];

  const longestStreakDays = 0;
  const hydrationPerfectDays = 0;
  const medPerfectDays = 0;
  const goal100Days = 0;

  const nextStep  = nextMilestone(stepsTotal, STEP_MILESTONES);
  const nextStreak = nextMilestone(longestStreakDays, STREAK_MILESTONES);
  const nextHydr = nextMilestone(hydrationPerfectDays, HYDRATION_MILESTONES);
  const nextMed  = nextMilestone(medPerfectDays, MED_MILESTONES);
  const nextGoal = nextMilestone(goal100Days, GOAL100_MILESTONES);

  const achievedStepMilestones = STEP_MILESTONES.filter((m) => stepsTotal >= m);
  const badges = [
    ...achievedStepMilestones.map((m) => ({
      id: `steps-${m}`,
      title: prettySteps(m),
      img: getBadgeImage(`steps-${m}`),
    })),
    ...(longestStreakDays >= 30 ? [{ id: "streak30", title: "30-day streak", img: getBadgeImage("streak30") }] : []),
    ...(longestStreakDays >= 365 ? [{ id: "streak365", title: "365-day streak", img: getBadgeImage("streak365") }] : []),
  ];

  return (
    <section className="summary" style={{ marginTop: 8 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <div
          style={{
            width: 54, height: 54, borderRadius: "50%", background: "#e6f5ec",
            display: "grid", placeItems: "center", fontWeight: 800,
          }}
          aria-hidden
        >
          {initials(profile.name)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{profile.name}</div>
          <div className="muted">{profile.level}</div>
        </div>
        <div className="summary__actions" style={{ gap: 10 }}>
          <div className="chip" title="Weekly points (Sun–Sat)">
            Points (this week): <strong style={{ marginLeft: 6 }}>{fmtNumber(weeklyPts)}</strong>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, margin: "6px 0 14px" }}>
        <button className={`tab ${tab === "challenges" ? "tab--active" : ""}`} onClick={() => setTab("challenges")}>
          Challenges
        </button>
        <button className={`tab ${tab === "achievements" ? "tab--active" : ""}`} onClick={() => setTab("achievements")}>
          Achievements
        </button>
      </div>

      <div className="panel">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : tab === "challenges" ? (
          <>
            <h3 style={{ marginBottom: 10 }}>Daily Challenges</h3>
            <ul className="activity" style={{ gap: 10 }}>
              {challenges.map((c) => (
                <li key={c.id} className="activity__item" style={{ alignItems: "center", justifyContent: "space-between", display: "flex", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                    <span className="dot" />
                    <div>
                      <div className="activity__text">{c.title}</div>
                      <div className="activity__when">
                        {c.footnote || ""}{c.footnote ? " • " : ""}<span>+{c.points} pts</span>
                      </div>
                    </div>
                  </div>
                  <StatusRight done={c.done} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            {/* Badges */}
            <div className="tile" style={{ marginBottom: 16 }}>
              <div className="tile__title" style={{ marginBottom: 10 }}>Achieved badges</div>
              {badges.length ? <BadgeGrid badges={badges} /> : <p className="muted">No badges yet — keep going!</p>}
            </div>

            <h3 style={{ marginBottom: 10 }}>Lifetime Achievements</h3>

            <MilestoneTile
              title="Next steps milestone"
              subtitle={`${fmtNumber(stepsTotal)} steps lifetime`}
              label={nextStep ? prettySteps(nextStep) : "All milestones completed 🎉"}
              pct={nextStep ? pct(stepsTotal, nextStep) : 100}
              detailsTitle="Show all step milestones"
              items={STEP_MILESTONES.map((m) => ({
                key: m,
                primary: prettySteps(m),
                secondary: `${fmtNumber(stepsTotal)} / ${fmtNumber(m)} steps`,
                done: stepsTotal >= m,
              }))}
            />
            <MilestoneTile
              title="Next streak milestone"
              subtitle={`Longest: ${longestStreakDays} days`}
              label={nextStreak ? `${fmtNumber(nextStreak)}-day streak` : "All streak milestones completed 🎉"}
              pct={nextStreak ? pct(longestStreakDays, nextStreak) : 100}
              detailsTitle="Show all streak milestones"
              items={STREAK_MILESTONES.map((m) => ({
                key: m,
                primary: `${fmtNumber(m)}-day streak`,
                secondary: `Longest: ${longestStreakDays} / ${m} days`,
                done: longestStreakDays >= m,
              }))}
            />
            <MilestoneTile
              title="Hydration (perfect days)"
              subtitle={`${fmtNumber(hydrationPerfectDays)} perfect days`}
              label={nextHydr ? `${fmtNumber(nextHydr)} days` : "All hydration milestones completed 🎉"}
              pct={nextHydr ? pct(hydrationPerfectDays, nextHydr) : 100}
              detailsTitle="Show hydration milestones"
              items={HYDRATION_MILESTONES.map((m) => ({
                key: m,
                primary: `${fmtNumber(m)} perfect days`,
                secondary: `${hydrationPerfectDays} / ${m} days`,
                done: hydrationPerfectDays >= m,
              }))}
            />
            <MilestoneTile
              title="Medication adherence (perfect days)"
              subtitle={`${fmtNumber(medPerfectDays)} perfect days`}
              label={nextMed ? `${fmtNumber(nextMed)} days` : "All medication milestones completed 🎉"}
              pct={nextMed ? pct(medPerfectDays, nextMed) : 100}
              detailsTitle="Show medication milestones"
              items={MED_MILESTONES.map((m) => ({
                key: m,
                primary: `${fmtNumber(m)} perfect days`,
                secondary: `${medPerfectDays} / ${m} days`,
                done: medPerfectDays >= m,
              }))}
            />
            <MilestoneTile
              title="Daily goal at 100% (days)"
              subtitle={`${fmtNumber(goal100Days)} days at 100%`}
              label={nextGoal ? `${fmtNumber(nextGoal)} days` : "All goal milestones completed 🎉"}
              pct={nextGoal ? pct(goal100Days, nextGoal) : 100}
              detailsTitle="Show goal milestones"
              items={GOAL100_MILESTONES.map((m) => ({
                key: m,
                primary: `${fmtNumber(m)} days at 100%`,
                secondary: `${goal100Days} / ${m} days`,
                done: goal100Days >= m,
              }))}
            />
          </>
        )}
      </div>
    </section>
  );
}

function StatusRight({ done }) {
  return done ? (
    <span className="chip" style={chipDone} aria-label="Completed" title="Completed">
      <Dot color="#2f9e44">✓</Dot> Done
    </span>
  ) : (
    <span className="chip" style={chipTodo} aria-label="Not done" title="Not done">
      <Dot color="#c92a2a">✗</Dot> Not done
    </span>
  );
}
const chipDone = {
  background: "#e9f6ef", borderColor: "#cdebdc", color: "#0f5b2d",
  fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, minWidth: 110, justifyContent: "center",
};
const chipTodo = {
  background: "#fff5f5", borderColor: "#f2cccc", color: "#8a1f1f",
  fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, minWidth: 110, justifyContent: "center",
};
function Dot({ color = "#2f9e44", children }) {
  return (
    <span
      style={{
        width: 16, height: 16, borderRadius: "50%", background: color,
        display: "inline-grid", placeItems: "center", color: "white",
        fontSize: 12, lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

function BadgeGrid({ badges }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 14 }}>
      {badges.map((b) => (
        <div key={b.id} className="panel" style={{ padding: 12, textAlign: "center" }} title={b.title}>
          <div
            style={{
              width: 72, height: 72, borderRadius: 16, margin: "0 auto 8px",
              background: "#f7fbf8", display: "grid", placeItems: "center", overflow: "hidden",
              border: "1px solid #e6efe9",
            }}
          >
            <img src={b.img} alt="" style={{ width: 64, height: 64, objectFit: "contain" }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{b.title}</div>
        </div>
      ))}
    </div>
  );
}

function MilestoneTile({ title, subtitle, label, pct, detailsTitle, items }) {
  return (
    <div className="tile" style={{ marginBottom: 16 }}>
      <div className="tile__title">{title}</div>
      <div className="tile__value" style={{ fontSize: 22 }}>{label}</div>
      {subtitle ? <div className="tile__note">{subtitle}</div> : null}
      <div style={{ marginTop: 10 }}>
        <ProgressBar pct={pct} />
      </div>
      <details style={{ marginTop: 12 }}>
        <summary className="link-btn">{detailsTitle}</summary>
        <ul className="activity" style={{ marginTop: 10 }}>
          {items.map((it) => (
            <li key={it.key} className="activity__item" style={{ alignItems: "center" }}>
              <span className="dot" />
              <div style={{ flex: 1 }}>
                <div className="activity__text">{it.primary}</div>
                <div className="activity__when">{it.secondary}</div>
              </div>
              <StatusRight done={it.done} />
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ProgressBar({ pct = 0 }) {
  return (
    <div className="bar">
      <div className="bar__fill" style={{ width: `${pct}%` }} />
      <div className="bar__label">{pct}%</div>
    </div>
  );
}
