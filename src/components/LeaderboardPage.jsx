import React, { useEffect, useMemo, useState } from "react";
import { findPatient } from "../fhirService";

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
function partyKeyFor(pid) {
  return pid ? `hh_party_members_${pid}` : "hh_party_members_demo";
}
export default function Leaderboard({ patient }) {
  const pid = patient?.id;
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState({ name: "—", steps: 0, waterOz: 0, points: 0 });
  const [partyMembers, setPartyMembers] = useState([]);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
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
  useEffect(() => {
    if (!pid) return;
    try {
      const raw = localStorage.getItem(partyKeyFor(pid));
      if (!raw) {
        setPartyMembers([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setPartyMembers(parsed);
      } else {
        setPartyMembers([]);
      }
    } catch {
      setPartyMembers([]);
    }
  }, [pid]);

  useEffect(() => {
    if (!pid || !partyMembers.length) return;
    let ignore = false;

    (async () => {
      const { startISO, endISO } = thisWeekUTCRange();

      try {
        const updated = await Promise.all(
          partyMembers.map(async (m) => {
            try {
              const r = await fetch(
                `${API_BASE}/api/daily/${encodeURIComponent(m.id)}`
              );
              const docs = r.ok ? await r.json() : [];

              const weekDocs = docs.filter(
                (d) => d.date >= startISO && d.date <= endISO
              );
              const stepsTotal = weekDocs.reduce(
                (s, d) => s + (d.steps || 0),
                0
              );
              const waterOzTotal = weekDocs.reduce(
                (s, d) =>
                  s + ((d.hydrationPct || 0) / 100) * 88,
                0
              );
              const pointsTotal = weekDocs.reduce(
                (s, d) => s + dailyPoints(d),
                0
              );

              return {
                ...m,
                steps: Math.max(0, Math.round(stepsTotal)),
                waterOz: Math.max(0, Math.round(waterOzTotal)),
                points: Math.max(0, Math.round(pointsTotal)),
              };
            } catch {
              return m;
            }
          })
        );

        if (!ignore) {
          setPartyMembers(updated);
          try {
            localStorage.setItem(
              partyKeyFor(pid),
              JSON.stringify(updated)
            );
          } catch {}
        }
      } catch {
      }
    })();

    return () => {
      ignore = true;
    };
  }, [pid, partyMembers.length]);
  async function handleSendInvite() {
    if (!pid) {
      setInviteStatus(
        "Please select a patient before inviting friends."
      );
      return;
    }

    const q = inviteQuery.trim();
    if (!q) {
      setInviteStatus("Please enter a patient's last name or ID.");
      return;
    }

    setInviteStatus("Searching for patient to invite...");
    try {
      const results = await findPatient(q);
      if (!results.length) {
        setInviteStatus("No matching patient found to invite.");
        return;
      }
      const invited = results[0];
      const invitedName = displayNameOf(invited);

      const newMember = {
        id: invited.id,
        name: invitedName,
        steps: 0,
        waterOz: 0,
        points: 0,
      };

      const hostMember = {
        id: pid,
        name,
        steps: 0,
        waterOz: 0,
        points: 0,
      };
      setPartyMembers((prev) => {
        if (prev.some((m) => m.id === newMember.id)) {
          setInviteStatus(
            `${invitedName} is already in your party.`
          );
          return prev;
        }
        const next = [...prev, newMember];
        try {
          localStorage.setItem(
            partyKeyFor(pid),
            JSON.stringify(next)
          );
        } catch {}
        setInviteStatus(
          `${invitedName} has been added to your party leaderboard.`
        );
        return next;
      });
      try {
        const invitedKey = partyKeyFor(invited.id);
        const raw = localStorage.getItem(invitedKey);
        let list = [];
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) list = parsed;
          } catch {
            list = [];
          }
        }
        if (!list.some((m) => m.id === hostMember.id)) {
          list.push(hostMember);
          localStorage.setItem(invitedKey, JSON.stringify(list));
        }
      } catch {
      }

      setInviteQuery("");
    } catch (err) {
      console.error(err);
      setInviteStatus("Invite failed. FHIR search error.");
    }
  }
  function removeMember(memberId) {
    if (!pid) return;
    setPartyMembers((prev) => {
      const next = prev.filter((m) => m.id !== memberId);
      try {
        localStorage.setItem(
          partyKeyFor(pid),
          JSON.stringify(next)
        );
      } catch {}
      return next;
    });
  }

  return (
    <section className="summary" style={{ marginTop: 0 }}>
      <h2 className="summary__title">Leaderboard</h2>
      <p className="summary__subtitle">Compete with friends and keep each other motivated.</p>
      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel__header"><h3>Invite a friend</h3></div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            className="input"
            type="text"
            placeholder="Enter patient last name or ID to invite"
            style={{ flex: 1 }}
            value={inviteQuery}
            onChange={(e) => setInviteQuery(e.target.value)}
          />
          <button
            className="chip"
            type="button"
            onClick={handleSendInvite}
          >
            Send invite
          </button>
        </div>
        {inviteStatus && (
          <p style={{ marginTop: 8, fontSize: 12 }}>{inviteStatus}</p>
        )}
      </div>  
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel__header">
          <h3>This week (Sun–Sat)</h3>
        </div>
        <table
          style={{ width: "100%", borderCollapse: "collapse" }}
        >
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
            {(() => {
              const combined = [
                {
                  id: pid,
                  name: row.name,
                  steps: row.steps,
                  waterOz: row.waterOz,
                  points: row.points,
                  isHost: true,
                },
                ...partyMembers.map((m) => ({
                  ...m,
                  isHost: false,
                })),
              ];
              combined.sort(
                (a, b) => (b.points || 0) - (a.points || 0)
              );

              return combined.map((m, idx) => (
                <tr key={m.id || idx}>                
                  <td style={td}>{idx + 1}</td>

                  
                  <td style={td}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span>
                        {m.name}
                        {m.isHost && (
                          <span
                            style={{
                              marginLeft: 6,
                              color: "#4caf50",
                              fontWeight: 600,
                            }}
                          >
                            (You)
                          </span>
                        )}
                      </span>

                      {!m.isHost && (
                        <button
                          type="button"
                          className="chip"
                          style={{
                            padding: "2px 8px",
                            fontSize: 11,
                          }}
                          onClick={() => removeMember(m.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>

                  <td style={td}>{fmt(m.steps ?? 0)}</td>
                  <td style={td}>{fmt(m.waterOz ?? 0)}</td>
                  <td style={td}>{fmt(m.points ?? 0)}</td>
                </tr>
              ));
            })()}
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
