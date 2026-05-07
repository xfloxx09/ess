"use client";

import { useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

type Dashboard = {
  projects: Array<{ id: string; name: string; abteilungId: string }>;
  products: Array<{ id: string; name: string; category: string }>;
  premiums: Array<{ id: string; projectId: string; productId: string; amountEuro: number }>;
};

export default function AdminCatalogPage() {
  const { token, loading } = useRequireAuth(["ADMIN"]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [projectName, setProjectName] = useState("");
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState("Internet");
  const [premium, setPremium] = useState({ projectId: "", productId: "", amountEuro: 0 });
  const [status, setStatus] = useState("Manage product catalog and premium mapping.");

  async function reload() {
    if (!token) {
      return;
    }
    try {
      const snapshot = await api<Dashboard>("/config/dashboard", undefined, token);
      setDashboard(snapshot);
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function saveProject() {
    if (!token || !projectName.trim()) {
      return;
    }
    try {
      await api("/config/project", { method: "POST", body: JSON.stringify({ name: projectName.trim() }) }, token);
      setStatus("Project saved");
      setProjectName("");
      await reload();
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function saveProduct() {
    if (!token || !productName.trim()) {
      return;
    }
    try {
      await api(
        "/config/product",
        { method: "POST", body: JSON.stringify({ name: productName.trim(), category: productCategory }) },
        token,
      );
      setStatus("Product saved");
      setProductName("");
      await reload();
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function savePremium() {
    if (!token) {
      return;
    }
    try {
      await api("/config/premium", { method: "POST", body: JSON.stringify(premium) }, token);
      setStatus("Premium mapping saved");
      await reload();
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function seedDemo() {
    if (!token) {
      return;
    }
    try {
      const result = await api<{ message: string; createdDays: number; createdSales: number }>(
        "/config/seed-demo",
        { method: "POST" },
        token,
      );
      setStatus(`${result.message} Created days: ${result.createdDays}, sales: ${result.createdSales}`);
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  if (loading) {
    return <p className="status-ok">Loading admin catalog...</p>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2>Admin Catalog</h2>
        <p>Maintain projects, products and premium mappings with payroll impact visibility.</p>
      </div>

      <div className="panel row">
        <button onClick={reload}>Refresh snapshot</button>
        <button className="btn-secondary" onClick={seedDemo}>
          Seed random demo data
        </button>
      </div>

      <div className="panel grid cols-2">
        <label>
          New project name
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
        </label>
        <button onClick={saveProject}>Save project</button>
        <label>
          New product name
          <input value={productName} onChange={(event) => setProductName(event.target.value)} />
        </label>
        <label>
          Product category
          <input value={productCategory} onChange={(event) => setProductCategory(event.target.value)} />
        </label>
        <button onClick={saveProduct}>Save product</button>
      </div>

      <div className="panel grid cols-2">
        <label>
          Project
          <select value={premium.projectId} onChange={(event) => setPremium((prev) => ({ ...prev, projectId: event.target.value }))}>
            <option value="">Select project...</option>
            {(dashboard?.projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Product
          <select value={premium.productId} onChange={(event) => setPremium((prev) => ({ ...prev, productId: event.target.value }))}>
            <option value="">Select product...</option>
            {(dashboard?.products ?? []).map((product) => (
              <option key={product.id} value={product.id}>
                {product.category} · {product.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prämie (EUR)
          <input
            type="number"
            step="0.01"
            value={premium.amountEuro}
            onChange={(event) => setPremium((prev) => ({ ...prev, amountEuro: Number(event.target.value) }))}
          />
        </label>
        <button onClick={savePremium}>Save premium</button>
      </div>

      <p className={status.toLowerCase().includes("saved") ? "status-ok" : "status-bad"}>{status}</p>

      {dashboard && (
        <div className="panel">
          <h3>Premium Mapping</h3>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Product</th>
                <th>Prämie</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.premiums.map((mapping) => (
                <tr key={mapping.id}>
                  <td>{dashboard.projects.find((project) => project.id === mapping.projectId)?.name ?? mapping.projectId}</td>
                  <td>
                    {(() => {
                      const product = dashboard.products.find((item) => item.id === mapping.productId);
                      return product ? `${product.category} · ${product.name}` : mapping.productId;
                    })()}
                  </td>
                  <td>{mapping.amountEuro.toFixed(2)} EUR</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
