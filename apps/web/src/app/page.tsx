"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.visibleViews.includes("dashboard_kpi")) {
      router.replace("/dashboard");
    } else if (user.role === "AGENT") {
      router.replace("/agent/sales");
    } else if (user.role === "CONTROLLING") {
      router.replace("/controlling/review");
    } else {
      router.replace("/admin/users");
    }
  }, [user, loading, router]);

  return null;
}
