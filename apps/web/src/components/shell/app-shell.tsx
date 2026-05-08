"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const onLogin = pathname === "/login";

  if (loading && !onLogin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  if (onLogin || !user) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Suspense fallback={<aside className="w-16 shrink-0 border-r bg-card sm:w-64" aria-hidden />}>
        <Sidebar />
      </Suspense>
      <div className="flex min-h-screen flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-7xl p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
