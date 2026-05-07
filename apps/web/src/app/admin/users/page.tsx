"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { UserRole } from "@ess/shared";
import { api } from "@/lib/api";
import { toMessage, useRequireAuth } from "@/lib/auth";
import { useT } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  locale: string;
  teamId: string | null;
  team?: { id: string; name: string; projectId: string } | null;
  hourlyRateEuro: number;
  createdAt: string;
  lastLoginAt: string | null;
}

interface UserListResponse {
  items: UserRow[];
  total: number;
}

export default function AdminUsersPage() {
  const auth = useRequireAuth({ anyViews: ["admin_users"], roles: ["ADMIN"] });
  const t = useT();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ["users", "list", search],
    queryFn: () => api<UserListResponse>(`/admin/users?search=${encodeURIComponent(search)}&take=200`, { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}`, { method: "DELETE", token: auth.token ?? undefined }),
    onSuccess: () => {
      toast.success("User disabled");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => toast.error(toMessage(err)),
  });

  const resetLink = useMutation({
    mutationFn: (id: string) => api<{ token: string; expiresIn: string }>(`/admin/users/${id}/reset-link`, { method: "POST", token: auth.token ?? undefined }),
    onSuccess: (data) => {
      navigator.clipboard?.writeText(data.token).catch(() => undefined);
      toast.success(`Reset link generated (copied to clipboard, expires ${data.expiresIn})`);
    },
    onError: (err) => toast.error(toMessage(err)),
  });

  return (
    <>
      <PageHeader
        title={t("users.title")}
        actions={
          <>
            <Input
              type="search"
              placeholder={t("app.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {t("users.create")}
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("users.table.name")}</TableHead>
                <TableHead>{t("users.table.email")}</TableHead>
                <TableHead>{t("users.table.role")}</TableHead>
                <TableHead>{t("users.table.team")}</TableHead>
                <TableHead>{t("users.table.active")}</TableHead>
                <TableHead>{t("users.table.lastLogin")}</TableHead>
                <TableHead className="text-right">{t("app.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {t("app.loading")}
                  </TableCell>
                </TableRow>
              ) : (
                list.data?.items.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.fullName}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === "ADMIN" ? "default" : user.role === "CONTROLLING" ? "secondary" : "outline"}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{user.team?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={user.active ? "success" : "destructive"}>{user.active ? "✓" : "✗"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(user)} title={t("app.edit")}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => resetLink.mutate(user.id)}
                        title="Reset link"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Disable ${user.fullName}?`)) remove.mutate(user.id);
                        }}
                        title={t("app.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <UserFormDialog
        open={creating}
        onOpenChange={(o) => setCreating(o)}
        token={auth.token ?? undefined}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["users"] })}
      />

      <UserFormDialog
        open={!!editing}
        user={editing ?? undefined}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        token={auth.token ?? undefined}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["users"] });
          setEditing(null);
        }}
      />
    </>
  );
}

function UserFormDialog({
  open,
  onOpenChange,
  user,
  token,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserRow;
  token: string | undefined;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    email: user?.email ?? "",
    fullName: user?.fullName ?? "",
    role: (user?.role ?? "AGENT") as UserRole,
    password: "",
    active: user?.active ?? true,
    hourlyRateEuro: user?.hourlyRateEuro ?? 12.5,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const path = isEdit ? `/admin/users/${user!.id}` : "/admin/users";
      const body: Record<string, unknown> = {
        email: form.email,
        fullName: form.fullName,
        role: form.role,
        active: form.active,
        hourlyRateEuro: Number(form.hourlyRateEuro) || 0,
      };
      if (form.password) body.password = form.password;
      else if (!isEdit) throw new Error("Password required");
      return api(path, { method: isEdit ? "PATCH" : "POST", body, token });
    },
    onSuccess: () => {
      toast.success(isEdit ? "User updated" : "User created");
      onSaved();
      onOpenChange(false);
    },
    onError: (err) => toast.error(toMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Benutzer bearbeiten" : "Neuer Benutzer"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="space-y-1">
            <Label>Rolle</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserRole })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AGENT">Agent</SelectItem>
                <SelectItem value="CONTROLLING">Controlling</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{isEdit ? "Neues Passwort (optional)" : "Passwort"}</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!isEdit}
              minLength={8}
              placeholder={isEdit ? "Leer lassen, um beizubehalten" : "Mindestens 8 Zeichen"}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
            <Label>Aktiv</Label>
            <Switch checked={form.active} onCheckedChange={(c) => setForm({ ...form, active: c })} />
          </div>
          <div className="space-y-1">
            <Label>Stundensatz (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.hourlyRateEuro}
              onChange={(e) => setForm({ ...form, hourlyRateEuro: Number(e.target.value) })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
              Abbrechen
            </Button>
            <Button type="submit" disabled={submit.isPending}>
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
