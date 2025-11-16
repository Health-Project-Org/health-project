import React, { useEffect, useMemo, useRef, useState } from "react";

export default function ProfileMenu({ patient, onLogout }) {
  const initials = useMemo(() => {
    const n = patient?.name?.[0];
    const text = n?.text;
    const structured = [
      Array.isArray(n?.given) ? n.given.join(" ") : null,
      n?.family,
    ].filter(Boolean).join(" ");
    const name = text || structured || "User";
    const parts = name.trim().split(/\s+/);
    const i = (s) => (s ? s[0].toUpperCase() : "");
    return parts.length >= 2 ? i(parts[0]) + i(parts[parts.length - 1]) : i(parts[0]);
  }, [patient]);

  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const closeOnOutside = (e) => {
    if (!open) return;
    const dd = document.getElementById("profile-dd");
    if (dd && !dd.contains(e.target) && !btnRef.current?.contains(e.target)) {
      setOpen(false);
    }
  };
  useEffect(() => {
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [open]);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="avatar-btn"
        title="Account"
      >
        {initials}
      </button>

      {open && (
        <div id="profile-dd" className="dropdown">
          <div className="dropdown__header">
            <div className="avatar-badge">{initials}</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {patient?.name?.[0]?.text ||
               [patient?.name?.[0]?.given?.join(" "), patient?.name?.[0]?.family].filter(Boolean).join(" ") ||
               "User"}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>Patient ID: {patient?.id}</div>
          </div>
          <button className="dropdown__item" onClick={() => setOpen(false)}>
            View profile (soon)
          </button>
          <button className="dropdown__item" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
