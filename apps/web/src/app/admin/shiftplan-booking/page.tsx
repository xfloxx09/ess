"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { toMessage, useRequireAuth } from "@/lib/auth";
import { useT } from "@/i18n/provider";
import { currentMonthKey } from "@/lib/utils";

type Project = { id: string; name: string };

type MonthConfig = {
  id: string;
  projectId: string;
  month: string;
  calendarBookingOpen: boolean;
  agentShiftplanVisibility: "PLANNING_HIDDEN" | "PLANNING_VISIBLE" | "PUBLISHED";
};

type DayOv = { id: string; projectId: string; date: string; calendarBookingOpen: boolean };

type TypeBlock = {
  id: string;
  projectId: string;
  month: string | null;
  date: string | null;
  bookingTypeId: string;
  bookingType: { id: string; label: string; code: string };
};

type RulesBundle = {
  monthConfig: MonthConfig | null;
  dayOverrides: DayOv[];
  typeBlocks: TypeBlock[];
  bookingTypes: Array<{ id: string; label: string; code: string }>;
  planner: {
    shiftplanTargetDayMinutes: number;
    shiftplanPausePatternJson: unknown;
  };
};

export default function AdminShiftplanBookingPage() {
  const { token, loading } = useRequireAuth(["ADMIN"]);
  const t = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [month, setMonth] = useState(currentMonthKey());
  const [bundle, setBundle] = useState<RulesBundle | null>(null);
  const [status, setStatus] = useState("");

  const [monthOpen, setMonthOpen] = useState(true);
  const [visibility, setVisibility] = useState<MonthConfig["agentShiftplanVisibility"]>("PUBLISHED");

  const [dayDate, setDayDate] = useState(`${currentMonthKey()}-01`);
  const [dayOpen, setDayOpen] = useState(false);

  const [blockScope, setBlockScope] = useState<"month" | "day">("month");
  const [blockTypeId, setBlockTypeId] = useState("");

  const [plannerMinutes, setPlannerMinutes] = useState(480);
  const [plannerPatternJson, setPlannerPatternJson] = useState(
    JSON.stringify(
      [
        { workMinutes: 120, pauseMinutes: 15 },
        { workMinutes: 120, pauseMinutes: 30 },
        { workMinutes: 120, pauseMinutes: 15 },
      ],
      null,
      2,
    ),
  );

  const bookingTypes = bundle?.bookingTypes ?? [];

  useEffect(() => {
    if (!token) return;
    void api<Project[]>("/shiftplan/projects", undefined, token)
      .then((ps) => {
        setProjects(ps);
        if (ps.length && !projectId) setProjectId(ps[0].id);
      })
      .catch((e) => setStatus(toMessage(e)));
  }, [token, projectId]);

  async function loadRules() {
    if (!token || !projectId) return;
    try {
      const b = await api<RulesBundle>(
        `/config/shiftplan-booking-rules?projectId=${encodeURIComponent(projectId)}&month=${encodeURIComponent(month)}`,
        undefined,
        token,
      );
      setBundle(b);
      if (b.monthConfig) {
        setMonthOpen(b.monthConfig.calendarBookingOpen);
        setVisibility(b.monthConfig.agentShiftplanVisibility);
      } else {
        setMonthOpen(true);
        setVisibility("PUBLISHED");
      }
      if (b.planner) {
        setPlannerMinutes(b.planner.shiftplanTargetDayMinutes);
        setPlannerPatternJson(
          JSON.stringify(
            b.planner.shiftplanPausePatternJson ??
              [
                { workMinutes: 120, pauseMinutes: 15 },
                { workMinutes: 120, pauseMinutes: 30 },
                { workMinutes: 120, pauseMinutes: 15 },
              ],
            null,
            2,
          ),
        );
      } else {
        setPlannerMinutes(480);
        setPlannerPatternJson(
          JSON.stringify(
            [
              { workMinutes: 120, pauseMinutes: 15 },
              { workMinutes: 120, pauseMinutes: 30 },
              { workMinutes: 120, pauseMinutes: 15 },
            ],
            null,
            2,
          ),
        );
      }
      setStatus(t("adminShiftplan.rulesLoaded"));
    } catch (e) {
      setStatus(toMessage(e));
    }
  }

  useEffect(() => {
    if (!token || !projectId) return;
    void loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when project/month changes
  }, [token, projectId, month]);

  const monthLabel = useMemo(() => month, [month]);

  async function saveMonthConfig() {
    if (!token || !projectId) return;
    try {
      await api("/config/shiftplan-month-config", { method: "POST", token, body: { projectId, month, calendarBookingOpen: monthOpen, agentShiftplanVisibility: visibility } });
      setStatus(t("adminShiftplan.monthSaved"));
      await loadRules();
    } catch (e) {
      setStatus(toMessage(e));
    }
  }

  async function clearMonthConfig() {
    if (!token || !projectId) return;
    try {
      await api("/config/shiftplan-month-config/delete", { method: "POST", token, body: { projectId, month } });
      setStatus(t("adminShiftplan.monthCleared"));
      await loadRules();
    } catch (e) {
      setStatus(toMessage(e));
    }
  }

  async function saveDayOverride() {
    if (!token || !projectId) return;
    try {
      await api("/config/shiftplan-day-override", { method: "POST", token, body: { projectId, date: dayDate, calendarBookingOpen: dayOpen } });
      setStatus(t("adminShiftplan.daySaved"));
      await loadRules();
    } catch (e) {
      setStatus(toMessage(e));
    }
  }

  async function deleteDayOverride(date: string) {
    if (!token || !projectId) return;
    try {
      await api("/config/shiftplan-day-override/delete", { method: "POST", token, body: { projectId, date } });
      setStatus(t("adminShiftplan.dayRemoved"));
      await loadRules();
    } catch (e) {
      setStatus(toMessage(e));
    }
  }

  async function addTypeBlock() {
    if (!token || !projectId || !blockTypeId) return;
    try {
      const body =
        blockScope === "month"
          ? { projectId, bookingTypeId: blockTypeId, month, date: null }
          : { projectId, bookingTypeId: blockTypeId, month: null, date: dayDate };
      await api("/config/shiftplan-type-block", { method: "POST", token, body });
      setStatus(t("adminShiftplan.blockAdded"));
      await loadRules();
    } catch (e) {
      setStatus(toMessage(e));
    }
  }

  async function deleteTypeBlock(id: string) {
    if (!token || !projectId) return;
    try {
      await api("/config/shiftplan-type-block/delete", { method: "POST", token, body: { id, projectId } });
      setStatus(t("adminShiftplan.blockRemoved"));
      await loadRules();
    } catch (e) {
      setStatus(toMessage(e));
    }
  }

  async function savePlannerSettings() {
    if (!token || !projectId) return;
    let pattern: Array<{ workMinutes: number; pauseMinutes: number }>;
    try {
      const raw = JSON.parse(plannerPatternJson.trim()) as unknown;
      if (!Array.isArray(raw) || raw.length === 0) {
        setStatus("Pausen-Muster: ein nicht leeres JSON-Array mit Objekten { workMinutes, pauseMinutes } ist nötig.");
        return;
      }
      pattern = [];
      for (const row of raw) {
        if (typeof row !== "object" || row === null || !("workMinutes" in row) || !("pauseMinutes" in row)) {
          setStatus("Pausen-Muster: jedes Element muss { workMinutes: Zahl, pauseMinutes: Zahl } sein.");
          return;
        }
        const w = Number((row as { workMinutes: unknown }).workMinutes);
        const p = Number((row as { pauseMinutes: unknown }).pauseMinutes);
        if (!Number.isFinite(w) || !Number.isFinite(p)) {
          setStatus("Pausen-Muster: workMinutes und pauseMinutes müssen Zahlen sein.");
          return;
        }
        pattern.push({ workMinutes: w, pauseMinutes: p });
      }
    } catch (e) {
      const hint = e instanceof SyntaxError ? ` (${e.message})` : "";
      setStatus(`Pausen-Muster: JSON ist ungültig${hint}. Tipp: doppelte Kommas oder fehlende Anführungszeichen prüfen.`);
      return;
    }
    try {
      await api("/config/project-shiftplan-planner", {
        method: "POST",
        token,
        body: { projectId, shiftplanTargetDayMinutes: plannerMinutes, shiftplanPausePattern: pattern },
      });
      setStatus("Schichtplaner-Einstellungen gespeichert.");
      await loadRules();
    } catch (e) {
      setStatus(toMessage(e));
    }
  }

  if (loading) {
    return <p className="p-6 text-muted-foreground">{t("app.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("adminShiftplan.title")} description={t("adminShiftplan.subtitle")} />

      <p className={`text-sm ${status && !status.toLowerCase().includes("error") && !status.toLowerCase().includes("fehl") ? "text-muted-foreground" : "text-destructive"}`}>
        {status}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminShiftplan.scopeTitle")}</CardTitle>
          <CardDescription>{t("adminShiftplan.scopeHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label>{t("adminShiftplan.project")}</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-[240px]">
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
            <Label>{t("roster.day")}</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          </div>
          <Button type="button" variant="secondary" onClick={() => void loadRules()}>
            {t("agentWorkspace.show")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminShiftplan.monthRulesTitle")}</CardTitle>
          <CardDescription>{t("adminShiftplan.monthRulesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={monthOpen} onChange={(e) => setMonthOpen(e.target.checked)} />
              {t("adminShiftplan.monthBookingOpen")}
            </label>
          </div>
          <div className="space-y-2">
            <Label>{t("adminShiftplan.agentVisibility")}</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as MonthConfig["agentShiftplanVisibility"])}>
              <SelectTrigger className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLISHED">{t("adminShiftplan.visPublished")}</SelectItem>
                <SelectItem value="PLANNING_VISIBLE">{t("adminShiftplan.visPlanningVisible")}</SelectItem>
                <SelectItem value="PLANNING_HIDDEN">{t("adminShiftplan.visPlanningHidden")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("adminShiftplan.agentVisibilityHint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void saveMonthConfig()}>
              {t("app.save")}
            </Button>
            <Button type="button" variant="outline" onClick={() => void clearMonthConfig()}>
              {t("adminShiftplan.resetMonthDefaults")}
            </Button>
          </div>
          {bundle?.monthConfig && (
            <p className="text-xs text-muted-foreground">
              {t("adminShiftplan.activeFor")}: {monthLabel}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schichtplaner: Zielzeit &amp; Pausen</CardTitle>
          <CardDescription>
            Gilt pro Projekt für die FTE-Füllung in der Tagesmatrix. Arbeit in Minuten, danach Pause in Minuten — zyklisch wiederholt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-3xl">
          <div className="space-y-2">
            <Label>Ziel-Arbeitszeit bei FTE 1,0 (Minuten / Tag)</Label>
            <Input type="number" min={120} max={840} value={plannerMinutes} onChange={(e) => setPlannerMinutes(Number(e.target.value) || 480)} className="w-40" />
          </div>
          <div className="space-y-2">
            <Label>Pausen-Muster (JSON)</Label>
            <textarea
              className="w-full min-h-[140px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              value={plannerPatternJson}
              onChange={(e) => setPlannerPatternJson(e.target.value)}
            />
          </div>
          <Button type="button" onClick={() => void savePlannerSettings()}>
            {t("app.save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminShiftplan.dayOverrideTitle")}</CardTitle>
          <CardDescription>{t("adminShiftplan.dayOverrideHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>{t("sales.table.date")}</Label>
              <Input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} className="w-44" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dayOpen} onChange={(e) => setDayOpen(e.target.checked)} />
              {t("adminShiftplan.dayOpenForBooking")}
            </label>
            <Button type="button" onClick={() => void saveDayOverride()}>
              {t("adminShiftplan.saveDayOverride")}
            </Button>
          </div>
          {bundle && bundle.dayOverrides.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sales.table.date")}</TableHead>
                  <TableHead>{t("adminShiftplan.dayOpenForBooking")}</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundle.dayOverrides.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-sm">{d.date}</TableCell>
                    <TableCell>{d.calendarBookingOpen ? t("app.yes") : t("app.no")}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void deleteDayOverride(d.date)}>
                        {t("app.delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminShiftplan.typeBlockTitle")}</CardTitle>
          <CardDescription>{t("adminShiftplan.typeBlockHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>{t("adminShiftplan.blockScope")}</Label>
              <Select value={blockScope} onValueChange={(v) => setBlockScope(v as "month" | "day")}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">{t("adminShiftplan.blockWholeMonth")}</SelectItem>
                  <SelectItem value="day">{t("adminShiftplan.blockSingleDay")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("adminShiftplan.bookingType")}</Label>
              <Select value={blockTypeId} onValueChange={setBlockTypeId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {bookingTypes.map((bt) => (
                    <SelectItem key={bt.id} value={bt.id}>
                      {bt.label} ({bt.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {blockScope === "day" && (
              <div className="space-y-2">
                <Label>{t("sales.table.date")}</Label>
                <Input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} className="w-44" />
              </div>
            )}
            <Button type="button" onClick={() => void addTypeBlock()}>
              {t("adminShiftplan.addBlock")}
            </Button>
          </div>
          {bundle && bundle.typeBlocks.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("adminShiftplan.blockBookingType")}</TableHead>
                  <TableHead>{t("adminShiftplan.blockApplies")}</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundle.typeBlocks.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      {b.bookingType.label} ({b.bookingType.code})
                    </TableCell>
                    <TableCell className="font-mono text-sm">{b.date ?? b.month ?? "—"}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void deleteTypeBlock(b.id)}>
                        {t("app.delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
