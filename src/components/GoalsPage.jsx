import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const FHIR_BASE = process.env.REACT_APP_FHIR_BASE_URL || "https://r4.smarthealthit.org";

export default function GoalsPage({ patient }) {
  const navigate = useNavigate();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  const name = useMemo(() => {
    const n = patient?.name?.[0];
    const text = n?.text;
    const structured = [Array.isArray(n?.given) ? n.given.join(" ") : null, n?.family]
      .filter(Boolean).join(" ");
    return text || structured || "there";
  }, [patient]);

  useEffect(() => {
    if (!patient?.id) return;
    (async () => {
      try {
        const res = await fetch(`${FHIR_BASE}/Goal?subject=Patient/${patient.id}&_count=50`,
          { headers: { Accept: "application/fhir+json" } });
        const data = await res.json();
        setGoals(data.entry?.map(e => e.resource).filter(Boolean) ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [patient?.id]);

  return (
    <section className="summary" style={{ marginTop: 0 }}>
      <div className="summary__head" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 className="summary__title">Health Goals for {name}</h2>
          <p className="summary__subtitle"><strong>Patient ID:</strong> {patient.id}</p>
        </div>
        <button className="chip" onClick={() => navigate(-1)}>← Back</button>
      </div>

      <div className="panel">
        <div className="panel__header"><h3>All Goals</h3></div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : goals.length ? (
          <ul className="activity" style={{ gap: 10 }}>
            {goals.map((g) => {
              const title =
                g.description?.text ||
                g.description ||
                g.target?.[0]?.detailString ||
                g.target?.[0]?.detailCodeableConcept?.text ||
                "Goal";
              const status = g.lifecycleStatus || g.status || "active";
              const start = g.startDate ? new Date(g.startDate).toLocaleDateString() : null;
              return (
                <li key={g.id} className="activity__item">
                  <span className="dot" />
                  <div>
                    <div className="activity__text">{title}</div>
                    <div className="activity__when">Status: {String(status)}{start ? ` • Since ${start}` : ""}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">No goals on file.</p>
        )}
      </div>
    </section>
  );
}
