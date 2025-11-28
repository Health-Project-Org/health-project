import React, { useEffect, useMemo, useState } from "react";
import { getObservations, getConditions, getMedications } from "../fhirService";
import { getToday, initToday, patchToday, getDailyGoalSeries } from "../api";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const LS_KEY = "hh_summary_v1";
const HTN_SNOMED = ["38341003"];        // Hypertension
const PREDIAB_SNOMED = ["15777000"];    // Prediabetes
const OBESITY_SNOMED = ["414916001"];   // Obesity
const HYPERLIPID_SNOMED = ["55822004"]; // Hyperlipidemia
const CVD_SNOMED = [
  "53741008",   // Coronary artery disease
  "413444003", // Ischemic heart disease
];

function hydrationBaseTargetOz(patient) {
  const g = (patient?.gender || "").toLowerCase();
  if (g === "male") return 104;
  if (g === "female") return 72;
  return 88;
}
function clamp0to100(v) { return Math.max(0, Math.min(100, Math.round(v ?? 0))); }
function formatNumber(n) { try { return Intl.NumberFormat().format(n); } catch { return String(n); } }
function safeParse(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }
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

function computePersonalizedTargets(patient, conditions) {
  let stepTarget = 10000;
  const baseHydr = hydrationBaseTargetOz(patient);
  let hydrationOzTarget = baseHydr;

  const conditionCodes =
    conditions
      ?.flatMap((c) => (c.code?.coding || []).map((cd) => cd.code))
      .filter(Boolean) || [];

  const hasHypertension = conditionCodes.some((c) =>
    HTN_SNOMED.includes(c)
  );
  const hasPrediabetes = conditionCodes.some((c) =>
    PREDIAB_SNOMED.includes(c)
  );
  const hasObesity = conditionCodes.some((c) =>
    OBESITY_SNOMED.includes(c)
  );
  const hasHyperlipid = conditionCodes.some((c) =>
    HYPERLIPID_SNOMED.includes(c)
  );
  const hasCVD = conditionCodes.some((c) => CVD_SNOMED.includes(c));

  if (hasHypertension) {
    stepTarget += 1000;
    hydrationOzTarget += 8;
  }
  if (hasPrediabetes) {
    stepTarget += 500;
  }
  if (hasObesity) {
    stepTarget = Math.max(stepTarget, 11000);
  }
  if (hasHyperlipid) {
    stepTarget += 500;
  }
  if (hasCVD) {
    stepTarget = Math.min(stepTarget, 9000);
  }
  stepTarget = Math.min(stepTarget, 12000);
  hydrationOzTarget = Math.min(hydrationOzTarget, baseHydr + 16);

  return { stepTarget, hydrationOzTarget };
}

export default function UnifiedDashboard({ patient }) {
  const [observations, setObservations] = useState([]);
  const [conditions, setConditions] = useState([]);

  const [demo, setDemo] = useState(() => {
    const saved = safeParse(localStorage.getItem(LS_KEY));
    return saved ?? {
      steps: 8200,
      hydrationPct: 68,
      medicationTakenToday: 0,
      medsTotal: 0,
      dailyGoalPct: 76,
    };
  });
  useEffect(() => localStorage.setItem(LS_KEY, JSON.stringify(demo)), [demo]);

  const [targets, setTargets] = useState(() => ({
    stepTarget: 10000,
    hydrationOzTarget: hydrationBaseTargetOz(patient),
  }));

  useEffect(() => {
    if (!patient?.id) return;
    (async () => {
      try {
        let doc = await getToday(patient.id);
        if (!doc) doc = await initToday(patient.id, {});
        setDemo((d) => ({
          ...d,
          steps: doc?.steps ?? 0,
          hydrationPct: doc?.hydrurationPct ?? doc?.hydrationPct ?? 0,
          medicationTakenToday: doc?.medsTaken ?? 0,
          medsTotal: doc?.medsTotal ?? d.medsTotal ?? 0,
          dailyGoalPct: (doc?.dailyGoalPct ?? doc?.weeklyGoalPct ?? 0),
        }));
      } catch { }
    })();
  }, [patient?.id]);

  useEffect(() => {
    if (!patient?.id) return;
    getObservations(patient.id)
      .then(setObservations)
      .catch(() => {});
  }, [patient?.id]);

  useEffect(() => {
    if (!patient?.id) return;
    getConditions(patient.id)
      .then(setConditions)
      .catch(() => setConditions([]));
  }, [patient?.id]);

  useEffect(() => {
    const next = computePersonalizedTargets(patient, conditions);
    setTargets(next);
  }, [patient, conditions]);

  const name = useMemo(() => {
    const n = patient?.name?.[0];
    const text = n?.text;
    const structured = [Array.isArray(n?.given) ? n.given.join(" ") : null, n?.family]
      .filter(Boolean).join(" ");
    return text || structured || "there";
  }, [patient]);

  const fmt = (v, d = 1, dash = "—") =>
    v == null || Number.isNaN(Number(v)) ? dash : Number(v).toFixed(d);

  const byCode = (code) =>
    observations.filter((o) => o.code?.coding?.some((c) => c.code === code));

  const latestQuantityFor = (code) =>
    byCode(code)
      .filter((o) => o.valueQuantity?.value != null)
      .map((o) => ({ when: o.effectiveDateTime || o.issued, value: o.valueQuantity.value }))
      .sort((a, b) => Date.parse(b.when || 0) - Date.parse(a.when || 0))[0]?.value ?? null;

  const bmi = latestQuantityFor("39156-5");
  const latestWeight = latestQuantityFor("29463-7");
  const bpPanel = byCode("85354-9")[0];
  const systolic = bpPanel?.component?.find((c) =>
    c.code?.coding?.some((cd) => cd.code === "8480-6"))?.valueQuantity?.value;
  const diastolic = bpPanel?.component?.find((c) =>
    c.code?.coding?.some((cd) => cd.code === "8462-4"))?.valueQuantity?.value;
  const o2 = latestQuantityFor("2708-6");
  const rr = latestQuantityFor("9279-1");
  const hr = latestQuantityFor("8867-4");

  const [showSteps, setShowSteps] = useState(false);
  const [stepsInput, setStepsInput] = useState("");

  const [showHydr, setShowHydr] = useState(false);
  const [hydrOzInput, setHydrOzInput] = useState("");

  const [showMeds, setShowMeds] = useState(false);
  const [meds, setMeds] = useState({ active: [], past: [] });
  const [loadingMeds, setLoadingMeds] = useState(false);
  const [takenSet, setTakenSet] = useState(new Set());

  useEffect(() => { if (showSteps) setStepsInput(String(demo.steps ?? 0)); }, [showSteps, demo.steps]);
  useEffect(() => {
    if (!showHydr) return;
    const tgt = targets.hydrationOzTarget || hydrationBaseTargetOz(patient);
    const estOz = Math.round(((demo.hydrationPct || 0) / 100) * tgt);
    setHydrOzInput(String(estOz));
  }, [showHydr, patient, demo.hydrationPct, targets.hydrationOzTarget]);

  const submitStepsAbsolute = async (e) => {
    e?.preventDefault();
    const current = Number(demo.steps || 0);
    const val = Number(stepsInput);
    if (!Number.isFinite(val) || val < 0) return;
    const next = Math.round(val);
    const delta = next - current;
    setDemo((d) => ({ ...d, steps: next }));
    setShowSteps(false);
    try { await patchToday(patient.id, { steps: delta }); } catch {}
  };

  const submitHydrationOzAbsolute = async (e) => {
    e?.preventDefault();
    const oz = Number(hydrOzInput);
    if (!Number.isFinite(oz) || oz < 0) return;
    const target = targets.hydrationOzTarget || hydrationBaseTargetOz(patient);
    const pct = clamp0to100(Math.round((oz / target) * 100));
    setDemo((d) => ({ ...d, hydrationPct: pct }));
    setShowHydr(false);
    try { await patchToday(patient.id, { hydrationPct: pct }); } catch {}
  };

  const todayUTC = () => new Date().toISOString().slice(0, 10);
  const adhKey = (pid) => `hh_meds_${pid}_${todayUTC()}`;

  useEffect(() => {
    if (!patient?.id) return;
    (async () => {
      try {
        const m = await getMedications(patient.id);
        const active = (m.active || []).map((x) =>
          typeof x === "string" ? { key: x.toLowerCase(), name: x } : x
        );
        setMeds((prev) => ({ ...prev, active, past: prev.past || [] }));

        const total = active.length;
        setDemo((d) => ({ ...d, medsTotal: total }));
        await patchToday(patient.id, { medsTotal: total });
      } catch {}
    })();
  }, [patient?.id]);

  useEffect(() => {
    if (!patient?.id) return;
    try {
      const raw = localStorage.getItem(adhKey(patient.id));
      const arr = raw ? JSON.parse(raw) : [];
      setTakenSet(new Set(arr));
      setDemo((d) => ({ ...d, medicationTakenToday: Array.isArray(arr) ? arr.length : 0 }));
    } catch { setTakenSet(new Set()); }
  }, [patient?.id, showMeds]);

  useEffect(() => {
    if (!patient?.id) return;
    localStorage.setItem(adhKey(patient.id), JSON.stringify([...takenSet]));
  }, [takenSet, patient?.id]);

  const toggleTaken = (key) =>
    setTakenSet((prev) => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      const taken = s.size;
      setDemo((d) => ({ ...d, medicationTakenToday: taken }));
      patchToday(patient.id, { medsTaken: taken }).catch(() => {});
      return s;
    });

  const markAll = () => {
    const all = new Set(meds.active.map((m) => m.key));
    setTakenSet(all);
    const taken = all.size;
    setDemo((d) => ({ ...d, medicationTakenToday: taken }));
    patchToday(patient.id, { medsTaken: taken }).catch(() => {});
  };
  const resetToday = () => {
    setTakenSet(new Set());
    setDemo((d) => ({ ...d, medicationTakenToday: 0 }));
    patchToday(patient.id, { medsTaken: 0 }).catch(() => {});
  };

  const takenCount = meds.active.filter((m) => takenSet.has(m.key)).length;

  useEffect(() => {
    if (!patient?.id) return;
    patchToday(patient.id, { medsTotal: meds.active.length, medsTaken: takenCount }).catch(() => {});
  }, [patient?.id, meds.active.length, takenCount]);

  useEffect(() => {
    if (!patient?.id) return;

    (async () => {
      try {
        const stepTarget = targets.stepTarget || 10000;
        const hydrTargetPct = 100;

        const stepPct = Math.min(1, (demo.steps || 0) / stepTarget);
        const hydrPct = Math.min(1, (demo.hydrationPct || 0) / hydrTargetPct);

        const W = 100 / 3;
        const totalMeds = meds.active.length;
        const taken = takenCount;

        let score;
        if (totalMeds > 0) {
          const perMedWeight = W / totalMeds;
          const medsScore = perMedWeight * taken;
          const stepScore = stepPct * W;
          const hydrScore = hydrPct * W;
          score = stepScore + hydrScore + medsScore;
          if (stepPct >= 1 && hydrPct >= 1 && taken === totalMeds) score = 100;
        } else {
          const stepScore = stepPct * 50;
          const hydrScore = hydrPct * 50;
          score = stepScore + hydrScore;
          if (stepPct >= 1 && hydrPct >= 1) score = 100;
        }

        const pct = Math.round(Math.max(0, Math.min(100, score)));
        if (pct !== (demo.dailyGoalPct ?? 0)) {
          setDemo((d) => ({ ...d, dailyGoalPct: pct }));
          patchToday(patient.id, { dailyGoalPct: pct, weeklyGoalPct: pct }).catch(() => {});
        }
      } catch { }
    })();
  }, [patient?.id, demo.steps, demo.hydrationPct, meds.active.length, takenCount, targets.stepTarget]);

  const [weekSeries, setWeekSeries] = useState([]);
  useEffect(() => {
    if (!patient?.id) return;

    const { startISO, endISO, labels } = currentWeekUTCRange();
    (async () => {
      try {
        const rows = await getDailyGoalSeries(patient.id, startISO, endISO);
        const map = new Map(rows.map(r => [r.date, clamp0to100(r.pct ?? 0)]));
        const days = labels.map(({ iso, label }) => ({
          label,
          pct: map.get(iso) ?? 0,
        }));
        setWeekSeries(days);
      } catch {
        setWeekSeries(labels.map(({ label }) => ({ label, pct: 0 })));
      }
    })();
  }, [patient?.id, demo.dailyGoalPct]);

  return (
    <section className="summary" style={{ marginTop: 0 }}>
      {/* Header */}
      <div className="summary__head">
        <div>
          <h2 className="summary__title">Welcome back, {name} 👋</h2>
          <p className="summary__subtitle"><strong>Patient ID:</strong> {patient.id}</p>
        </div>
        <div className="summary__actions">
        </div>
      </div>

      {/* Daily Inputs */}
      <div className="panel" style={{ marginTop: 8 }}>
        <div className="panel__header"><h3>Your Daily Inputs</h3></div>
        <div className="tiles">
          {/* Steps */}
          <button className="tile tile--clickable" onClick={() => setShowSteps(true)} style={{ textAlign: "left", position: "relative" }}>
            <div className="tile__title">Steps</div>
            <div className="tile__value">{formatNumber(demo.steps)}</div>
            <div className="tile__note">
              target {formatNumber(targets.stepTarget || 10000)}
            </div>
          </button>

          {/* Hydration */}
          <button
            className="tile tile--clickable"
            onClick={() => setShowHydr(true)}
            style={{ textAlign: "left", position: "relative" }}
          >
            <div className="tile__title">Hydration</div>
            <div className="tile__value">{demo.hydrationPct}%</div>
            <div className="tile__note">
              target{" "}
              {targets.hydrationOzTarget ||
                hydrationBaseTargetOz(patient)}{" "}
              oz
            </div>
          </button>

          {/* Medication */}
          <button
            className="tile tile--clickable"
            onClick={() => setShowMeds(true)}
            style={{ textAlign: "left" }}
          >
            <div className="tile__title">Medication</div>
            <div className="tile__value">
              {(demo.medicationTakenToday ?? takenCount ?? 0)}/
              {demo.medsTotal ?? meds.active.length ?? 0}
            </div>
            <div className="tile__note">taken today • view meds</div>
          </button>
        </div>

        {/* Daily Goal */}
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel__header">
            <h3>Daily Goal</h3>
          </div>
          <ProgressBar pct={demo.dailyGoalPct ?? 0} />
          <p className="muted">today’s completion</p>
        </div>
      </div>

      {/* From Your Record (FHIR) */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel__header">
          <h3>From Your Record (FHIR)</h3>
        </div>
        <div className="tiles" style={{ marginTop: 6 }}>
          <Tile title="BMI" value={fmt(bmi, 1)} />
          <Tile title="Weight (kg)" value={fmt(latestWeight, 1)} />
          <Tile
            title="Blood Pressure"
            value={
              systolic && diastolic
                ? `${fmt(systolic, 0)}/${fmt(diastolic, 0)} mmHg`
                : "— mmHg"
            }
          />
          <Tile
            title="Oxygen Sat"
            value={o2 != null ? `${fmt(o2, 0)}%` : "— %"}
          />
          <Tile
            title="Respiratory Rate"
            value={rr != null ? `${fmt(rr, 0)} bpm` : "— bpm"}
          />
          <Tile
            title="Heart Rate"
            value={hr != null ? `${fmt(hr, 0)} bpm` : "— bpm"}
          />
        </div>
      </div>

      {/* Weekly Goal Trend */}
      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Weekly Goal Trend (Sun–Sat)</h3>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weekSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="pct"
                stroke="#2f9e44"
                strokeWidth={2}
                dot
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Steps modal */}
      {showSteps && (
        <div
          className="modal__backdrop"
          onClick={() => setShowSteps(false)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal__header">
              <h3>Steps</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="chip"
                  onClick={() => setShowSteps(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <form
              onSubmit={submitStepsAbsolute}
              style={{ display: "grid", gap: 10 }}
            >
              <label style={{ fontWeight: 700 }}>
                Enter today’s step count
              </label>
              <input
                type="number"
                min="0"
                value={stepsInput}
                onChange={(e) => setStepsInput(e.target.value)}
                aria-label="Today's steps"
              />
              <div className="muted">
                Target:{" "}
                {formatNumber(targets.stepTarget || 10000)} steps
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="chip" type="submit">
                  Save
                </button>
                <button
                  className="chip"
                  type="button"
                  onClick={() => setShowSteps(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hydration modal */}
      {showHydr && (
        <div
          className="modal__backdrop"
          onClick={() => setShowHydr(false)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal__header">
              <h3>Hydration</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="chip"
                  onClick={() => setShowHydr(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <form
              onSubmit={submitHydrationOzAbsolute}
              style={{ display: "grid", gap: 10 }}
            >
              <label style={{ fontWeight: 700 }}>
                Water consumed today (oz)
              </label>
              <input
                type="number"
                min="0"
                value={hydrOzInput}
                onChange={(e) =>
                  setHydrOzInput(e.target.value)
                }
                aria-label="Today's water (oz)"
              />
              <div className="muted">
                Target:{" "}
                {targets.hydrationOzTarget ||
                  hydrationBaseTargetOz(patient)}{" "}
                oz
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="chip" type="submit">
                  Save
                </button>
                <button
                  className="chip"
                  type="button"
                  onClick={() => setShowHydr(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Meds modal */}
      {showMeds && (
        <div
          className="modal__backdrop"
          onClick={() => setShowMeds(false)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal__header">
              <h3>Medications</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="chip" onClick={markAll}>
                  Mark all
                </button>
                <button className="chip" onClick={resetToday}>
                  Reset today
                </button>
                <button
                  className="chip"
                  onClick={() => setShowMeds(false)}
                >
                  Close
                </button>
              </div>
            </div>

            {loadingMeds ? (
              <p className="muted">Loading…</p>
            ) : (
              <>
                <h4
                  style={{ marginTop: 6, marginBottom: 8 }}
                >
                  Active
                </h4>
                {meds.active.length ? (
                  <ul className="activity" style={{ gap: 8 }}>
                    {meds.active.map((m) => (
                      <li
                        key={m.key}
                        className="activity__item"
                        style={{
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={takenSet.has(m.key)}
                          onChange={() => toggleTaken(m.key)}
                          aria-label={`Mark ${m.name} as taken today`}
                        />
                        <div className="activity__text">
                          {m.name}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">
                    No active medications found.
                  </p>
                )}

                <details style={{ marginTop: 14 }}>
                  <summary
                    style={{
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Past medication
                  </summary>
                  {meds.past.length ? (
                    <ul
                      className="activity"
                      style={{
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      {meds.past.map((m) => (
                        <li
                          key={m.key}
                          className="activity__item"
                        >
                          <span className="dot" />
                          <div className="activity__text">
                            {m.name}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p
                      className="muted"
                      style={{ marginTop: 8 }}
                    >
                      None
                    </p>
                  )}
                </details>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Tile({ title, value, note }) {
  return (
    <div className="tile">
      <div className="tile__title">{title}</div>
      <div className="tile__value">{value}</div>
      {note ? <div className="tile__note">{note}</div> : null}
    </div>
  );
}

function ProgressBar({ pct = 0 }) {
  const safe = clamp0to100(pct);
  return (
    <div className="bar">
      <div
        className="bar__fill"
        style={{ width: `${safe}%` }}
      />
      <div className="bar__label">{safe}%</div>
    </div>
  );
}
