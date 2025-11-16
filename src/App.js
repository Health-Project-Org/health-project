import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import "./App.css";

import logo from "./logo.png";
import { getMetadata, findPatient } from "./fhirService";

import UnifiedDashboard from "./components/UnifiedDashboard";
import ConditionsPage from "./components/ConditionsPage";
import GoalsPage from "./components/GoalsPage";
import RewardsPage from "./components/RewardsPage";
import LeaderboardPage from "./components/LeaderboardPage";

import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
} from "react-router-dom";

const FHIR_BASE =
  process.env.REACT_APP_FHIR_BASE_URL || "https://r4.smarthealthit.org";

function HeaderLinks({ hasPatient }) {
  const navigate = useNavigate();
  if (!hasPatient) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 22,
        alignItems: "center",
        fontWeight: 700,
        marginLeft: 20,
      }}
    >
      <button onClick={() => navigate("/")} style={linkBtnStyle}>
        Dashboard
      </button>
      <button onClick={() => navigate("/conditions")} style={linkBtnStyle}>
        Conditions
      </button>
      <button onClick={() => navigate("/goals")} style={linkBtnStyle}>
        Goals
      </button>
      <button onClick={() => navigate("/rewards")} style={linkBtnStyle}>
        Rewards
      </button>
      <button onClick={() => navigate("/leaderboard")} style={linkBtnStyle}>
        Leaderboard
      </button>
    </div>
  );
}

const linkBtnStyle = {
  background: "none",
  border: "none",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  padding: 0,
};

function ProfileAvatar({ patient, onLogout }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);

  const name = (() => {
    const n = patient?.name?.[0];
    const text = n?.text;
    const structured = [Array.isArray(n?.given) ? n.given.join(" ") : null, n?.family]
      .filter(Boolean)
      .join(" ");
    return (text || structured || "User").trim();
  })();

  const initials = (() => {
    const parts = name.split(/\s+/);
    if (!parts.length) return "U";
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || "U";
    return `${parts[0][0]?.toUpperCase() || ""}${parts.at(-1)[0]?.toUpperCase() || ""}`;
  })();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (e.key === "Escape") setOpen(false);
      const dd = document.getElementById("profile-dd");
      if (e.type === "mousedown" && dd && anchorRef.current) {
        if (!dd.contains(e.target) && !anchorRef.current.contains(e.target)) {
          setOpen(false);
        }
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onDoc);
    };
  }, [open]);

  const ddPos = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    const width = 180;
    const top = (r?.bottom ?? 0) + 8;
    const left = (r?.right ?? 0) - width;
    return { top, left, width };
  };

  return (
    <>
      <button
        ref={anchorRef}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={name}
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "1px solid #dfe3e6",
          background: "#e6f5ec",
          fontWeight: 800,
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
        }}
      >
        {initials}
      </button>

      {open &&
        ReactDOM.createPortal(
          <div
            id="profile-dd"
            className="inbox-dropdown"
            role="menu"
            style={{
              position: "fixed",
              ...ddPos(),
              padding: 10,
            }}
          >
            <button
              className="chip"
              style={{ width: "100%" }}
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              Log out
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

function InboxMenu({ patient }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("messages");
  const [messages, setMessages] = useState([]);
  const [reminders, setReminders] = useState([]);
  const anchorRef = useRef(null);

  useEffect(() => {
    if (!open || !patient?.id) return;

    const run = async () => {
      try {
        const msgRes = await fetch(
          `${FHIR_BASE}/Communication?subject=Patient/${patient.id}&_count=10`,
          { headers: { Accept: "application/fhir+json" } }
        );
        const msgData = await msgRes.json();
        setMessages(msgData.entry?.map((e) => e.resource).filter(Boolean) ?? []);
      } catch {
        setMessages([]);
      }

      try {
        const remRes = await fetch(
          `${FHIR_BASE}/CommunicationRequest?subject=Patient/${patient.id}&_count=10`,
          { headers: { Accept: "application/fhir+json" } }
        );
        const remData = await remRes.json();
        setReminders(remData.entry?.map((e) => e.resource).filter(Boolean) ?? []);
      } catch {
        setReminders([]);
      }
    };

    run();
  }, [open, patient?.id]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!anchorRef.current) return;
      if (e.key === "Escape") setOpen(false);
      if (e.type === "mousedown") {
        const dropdown = document.getElementById("inbox-dropdown");
        if (
          dropdown &&
          !dropdown.contains(e.target) &&
          !anchorRef.current.contains(e.target)
        ) {
          setOpen(false);
        }
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onDoc);
    };
  }, [open]);

  const total = (messages?.length || 0) + (reminders?.length || 0);

  const dropdownStyle = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    const width = 440;
    const top = (rect?.bottom ?? 0) + 8;
    const left = (rect?.right ?? 0) - width;
    return { top, left, width };
  };

  return (
    <>
      <button
        ref={anchorRef}
        className="inbox-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="inbox-dropdown"
      >
        Inbox <span className="inbox-badge">{total}</span>
      </button>

      {open &&
        ReactDOM.createPortal(
          <div
            id="inbox-dropdown"
            className="inbox-dropdown"
            role="menu"
            style={{ position: "fixed", ...dropdownStyle() }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <h3 style={{ margin: 0 }}>Inbox</h3>
              <div style={{ display: "inline-flex", gap: 6 }}>
                <button
                  className={`tab ${tab === "messages" ? "tab--active" : ""}`}
                  onClick={() => setTab("messages")}
                >
                  Messages <span className="badge">{messages.length}</span>
                </button>
                <button
                  className={`tab ${tab === "reminders" ? "tab--active" : ""}`}
                  onClick={() => setTab("reminders")}
                >
                  Reminders <span className="badge">{reminders.length}</span>
                </button>
              </div>
            </div>

            {tab === "messages" ? (
              messages.length ? (
                <ul className="activity list--condensed">
                  {messages.map((m) => {
                    const text =
                      m.payload?.[0]?.contentString ||
                      m.note?.[0]?.text ||
                      m.status ||
                      "Message";
                    const when = m.sent || m.received || m.authoredOn || null;
                    return (
                      <li key={m.id} className="activity__item">
                        <span className="dot" />
                        <div>
                          <div className="activity__text">{text}</div>
                          {when && (
                            <div className="activity__when">
                              {new Date(when).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="muted">No messages found.</p>
              )
            ) : reminders.length ? (
              <ul className="activity list--condensed">
                {reminders.map((r) => {
                  const text =
                    r.payload?.[0]?.contentString ||
                    r.reasonCode?.[0]?.text ||
                    r.note?.[0]?.text ||
                    "Reminder";
                  const when =
                    r.occurrenceDateTime || r.authoredOn || r.requestedOn || null;
                  return (
                    <li key={r.id} className="activity__item">
                      <span className="dot" />
                      <div>
                        <div className="activity__text">{text}</div>
                        {when && (
                          <div className="activity__when">
                            {new Date(when).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">No reminders.</p>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

function AuthedRoutes({ patient, clearPatient }) {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route
        path="/"
        element={
          <UnifiedDashboard
            patient={patient}
            onLogout={() => {
              clearPatient();
              navigate("/");
            }}
          />
        }
      />
      <Route
        path="/conditions"
        element={<ConditionsPage patient={patient} onBack={() => navigate(-1)} />}
      />
      <Route
        path="/goals"
        element={<GoalsPage patient={patient} onBack={() => navigate(-1)} />}
      />
      <Route
        path="/rewards"
        element={<RewardsPage patient={patient} onBack={() => navigate(-1)} />}
      />
      <Route
        path="/leaderboard"
        element={<LeaderboardPage patient={patient} onBack={() => navigate(-1)} />}
      />
      <Route
        path="*"
        element={
          <UnifiedDashboard
            patient={patient}
            onLogout={() => {
              clearPatient();
              navigate("/");
            }}
          />
        }
      />
    </Routes>
  );
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [patient, setPatient] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getMetadata().then(() => setConnected(true)).catch(() => setConnected(false));
  }, []);

  const clearPatient = () => {
    setPatient(null);
    setInput("");
  };

  useEffect(() => {
    async function fetchPatientsFromBackend() {
      try {
        const res = await fetch("http://localhost:5050/api/patients");
        if (!res.ok) throw new Error("Failed to fetch patients");
        const data = await res.json();
        console.log("Patients fetched from backend:", data);
      } catch (err) {
        console.error("Error fetching patients:", err);
      }
    }
    fetchPatientsFromBackend();
  }, []);

  return (
    <BrowserRouter>
      <div className="page">
        <header
          className="nav"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            paddingLeft: 20,
            paddingRight: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {logo && <img src={logo} alt="Health Hero" className="logo" />}
            <HeaderLinks hasPatient={!!patient} />
          </div>

          {patient ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <InboxMenu patient={patient} />
              <ProfileAvatar patient={patient} onLogout={clearPatient} />
            </div>
          ) : null}
        </header>

        <main
          className="main"
          style={{
            minHeight: "82vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: patient ? "flex-start" : "center",
            gap: patient ? 16 : 18,
          }}
        >
          {!patient ? (
            <>
              <div style={{ textAlign: "center" }}>
                <h1
                  className="title"
                  style={{
                    fontSize: "3.1rem",
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: "-0.6px",
                  }}
                >
                  Health <span className="accent">Hero</span>
                </h1>
                <p className="subtitle" style={{ fontSize: "1.18rem", margin: "10px 0 12px" }}>
                  On track to a better you!
                </p>
                <div style={{ fontSize: 13, color: "#333", marginBottom: 6 }}>
                  FHIR Connected: {connected ? "✅" : "❌"}
                </div>
              </div>

              <section
                className="card"
                style={{
                  width: 380,
                  borderRadius: 14,
                  boxShadow: "0 10px 28px rgba(0,0,0,0.09)",
                }}
              >
                <div className="card-header" style={{ fontSize: 24, fontWeight: 700 }}>
                  Sign in
                </div>
                <form
                  className="card-body"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setLoading(true);
                    setError("");
                    try {
                      const results = await findPatient(input.trim());
                      if (!results.length) setError("No matching patient found");
                      else setPatient(results[0]);
                    } catch {
                      setError("FHIR connection failed");
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  <input
                    type="text"
                    placeholder="Enter patient name or ID"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    style={{ height: 46, borderRadius: 10, fontSize: 16 }}
                  />
                  <button
                    className="btn"
                    type="submit"
                    disabled={loading}
                    style={{ height: 44, borderRadius: 10, fontSize: 16, fontWeight: 700 }}
                  >
                    {loading ? "Loading..." : "Login"}
                  </button>
                  {error && (
                    <p style={{ color: "red", textAlign: "center", margin: 0 }}>
                      {error}
                    </p>
                  )}
                </form>
              </section>
            </>
          ) : (
            <div style={{ marginTop: 8, width: "100%" }}>
              <AuthedRoutes patient={patient} clearPatient={clearPatient} />
            </div>
          )}
        </main>
      </div>
    </BrowserRouter>
  );
}
