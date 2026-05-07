"use client";

import { useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

type AgentMonthResponse = {
  days: Array<{
    id: string;
    date: string;
    minuteIb: number;
    minuteOb: number;
    waitMinutes: number;
    salesEuro: number;
    npsEuro: number;
    approvedA: number;
    approvedP: number;
    antragPaidSlots: number;
    antragPaidMinutes: number;
    antragPaidTypes: string[];
    antragPendingSlots: number;
    antragPendingCount: number;
    agreedSlots: number;
    disagreedSlots: number;
    bookingLabel?: string;
    bookingCode?: string;
    baseEuro: number;
    dayEuro: number;
  }>;
  abrechnung: {
    baseEuro: number;
    salesEuro: number;
    npsEuro: number;
    totalEuro: number;
  };
  totals: {
    minuteIb: number;
    minuteOb: number;
    waitMinutes: number;
    antragPaidMinutes: number;
    antragPendingSlots: number;
    salesEuro: number;
    npsEuro: number;
  };
};

export default function AgentViewPage() {
  const { token, loading } = useRequireAuth(["AGENT"]);
  const [month, setMonth] = useState("2026-04");
  const [data, setData] = useState<AgentMonthResponse | null>(null);
  const [status, setStatus] = useState("Click Anzeigen");

  async function load() {
    if (!token) {
      return;
    }
    try {
      const response = await api<AgentMonthResponse>(`/kpi/agent-month?month=${month}`, undefined, token);
      setData(response);
      setStatus("Loaded");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  if (loading) {
    return <p className="status-ok">Loading AgentView...</p>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2>AgentView (FEST)</h2>
        <p>Daily KPI visibility with transparent monthly payout simulation.</p>
      </div>

      <div className="panel row">
        <label>
          Month
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <button onClick={load}>Anzeigen</button>
      </div>
      <p className={status === "Loaded" ? "status-ok" : "status-bad"}>{status}</p>

      {data && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <p className="label">Minute IB</p>
              <p className="value">{data.totals.minuteIb}</p>
            </div>
            <div className="kpi-card">
              <p className="label">Minute OB</p>
              <p className="value">{data.totals.minuteOb}</p>
            </div>
            <div className="kpi-card">
              <p className="label">Wartezeit</p>
              <p className="value">{data.totals.waitMinutes}</p>
            </div>
            <div className="kpi-card">
              <p className="label">Antrag paid min</p>
              <p className="value">{data.totals.antragPaidMinutes}</p>
            </div>
            <div className="kpi-card">
              <p className="label">Antrag pending (15m slots)</p>
              <p className="value">{data.totals.antragPendingSlots}</p>
            </div>
            <div className="kpi-card">
              <p className="label">Gesamt EUR</p>
              <p className="value">{data.abrechnung.totalEuro.toFixed(2)}</p>
            </div>
          </div>

          <div className="panel">
            <h3>Daily KPI Ledger</h3>
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Booked</th>
                  <th>A (15m)</th>
                  <th>P (15m)</th>
                  <th>Antrag paid</th>
                  <th>Antrag paid (Typen)</th>
                  <th>Antrag pending</th>
                  <th>Agreed</th>
                  <th>Diff</th>
                  <th>Minute IB</th>
                  <th>Minute OB</th>
                  <th>Wartezeit</th>
                  <th>Base</th>
                  <th>Sales</th>
                  <th>NPS</th>
                  <th>Day Total</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((day) => (
                  <tr key={day.id}>
                    <td>{day.date}</td>
                    <td>
                      {day.bookingLabel ?? "-"} {day.bookingCode ? `(${day.bookingCode})` : ""}
                    </td>
                    <td>{day.approvedA}</td>
                    <td>{day.approvedP}</td>
                    <td>
                      {day.antragPaidSlots} slots / {day.antragPaidMinutes} min
                    </td>
                    <td>{day.antragPaidTypes.length > 0 ? day.antragPaidTypes.join(", ") : "-"}</td>
                    <td>
                      {day.antragPendingSlots > 0
                        ? `${day.antragPendingSlots} slots (${day.antragPendingCount} Anträge)`
                        : "-"}
                    </td>
                    <td>{day.agreedSlots}</td>
                    <td>{day.disagreedSlots}</td>
                    <td>{day.minuteIb}</td>
                    <td>{day.minuteOb}</td>
                    <td>{day.waitMinutes}</td>
                    <td>{day.baseEuro.toFixed(2)} EUR</td>
                    <td>{day.salesEuro.toFixed(2)} EUR</td>
                    <td>{day.npsEuro.toFixed(2)} EUR</td>
                    <td>{day.dayEuro.toFixed(2)} EUR</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <h3>Abrechnung</h3>
            <div className="kpi-grid">
              <div className="kpi-card">
                <p className="label">Basis</p>
                <p className="value">{data.abrechnung.baseEuro.toFixed(2)} EUR</p>
              </div>
              <div className="kpi-card">
                <p className="label">Sales</p>
                <p className="value">{data.abrechnung.salesEuro.toFixed(2)} EUR</p>
              </div>
              <div className="kpi-card">
                <p className="label">NPS</p>
                <p className="value">{data.abrechnung.npsEuro.toFixed(2)} EUR</p>
              </div>
              <div className="kpi-card">
                <p className="label">Gesamt</p>
                <p className="value">{data.abrechnung.totalEuro.toFixed(2)} EUR</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
