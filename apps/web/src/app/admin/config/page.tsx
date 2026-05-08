"use client";

import { useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

type Dashboard = {
  projects: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string; category: string }>;
  bookingTypes: Array<{ id: string; label: string; code: string }>;
  rateTables: Array<{ id: string; shiftType: string; euroPerHour: number }>;
  quarterHourCodes: Array<{ id: string; code: string; label: string; color: string }>;
};

type ControllingPolicy = { id: string; liveBlockMinutes: number; updatedAt: string };

export default function ConfigPage() {
  const { token, loading } = useRequireAuth(["ADMIN"]);
  const [code, setCode] = useState({ code: "A", label: "Anwesend", color: "#3498db", valueMultiplier: 1 });
  const [rate, setRate] = useState({ shiftType: "FRUEH", euroPerHour: 12.5 });
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [controllingPolicy, setControllingPolicy] = useState<ControllingPolicy | null>(null);
  const [liveBlockMinutes, setLiveBlockMinutes] = useState(30);
  const [status, setStatus] = useState("Update rate tables and quarter-hour semantics.");

  async function load() {
    if (!token) {
      return;
    }
    try {
      const response = await api<Dashboard>("/config/dashboard", undefined, token);
      setDashboard(response);
      setStatus("Configuration loaded");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function loadControllingPolicy() {
    if (!token) return;
    try {
      const p = await api<ControllingPolicy>("/controlling/policy", undefined, token);
      setControllingPolicy(p);
      setLiveBlockMinutes(p.liveBlockMinutes);
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function saveControllingPolicy() {
    if (!token) return;
    try {
      const p = await api<ControllingPolicy>("/controlling/policy", { method: "PATCH", body: { liveBlockMinutes }, token });
      setControllingPolicy(p);
      setStatus("Controlling live block updated");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function saveCode() {
    if (!token) {
      return;
    }
    try {
      await api("/config/quarter-hour-code", { method: "POST", body: JSON.stringify(code) }, token);
      setStatus("Quarter-hour code saved");
      await load();
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function saveRate() {
    if (!token) {
      return;
    }
    try {
      await api("/config/rate", { method: "POST", body: JSON.stringify(rate) }, token);
      setStatus("Rate saved");
      await load();
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  if (loading) {
    return <p className="status-ok">Loading configuration studio...</p>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2>Configuration Studio</h2>
        <p>Centralized rule governance for code semantics, valuation logic and compensation rates.</p>
      </div>

      <div className="panel grid cols-2">
        <h3 className="col-span-2">Controlling – Live-Block (Minuten)</h3>
        <p className="col-span-2 text-sm text-muted-foreground">
          Intervall für Live-A/P/N (Stufe 1). Nur der aktuelle Block nach Europe/Berlin ist editierbar.
        </p>
        <label>
          Minuten
          <input
            type="number"
            min={5}
            max={180}
            step={5}
            value={liveBlockMinutes}
            onChange={(event) => setLiveBlockMinutes(Number(event.target.value))}
          />
        </label>
        <div className="flex gap-2 items-end">
          <button type="button" className="btn-secondary" onClick={() => void loadControllingPolicy()}>
            Load policy
          </button>
          <button type="button" onClick={() => void saveControllingPolicy()}>
            Save policy
          </button>
        </div>
        {controllingPolicy && (
          <p className="col-span-2 text-xs text-muted-foreground">Last updated: {controllingPolicy.updatedAt}</p>
        )}
      </div>

      <div className="panel grid cols-2">
        <label>
          Quarter-hour code
          <input value={code.code} onChange={(event) => setCode((prev) => ({ ...prev, code: event.target.value }))} />
        </label>
        <label>
          Label
          <input value={code.label} onChange={(event) => setCode((prev) => ({ ...prev, label: event.target.value }))} />
        </label>
        <label>
          Color
          <input type="color" value={code.color} onChange={(event) => setCode((prev) => ({ ...prev, color: event.target.value }))} />
        </label>
        <label>
          Value Multiplier
          <input
            type="number"
            step="0.1"
            value={code.valueMultiplier}
            onChange={(event) => setCode((prev) => ({ ...prev, valueMultiplier: Number(event.target.value) }))}
          />
        </label>
        <button onClick={saveCode}>Save code</button>
        <label>
          Shift Type
          <input value={rate.shiftType} onChange={(event) => setRate((prev) => ({ ...prev, shiftType: event.target.value }))} />
        </label>
        <label>
          EUR / Hour
          <input
            type="number"
            step="0.5"
            value={rate.euroPerHour}
            onChange={(event) => setRate((prev) => ({ ...prev, euroPerHour: Number(event.target.value) }))}
          />
        </label>
        <button onClick={saveRate}>Save rate</button>
        <button className="btn-secondary" onClick={load}>
          Load dashboard
        </button>
      </div>
      <p className={status.toLowerCase().includes("saved") || status.toLowerCase().includes("loaded") ? "status-ok" : "status-bad"}>
        {status}
      </p>

      {dashboard && (
        <div className="panel">
          <h3>Current Config Snapshot</h3>
          <p>Projects: {dashboard.projects.length}</p>
          <p>Products: {dashboard.products.length}</p>
          <p>Booking types: {dashboard.bookingTypes.length}</p>
          <p>Rate tables: {dashboard.rateTables.length}</p>
          <p>Quarter-hour codes: {dashboard.quarterHourCodes.length}</p>

          <h3>Rate table</h3>
          <table>
            <thead>
              <tr>
                <th>Shift Type</th>
                <th>EUR / Hour</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.rateTables.map((rateItem) => (
                <tr key={rateItem.id}>
                  <td>{rateItem.shiftType}</td>
                  <td>{rateItem.euroPerHour.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
