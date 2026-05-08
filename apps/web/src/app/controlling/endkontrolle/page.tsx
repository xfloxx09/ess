"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { toMessage, useRequireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/provider";

type Project = { id: string; name: string; abteilungId: string };

type FinalRow = {
  agent: { id: string; fullName: string; email: string; teamId: string | null; teamName: string | null };
  liveObservations: Array<{ blockIndex: number; code: string; blockMinutesSnapshot: number }>;
  agentDay: {
    id: string;
    l2Released: boolean | null;
    l2Note: string | null;
    l2DecidedAt: string | null;
    finalHoursDelta: number;
    finalNote: string | null;
    finalDecidedAt: string | null;
  } | null;
  l2Done: boolean;
  l2Released: boolean | null;
};

type FinalBoard = { date: string; projectId: string; rows: FinalRow[] };

export default function ControllingEndkontrollePage() {
  const auth = useRequireAuth({ anyViews: ["controlling_endkontrolle"] });
  const t = useT();
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hoursByAgent, setHoursByAgent] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");

  const projects = useQuery({
    queryKey: ["shiftplan", "projects"],
    queryFn: () => api<Project[]>("/shiftplan/projects", { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const board = useQuery({
    queryKey: ["controlling", "final", projectId, date],
    queryFn: () =>
      api<FinalBoard>(
        `/controlling/final/board?projectId=${encodeURIComponent(projectId)}&date=${encodeURIComponent(date)}`,
        { token: auth.token ?? undefined },
      ),
    enabled: !!auth.token && !!projectId,
  });

  const saveFinal = useMutation({
    mutationFn: async (p: { agentId: string; hoursDelta: number }) => {
      return api(`/controlling/final/${encodeURIComponent(p.agentId)}/${encodeURIComponent(date)}`, {
        method: "PATCH",
        body: { hoursDelta: p.hoursDelta },
        token: auth.token ?? undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["controlling", "final", projectId, date] });
      setStatus(t("app.save"));
    },
    onError: (e) => setStatus(toMessage(e)),
  });

  if (auth.loading || !auth.token) {
    return <p className="p-6 text-muted-foreground">{t("app.loading")}</p>;
  }

  return (
    <>
      <PageHeader title={t("controlling.end.title")} description={t("controlling.end.subtitle")} />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap gap-4 pt-6">
          <div className="space-y-2">
            <Label>{t("controlling.level2.project")}</Label>
            <Select value={projectId || undefined} onValueChange={setProjectId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder={t("controlling.level1.pickProject")} />
              </SelectTrigger>
              <SelectContent>
                {(projects.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("controlling.level1.date")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("controlling.end.tableTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!projectId && <p className="text-sm text-muted-foreground">{t("controlling.level2.pickProjectHint")}</p>}
          {projectId && board.isLoading && <Skeleton className="h-64" />}
          {projectId && board.data && (
            <div className="space-y-6">
              {board.data.rows.map((row) => {
                const codes = row.liveObservations.map((o) => `${o.blockIndex}:${o.code}`).join(", ") || "—";
                const hKey = row.agent.id;
                const raw = hoursByAgent[hKey] ?? String(row.agentDay?.finalHoursDelta ?? 0);
                return (
                  <div key={row.agent.id} className="rounded-lg border bg-muted/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold">{row.agent.fullName}</div>
                        <div className="text-xs text-muted-foreground">{row.agent.email}</div>
                        <p className="mt-2 text-sm">
                          <span className="text-muted-foreground">{t("controlling.end.live")}:</span> {codes}
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">{t("controlling.end.l2")}:</span>{" "}
                          {!row.l2Done ? t("controlling.level2.pending") : row.l2Released ? t("controlling.level2.released") : t("controlling.level2.rejected")}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">{t("controlling.end.hoursDelta")}</Label>
                          <Input
                            className="w-28"
                            type="number"
                            step="0.25"
                            value={raw}
                            onChange={(e) => setHoursByAgent((m) => ({ ...m, [hKey]: e.target.value }))}
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={() => saveFinal.mutate({ agentId: row.agent.id, hoursDelta: Number(raw) || 0 })}
                          disabled={saveFinal.isPending}
                        >
                          {t("controlling.end.saveFinal")}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {board.data.rows.length === 0 && <p className="text-muted-foreground">{t("app.noData")}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {status ? <p className="mt-4 text-sm text-muted-foreground">{status}</p> : null}
    </>
  );
}
