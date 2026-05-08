"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toMessage, useAuth, useRequireAuth } from "@/lib/auth";
import { useT } from "@/i18n/provider";
import { formatDate, formatEuro } from "@/lib/utils";

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
  contractRef?: string | null;
  orderRef?: string | null;
  note?: string | null;
  createdAt: string;
};

export default function AgentSalesPage() {
  const auth = useRequireAuth(["AGENT"]);
  const { user } = useAuth();
  const t = useT();
  const qc = useQueryClient();
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [premiumsOpen, setPremiumsOpen] = useState(false);

  const catalog = useQuery({
    queryKey: ["sales", "catalog"],
    queryFn: () => api<CatalogResponse>("/sales/catalog", { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const entries = useQuery({
    queryKey: ["sales", "mine"],
    queryFn: () => api<SalesEntry[]>("/sales/mine", { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  useEffect(() => {
    if (!catalog.data) return;
    const preferred = user?.agentContext?.projectId;
    setForm((prev) => {
      const next = { ...prev };
      if (preferred && catalog.data!.projects.some((p) => p.id === preferred)) {
        next.projectId = preferred;
      } else if (!next.projectId && catalog.data!.projects[0]) {
        next.projectId = catalog.data!.projects[0].id;
      }
      if (!next.productId && catalog.data!.products[0]) {
        next.productId = catalog.data!.products[0].id;
      }
      return next;
    });
  }, [catalog.data, user?.agentContext?.projectId]);

  const categories = useMemo(
    () => ["All", ...new Set((catalog.data?.products ?? []).map((p) => p.category))],
    [catalog.data?.products],
  );
  const visibleProducts = useMemo(() => {
    const prods = catalog.data?.products ?? [];
    return prods.filter((p) => category === "All" || p.category === category);
  }, [catalog.data?.products, category]);

  const selectedPremium = useMemo(() => {
    const premiums = catalog.data?.premiums ?? [];
    return premiums.find((x) => x.projectId === form.projectId && x.productId === form.productId)?.amountEuro ?? 0;
  }, [catalog.data?.premiums, form.productId, form.projectId]);

  const createEntry = useMutation({
    mutationFn: () =>
      api<SalesEntry>("/sales", {
        method: "POST",
        body: {
          projectId: form.projectId,
          productId: form.productId,
          quantity: form.quantity,
          callDate: form.callDate,
          contractRef: form.contractRef || undefined,
          orderRef: form.orderRef || undefined,
          note: form.note || undefined,
        },
        token: auth.token ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sales", "mine"] });
      toast.success(`${formatEuro(selectedPremium * form.quantity)} ${t("sales.table.premium")}`);
    },
    onError: (e) => toast.error(toMessage(e)),
  });

  const removeEntry = useMutation({
    mutationFn: (id: string) => api(`/sales/mine?id=${encodeURIComponent(id)}`, { method: "DELETE", token: auth.token ?? undefined }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sales", "mine"] }),
    onError: (e) => toast.error(toMessage(e)),
  });

  const list = entries.data ?? [];
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const slice = useMemo(
    () => list.slice((pageClamped - 1) * pageSize, pageClamped * pageSize),
    [list, pageClamped, pageSize],
  );

  if (auth.loading || !auth.token) {
    return <p className="p-6 text-muted-foreground">{t("app.loading")}</p>;
  }

  const projects = catalog.data?.projects ?? [];
  const premiums = catalog.data?.premiums ?? [];

  return (
    <>
      <PageHeader title={t("agentWorkspace.salesTitle")} description={t("agentWorkspace.salesEntryOnlySubtitle")} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void entries.refetch()} disabled={entries.isFetching}>
          <RefreshCw className={entries.isFetching ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
          {t("agentWorkspace.refresh")}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setPremiumsOpen(true)}>
          {t("agentWorkspace.premiumLists")}
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("agentWorkspace.dataset")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("sales.table.project")} *</Label>
            <Select value={form.projectId} onValueChange={(v) => setForm((p) => ({ ...p, projectId: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Kategorie</Label>
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v);
                const first = catalog.data?.products.find((p) => v === "All" || p.category === v);
                if (first) setForm((prev) => ({ ...prev, productId: first.id }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>{t("sales.table.product")} *</Label>
            <Select value={form.productId} onValueChange={(v) => setForm((p) => ({ ...p, productId: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visibleProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.category} · {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>CRMT / Auftragsnummer</Label>
            <Input value={form.orderRef} onChange={(e) => setForm((p) => ({ ...p, orderRef: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t("sales.table.contractRef")}</Label>
            <Input value={form.contractRef} onChange={(e) => setForm((p) => ({ ...p, contractRef: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Prämierungsnummer / Notiz</Label>
            <Input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t("sales.table.quantity")} *</Label>
            <Input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => setForm((p) => ({ ...p, quantity: Math.max(1, Number(e.target.value) || 1) }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Stichtag *</Label>
            <Input type="date" value={form.callDate} onChange={(e) => setForm((p) => ({ ...p, callDate: e.target.value }))} />
          </div>
          <div className="flex items-end gap-3 md:col-span-2">
            <Button onClick={() => createEntry.mutate()} disabled={createEntry.isPending || !form.projectId || !form.productId}>
              + {t("app.create")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t("sales.table.premium")}: {formatEuro(selectedPremium)} × {form.quantity} = {formatEuro(selectedPremium * form.quantity)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("agentWorkspace.salesErfassungListTitle")}</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("agentWorkspace.page")}</span>
            <Input
              className="h-8 w-14"
              type="number"
              min={1}
              max={totalPages}
              value={pageClamped}
              onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
            />
            <span className="text-muted-foreground">/ {totalPages}</span>
            <span className="text-muted-foreground">{t("agentWorkspace.rows")}</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("agentWorkspace.name")}</TableHead>
                <TableHead>{t("sales.table.project")}</TableHead>
                <TableHead>{t("sales.table.product")}</TableHead>
                <TableHead>Stichtag</TableHead>
                <TableHead>{t("sales.table.quantity")}</TableHead>
                <TableHead>{t("sales.table.premium")}</TableHead>
                <TableHead>Einbuchung</TableHead>
                <TableHead>Vertrag / Auftrag</TableHead>
                <TableHead className="text-right">{t("app.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slice.map((entry) => {
                const prem =
                  catalog.data?.premiums.find((p) => p.projectId === entry.projectId && p.productId === entry.productId)?.amountEuro ?? 0;
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{user?.fullName}</TableCell>
                    <TableCell>{projects.find((p) => p.id === entry.projectId)?.name}</TableCell>
                    <TableCell>{catalog.data?.products.find((p) => p.id === entry.productId)?.name}</TableCell>
                    <TableCell>{formatDate(entry.callDate)}</TableCell>
                    <TableCell className="tabular-nums">{entry.quantity}</TableCell>
                    <TableCell className="tabular-nums">{formatEuro(prem * entry.quantity)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(entry.createdAt)}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {entry.contractRef ?? "—"} / {entry.orderRef ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeEntry.mutate(entry.id)}>
                        {t("app.delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {slice.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    {t("app.noData")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            {(pageClamped - 1) * pageSize + 1}-{Math.min(pageClamped * pageSize, list.length)} {t("app.of")} {list.length}
          </p>
        </CardContent>
      </Card>

      <Dialog open={premiumsOpen} onOpenChange={setPremiumsOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("agentWorkspace.premiumLists")}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("sales.table.product")}</TableHead>
                <TableHead className="text-right">{t("sales.table.premium")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {premiums
                .filter((pr) => pr.projectId === form.projectId)
                .map((pr) => {
                  const prod = catalog.data?.products.find((p) => p.id === pr.productId);
                  return (
                    <TableRow key={pr.id}>
                      <TableCell>{prod ? `${prod.category} · ${prod.name}` : pr.productId}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatEuro(pr.amountEuro)}</TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </>
  );
}
