"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getApiBase } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { useT } from "@/i18n/provider";
import { currentMonthKey } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ReportsPage() {
  const auth = useRequireAuth({ anyViews: ["controlling_reports", "controlling_review"] });
  const t = useT();
  const [month, setMonth] = useState(currentMonthKey());
  const [projectId, setProjectId] = useState<string>("");

  const projects = useQuery({
    queryKey: ["shiftplan", "projects"],
    queryFn: () => api<Array<{ id: string; name: string }>>("/shiftplan/projects", { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const apiBase = getApiBase();
  const kpiCsv = `${apiBase}/reports/kpi.csv?month=${month}`;
  const kpiPdf = `${apiBase}/reports/kpi.pdf?month=${month}`;
  const rosterCsv = projectId ? `${apiBase}/reports/roster-month.csv?month=${month}&projectId=${projectId}` : null;

  return (
    <>
      <PageHeader title="Reports" description="KPI- und Schichtplan-Exporte" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <Label>Monat</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div>
          <Label>Projekt (für Roster-Export)</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Projekt auswählen…" />
            </SelectTrigger>
            <SelectContent>
              {projects.data?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" /> KPI Leaderboard CSV
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Auszahlungs- und Slot-Übersicht aller Agenten für den ausgewählten Monat.
            </p>
            <Button asChild>
              <a href={kpiCsv} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" /> CSV
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> KPI Report PDF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">Gedruckte Übersicht für den Monat (Top-Agenten).</p>
            <Button asChild variant="outline">
              <a href={kpiPdf} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" /> PDF
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" /> Roster-Monat CSV
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Tagesweise Anwesenheit pro Team und Agent (Projekt-Auswahl erforderlich).
            </p>
            <Button asChild disabled={!rosterCsv} variant="outline">
              {rosterCsv ? (
                <a href={rosterCsv} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" /> CSV
                </a>
              ) : (
                <span>
                  <Download className="h-4 w-4" /> CSV
                </span>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
