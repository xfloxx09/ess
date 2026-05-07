"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

type CatalogResponse = {
  projects: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string; category: string }>;
  premiums: Array<{ id: string; projectId: string; productId: string; amountEuro: number }>;
};

type SalesEntry = {
  id: string;
  projectId: string;
  productId: string;
  quantity: number;
  callDate: string;
  contractRef?: string;
  orderRef?: string;
};

export default function AgentSalesPage() {
  const { token, loading } = useRequireAuth(["AGENT"]);
  const [catalog, setCatalog] = useState<CatalogResponse>({ projects: [], products: [], premiums: [] });
  const [entries, setEntries] = useState<SalesEntry[]>([]);
  const [category, setCategory] = useState("All");
  const [form, setForm] = useState({
    projectId: "",
    productId: "",
    quantity: 1,
    callDate: new Date().toISOString().slice(0, 10),
    contractRef: "",
    orderRef: "",
    note: "",
  });
  const [status, setStatus] = useState("Ready for new entry");

  const selectedPremium = useMemo(() => {
    return (
      catalog.premiums.find((item) => item.projectId === form.projectId && item.productId === form.productId)?.amountEuro ??
      0
    );
  }, [catalog.premiums, form.productId, form.projectId]);

  const categories = useMemo(() => ["All", ...new Set(catalog.products.map((product) => product.category))], [catalog.products]);
  const visibleProducts = useMemo(
    () => catalog.products.filter((product) => category === "All" || product.category === category),
    [catalog.products, category],
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    Promise.all([
      api<CatalogResponse>("/sales/catalog", undefined, token),
      api<SalesEntry[]>("/sales/mine", undefined, token),
    ])
      .then(([catalogData, myEntries]) => {
        setCatalog(catalogData);
        setEntries(myEntries);
        if (catalogData.projects[0] && !form.projectId) {
          setForm((prev) => ({ ...prev, projectId: catalogData.projects[0].id }));
        }
        if (catalogData.products[0] && !form.productId) {
          setForm((prev) => ({ ...prev, productId: catalogData.products[0].id }));
        }
      })
      .catch((error) => setStatus(toMessage(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submit() {
    if (!token) {
      return;
    }
    try {
      const created = await api<SalesEntry>(
        "/sales",
        {
          method: "POST",
          body: JSON.stringify(form),
        },
        token,
      );
      setEntries((prev) => [created, ...prev]);
      setStatus(`Entry saved (+${(selectedPremium * form.quantity).toFixed(2)} EUR estimated premium)`);
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function removeEntry(id: string) {
    if (!token) {
      return;
    }
    try {
      await api(`/sales/mine?id=${id}`, { method: "DELETE" }, token);
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      setStatus("Entry removed");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  if (loading) {
    return <p className="status-ok">Loading sales workspace...</p>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2>Sales-Erfassung</h2>
        <p>Track every closed product with project-linked premium logic and payout traceability.</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <p className="label">My Entries</p>
          <p className="value">{entries.length}</p>
        </div>
        <div className="kpi-card">
          <p className="label">Project Catalog</p>
          <p className="value">{catalog.projects.length}</p>
        </div>
        <div className="kpi-card">
          <p className="label">Categories</p>
          <p className="value">{new Set(catalog.products.map((item) => item.category)).size}</p>
        </div>
        <div className="kpi-card">
          <p className="label">Estimated Premium</p>
          <p className="value">{(selectedPremium * form.quantity).toFixed(2)} EUR</p>
        </div>
      </div>

      <div className="panel grid cols-2">
        <label>
          Project
          <select value={form.projectId} onChange={(event) => setForm((prev) => ({ ...prev, projectId: event.target.value }))}>
            {catalog.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Product Category
          <select
            value={category}
            onChange={(event) => {
              const nextCategory = event.target.value;
              setCategory(nextCategory);
              const first = catalog.products.find((product) => nextCategory === "All" || product.category === nextCategory);
              if (first) {
                setForm((prev) => ({ ...prev, productId: first.id }));
              }
            }}
          >
            {categories.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label>
          Product
          <select value={form.productId} onChange={(event) => setForm((prev) => ({ ...prev, productId: event.target.value }))}>
            {visibleProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.category} · {product.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input
            type="number"
            min={1}
            value={form.quantity}
            onChange={(event) => setForm((prev) => ({ ...prev, quantity: Number(event.target.value) }))}
          />
        </label>
        <label>
          Call Date
          <input
            type="date"
            value={form.callDate}
            onChange={(event) => setForm((prev) => ({ ...prev, callDate: event.target.value }))}
          />
        </label>
        <label>
          Vertragsnummer
          <input
            value={form.contractRef}
            onChange={(event) => setForm((prev) => ({ ...prev, contractRef: event.target.value }))}
          />
        </label>
        <label>
          Auftragsnummer
          <input value={form.orderRef} onChange={(event) => setForm((prev) => ({ ...prev, orderRef: event.target.value }))} />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          Notiz
          <textarea value={form.note} onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))} />
        </label>
        <div className="row">
          <button onClick={submit}>Anlegen</button>
          <span className="pill">Premium per item: {selectedPremium.toFixed(2)} EUR</span>
        </div>
      </div>

      <p className={status.toLowerCase().includes("saved") ? "status-ok" : "status-bad"}>{status}</p>

      <div className="panel">
        <h3>Recent Sales</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Project</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Premium Est.</th>
              <th>Contract / Order</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 12).map((entry) => (
              <tr key={entry.id}>
                <td>{entry.callDate}</td>
                <td>{catalog.projects.find((p) => p.id === entry.projectId)?.name ?? entry.projectId}</td>
                <td>{catalog.products.find((p) => p.id === entry.productId)?.name ?? entry.productId}</td>
                <td>{entry.quantity}</td>
                <td>{((catalog.premiums.find((p) => p.projectId === entry.projectId && p.productId === entry.productId)?.amountEuro ?? 0) * entry.quantity).toFixed(2)} EUR</td>
                <td>
                  {entry.contractRef ?? "-"} / {entry.orderRef ?? "-"}
                </td>
                <td>
                  <button className="btn-danger" onClick={() => removeEntry(entry.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={7}>No entries yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
