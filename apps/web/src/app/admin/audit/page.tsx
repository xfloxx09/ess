"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { api, getApiBase } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { useT } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface AuditRow {
  id: string;
  createdAt: string;
  action: string;
  resource: string;
  resourceId: string | null;
  payload: unknown;
  actor: { id: string; email: string; fullName: string } | null;
}

interface AuditList {
  items: AuditRow[];
  total: number;
}

export default function AdminAuditPage() {
  const auth = useRequireAuth({ roles: ["ADMIN"], anyViews: ["admin_audit"] });
  const t = useT();
  const [filters, setFilters] = useState({ resource: "", action: "" });

  const list = useQuery({
    queryKey: ["audit", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.resource) params.set("resource", filters.resource);
      if (filters.action) params.set("action", filters.action);
      params.set("take", "200");
      return api<AuditList>(`/audit?${params.toString()}`, { token: auth.token ?? undefined });
    },
    enabled: !!auth.token,
  });

  const exportUrl = `${getApiBase()}/audit/export.csv?${new URLSearchParams({ resource: filters.resource, action: filters.action }).toString()}`;

  return (
    <>
      <PageHeader
        title={t("audit.title")}
        actions={
          <Button asChild variant="outline">
            <a href={exportUrl} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4" />
              {t("audit.exportCsv")}
            </a>
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <Label className="text-xs">{t("audit.resource")}</Label>
          <Input value={filters.resource} onChange={(e) => setFilters({ ...filters, resource: e.target.value })} placeholder="z. B. user, sales.entry" />
        </div>
        <div>
          <Label className="text-xs">{t("audit.action")}</Label>
          <Input value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} placeholder="CREATE, UPDATE, DELETE…" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Zeit</TableHead>
                <TableHead>{t("audit.actor")}</TableHead>
                <TableHead>{t("audit.action")}</TableHead>
                <TableHead>{t("audit.resource")}</TableHead>
                <TableHead>Payload</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{row.actor?.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.action}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.resource}
                    {row.resourceId ? <span className="text-muted-foreground">:{row.resourceId.slice(0, 8)}</span> : null}
                  </TableCell>
                  <TableCell>
                    <details>
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        <FileText className="mr-1 inline h-3 w-3" /> view
                      </summary>
                      <pre className="mt-2 max-w-xl overflow-auto rounded-md bg-muted p-2 text-[10px]">{JSON.stringify(row.payload, null, 2)}</pre>
                    </details>
                  </TableCell>
                </TableRow>
              ))}
              {list.data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t("app.noData")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
