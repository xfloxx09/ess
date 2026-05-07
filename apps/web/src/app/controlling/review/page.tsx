"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

type Agent = { id: string; fullName: string; email: string };
type Code = { id: string; code: string; label: string; color: string; valueMultiplier: number };
type Cell = { id: string; date: string; slotIndex: number; controllerCode: string; rawCode: string; version: number; updatedAtIso: string };
type ShiftHistory = {
  id: string;
  date: string;
  slotIndex: number;
  action: "UPSERT";
  version: number;
  atIso: string;
};

export default function ControllingReviewPage() {
  const { token, loading } = useRequireAuth({
    roles: ["CONTROLLING", "ADMIN"],
    anyViews: ["controlling_review"],
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [agentId, setAgentId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [controllerCode, setControllerCode] = useState("A");
  const [rawCode, setRawCode] = useState("A");
  const [fromSlot, setFromSlot] = useState(36);
  const [toSlot, setToSlot] = useState(68);
  const [cells, setCells] = useState<Cell[]>([]);
  const [history, setHistory] = useState<ShiftHistory[]>([]);
  const [status, setStatus] = useState("Set range and apply marks.");

  useEffect(() => {
    if (!token) {
      return;
    }
    Promise.all([api<Agent[]>("/shiftplan/agents", undefined, token), api<Code[]>("/shiftplan/codes", undefined, token)])
      .then(([agentData, codeData]) => {
        setAgents(agentData);
        setCodes(codeData);
        if (agentData[0] && !agentId) {
          setAgentId(agentData[0].id);
        }
        if (codeData[0] && !controllerCode) {
          setControllerCode(codeData[0].code);
          setRawCode(codeData[0].code);
        }
      })
      .catch((error) => setStatus(toMessage(error)));
  }, [token, agentId, controllerCode]);

  async function refreshDay() {
    if (!token || !agentId) {
      return;
    }
    try {
      const month = date.slice(0, 7);
      const payload = await api<{ cells: Cell[]; days: Array<{ date: string }> }>(
        `/shiftplan/agent-final-month?month=${month}&agentId=${agentId}`,
        undefined,
        token,
      );
      const changes = await api<ShiftHistory[]>(
        `/shiftplan/history?month=${month}&agentId=${agentId}`,
        undefined,
        token,
      );
      setCells(payload.cells.filter((cell) => cell.date === date).sort((a, b) => a.slotIndex - b.slotIndex));
      setHistory(changes.filter((entry) => entry.date === date));
      setStatus("Loaded day matrix");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function applyRange() {
    if (!token || !agentId) {
      return;
    }
    try {
      const start = Math.max(0, Math.min(fromSlot, toSlot));
      const end = Math.min(95, Math.max(fromSlot, toSlot));
      const slots = Array.from({ length: end - start + 1 }, (_, idx) => ({
        slotIndex: start + idx,
        controllerCode,
        rawCode,
        expectedVersion: cells.find((entry) => entry.slotIndex === start + idx)?.version,
      }));
      await api(
        "/shiftplan/bulk",
        {
          method: "POST",
          body: JSON.stringify({ agentId, date, slots }),
        },
        token,
      );
      setStatus(`Updated ${slots.length} slots`);
      await refreshDay();
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  const summary = useMemo(() => {
    const agreed = cells.filter((cell) => cell.controllerCode === cell.rawCode).length;
    const disagreed = cells.length - agreed;
    const aSlots = cells.filter((cell) => cell.controllerCode === "A" && cell.rawCode === "A").length;
    const pSlots = cells.filter((cell) => cell.controllerCode === "P" && cell.rawCode === "P").length;
    return { agreed, disagreed, aSlots, pSlots };
  }, [cells]);

  if (loading) {
    return <p className="status-ok">Loading controlling workspace...</p>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2>Controlling Review</h2>
        <p>Fill and reconcile quarter-hour evidence between controlling and raw provider marks.</p>
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
          Date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          Controller code
          <select value={controllerCode} onChange={(event) => setControllerCode(event.target.value)}>
            {codes.map((code) => (
              <option key={code.id} value={code.code}>
                {code.code} ({code.label})
              </option>
            ))}
          </select>
        </label>
        <label>
          Raw code
          <select value={rawCode} onChange={(event) => setRawCode(event.target.value)}>
            {codes.map((code) => (
              <option key={code.id} value={code.code}>
                {code.code} ({code.label})
              </option>
            ))}
          </select>
        </label>
        <label>
          Slot from (0-95)
          <input type="number" min={0} max={95} value={fromSlot} onChange={(event) => setFromSlot(Number(event.target.value))} />
        </label>
        <label>
          Slot to (0-95)
          <input type="number" min={0} max={95} value={toSlot} onChange={(event) => setToSlot(Number(event.target.value))} />
        </label>
        <div className="row">
          <button onClick={applyRange}>Apply range</button>
          <button className="btn-secondary" onClick={refreshDay}>
            Refresh day
          </button>
        </div>
      </div>

      <p className={status.toLowerCase().includes("updated") || status.toLowerCase().includes("loaded") ? "status-ok" : "status-bad"}>
        {status}
      </p>

      <div className="kpi-grid">
        <div className="kpi-card">
          <p className="label">Agreed slots</p>
          <p className="value">{summary.agreed}</p>
        </div>
        <div className="kpi-card">
          <p className="label">Disagreed slots</p>
          <p className="value">{summary.disagreed}</p>
        </div>
        <div className="kpi-card">
          <p className="label">A slots</p>
          <p className="value">{summary.aSlots}</p>
        </div>
        <div className="kpi-card">
          <p className="label">P slots</p>
          <p className="value">{summary.pSlots}</p>
        </div>
      </div>

      <div className="panel">
        <h3>Quarter-hour day matrix</h3>
        <table>
          <thead>
            <tr>
              <th>Slot</th>
              <th>Controlling</th>
              <th>Raw</th>
              <th>Version</th>
              <th>Agree</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((cell) => (
              <tr key={cell.id}>
                <td>{cell.slotIndex}</td>
                <td>{cell.controllerCode}</td>
                <td>{cell.rawCode}</td>
                <td>{cell.version}</td>
                <td>{cell.controllerCode === cell.rawCode ? "✅" : "⚠️"}</td>
              </tr>
            ))}
            {cells.length === 0 && (
              <tr>
                <td colSpan={5}>No slots loaded yet for this date.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Day change history</h3>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Slot</th>
              <th>Action</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            {history.slice(0, 120).map((entry) => (
              <tr key={entry.id}>
                <td>{entry.atIso}</td>
                <td>{entry.slotIndex}</td>
                <td>{entry.action}</td>
                <td>{entry.version}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={4}>No history rows for this day.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
