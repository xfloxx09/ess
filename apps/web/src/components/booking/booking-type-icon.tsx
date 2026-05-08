"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  CalendarOff,
  Columns2,
  FileText,
  HelpCircle,
  Moon,
  Palmtree,
  Stethoscope,
  Sunrise,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Line icons only — same stroke weight for every booking type code. */
const BOOKING_ICON_BY_CODE: Record<string, LucideIcon> = {
  FR: Sunrise,
  SN: Moon,
  SPLIT: Columns2,
  SOS: AlarmClock,
  F: CalendarOff,
  U: Palmtree,
  SU: FileText,
  UK: Zap,
  K: Stethoscope,
};

const Fallback: LucideIcon = HelpCircle;

export function bookingTypeIconComponent(code: string): LucideIcon {
  return BOOKING_ICON_BY_CODE[code] ?? Fallback;
}

export function BookingTypeIcon({
  code,
  className,
  "aria-hidden": ariaHidden = true,
}: {
  code: string;
  className?: string;
  "aria-hidden"?: boolean;
}) {
  const Icon = bookingTypeIconComponent(code);
  return <Icon className={cn("h-4 w-4 shrink-0", className)} strokeWidth={2} aria-hidden={ariaHidden} />;
}
