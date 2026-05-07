"use client";

import { useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

type ShiftplanCell = {
  id: string;
  date: string;
  slotIndex: number;
  controllerCode: string;
  rawCode: string;
};

type ShiftplanFinalResponse = {
  bookings: Array<{ id: string; date: string; bookingTypeId: string; blocks: Array<{ start: string; end: string }> }>;
  cells: ShiftplanCell[];
  antraege: Array<{
    id: string;
    date: string;
    fromSlot: number;
    toSlot: number;
    type: "STOERUNG" | "MEETING";
    status: "PENDING" | "APPROVED" | "REJECTED";
  }>;
  days: Array<{
    date: string;
    booking?: string;
    bookingCode?: string;
    agreed: number;
    disagreed: number;
    A: number;
    P: number;
    antragSlots: number;
    antragTypes: string[];
    antragPendingSlots: number;
    antragPendingTypes: string[];
  }>;
};

export default function ShiftplanPage() {
  const { token, loading } = useRequireAuth(["AGENT"]);
  const [month, setMonth] = useState("2026-04");
  const [payload, setPayload] = useState<ShiftplanFinalResponse>({ bookings: [], cells: [], antraege: [], days: [] });
  const [status, setStatus] = useState("Click Anzeigen");

  async function load() {
    if (!token) {
      return;
    }
    try {
      const response = await api<ShiftplanFinalResponse>(`/shiftplan/agent-final-month?month=${month}`, undefined, token);
      setPayload(response);
      setStatus("Loaded");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  if (loading) {
    return <p className="status-ok">Loading shiftplan...</p>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2>Agent-Schichtplan</h2>
        <p>15-minute evidence matrix from controlling marks and raw client feed comparison.</p>
      </div>

      <div className="panel row">
        <label>
          Month
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <button onClick={load}>Anzeigen</button>
      </div>
      <p className={status === "Loaded" ? "status-ok" : "status-bad"}>{status}</p>

      <div className="kpi-grid">
        <div className="kpi-card">
          <p className="label">Quarter-Hour Cells</p>
          <p className="value">{payload.cells.length}</p>
        </div>
        <div className="kpi-card">
          <p className="label">Distinct Days</p>
          <p className="value">{payload.days.length}</p>
        </div>
        <div className="kpi-card">
          <p className="label">Approved A slots</p>
          <p className="value">{payload.days.reduce((sum, day) => sum + day.A, 0)}</p>
        </div>
        <div className="kpi-card">
          <p className="label">Disagreements</p>
          <p className="value">{payload.days.reduce((sum, day) => sum + day.disagreed, 0)}</p>
        </div>
        <div className="kpi-card">
          <p className="label">Antrag slots (approved)</p>
          <p className="value">{payload.days.reduce((sum, day) => sum + day.antragSlots, 0)}</p>
        </div>
        <div className="kpi-card">
          <p className="label">Antrag pending slots</p>
          <p className="value">{payload.days.reduce((sum, day) => sum + day.antragPendingSlots, 0)}</p>
        </div>
      </div>

      <div className="panel">
        <h3>Booked vs Controlling Final View</h3>
        <table>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Booked</th>
              <th>A approved</th>
              <th>P approved</th>
              <th>Antrag (approved)</th>
              <th>Typen</th>
              <th>Antrag pending</th>
              <th>Agreed slots</th>
              <th>Disagreed slots</th>
            </tr>
          </thead>
          <tbody>
            {payload.days.map((day) => (
              <tr key={day.date}>
                <td>{day.date}</td>
                <td>
                  {day.booking ?? "Unbooked"} {day.bookingCode ? `(${day.bookingCode})` : ""}
                </td>
                <td>{day.A}</td>
                <td>{day.P}</td>
                <td>{day.antragSlots}</td>
                <td>{day.antragTypes.length > 0 ? day.antragTypes.join(", ") : "-"}</td>
                <td>
                  {day.antragPendingSlots > 0
                    ? `${day.antragPendingSlots} (${day.antragPendingTypes.join(", ")})`
                    : "-"}
                </td>
                <td>{day.agreed}</td>
                <td>{day.disagreed}</td>
              </tr>
            ))}
            {payload.days.length === 0 && (
              <tr>
                <td colSpan={10}>No data for selected month.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Quarter-hour detail (first 200 cells)</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Slot</th>
              <th>Controlling</th>
              <th>Raw</th>
              <th>Agreement</th>
            </tr>
          </thead>
          <tbody>
            {payload.cells.slice(0, 200).map((cell) => (
              <tr key={cell.id}>
                <td>{cell.date}</td>
                <td>{cell.slotIndex}</td>
                <td>{cell.controllerCode}</td>
                <td>{cell.rawCode}</td>
                <td>{cell.controllerCode === cell.rawCode ? "✅" : "⚠️"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
