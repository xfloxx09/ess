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

type L2Row = {
  agent: { id: string; fullName: string; email: string; teamId: string | null; teamName: string | null };
  liveObservationCount: number;
  agentDay: {
    id: string;
    l2Released: boolean | null;
    l2Note: string | null;
    l2DecidedAt: string | null;
  } | null;
};

type L2Board = { date: string; projectId: string; rows: L2Row[] };

export default function ControllingLevel2Page() {
  const auth = useRequireAuth({ anyViews: ["controlling_level2"] });
  const t = useT();
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("");

  const projects = useQuery({
    queryKey: ["shiftplan", "projects"],
    queryFn: () => api<Project[]>("/shiftplan/projects", { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const board = useQuery({
    queryKey: ["controlling", "l2", projectId, date],
    queryFn: () =>
      api<L2Board>(
        `/controlling/l2/board?projectId=${encodeURIComponent(projectId)}&date=${encodeURIComponent(date)}`,
        { token: auth.token ?? undefined },
      ),
    enabled: !!auth.token && !!projectId,
  });

  const decide = useMutation({
    mutationFn: async (p: { agentId: string; released: boolean }) => {
      return api(`/controlling/l2/${encodeURIComponent(p.agentId)}/${encodeURIComponent(date)}`, {
        method: "PATCH",
        body: { released: p.released },
        token: auth.token ?? undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["controlling", "l2", projectId, date] });
      setStatus(t("app.save"));
    },
    onError: (e) => setStatus(toMessage(e)),
  });

  if (auth.loading || !auth.token) {
    return <p className="p-6 text-muted-foreground">{t("app.loading")}</p>;
  }

  return (
    <>
      <PageHeader title={t("controlling.level2.title")} description={t("controlling.level2.subtitle")} />

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
          <CardTitle>{t("controlling.level2.tableTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!projectId && <p className="text-sm text-muted-foreground">{t("controlling.level2.pickProjectHint")}</p>}
          {projectId && board.isLoading && <Skeleton className="h-64" />}
          {projectId && board.data && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">{t("users.table.name")}</th>
                    <th className="py-2 pr-4">{t("users.table.email")}</th>
                    <th className="py-2 pr-4">{t("users.table.team")}</th>
                    <th className="py-2 pr-4">{t("controlling.level2.liveCount")}</th>
                    <th className="py-2 pr-4">{t("controlling.level2.l2Status")}</th>
                    <th className="py-2">{t("app.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {board.data.rows.map((row) => (
                    <tr key={row.agent.id} className="border-b border-border/60">
                      <td className="py-2 pr-4 font-medium">{row.agent.fullName}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{row.agent.email}</td>
                      <td className="py-2 pr-4">{row.agent.teamName ?? "—"}</td>
                      <td className="py-2 pr-4 tabular-nums">{row.liveObservationCount}</td>
                      <td className="py-2 pr-4">
                        {row.agentDay?.l2DecidedAt == null
                          ? t("controlling.level2.pending")
                          : row.agentDay.l2Released
                            ? t("controlling.level2.released")
                            : t("controlling.level2.rejected")}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="default" onClick={() => decide.mutate({ agentId: row.agent.id, released: true })} disabled={decide.isPending}>
                            {t("controlling.level2.approve")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => decide.mutate({ agentId: row.agent.id, released: false })} disabled={decide.isPending}>
                            {t("controlling.level2.reject")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {board.data.rows.length === 0 && <p className="py-6 text-muted-foreground">{t("app.noData")}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {status ? <p className="mt-4 text-sm text-muted-foreground">{status}</p> : null}
    </>
  );
}
