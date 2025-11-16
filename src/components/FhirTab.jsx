import React, { useEffect, useState, useMemo } from "react";
import { getObservations } from "../fhirService";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export default function FhirTab({ patient }) {
  const [observations, setObservations] = useState([]);

  const displayName = useMemo(() => {
    const n = patient?.name?.[0];
    const text = n?.text;
    const structured = [Array.isArray(n?.given) ? n.given.join(" ") : null, n?.family]
      .filter(Boolean)
      .join(" ");
    return text || structured || "Unnamed patient";
  }, [patient]);

  useEffect(() => {
    if (patient?.id) {
      getObservations(patient.id).then(setObservations);
    }
  }, [patient?.id]);

  const fmt = (v, d = 1) => (v == null ? "—" : Number(v).toFixed(d));

  // Weight (LOINC 29463-7)
  const weightSeries = observations
    .filter(o => o.code?.coding?.some(c => c.code === "29463-7") && o.valueQuantity?.value != null)
    .map(o => ({
      date: o.effectiveDateTime ? new Date(o.effectiveDateTime).toLocaleDateString() : "",
      value: o.valueQuantity.value,
    }))
    .reverse();

  const latestWeight = weightSeries.at(-1)?.value ?? null;

  // BMI (39156-5) 
  const bmiObs = observations.find(o => o.code?.coding?.some(c => c.code === "39156-5"));
  const bmi = bmiObs?.valueQuantity?.value ?? null;

  // BP panel (85354-9) with systolic (8480-6) & diastolic (8462-4)
  const bp = observations.find(o => o.code?.coding?.some(c => c.code === "85354-9"));
  const systolic = bp?.component?.find(c => c.code?.coding?.some(cd => cd.code === "8480-6"))?.valueQuantity?.value;
  const diastolic = bp?.component?.find(c => c.code?.coding?.some(cd => cd.code === "8462-4"))?.valueQuantity?.value;

  return (
    <div className="fhir-tab">
      <h2>Welcome, {displayName}!</h2>
      <p><strong>Patient ID:</strong> {patient.id}</p>

      <div className="vital-cards">
        <div className="vital-card">
          <h3>BMI</h3>
          <p>{fmt(bmi, 1)}</p>
        </div>
        <div className="vital-card">
          <h3>Weight (kg)</h3>
          <p>{fmt(latestWeight, 1)}</p>
        </div>
        <div className="vital-card">
          <h3>Blood Pressure</h3>
          <p>{systolic && diastolic ? `${fmt(systolic, 0)}/${fmt(diastolic, 0)} mmHg` : "— mmHg"}</p>
        </div>
      </div>

      <div className="chart-wrapper">
        <h3>Weight Trend</h3>
        {weightSeries.length >= 2 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={weightSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#2f9e44" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ color: "#666" }}>Not enough weight data to draw a chart yet.</p>
        )}
      </div>
    </div>
  );
}
