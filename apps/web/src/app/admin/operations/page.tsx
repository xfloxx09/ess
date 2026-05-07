"use client";

import { useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

type LeaderboardEntry = {
  agentId: string;
  fullName: string;
  email: string;
  totalEuro: number;
  baseEuro: number;
  salesEuro: number;
  npsEuro: number;
  agreedSlots: number;
  disagreedSlots: number;
};

type OrgPayload = {
  month: string;
  leaderboard: LeaderboardEntry[];
  totals: { payoutEuro: number; agreedSlots: number; disagreedSlots: number };
};

type Reconciliation = {
  id: string;
  fullName: string;
  email: string;
  month: string;
  bookedDays: number;
  agreedSlots: number;
  disagreedSlots: number;
  agreementPct: number;
};

type SalesEntry = {
  id: string;
  agentId: string;
  projectId: string;
  productId: string;
  quantity: number;
  callDate: string;
  contractRef?: string;
  orderRef?: string;
};

export default function OperationsHubPage() {
  const { token, loading } = useRequireAuth({
    roles: ["ADMIN", "CONTROLLING"],
    anyViews: ["controlling_operations", "controlling_imports", "controlling_review", "controlling_roster_day"],
  });
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [org, setOrg] = useState<OrgPayload | null>(null);
  const [recon, setRecon] = useState<Reconciliation[]>([]);
  const [sales, setSales] = useState<SalesEntry[]>([]);
  const [search, setSearch] = useState("");
  const [minAgreement, setMinAgreement] = useState(0);
  const [salesSearch, setSalesSearch] = useState("");
  const [status, setStatus] = useState("Load operational month report.");

  async function load() {
    if (!token) {
      return;
    }
    try {
      const [orgPayload, reconPayload, salesPayload] = await Promise.all([
        api<OrgPayload>(`/kpi/org-month?month=${month}&search=${encodeURIComponent(search)}`, undefined, token),
        api<Reconciliation[]>(
          `/shiftplan/reconciliation?month=${month}&search=${encodeURIComponent(search)}&minAgreement=${minAgreement}`,
          undefined,
          token,
        ),
        api<SalesEntry[]>(`/sales/month?month=${month}&search=${encodeURIComponent(salesSearch)}`, undefined, token),
      ]);
      setOrg(orgPayload);
      setRecon(reconPayload);
      setSales(salesPayload);
      setStatus("Operational report loaded");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function removeSales(id: string) {
    if (!token) {
      return;
    }
    try {
      await api(`/sales/admin?id=${id}`, { method: "DELETE" }, token);
      setSales((prev) => prev.filter((entry) => entry.id !== id));
      setStatus("Sales entry removed");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  function exportSalesCsv() {
    const header = ["id", "agentId", "projectId", "productId", "quantity", "callDate", "contractRef", "orderRef"];
    const lines = sales.map((entry) =>
      [
        entry.id,
        entry.agentId,
        entry.projectId,
        entry.productId,
        entry.quantity,
        entry.callDate,
        entry.contractRef ?? "",
        entry.orderRef ?? "",
      ]
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `sales-audit-${month}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  if (loading) {
    return <p className="status-ok">Loading operations hub...</p>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2>Operations Hub</h2>
        <p>Cross-agent payout, reconciliation quality and sales control in one monthly cockpit.</p>
      </div>

      <div className="panel row">
        <label>
          Month
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <label>
          Agent search
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="name or email" />
        </label>
        <label>
          Min agreement %
          <input type="number" min={0} max={100} value={minAgreement} onChange={(event) => setMinAgreement(Number(event.target.value))} />
        </label>
        <label>
          Sales search
          <input value={salesSearch} onChange={(event) => setSalesSearch(event.target.value)} placeholder="contract/order/agent" />
        </label>
        <button onClick={load}>Load report</button>
        <button className="btn-secondary" onClick={exportSalesCsv}>
          Export sales CSV
        </button>
      </div>

      <p className={status.toLowerCase().includes("loaded") || status.toLowerCase().includes("removed") ? "status-ok" : "status-bad"}>
        {status}
      </p>

      {org && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <p className="label">Expected payout</p>
            <p className="value">{org.totals.payoutEuro.toFixed(2)} EUR</p>
          </div>
          <div className="kpi-card">
            <p className="label">Agreed slots</p>
            <p className="value">{org.totals.agreedSlots}</p>
          </div>
          <div className="kpi-card">
            <p className="label">Disagreed slots</p>
            <p className="value">{org.totals.disagreedSlots}</p>
          </div>
          <div className="kpi-card">
            <p className="label">Sales entries</p>
            <p className="value">{sales.length}</p>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>Agent payout leaderboard</h3>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Total</th>
              <th>Base</th>
              <th>Sales</th>
              <th>Agreed</th>
              <th>Diff</th>
            </tr>
          </thead>
          <tbody>
            {(org?.leaderboard ?? []).map((entry) => (
              <tr key={entry.agentId}>
                <td>{entry.fullName}</td>
                <td>{entry.totalEuro.toFixed(2)} EUR</td>
                <td>{entry.baseEuro.toFixed(2)} EUR</td>
                <td>{entry.salesEuro.toFixed(2)} EUR</td>
                <td>{entry.agreedSlots}</td>
                <td>{entry.disagreedSlots}</td>
              </tr>
            ))}
            {(org?.leaderboard ?? []).length === 0 && (
              <tr>
                <td colSpan={6}>No data loaded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Reconciliation quality</h3>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Booked days</th>
              <th>Agreement</th>
              <th>Agreed slots</th>
              <th>Diff slots</th>
            </tr>
          </thead>
          <tbody>
            {recon.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.fullName}</td>
                <td>{entry.bookedDays}</td>
                <td>{entry.agreementPct.toFixed(1)}%</td>
                <td>{entry.agreedSlots}</td>
                <td>{entry.disagreedSlots}</td>
              </tr>
            ))}
            {recon.length === 0 && (
              <tr>
                <td colSpan={5}>No reconciliation rows loaded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Sales audit ({month})</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Agent</th>
              <th>Project</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Refs</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.callDate}</td>
                <td>{entry.agentId}</td>
                <td>{entry.projectId}</td>
                <td>{entry.productId}</td>
                <td>{entry.quantity}</td>
                <td>
                  {entry.contractRef ?? "-"} / {entry.orderRef ?? "-"}
                </td>
                <td>
                  <button className="btn-danger" onClick={() => removeSales(entry.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={7}>No sales entries loaded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
