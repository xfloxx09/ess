"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRequireAuth, toMessage } from "@/lib/auth";
import { useT } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface ImportJob {
  id: string;
  fileName: string;
  status: string;
  rowsTotal: number;
  rowsAccepted: number;
  rowsRejected: number;
  message: string | null;
  createdAt: string;
  finishedAt: string | null;
  uploadedBy?: { id: string; fullName: string; email: string };
}

interface DryRunResult {
  fileName: string;
  lineCount: number;
  headers: string[];
  sample: Array<Record<string, string>>;
}

type ImportKind = "GENERIC" | "KPI_DAILY" | "SALES";

export default function ImportsPage() {
  const auth = useRequireAuth({ anyViews: ["controlling_imports"] });
  const t = useT();
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [kind, setKind] = useState<ImportKind>("KPI_DAILY");
  const [csvText, setCsvText] = useState("");
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);

  const history = useQuery({
    queryKey: ["imports", "history"],
    queryFn: () => api<ImportJob[]>("/imports/history?take=50", { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const dryRunM = useMutation({
    mutationFn: () => api<DryRunResult>("/imports/dry-run", { method: "POST", body: { fileName: fileName || "upload.csv", csv: csvText }, token: auth.token ?? undefined }),
    onSuccess: (data) => {
      setDryRun(data);
      toast.success(`Vorschau: ${data.lineCount} Zeilen`);
    },
    onError: (err) => toast.error(toMessage(err)),
  });

  const commit = useMutation({
    mutationFn: () =>
      api<ImportJob>("/imports/commit", {
        method: "POST",
        body: { source: fileName || "upload.csv", body: csvText, kind },
        token: auth.token ?? undefined,
      }),
    onSuccess: (data) => {
      toast.success(`Import gestartet (${data.id.slice(0, 8)})`);
      setCsvText("");
      setDryRun(null);
      queryClient.invalidateQueries({ queryKey: ["imports"] });
    },
    onError: (err) => toast.error(toMessage(err)),
  });

  return (
    <>
      <PageHeader title={t("imports.title")} description="CSV-Daten importieren (Mapping per Header)" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Neuer Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>{t("imports.fileName")}</Label>
                <Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="kpi-2024-04.csv" />
              </div>
              <div>
                <Label>Art</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as ImportKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KPI_DAILY">{t("imports.kind.KPI_DAILY")}</SelectItem>
                    <SelectItem value="SALES">{t("imports.kind.SALES")}</SelectItem>
                    <SelectItem value="GENERIC">{t("imports.kind.GENERIC")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>CSV-Inhalt</Label>
              <Textarea
                rows={10}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={
                  kind === "KPI_DAILY"
                    ? "email,date,minuteIb,minuteOb,waitMinutes,salesEuro,npsEuro\nagent@ess.local,2024-04-01,180,30,15,12.50,0"
                    : kind === "SALES"
                      ? "email,date,project,product,quantity,contractRef\nagent@ess.local,2024-04-01,GK CM KMU,Fiber Upgrade,1,V-1"
                      : "header1,header2\nvalue1,value2"
                }
                className="font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => dryRunM.mutate()} disabled={!csvText || dryRunM.isPending}>
                {dryRunM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {t("imports.dryRun")}
              </Button>
              <Button onClick={() => commit.mutate()} disabled={!csvText || commit.isPending}>
                {commit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {t("imports.commit")}
              </Button>
            </div>
            {dryRun && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div className="mb-2 font-medium">
                  Vorschau: {dryRun.lineCount} Zeilen, Header: {dryRun.headers.join(", ")}
                </div>
                <pre className="overflow-auto">{JSON.stringify(dryRun.sample, null, 2)}</pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("imports.history")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datei</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Zeilen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data?.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">{job.fileName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "destructive" : "secondary"
                        }
                      >
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {job.rowsAccepted}/{job.rowsTotal}
                    </TableCell>
                  </TableRow>
                ))}
                {!history.data?.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      {t("app.noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
