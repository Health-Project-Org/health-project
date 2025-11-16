const FHIR_BASE_URL =
  process.env.REACT_APP_FHIR_BASE_URL || "https://r4.smarthealthit.org";

export async function getMetadata() {
  const res = await fetch(`${FHIR_BASE_URL}/metadata`, {
    headers: { Accept: "application/fhir+json" },
  });
  if (!res.ok) throw new Error("Failed to connect");
  return res.json();
}

export async function getPatientById(id) {
  const res = await fetch(`${FHIR_BASE_URL}/Patient/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/fhir+json" },
  });
  if (!res.ok) throw new Error("Patient not found");
  return res.json();
}

export async function searchPatientsByName(name) {
  const res = await fetch(`${FHIR_BASE_URL}/Patient?name=${encodeURIComponent(name)}`, {
    headers: { Accept: "application/fhir+json" },
  });
  const data = await res.json();
  return data.entry?.map((e) => e.resource) || [];
}

export async function findPatient(input) {
  try {
    const p = await getPatientById(input);
    return [p];
  } catch (_) {
    return await searchPatientsByName(input);
  }
}

export async function getObservations(patientId) {
  const base = process.env.REACT_APP_FHIR_BASE_URL || "https://r4.smarthealthit.org";
  const res = await fetch(
    `${base}/Observation?subject=Patient/${patientId}&_sort=-date&_count=200`,
    { headers: { Accept: "application/fhir+json" } }
  );
  const data = await res.json();
  return data.entry?.map((e) => e.resource) || [];
}

const _pickMedName = (r) => {
  const cc = r.medicationCodeableConcept;
  const text = cc?.text?.trim();
  const disp = cc?.coding?.[0]?.display?.trim();
  return text || disp || r.code?.text || r.code?.coding?.[0]?.display || "";
};

export async function getMedications(patientId) {
  const base = process.env.REACT_APP_FHIR_BASE_URL || "https://r4.smarthealthit.org";
  const qsS = `_count=200&subject=Patient/${patientId}&_include=MedicationStatement:medication`;
  const qsR = `_count=200&subject=Patient/${patientId}&_include=MedicationRequest:medication`;

  const [stmtRes, reqRes] = await Promise.all([
    fetch(`${base}/MedicationStatement?${qsS}`, { headers: { Accept: "application/fhir+json" } }),
    fetch(`${base}/MedicationRequest?${qsR}`,   { headers: { Accept: "application/fhir+json" } }),
  ]);
  const stmtBundle = await stmtRes.json();
  const reqBundle  = await reqRes.json();

  const medMap = new Map();
  const harvestMeds = (bundle) => {
    (bundle.entry ?? []).forEach(({ resource }) => {
      if (resource?.resourceType === "Medication" && resource.id) {
        const cc = resource.code;
        const name = cc?.text?.trim() || cc?.coding?.[0]?.display?.trim() || "";
        if (name) medMap.set(resource.id, name);
      }
    });
  };
  harvestMeds(stmtBundle);
  harvestMeds(reqBundle);

  const resolveName = (r) => {
    const cc = r.medicationCodeableConcept;
    const ref = r.medicationReference?.reference; 
    if (cc) return cc.text?.trim() || cc.coding?.[0]?.display?.trim() || "";
    if (ref?.startsWith("Medication/")) return medMap.get(ref.split("/")[1]) || "";
    return r.code?.text || r.code?.coding?.[0]?.display || "";
  };

  const now = Date.now();
  const isStmtActive = (s) => {
    if ((s.status || "").toLowerCase() !== "active") return false;
    const end = s.effectivePeriod?.end ? Date.parse(s.effectivePeriod.end) : null;
    return !(end && end < now);
  };
  const isReqActive = (r) => {
    const status = (r.status || "").toLowerCase();
    const intent = (r.intent || "").toLowerCase();
    const validIntent = ["order", "original-order", "instance-order"].includes(intent);
    const vpEnd = r.dispenseRequest?.validityPeriod?.end ? Date.parse(r.dispenseRequest.validityPeriod.end) : null;
    if (r.doNotPerform === true) return false;
    if (!validIntent) return false;
    if (!(status === "active" || status === "on-hold")) return false;
    return !(vpEnd && vpEnd < now);
  };

  const collect = (bundle, type) =>
    (bundle.entry ?? [])
      .map((e) => e.resource)
      .filter((r) => r?.resourceType === type);

  const stmt = collect(stmtBundle, "MedicationStatement");
  const req  = collect(reqBundle,  "MedicationRequest");

  const items = [];
  const push = (name, codingArr, active) => {
    const clean = (name || "").trim();
    if (!clean || clean.toLowerCase() === "medication") return;
    const c0 = Array.isArray(codingArr) ? codingArr[0] : null;
    const codeKey = c0?.system && c0?.code ? `${c0.system}|${c0.code}` : clean.toLowerCase();
    items.push({ key: codeKey, name: clean, active });
  };

  stmt.forEach((s) => {
    push(resolveName(s), s.medicationCodeableConcept?.coding ?? s.code?.coding, isStmtActive(s));
  });
  req.forEach((r) => {
    push(resolveName(r), r.medicationCodeableConcept?.coding ?? r.code?.coding, isReqActive(r));
  });

  const byKey = new Map();
  items.forEach((it) => {
    const prev = byKey.get(it.key);
    if (!prev || (it.active && !prev.active)) byKey.set(it.key, it);
  });

  const active = [];
  const past = [];
  for (const v of byKey.values()) (v.active ? active : past).push({ key: v.key, name: v.name });

  return { active, past };
}
