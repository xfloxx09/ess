"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useT } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsBell() {
  const { token } = useAuth();
  const t = useT();
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => api<Notification[]>("/notifications?take=20", { token: token ?? undefined }),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const unread = list.data?.filter((n) => !n.readAt).length ?? 0;

  const markAllRead = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST", token: token ?? undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("notifications.title")}</span>
          {unread > 0 && (
            <button
              className="text-xs font-normal text-primary hover:underline"
              onClick={() => markAllRead.mutate()}
              type="button"
            >
              {t("notifications.markAllRead")}
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {list.data?.length ? (
          list.data.slice(0, 10).map((n) => {
            const inner = (
              <div className="flex w-full flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{n.title}</span>
                  {!n.readAt && <span className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
            );
            return (
              <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-1" asChild={!!n.link}>
                {n.link ? <Link href={n.link}>{inner}</Link> : inner}
              </DropdownMenuItem>
            );
          })
        ) : (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("notifications.empty")}</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
