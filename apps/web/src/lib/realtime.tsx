"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ReactNode, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import type { RealtimeEvent } from "@ess/shared";
import { getApiBase } from "./api";
import { useAuth } from "./auth";

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;
    const apiBase = getApiBase();
    const isAbsolute = /^https?:/i.test(apiBase);
    const url = isAbsolute ? apiBase : window.location.origin;
    const socket = io(`${url}/ws`, {
      transports: ["websocket"],
      auth: { token },
      withCredentials: true,
      path: "/socket.io",
    });
    socketRef.current = socket;

    socket.on("event", (event: RealtimeEvent) => {
      switch (event.type) {
        case "roster.cellChanged":
        case "roster.cellDeleted":
          queryClient.invalidateQueries({ queryKey: ["roster", "day-project"] });
          queryClient.invalidateQueries({ queryKey: ["roster", "day"] });
          break;
        case "antrag.created":
        case "antrag.decided":
          queryClient.invalidateQueries({ queryKey: ["antraege"] });
          break;
        case "notification.created":
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          break;
        case "import.progress":
        case "import.completed":
        case "import.failed":
          queryClient.invalidateQueries({ queryKey: ["imports"] });
          break;
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, queryClient]);

  return <>{children}</>;
}
