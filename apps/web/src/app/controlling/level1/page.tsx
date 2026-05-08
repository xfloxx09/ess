"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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

type OrgFilters = {
  abteilungen: Array<{ id: string; name: string; dienstleisterId: string }>;
  projects: Array<{ id: string; name: string; abteilungId: string }>;
};

type Team = { id: string; name: string; projectId: string; agents: Array<{ id: string; fullName: string }> };

type Board = {
  session: { id: string; date: string; projectId: string; teamIds: string[] };
  policy: { liveBlockMinutes: number };
  timeInfo: {
    berlinDate: string;
    requestedDate: string;
    currentBlockIndex: number;
    blocksPerDay: number;
    liveBlockMinutes: number;
    editableForCurrentBlock: boolean;
  };
  agents: Array<{
    id: string;
    fullName: string;
    email: string;
    teamId: string | null;
    currentBlockCode: string | null;
    observationsToday: Array<{ blockIndex: number; code: string; blockMinutesSnapshot: number }>;
  }>;
};

export default function ControllingLevel1Page() {
  const auth = useRequireAuth({ anyViews: ["controlling_level1"] });
  const t = useT();
  const qc = useQueryClient();
  const [abteilungId, setAbteilungId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const org = useQuery({
    queryKey: ["controlling", "org-filters"],
    queryFn: () => api<OrgFilters>("/controlling/org-filters", { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const projectsFiltered = useMemo(() => {
    const list = org.data?.projects ?? [];
    if (!abteilungId) return list;
    return list.filter((p) => p.abteilungId === abteilungId);
  }, [org.data?.projects, abteilungId]);

  const teams = useQuery({
    queryKey: ["shiftplan", "teams", projectId],
    queryFn: () => api<Team[]>(`/shiftplan/teams?projectId=${encodeURIComponent(projectId)}`, { token: auth.token ?? undefined }),
    enabled: !!auth.token && !!projectId,
  });

  const board = useQuery({
    queryKey: ["controlling", "board", sessionId, sessionDate],
    queryFn: () =>
      api<Board>(`/controlling/sessions/${sessionId}/board?date=${encodeURIComponent(sessionDate)}`, {
        token: auth.token ?? undefined,
      }),
    enabled: !!auth.token && !!sessionId,
  });

  const createSession = useMutation({
    mutationFn: async () => {
      if (!projectId || selectedTeamIds.length === 0) throw new Error(t("controlling.level1.needTeams"));
      return api<{ id: string }>("/controlling/sessions", {
        method: "POST",
        body: {
          date: sessionDate,
          abteilungId: abteilungId || null,
          projectId,
          teamIds: selectedTeamIds,
        },
        token: auth.token ?? undefined,
      });
    },
    onSuccess: (s) => {
      setSessionId(s.id);
      setStatus(t("controlling.level1.sessionCreated"));
      void qc.invalidateQueries({ queryKey: ["controlling", "board"] });
    },
    onError: (e) => setStatus(toMessage(e)),
  });

  const postCode = useMutation({
    mutationFn: async (payload: { agentId: string; code: "A" | "P" | "N" }) => {
      if (!sessionId || !board.data) throw new Error("No session");
      const { timeInfo, session } = board.data;
      return api("/controlling/live-observations", {
        method: "POST",
        body: {
          sessionId,
          agentId: payload.agentId,
          date: timeInfo.berlinDate,
          blockIndex: timeInfo.currentBlockIndex,
          code: payload.code,
        },
        token: auth.token ?? undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["controlling", "board", sessionId] });
      setStatus(t("controlling.level1.obsSaved"));
    },
    onError: (e) => setStatus(toMessage(e)),
  });

  if (auth.loading || !auth.token) {
    return <p className="p-6 text-muted-foreground">{t("app.loading")}</p>;
  }

  return (
    <>
      <PageHeader title={t("controlling.level1.title")} description={t("controlling.level1.subtitle")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("controlling.level1.setupTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("controlling.level1.date")}</Label>
              <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("controlling.level1.abteilung")}</Label>
              <Select value={abteilungId || "__all__"} onValueChange={(v) => setAbteilungId(v === "__all__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("app.all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("app.all")}</SelectItem>
                  {(org.data?.abteilungen ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("controlling.level1.project")}</Label>
              <Select value={projectId || undefined} onValueChange={(v) => setProjectId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("controlling.level1.pickProject")} />
                </SelectTrigger>
                <SelectContent>
                  {projectsFiltered.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("controlling.level1.teams")}</Label>
              {teams.isLoading ? (
                <Skeleton className="h-24" />
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
                  {(teams.data ?? []).map((team) => (
                    <label key={team.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedTeamIds.includes(team.id)}
                        onChange={(e) => {
                          setSelectedTeamIds((prev) =>
                            e.target.checked ? [...prev, team.id] : prev.filter((id) => id !== team.id),
                          );
                        }}
                      />
                      <span>{team.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={() => createSession.mutate()} disabled={createSession.isPending}>
              {t("controlling.level1.startSession")}
            </Button>
            {sessionId && (
              <p className="text-xs text-muted-foreground">
                {t("controlling.level1.sessionId")}: <span className="font-mono">{sessionId}</span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("controlling.level1.liveTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!sessionId && <p className="text-sm text-muted-foreground">{t("controlling.level1.openBoardHint")}</p>}
            {sessionId && board.isLoading && <Skeleton className="h-40" />}
            {sessionId && board.data && (
              <div className="space-y-3 text-sm">
                <p>
                  {t("controlling.level1.blockInfo", {
                    block: String(board.data.timeInfo.currentBlockIndex),
                    lastIndex: String(board.data.timeInfo.blocksPerDay - 1),
                    minutes: String(board.data.policy.liveBlockMinutes),
                  })}
                </p>
                <p className={board.data.timeInfo.editableForCurrentBlock ? "text-success" : "text-muted-foreground"}>
                  {board.data.timeInfo.editableForCurrentBlock
                    ? t("controlling.level1.editable")
                    : t("controlling.level1.readOnly")}
                </p>
                <div className="space-y-2">
                  {board.data.agents.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                      <div>
                        <div className="font-medium">{a.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("controlling.level1.currentCode")}: {a.currentBlockCode ?? "—"}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {(["A", "P", "N"] as const).map((code) => (
                          <Button
                            key={code}
                            size="sm"
                            variant={a.currentBlockCode === code ? "default" : "outline"}
                            disabled={!board.data.timeInfo.editableForCurrentBlock || postCode.isPending}
                            onClick={() => postCode.mutate({ agentId: a.id, code })}
                          >
                            {code}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {status ? <p className="mt-4 text-sm text-muted-foreground">{status}</p> : null}
    </>
  );
}
