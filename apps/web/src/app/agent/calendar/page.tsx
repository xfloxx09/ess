"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

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
  const [month, setMonth] = useState(nextMonthKey());
  const [date, setDate] = useState(`${nextMonthKey()}-01`);
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
    <div className="stack">
      <div className="page-head">
        <h2>Terminkalender</h2>
        <p>Klick auf einen Tag: Pop-up mit Kategorien Schichten, Urlaub und Krank melden.</p>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
          <label style={{ maxWidth: 260 }}>
            Monat
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <span className="pill">{monthTitle}</span>
        </div>
      </div>

      <div className="kpi-grid">
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

      <div className="panel">
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
                className={`calendar-day ${date === cell ? "calendar-day-active" : ""}`}
                style={dayType ? { borderColor: `${dayType.color}66`, background: `${dayType.color}16` } : undefined}
                onClick={() => openBookingModal(cell)}
              >
                <div>{cell.slice(-2)}</div>
                <div className="calendar-day-type">{dayType ? `${dayType.emoji ?? ""} ${dayType.label}` : "—"}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h3>Active Booking Types</h3>
        <div className="row">
          {bookingTypes.map((type) => (
            <span key={type.id} className="pill" style={{ background: `${type.color}22`, color: type.color }}>
              {type.emoji ?? ""} {type.label} ({type.code})
            </span>
          ))}
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Buchen: {date}</h3>
              <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>
                Schließen
              </button>
            </div>
            <p style={{ marginTop: 8, marginBottom: 8 }}>
              Aktuell: {activeType ? `${activeType.emoji ?? ""} ${activeType.label}` : "Keine Buchung"}
            </p>

            <div className="booking-category">
              <h4>Schichten buchen</h4>
              <div className="booking-chip-grid">
              {bookingTypes
                .filter((type) => resolveCategory(type) === "SHIFT")
                .map((type) => (
                    <button key={type.id} className={bookingTypeId === type.id ? "" : "btn-secondary"} onClick={() => chooseType(type.id)}>
                    {type.emoji ?? ""} {type.label}
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
                    <button key={type.id} className={bookingTypeId === type.id ? "" : "btn-secondary"} onClick={() => chooseType(type.id)}>
                    {type.emoji ?? ""} {type.label}
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
                    <button key={type.id} className={bookingTypeId === type.id ? "" : "btn-secondary"} onClick={() => chooseType(type.id)}>
                    {type.emoji ?? ""} {type.label}
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

            <div className="row" style={{ marginTop: 12 }}>
              <button onClick={saveBooking}>Buchung speichern</button>
              {activeBooking && (
                <button className="btn-danger" onClick={() => removeBooking(activeBooking.date)}>
                  Buchung entfernen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>My booked days ({month})</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Shift blocks</th>
              <th>Version</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedBookings.map((booking) => (
              <tr key={booking.id}>
                <td>{booking.date}</td>
                <td>{bookingTypes.find((type) => type.id === booking.bookingTypeId)?.label ?? booking.bookingTypeId}</td>
                <td>{booking.blocks.map((block) => `${block.start}-${block.end}`).join(", ")}</td>
                <td>v{booking.version}</td>
                <td>
                  <button className="btn-danger" onClick={() => removeBooking(booking.date)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {bookings.length === 0 && (
              <tr>
                <td colSpan={5}>No bookings in selected month.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Booking history ({month})</h3>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Date</th>
              <th>Action</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            {history.slice(0, 100).map((entry) => (
              <tr key={entry.id}>
                <td>{entry.atIso}</td>
                <td>{entry.date}</td>
                <td>{entry.action}</td>
                <td>{entry.version}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={4}>No changes logged in selected month.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function nextMonthKey() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
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
