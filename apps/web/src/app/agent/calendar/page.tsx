"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { BookingTypeIcon } from "@/components/booking/booking-type-icon";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { toMessage, useAuth, useRequireAuth } from "@/lib/auth";
import { useT } from "@/i18n/provider";
import { currentMonthKey } from "@/lib/utils";

type BookingType = {
  id: string;
  label: string;
  code: string;
  category: "SHIFT" | "VACATION" | "SICK";
  emoji?: string;
  color: string;
  allowsSplitShift: boolean;
};

type Booking = {
  id: string;
  date: string;
  bookingTypeId: string;
  blocks: Array<{ start: string; end: string }>;
  version: number;
  updatedAtIso: string;
};

type BookingHistory = {
  id: string;
  bookingId: string;
  date: string;
  action: "UPSERT" | "DELETE";
  version: number;
  atIso: string;
};

type TimeBlock = { start: string; end: string };
type TimeSetter = (value: TimeBlock | ((prev: TimeBlock) => TimeBlock)) => void;

export default function CalendarPage() {
  const { token, loading } = useRequireAuth(["AGENT"]);
  const { user } = useAuth();
  const t = useT();
  const [month, setMonth] = useState(currentMonthKey());
  const [date, setDate] = useState(`${currentMonthKey()}-01`);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bookingTypeId, setBookingTypeId] = useState("");
  const [bookingTypes, setBookingTypes] = useState<BookingType[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [history, setHistory] = useState<BookingHistory[]>([]);
  const [blockOne, setBlockOne] = useState({ start: "09:00", end: "13:00" });
  const [blockTwo, setBlockTwo] = useState({ start: "16:30", end: "21:00" });
  const [status, setStatus] = useState("Klick auf einen Tag, dann im Pop-up buchen.");

  useEffect(() => {
    if (!token) {
      return;
    }
    Promise.all([
      api<BookingType[]>("/calendar/booking-types", undefined, token),
      api<Booking[]>(`/calendar/mine?month=${month}`, undefined, token),
      api<BookingHistory[]>(`/calendar/history?month=${month}`, undefined, token),
    ])
      .then(([types, myBookings, changes]) => {
        setBookingTypes(types);
        setBookings(myBookings);
        setHistory(changes);
        if (types.length > 0 && !bookingTypeId) {
          setBookingTypeId(types[0].id);
        }
      })
      .catch((error) => setStatus(toMessage(error)));
  }, [month, token, bookingTypeId]);

  const selectedBookingType = bookingTypes.find((entry) => entry.id === bookingTypeId);
  const activeBooking = bookings.find((entry) => entry.date === date);
  const activeType = bookingTypes.find((entry) => entry.id === activeBooking?.bookingTypeId);
  const sortedBookings = useMemo(() => [...bookings].sort((a, b) => a.date.localeCompare(b.date)), [bookings]);

  async function reloadMonth() {
    if (!token) return;
    try {
      const [types, myBookings, changes] = await Promise.all([
        api<BookingType[]>("/calendar/booking-types", undefined, token),
        api<Booking[]>(`/calendar/mine?month=${month}`, undefined, token),
        api<BookingHistory[]>(`/calendar/history?month=${month}`, undefined, token),
      ]);
      setBookingTypes(types);
      setBookings(myBookings);
      setHistory(changes);
      setStatus(t("agentWorkspace.show") + " OK");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  function openBookingModal(day: string) {
    setDate(day);
    const existing = bookings.find((entry) => entry.date === day);
    if (existing) {
      setBookingTypeId(existing.bookingTypeId);
      const existingType = bookingTypes.find((entry) => entry.id === existing.bookingTypeId);
      if (existingType?.code === "SPLIT" && existing.blocks.length === 2) {
        setBlockOne(existing.blocks[0]);
        setBlockTwo(existing.blocks[1]);
      } else if (existing.blocks.length > 0) {
        setBlockOne(existing.blocks[0]);
      }
    } else {
      const defaultType = bookingTypes.find((entry) => resolveCategory(entry) === "SHIFT") ?? bookingTypes[0];
      if (defaultType) {
        setBookingTypeId(defaultType.id);
        applyPreset(defaultType.code, setBlockOne, setBlockTwo);
      }
    }
    setIsModalOpen(true);
  }

  function chooseType(typeId: string) {
    setBookingTypeId(typeId);
    const type = bookingTypes.find((entry) => entry.id === typeId);
    if (type) {
      applyPreset(type.code, setBlockOne, setBlockTwo);
    }
  }

  async function saveBooking() {
    if (!token) {
      return;
    }
    if (!selectedBookingType) {
      setStatus("Wähle zuerst einen Buchungstyp im Pop-up.");
      return;
    }
    try {
      const existing = bookings.find((entry) => entry.date === date);
      let blocks: Array<{ start: string; end: string }> = [];
      if (selectedBookingType.code === "SPLIT") {
        if (!isValidRange(blockOne.start, blockOne.end) || !isValidRange(blockTwo.start, blockTwo.end)) {
          setStatus("Bitte gültige Zeitblöcke für Splitschicht setzen.");
          return;
        }
        blocks = [blockOne, blockTwo];
      } else if (selectedBookingType.category === "SHIFT" && selectedBookingType.code !== "F" && selectedBookingType.code !== "SOS") {
        if (!isValidRange(blockOne.start, blockOne.end)) {
          setStatus("Bitte eine gültige Zeitspanne für die Schicht setzen.");
          return;
        }
        blocks = [{ start: blockOne.start, end: blockOne.end }];
      }
      const created = await api<Booking>(
        "/calendar/book",
        {
          method: "POST",
          body: JSON.stringify({
            date,
            bookingTypeId,
            blocks,
            expectedVersion: existing?.version,
          }),
        },
        token,
      );
      setBookings((prev) => [created, ...prev.filter((entry) => entry.date !== created.date)]);
      setHistory((prev) => [
        {
          id: `${created.id}-${Date.now()}`,
          bookingId: created.id,
          date: created.date,
          action: "UPSERT",
          version: created.version,
          atIso: new Date().toISOString(),
        },
        ...prev,
      ]);
      setStatus(`Buchung gespeichert: ${created.date}`);
      setIsModalOpen(false);
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function removeBooking(targetDate: string) {
    if (!token) {
      return;
    }
    try {
      const existing = bookings.find((entry) => entry.date === targetDate);
      await api(
        `/calendar/mine?date=${targetDate}${existing ? `&expectedVersion=${existing.version}` : ""}`,
        { method: "DELETE" },
        token,
      );
      setBookings((prev) => prev.filter((entry) => entry.date !== targetDate));
      if (existing) {
        setHistory((prev) => [
          {
            id: `${existing.id}-delete-${Date.now()}`,
            bookingId: existing.id,
            date: existing.date,
            action: "DELETE",
            version: existing.version,
            atIso: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
      setStatus(`Booking removed for ${targetDate}`);
      setIsModalOpen(false);
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  if (loading) {
    return <p className="status-ok">Loading calendar workspace...</p>;
  }

  const monthStart = new Date(`${month}-01T00:00:00`);
  const startWeekday = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - startWeekday + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      return null;
    }
    return `${month}-${String(dayNumber).padStart(2, "0")}`;
  });
  const splitDays = bookings.filter((entry) => entry.blocks.length === 2).length;
  const shiftDays = bookings.filter((entry) => resolveCategoryByBooking(entry, bookingTypes) === "SHIFT").length;
  const monthTitle = monthStart.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title={t("agentWorkspace.bookingTitle")} description={t("agentWorkspace.bookingSubtitle")} />

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("agentWorkspace.details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground">{t("agentWorkspace.name")}</p>
            <p className="font-medium">{user?.fullName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("agentWorkspace.employeeId")}</p>
            <p className="font-mono font-medium">{user?.id.slice(0, 8)}…</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("agentWorkspace.team")}</p>
            <p className="font-medium">{user?.agentContext?.teamName ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("agentWorkspace.statusFest")}</p>
            <p className="font-medium">AGENT</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end justify-between gap-4 pt-6">
          <label className="space-y-2">
            <span className="text-sm font-medium">{t("roster.day")}</span>
            <input
              type="month"
              value={month}
              className="flex h-9 w-44 rounded-md border border-input bg-background px-2 text-sm"
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
          <span className="text-sm text-muted-foreground">{monthTitle}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void reloadMonth()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("agentWorkspace.show")}
          </Button>
        </CardContent>
      </Card>

      <div className="kpi-grid mb-4">
        <div className="kpi-card">
          <p className="label">Gebuchte Tage</p>
          <p className="value">{bookings.length}</p>
        </div>
        <div className="kpi-card">
          <p className="label">Schicht-Tage</p>
          <p className="value">{shiftDays}</p>
        </div>
        <div className="kpi-card">
          <p className="label">Splitschicht-Tage</p>
          <p className="value">{splitDays}</p>
        </div>
        <div className="kpi-card">
          <p className="label">Tage im Monat</p>
          <p className="value">{daysInMonth}</p>
        </div>
      </div>

      <p className={status.toLowerCase().includes("saved") || status.toLowerCase().includes("success") ? "status-ok" : "status-bad"}>
        {status}
      </p>

      <div className="panel calendar-panel">
        <h3>Open booking calendar</h3>
        <div className="calendar-grid">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((weekday) => (
            <div key={weekday} className="pill calendar-weekday">
              {weekday}
            </div>
          ))}
          {cells.map((cell, index) => {
            if (!cell) {
              return <div key={`empty-${index}`} className="calendar-empty" />;
            }
            const dayBooking = bookings.find((booking) => booking.date === cell);
            const dayType = bookingTypes.find((type) => type.id === dayBooking?.bookingTypeId);
            return (
              <button
                key={cell}
                type="button"
                className={`calendar-day ${date === cell ? "calendar-day-active" : ""}`}
                style={
                  dayType
                    ? {
                        borderColor: dayType.color,
                        background: `color-mix(in srgb, ${dayType.color} 18%, hsl(var(--card)))`,
                      }
                    : undefined
                }
                onClick={() => openBookingModal(cell)}
              >
                <div className="flex w-full shrink-0 items-start justify-end">
                  <span className="calendar-day-num">{cell.slice(-2)}</span>
                </div>
                <div className="calendar-day-body">
                  {dayType ? (
                    <>
                      <span className="inline-flex rounded-md bg-background/60 p-1.5 shadow-sm ring-1 ring-border/60" style={{ color: dayType.color }}>
                        <BookingTypeIcon code={dayType.code} className="h-5 w-5" />
                      </span>
                      <span className="calendar-day-type w-full">{dayType.label}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h3>Active Booking Types</h3>
        <div className="row">
          {bookingTypes.map((type) => (
            <span
              key={type.id}
              className="pill inline-flex items-center gap-1.5"
              style={{ background: `${type.color}22`, color: type.color }}
            >
              <BookingTypeIcon code={type.code} className="h-4 w-4" />
              <span>
                {type.label} ({type.code})
              </span>
            </span>
          ))}
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buchen: {date}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Aktuell:{" "}
            {activeType ? (
              <span className="inline-flex items-center gap-1.5 align-middle">
                <span className="inline-flex shrink-0" style={{ color: activeType.color }}>
                  <BookingTypeIcon code={activeType.code} className="h-4 w-4" />
                </span>
                {activeType.label}
              </span>
            ) : (
              "Keine Buchung"
            )}
          </p>

            <div className="booking-category">
              <h4>Schichten buchen</h4>
              <div className="booking-chip-grid">
              {bookingTypes
                .filter((type) => resolveCategory(type) === "SHIFT")
                .map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      className={`inline-flex items-center justify-center gap-2 ${bookingTypeId === type.id ? "" : "btn-secondary"}`}
                      onClick={() => chooseType(type.id)}
                    >
                      <span className="inline-flex shrink-0" style={{ color: type.color }}>
                        <BookingTypeIcon code={type.code} className="h-4 w-4" />
                      </span>
                      {type.label}
                    </button>
                ))}
              </div>
            </div>

            <div className="booking-category">
              <h4>Urlaub</h4>
              <p className="booking-hint">Urlaub kurzfristig nur im aktuellen Monat. Normaler Urlaub laut Policy mit Vorlauf.</p>
              <div className="booking-chip-grid">
              {bookingTypes
                .filter((type) => resolveCategory(type) === "VACATION")
                .map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      className={`inline-flex items-center justify-center gap-2 ${bookingTypeId === type.id ? "" : "btn-secondary"}`}
                      onClick={() => chooseType(type.id)}
                    >
                      <span className="inline-flex shrink-0" style={{ color: type.color }}>
                        <BookingTypeIcon code={type.code} className="h-4 w-4" />
                      </span>
                      {type.label}
                    </button>
                ))}
              </div>
            </div>

            <div className="booking-category">
              <h4>Krank melden</h4>
              <div className="booking-chip-grid">
              {bookingTypes
                .filter((type) => resolveCategory(type) === "SICK")
                .map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      className={`inline-flex items-center justify-center gap-2 ${bookingTypeId === type.id ? "" : "btn-secondary"}`}
                      onClick={() => chooseType(type.id)}
                    >
                      <span className="inline-flex shrink-0" style={{ color: type.color }}>
                        <BookingTypeIcon code={type.code} className="h-4 w-4" />
                      </span>
                      {type.label}
                    </button>
                ))}
              </div>
            </div>

            {(selectedBookingType?.category === "SHIFT" || selectedBookingType?.code === "SPLIT") && (
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="row" style={{ marginBottom: 8 }}>
                  <button className="btn-secondary" onClick={() => applyPreset(selectedBookingType?.code ?? "", setBlockOne, setBlockTwo)}>
                    Preset laden
                  </button>
                </div>
                <label>
                  Block 1
                  <div className="row">
                    <input type="time" value={blockOne.start} onChange={(event) => setBlockOne((prev) => ({ ...prev, start: event.target.value }))} />
                    <input type="time" value={blockOne.end} onChange={(event) => setBlockOne((prev) => ({ ...prev, end: event.target.value }))} />
                  </div>
                </label>
                {selectedBookingType?.code === "SPLIT" && (
                  <label>
                    Block 2
                    <div className="row">
                      <input type="time" value={blockTwo.start} onChange={(event) => setBlockTwo((prev) => ({ ...prev, start: event.target.value }))} />
                      <input type="time" value={blockTwo.end} onChange={(event) => setBlockTwo((prev) => ({ ...prev, end: event.target.value }))} />
                    </div>
                  </label>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="button" onClick={saveBooking}>
                Buchung speichern
              </Button>
              {activeBooking && (
                <Button type="button" variant="destructive" onClick={() => removeBooking(activeBooking.date)}>
                  Buchung entfernen
                </Button>
              )}
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>My booked days ({month})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Shift blocks</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedBookings.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell>{booking.date}</TableCell>
                  <TableCell>
                    {(() => {
                      const rowType = bookingTypes.find((type) => type.id === booking.bookingTypeId);
                      return rowType ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-flex shrink-0" style={{ color: rowType.color }}>
                            <BookingTypeIcon code={rowType.code} className="h-4 w-4" />
                          </span>
                          {rowType.label}
                        </span>
                      ) : (
                        booking.bookingTypeId
                      );
                    })()}
                  </TableCell>
                  <TableCell>{booking.blocks.map((block) => `${block.start}-${block.end}`).join(", ")}</TableCell>
                  <TableCell>v{booking.version}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeBooking(booking.date)}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {bookings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No bookings in selected month.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Booking history ({month})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.slice(0, 100).map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.atIso}</TableCell>
                  <TableCell>{entry.date}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell>{entry.version}</TableCell>
                </TableRow>
              ))}
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No changes logged in selected month.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function resolveCategory(type: BookingType): "SHIFT" | "VACATION" | "SICK" {
  if (type.category) {
    return type.category;
  }
  if (["U", "SU", "UK"].includes(type.code)) {
    return "VACATION";
  }
  if (type.code === "K") {
    return "SICK";
  }
  return "SHIFT";
}

function resolveCategoryByBooking(booking: Booking, types: BookingType[]): "SHIFT" | "VACATION" | "SICK" {
  const type = types.find((entry) => entry.id === booking.bookingTypeId);
  return type ? resolveCategory(type) : "SHIFT";
}

function applyPreset(
  code: string,
  setBlockOne: TimeSetter,
  setBlockTwo: TimeSetter,
) {
  if (code === "FR") {
    setBlockOne({ start: "08:00", end: "16:00" });
    setBlockTwo({ start: "16:30", end: "21:00" });
    return;
  }
  if (code === "SN") {
    setBlockOne({ start: "14:00", end: "22:00" });
    setBlockTwo({ start: "22:30", end: "02:30" });
    return;
  }
  if (code === "SPLIT") {
    setBlockOne({ start: "08:00", end: "12:00" });
    setBlockTwo({ start: "16:00", end: "20:00" });
  }
}

function isValidRange(start: string, end: string) {
  return start !== end;
}
