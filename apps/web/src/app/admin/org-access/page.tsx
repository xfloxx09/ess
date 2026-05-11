"use client";

import type { AppViewKey } from "@ess/shared";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

type Snapshot = {
  viewCatalog: AppViewKey[];
  dienstleister: Array<{ id: string; name: string }>;
  abteilungen: Array<{ id: string; name: string; dienstleisterId: string }>;
  projects: Array<{ id: string; name: string; abteilungId: string }>;
  teams: Array<{ id: string; name: string; projectId: string }>;
  accessRoles: Array<{
    id: string;
    name: string;
    slug: string;
    views: string[];
    scopes: Array<{ resourceType: string; resourceId: string }>;
  }>;
  users: Array<{
    id: string;
    email: string;
    fullName: string;
    role: string;
    teamId?: string;
    accessRoleIds: string[];
  }>;
};

export default function AdminOrgAccessPage() {
  const { token, loading } = useRequireAuth(["ADMIN"]);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState("Lade Daten…");
  const [dlName, setDlName] = useState("");
  const [abName, setAbName] = useState("");
  const [abDlId, setAbDlId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamProjectId, setTeamProjectId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleSlug, setRoleSlug] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [viewKeysInput, setViewKeysInput] = useState("");
  const [scopesJson, setScopesJson] = useState("[]");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRoleId, setAssignRoleId] = useState("");

  async function reload() {
    if (!token) {
      return;
    }
    try {
      const data = await api<Snapshot>("/admin/org-access/snapshot", undefined, token);
      setSnap(data);
      if (!abDlId && data.dienstleister[0]) {
        setAbDlId(data.dienstleister[0].id);
      }
      if (!teamProjectId && data.projects[0]) {
        setTeamProjectId(data.projects[0].id);
      }
      const roleId = selectedRoleId || data.accessRoles[0]?.id || "";
      if (!selectedRoleId && data.accessRoles[0]) {
        setSelectedRoleId(data.accessRoles[0].id);
      }
      const role = data.accessRoles.find((r) => r.id === roleId);
      if (role) {
        setViewKeysInput(role.views.join(", "));
        setScopesJson(JSON.stringify(role.scopes, null, 2));
      }
      setStatus("Snapshot geladen.");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial + token
  }, [token]);

  useEffect(() => {
    if (!snap || !selectedRoleId) {
      return;
    }
    const role = snap.accessRoles.find((r) => r.id === selectedRoleId);
    if (role) {
      setViewKeysInput(role.views.join(", "));
      setScopesJson(JSON.stringify(role.scopes, null, 2));
    }
  }, [selectedRoleId, snap]);

  async function post(path: string, body: unknown) {
    if (!token) {
      return;
    }
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) }, token);
      setStatus("Gespeichert.");
      await reload();
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function patch(path: string, body: unknown) {
    if (!token) {
      return;
    }
    try {
      await api(path, { method: "PATCH", body: JSON.stringify(body) }, token);
      setStatus("Aktualisiert.");
      await reload();
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function put(path: string, body: unknown) {
    if (!token) {
      return;
    }
    try {
      await api(path, { method: "PUT", body: JSON.stringify(body) }, token);
      setStatus("Gespeichert.");
      await reload();
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function del(path: string, body?: unknown) {
    if (!token) {
      return;
    }
    try {
      await api(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }, token);
      setStatus("Entfernt.");
      await reload();
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  if (loading) {
    return <p className="status-ok">Lade Organisation…</p>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2>Organisation &amp; Rollen</h2>
        <p>
          Hierarchie: Dienstleister → Abteilung → Projekt → Team. Zugriffsrollen erweitern Sichten (Navigation) und können
          Daten auf Organisationseinheiten begrenzen.
        </p>
      </div>

      <p className="panel">{status}</p>

      <div className="panel row">
        <button type="button" onClick={() => void reload()}>
          Snapshot aktualisieren
        </button>
      </div>

      {snap && (
        <>
          <section className="panel stack">
            <h3>Dienstleister</h3>
            <ul className="compact-list">
              {snap.dienstleister.map((d) => (
                <li key={d.id}>{d.name}</li>
              ))}
            </ul>
            <div className="row">
              <label>
                Name
                <input value={dlName} onChange={(e) => setDlName(e.target.value)} placeholder="Neuer Dienstleister" />
              </label>
              <button type="button" onClick={() => void post("/admin/org-access/dienstleister", { name: dlName })}>
                Anlegen
              </button>
            </div>
          </section>

          <section className="panel stack">
            <h3>Abteilungen</h3>
            <ul className="compact-list">
              {snap.abteilungen.map((a) => (
                <li key={a.id}>
                  {a.name} <span className="muted">(Dienstleister {a.dienstleisterId.slice(0, 8)}…)</span>
                </li>
              ))}
            </ul>
            <div className="row">
              <label>
                Name
                <input value={abName} onChange={(e) => setAbName(e.target.value)} />
              </label>
              <label>
                Dienstleister
                <select value={abDlId} onChange={(e) => setAbDlId(e.target.value)}>
                  {snap.dienstleister.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => void post("/admin/org-access/abteilungen", { name: abName, dienstleisterId: abDlId })}>
                Anlegen
              </button>
            </div>
          </section>

          <section className="panel stack">
            <h3>Projekte</h3>
            <div className="grid cols-2">
              {snap.projects.map((p) => {
                const ab = snap.abteilungen.find((x) => x.id === p.abteilungId);
                return (
                  <div key={p.id} className="panel">
                    <strong>{p.name}</strong>
                    <p className="muted">Abteilung: {ab?.name ?? p.abteilungId}</p>
                    <label>
                      Umbenennen
                      <input
                        defaultValue={p.name}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== p.name) {
                            void patch(`/admin/org-access/projects/${p.id}`, { name: v });
                          }
                        }}
                      />
                    </label>
                    <label>
                      Abteilung
                      <select
                        defaultValue={p.abteilungId}
                        onChange={(e) => void patch(`/admin/org-access/projects/${p.id}`, { abteilungId: e.target.value })}
                      >
                        {snap.abteilungen.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel stack">
            <h3>Teams</h3>
            <ul className="compact-list">
              {snap.teams.map((t) => {
                const pr = snap.projects.find((p) => p.id === t.projectId);
                return (
                  <li key={t.id}>
                    {t.name} — {pr?.name ?? t.projectId}
                  </li>
                );
              })}
            </ul>
            <div className="row">
              <label>
                Name
                <input value={teamName} onChange={(e) => setTeamName(e.target.value)} />
              </label>
              <label>
                Projekt
                <select value={teamProjectId} onChange={(e) => setTeamProjectId(e.target.value)}>
                  {snap.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => void post("/admin/org-access/teams", { name: teamName, projectId: teamProjectId })}>
                Team anlegen
              </button>
            </div>
          </section>

          <section className="panel stack">
            <h3>Zugriffsrollen</h3>
            <div className="row">
              <label>
                Name
                <input value={roleName} onChange={(e) => setRoleName(e.target.value)} />
              </label>
              <label>
                Slug
                <input value={roleSlug} onChange={(e) => setRoleSlug(e.target.value)} placeholder="z. B. teamlead-nord" />
              </label>
              <button type="button" onClick={() => void post("/admin/org-access/access-roles", { name: roleName, slug: roleSlug })}>
                Rolle anlegen
              </button>
            </div>
            <label>
              Rolle bearbeiten
              <select value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}>
                {snap.accessRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.slug})
                  </option>
                ))}
              </select>
            </label>
            {selectedRoleId && (
              <div className="stack">
                <label>
                  Sichten (Komma-getrennt, siehe Katalog unten)
                  <textarea rows={3} value={viewKeysInput} onChange={(e) => setViewKeysInput(e.target.value)} />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const keys = viewKeysInput
                      .split(/[,\s]+/)
                      .map((s) => s.trim())
                      .filter(Boolean);
                    void put(`/admin/org-access/access-roles/${selectedRoleId}/views`, { viewKeys: keys });
                  }}
                >
                  Sichten speichern
                </button>
                <h4>Datenbereich (JSON)</h4>
                <p className="muted">Leer-Array = alle Projekte. Typen: DIENSTLEISTER, ABTEILUNG, PROJECT, TEAM.</p>
                <textarea rows={5} value={scopesJson} onChange={(e) => setScopesJson(e.target.value)} />
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const scopes = JSON.parse(scopesJson) as Array<{ resourceType: string; resourceId: string }>;
                      void put(`/admin/org-access/access-roles/${selectedRoleId}/scopes`, { scopes });
                    } catch (e) {
                      setStatus(e instanceof SyntaxError ? `Ungültiges JSON: ${e.message}` : "Ungültiges JSON für Scopes.");
                    }
                  }}
                >
                  Scopes speichern
                </button>
                <p className="muted">
                  <strong>Katalog:</strong> {snap.viewCatalog.join(", ")}
                </p>
              </div>
            )}
          </section>

          <section className="panel stack">
            <h3>Benutzer ↔ Rolle</h3>
            <div className="row">
              <label>
                Benutzer
                <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}>
                  <option value="">— wählen —</option>
                  {snap.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.email}) — {u.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Zugriffsrolle
                <select value={assignRoleId} onChange={(e) => setAssignRoleId(e.target.value)}>
                  <option value="">— wählen —</option>
                  {snap.accessRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  if (assignUserId && assignRoleId) {
                    void post("/admin/org-access/user-access-roles", { userId: assignUserId, accessRoleId: assignRoleId });
                  }
                }}
              >
                Zuweisen
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  if (assignUserId && assignRoleId) {
                    void del("/admin/org-access/user-access-roles", { userId: assignUserId, accessRoleId: assignRoleId });
                  }
                }}
              >
                Entfernen
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
