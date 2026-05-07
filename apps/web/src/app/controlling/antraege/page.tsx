"use client";

import { useEffect, useMemo, useState } from "react";
import { QuarterHourSlotPicker } from "../../../components/quarter-hour-slot-picker";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

type Agent = { id: string; fullName: string; email: string };
type AntragStatus = "PENDING" | "APPROVED" | "REJECTED";
type Antrag = {
  id: string;
  agentId: string;
  date: string;
  fromSlot: number;
  toSlot: number;
  type: "STOERUNG" | "MEETING";
  status: AntragStatus;
  note?: string;
  createdByUserId: string;
  createdAtIso: string;
  decidedByUserId?: string;
  decidedAtIso?: string;
};

type HistoryRow = {
  id: string;
  antragId: string;
  agentId: string;
  action: "CREATED" | "APPROVED" | "REJECTED";
  actorUserId: string;
  payload: string;
  atIso: string;
};

export default function AntraegePage() {
  const { token, loading } = useRequireAuth({
    roles: ["CONTROLLING", "ADMIN"],
    anyViews: ["controlling_antraege"],
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [agentId, setAgentId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | AntragStatus>("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fromSlot, setFromSlot] = useState(40);
  const [toSlot, setToSlot] = useState(47);
  const [type, setType] = useState<"STOERUNG" | "MEETING">("STOERUNG");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Antrag[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [status, setStatus] = useState("Antrag erstellen — neue Einträge sind PENDING bis Freigabe.");
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    api<Agent[]>("/shiftplan/agents", undefined, token)
      .then((data) => {
        setAgents(data);
        if (data.length > 0 && !agentId) {
          setAgentId(data[0].id);
        }
      })
      .catch((error) => setStatus(toMessage(error)));
  }, [token, agentId]);

  async function loadMonth() {
    if (!token) {
      return;
    }
    try {
      const queryParts = [`month=${month}`];
      if (agentId) {
        queryParts.push(`agentId=${agentId}`);
      }
      if (statusFilter) {
        queryParts.push(`status=${statusFilter}`);
      }
      const data = await api<Antrag[]>(`/antraege/month?${queryParts.join("&")}`, undefined, token);
      setRows(data);
      const histQuery = agentId ? `&agentId=${agentId}` : "";
      const hist = await api<HistoryRow[]>(`/antraege/history?month=${month}${histQuery}`, undefined, token);
      setHistory(hist);
      setStatus("Anträge & Verlauf geladen");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function createAntrag() {
    if (!token || !agentId) {
      return;
    }
    try {
      await api(
        "/antraege",
        {
          method: "POST",
          body: JSON.stringify({
            agentId,
            date,
            fromSlot: Number(fromSlot),
            toSlot: Number(toSlot),
            type,
            note,
          }),
        },
        token,
      );
      setStatus("Antrag angelegt (PENDING)");
      setNote("");
      await loadMonth();
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function approve(id: string) {
    if (!token) {
      return;
    }
    try {
      await api(`/antraege/${id}/approve`, { method: "POST" }, token);
      setStatus("Antrag genehmigt — zählt in Abrechnung");
      await loadMonth();
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function reject(id: string) {
    if (!token) {
      return;
    }
    try {
      await api(`/antraege/${id}/reject`, { method: "POST" }, token);
      setStatus("Antrag abgelehnt");
      await loadMonth();
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  const slotHours = useMemo(() => {
    const slots = Math.max(0, Math.abs(toSlot - fromSlot) + 1);
    return (slots * 0.25).toFixed(2);
  }, [fromSlot, toSlot]);

  const dayLabel = useMemo(() => {
    const d = new Date(`${date}T12:00:00`);
    if (Number.isNaN(d.getTime())) {
      return date;
    }
    return d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  }, [date]);

  const slotRangeLabel = useMemo(() => {
    const lo = Math.min(fromSlot, toSlot);
    const hi = Math.max(fromSlot, toSlot);
    const startMin = lo * 15;
    const endMin = Math.min(24 * 60, (hi + 1) * 15);
    const fmt = (m: number) => {
      const h = Math.floor(m / 60);
      const min = m % 60;
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    };
    return `${fmt(startMin)} – ${fmt(endMin)}`;
  }, [fromSlot, toSlot]);

  const pendingCount = useMemo(() => rows.filter((r) => r.status === "PENDING").length, [rows]);

  if (loading) {
    return <p className="status-ok">Loading Antrag workspace...</p>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2>Führungskraft Anträge</h2>
        <p>
          Neue Anträge starten als <strong>PENDING</strong>. Nur <strong>APPROVED</strong> fließen in die bezahlten Slots (KPI / Abrechnung) ein.
        </p>
      </div>

      <div className="panel grid cols-3">
        <label>
          Agent
          <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.fullName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Datum
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          Antragstyp
          <select value={type} onChange={(event) => setType(event.target.value as "STOERUNG" | "MEETING")}>
            <option value="STOERUNG">Antrag Störung</option>
            <option value="MEETING">Antrag Meeting</option>
          </select>
        </label>
        <label>
          Zeitfenster (15-Minuten-Slots)
          <div className="row" style={{ alignItems: "stretch" }}>
            <div className="panel" style={{ flex: 1, marginBottom: 0, padding: "10px 12px" }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>{dayLabel}</p>
              <p style={{ margin: "6px 0 0", fontWeight: 700, fontSize: 15 }}>{slotRangeLabel}</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                Index {Math.min(fromSlot, toSlot)}–{Math.max(fromSlot, toSlot)} · {slotHours} h
              </p>
            </div>
            <button type="button" className="btn-secondary" style={{ alignSelf: "center" }} onClick={() => setSlotPickerOpen(true)}>
              Slots wählen
            </button>
          </div>
        </label>
        <label>
          Notiz
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="optional" />
        </label>
        <div className="row">
          <button onClick={createAntrag}>Antrag anlegen (PENDING)</button>
          <span className="pill">{slotHours}h (nach Freigabe bezahlt)</span>
        </div>
      </div>

      <div className="panel row">
        <label>
          Monat
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <label>
          Status-Filter
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | AntragStatus)}>
            <option value="">Alle</option>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </label>
        <button onClick={loadMonth}>Monat laden</button>
        {pendingCount > 0 && <span className="pill">{pendingCount} offen</span>}
      </div>

      <p className={status.toLowerCase().includes("geladen") || status.toLowerCase().includes("genehmigt") ? "status-ok" : "status-bad"}>
        {status}
      </p>

      <QuarterHourSlotPicker
        open={slotPickerOpen}
        dayLabel={dayLabel}
        initialFrom={fromSlot}
        initialTo={toSlot}
        onClose={() => setSlotPickerOpen(false)}
        onConfirm={(from, to) => {
          setFromSlot(from);
          setToSlot(to);
        }}
      />

      <div className="panel">
        <h3>Anträge ({month})</h3>
        <table>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Agent</th>
              <th>Typ</th>
              <th>Status</th>
              <th>Slots</th>
              <th>Stunden</th>
              <th>Notiz</th>
              <th>Erstellt</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>{agents.find((agent) => agent.id === row.agentId)?.fullName ?? row.agentId}</td>
                <td>{row.type}</td>
                <td>{row.status}</td>
                <td>
                  {row.fromSlot} – {row.toSlot}
                </td>
                <td>{((row.toSlot - row.fromSlot + 1) * 0.25).toFixed(2)}</td>
                <td>{row.note ?? "—"}</td>
                <td>{row.createdAtIso}</td>
                <td>
                  {row.status === "PENDING" ? (
                    <div className="row">
                      <button onClick={() => approve(row.id)}>Freigeben</button>
                      <button className="btn-danger" onClick={() => reject(row.id)}>
                        Ablehnen
                      </button>
                    </div>
                  ) : (
                    <span className="pill">{row.decidedAtIso ?? "—"}</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9}>Keine Anträge im gewählten Filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Verlauf (Audit)</h3>
        <table>
          <thead>
            <tr>
              <th>Zeit</th>
              <th>Aktion</th>
              <th>Antrag-ID</th>
              <th>Actor</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {history.slice(0, 80).map((h) => (
              <tr key={h.id}>
                <td>{h.atIso}</td>
                <td>{h.action}</td>
                <td style={{ fontSize: 12 }}>{h.antragId}</td>
                <td style={{ fontSize: 12 }}>{h.actorUserId}</td>
                <td style={{ fontSize: 12 }}>{h.payload}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={5}>Keine Historie für diesen Monat / Agent.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
