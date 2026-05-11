"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toMessage, useRequireAuth } from "@/lib/auth";
import { useT } from "@/i18n/provider";

type OrgSnapshot = {
  dienstleister: Array<{ id: string; name: string }>;
  abteilungen: Array<{ id: string; name: string; dienstleisterId: string }>;
  projects: Array<{ id: string; name: string; abteilungId: string }>;
  teams: Array<{ id: string; name: string; projectId: string }>;
};

type PlannerUser = { id: string; email: string; fullName: string; active: boolean };

type Selection = {
  user: { id: string; email: string; fullName: string };
  dienstleisterIds: string[];
  abteilungIds: string[];
  projectIds: string[];
  teamIds: string[];
  accessRoleId: string | null;
};

function toggleSet(set: Set<string>, id: string, on: boolean) {
  const n = new Set(set);
  if (on) n.add(id);
  else n.delete(id);
  return n;
}

export default function AdminSchichtplanerAccessPage() {
  const { token, loading } = useRequireAuth(["ADMIN"]);
  const t = useT();
  const [snap, setSnap] = useState<OrgSnapshot | null>(null);
  const [users, setUsers] = useState<PlannerUser[]>([]);
  const [userId, setUserId] = useState("");
  const [dl, setDl] = useState<Set<string>>(new Set());
  const [ab, setAb] = useState<Set<string>>(new Set());
  const [prj, setPrj] = useState<Set<string>>(new Set());
  const [team, setTeam] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("");

  const loadUsersAndOrg = useCallback(async () => {
    if (!token) return;
    const full = await api<{
      dienstleister: OrgSnapshot["dienstleister"];
      abteilungen: OrgSnapshot["abteilungen"];
      projects: OrgSnapshot["projects"];
      teams: OrgSnapshot["teams"];
    }>("/admin/org-access/snapshot", undefined, token);
    setSnap({
      dienstleister: full.dienstleister,
      abteilungen: full.abteilungen,
      projects: full.projects,
      teams: full.teams,
    });
    const uList = await api<PlannerUser[]>("/admin/schichtplaner-access/users", undefined, token);
    setUsers(uList);
    setUserId((prev) => (prev && uList.some((u) => u.id === prev) ? prev : uList[0]?.id ?? ""));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void loadUsersAndOrg().catch((e) => setStatus(toMessage(e)));
  }, [token, loadUsersAndOrg]);

  useEffect(() => {
    if (!token || !userId) return;
    void api<Selection>(`/admin/schichtplaner-access/${userId}/selection`, undefined, token)
      .then((s) => {
        setDl(new Set(s.dienstleisterIds));
        setAb(new Set(s.abteilungIds));
        setPrj(new Set(s.projectIds));
        setTeam(new Set(s.teamIds));
      })
      .catch((e) => setStatus(toMessage(e)));
  }, [token, userId]);

  async function save() {
    if (!token || !userId) return;
    try {
      await api(`/admin/schichtplaner-access/${userId}/scopes`, {
        method: "PUT",
        token,
        body: {
          dienstleisterIds: [...dl],
          abteilungIds: [...ab],
          projectIds: [...prj],
          teamIds: [...team],
        },
      });
      setStatus(t("adminSchichtplanerAccess.saved"));
      await loadUsersAndOrg();
    } catch (e) {
      setStatus(toMessage(e));
    }
  }

  if (loading) {
    return <p className="p-6 text-muted-foreground">{t("app.loading")}</p>;
  }

  const nonePicked = dl.size + ab.size + prj.size + team.size === 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t("adminSchichtplanerAccess.title")} description={t("adminSchichtplanerAccess.subtitle")} />

      <p className={`text-sm ${status.includes("Gespeichert") || status.includes("Saved") ? "text-muted-foreground" : status ? "text-destructive" : "text-muted-foreground"}`}>
        {status}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminSchichtplanerAccess.pickUser")}</CardTitle>
          <CardDescription>{t("adminSchichtplanerAccess.loadHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label>User</Label>
            <Select value={userId} onValueChange={setUserId} disabled={users.length === 0}>
              <SelectTrigger className="w-[min(100%,420px)]">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="secondary" onClick={() => void loadUsersAndOrg()}>
            {t("agentWorkspace.show")}
          </Button>
        </CardContent>
      </Card>

      {snap && userId && (
        <>
          {nonePicked && <p className="text-sm text-amber-600 dark:text-amber-500">{t("adminSchichtplanerAccess.emptySelection")}</p>}

          <Card>
            <CardHeader>
              <CardTitle>{t("adminSchichtplanerAccess.sectionDl")}</CardTitle>
            </CardHeader>
            <CardContent className="max-h-56 space-y-2 overflow-y-auto">
              {snap.dienstleister.map((d) => (
                <label key={d.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={dl.has(d.id)} onChange={(e) => setDl(toggleSet(dl, d.id, e.target.checked))} />
                  <span>{d.name}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("adminSchichtplanerAccess.sectionAb")}</CardTitle>
            </CardHeader>
            <CardContent className="max-h-56 space-y-2 overflow-y-auto">
              {snap.abteilungen.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={ab.has(a.id)} onChange={(e) => setAb(toggleSet(ab, a.id, e.target.checked))} />
                  <span>{a.name}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("adminSchichtplanerAccess.sectionPrj")}</CardTitle>
            </CardHeader>
            <CardContent className="max-h-56 space-y-2 overflow-y-auto">
              {snap.projects.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={prj.has(p.id)} onChange={(e) => setPrj(toggleSet(prj, p.id, e.target.checked))} />
                  <span>{p.name}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("adminSchichtplanerAccess.sectionTeam")}</CardTitle>
            </CardHeader>
            <CardContent className="max-h-56 space-y-2 overflow-y-auto">
              {snap.teams.map((tm) => (
                <label key={tm.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={team.has(tm.id)} onChange={(e) => setTeam(toggleSet(team, tm.id, e.target.checked))} />
                  <span>{tm.name}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          <Button type="button" onClick={() => void save()} disabled={!userId}>
            {t("adminSchichtplanerAccess.saveScopes")}
          </Button>
        </>
      )}
    </div>
  );
}
