"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { QueryProvider } from "@/lib/query";
import { RealtimeProvider } from "@/lib/realtime";
import { I18nProvider } from "@/i18n/provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <I18nProvider>
        <QueryProvider>
          <AuthProvider>
            <RealtimeProvider>{children}</RealtimeProvider>
            <Toaster position="top-right" richColors closeButton />
          </AuthProvider>
        </QueryProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
