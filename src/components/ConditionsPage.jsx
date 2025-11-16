import React, { useEffect, useMemo, useState } from "react";

const FHIR_BASE =
  process.env.REACT_APP_FHIR_BASE_URL || "https://r4.smarthealthit.org";

export default function ConditionsPage({ patient, onBack }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const name = useMemo(() => {
    const n = patient?.name?.[0];
    const text = n?.text;
    const structured = [
      Array.isArray(n?.given) ? n.given.join(" ") : null,
      n?.family,
    ]
      .filter(Boolean)
      .join(" ");
    return text || structured || "there";
  }, [patient]);

  useEffect(() => {
    if (!patient?.id) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${FHIR_BASE}/Condition?subject=Patient/${patient.id}`,
          { headers: { Accept: "application/fhir+json" } }
        );
        const data = await res.json();
        const rows =
          data.entry?.map((e) => e.resource).filter(Boolean) ?? [];

        const normalized = rows.map((c) => ({
          id: c.id,
          status:
            c.clinicalStatus?.coding?.[0]?.code ||
            c.clinicalStatus?.text ||
            "unknown",
          name:
            c.code?.text ||
            c.code?.coding?.[0]?.display ||
            "Condition",
          onset:
            c.onsetDateTime ||
            c.onsetPeriod?.start ||
            c.recordedDate ||
            null,
        }));

        normalized.sort((a, b) => {
          const aActive = String(a.status).toLowerCase() === "active";
          const bActive = String(b.status).toLowerCase() === "active";
          if (aActive !== bActive) return aActive ? -1 : 1;
          const at = a.onset ? Date.parse(a.onset) : 0;
          const bt = b.onset ? Date.parse(b.onset) : 0;
          return bt - at;
        });

        setItems(normalized);
      } finally {
        setLoading(false);
      }
    })();
  }, [patient?.id]);

  return (
    <section className="summary" style={{ marginTop: 0 }}>
      <div className="summary__head">
        <div>
          <h2 className="summary__title">Conditions for {name}</h2>
          <p className="summary__subtitle">
            <strong>Patient ID:</strong> {patient.id}
          </p>
        </div>
        <div className="summary__actions">
          <button className="chip" onClick={onBack}>← Back</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel__header">
          <h3>All Conditions</h3>
        </div>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : items.length ? (
          <ul className="activity" style={{ gap: 10 }}>
            {items.map((c) => (
              <li key={c.id} className="activity__item">
                <span
                  className="dot"
                  style={{
                    background:
                      String(c.status).toLowerCase() === "active"
                        ? "#2f9e44"
                        : "#adb5bd",
                  }}
                />
                <div>
                  <div className="activity__text">{c.name}</div>
                  <div className="activity__when">
                    Status: {c.status}
                    {c.onset
                      ? ` • Onset: ${new Date(c.onset).toLocaleDateString()}`
                      : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No conditions found.</p>
        )}
      </div>
    </section>
  );
}
