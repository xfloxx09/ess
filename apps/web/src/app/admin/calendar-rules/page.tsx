"use client";

import { useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

export default function CalendarRulesPage() {
  const { token, loading } = useRequireAuth(["ADMIN"]);
  const [bookingType, setBookingType] = useState({
    label: "",
    code: "",
    category: "SHIFT",
    emoji: "🗓️",
    color: "#3498db",
    allowsSplitShift: false,
    active: true,
  });
  const [calendarPolicy, setCalendarPolicy] = useState({
    normalVacationLeadDays: 21,
    allowNormalVacationCurrentMonth: false,
    allowMultiDayBooking: false,
  });
  const [windowRule, setWindowRule] = useState({ month: "2026-05", opensAtIso: "", closesAtIso: "" });
  const [splitRule, setSplitRule] = useState({
    minFirstHours: 4,
    maxFirstHours: 5,
    minPauseHours: 3.5,
    maxPauseHours: 5,
    minSecondHours: 4,
    maxSecondHours: 5,
  });
  const [status, setStatus] = useState("Configure booking policy and split-shift constraints.");

  async function saveBookingType() {
    if (!token) {
      return;
    }
    try {
      await api("/config/booking-type", { method: "POST", body: JSON.stringify(bookingType) }, token);
      setStatus("Booking type saved");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function saveWindow() {
    if (!token) {
      return;
    }
    try {
      await api("/config/booking-window", { method: "POST", body: JSON.stringify(windowRule) }, token);
      setStatus("Booking window saved");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function saveSplitRule() {
    if (!token) {
      return;
    }
    try {
      await api("/config/shift-rule", { method: "POST", body: JSON.stringify(splitRule) }, token);
      setStatus("Split shift rule saved");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  async function savePolicy() {
    if (!token) {
      return;
    }
    try {
      await api("/config/calendar-policy", { method: "POST", body: JSON.stringify(calendarPolicy) }, token);
      setStatus("Calendar policy saved");
    } catch (error) {
      setStatus(toMessage(error));
    }
  }

  if (loading) {
    return <p className="status-ok">Loading calendar rule engine...</p>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2>Admin Calendar Rules</h2>
        <p>Control planning windows, booking options, and split-shift hard limits from one place.</p>
      </div>

      <div className="panel grid cols-2">
        <label>
          Booking Label
          <input value={bookingType.label} onChange={(event) => setBookingType((prev) => ({ ...prev, label: event.target.value }))} />
        </label>
        <label>
          Code
          <input value={bookingType.code} onChange={(event) => setBookingType((prev) => ({ ...prev, code: event.target.value }))} />
        </label>
        <label>
          Category
          <select value={bookingType.category} onChange={(event) => setBookingType((prev) => ({ ...prev, category: event.target.value as "SHIFT" | "VACATION" | "SICK" }))}>
            <option value="SHIFT">Schichten buchen</option>
            <option value="VACATION">Urlaub</option>
            <option value="SICK">Krank melden</option>
          </select>
        </label>
        <label>
          Emoji
          <input value={bookingType.emoji} onChange={(event) => setBookingType((prev) => ({ ...prev, emoji: event.target.value }))} />
        </label>
        <label>
          Color
          <input type="color" value={bookingType.color} onChange={(event) => setBookingType((prev) => ({ ...prev, color: event.target.value }))} />
        </label>
        <label>
          Split-shift support
          <select
            value={String(bookingType.allowsSplitShift)}
            onChange={(event) => setBookingType((prev) => ({ ...prev, allowsSplitShift: event.target.value === "true" }))}
          >
            <option value="false">No split shift</option>
            <option value="true">Split shift allowed</option>
          </select>
        </label>
        <button onClick={saveBookingType}>Save booking type</button>
      </div>

      <div className="panel grid cols-2">
        <label>
          Target Month
          <input type="month" value={windowRule.month} onChange={(event) => setWindowRule((prev) => ({ ...prev, month: event.target.value }))} />
        </label>
        <label>
          Opens At
          <input type="datetime-local" value={windowRule.opensAtIso} onChange={(event) => setWindowRule((prev) => ({ ...prev, opensAtIso: event.target.value }))} />
        </label>
        <label>
          Closes At
          <input type="datetime-local" value={windowRule.closesAtIso} onChange={(event) => setWindowRule((prev) => ({ ...prev, closesAtIso: event.target.value }))} />
        </label>
        <button onClick={saveWindow}>Save booking window</button>
      </div>

      <div className="panel grid cols-2">
        {Object.entries(splitRule).map(([key, value]) => (
          <label key={key}>
            {key}
            <input
              type="number"
              step="0.5"
              value={value}
              onChange={(event) => setSplitRule((prev) => ({ ...prev, [key]: Number(event.target.value) }))}
            />
          </label>
        ))}
        <button onClick={saveSplitRule}>Save split-shift rule</button>
      </div>
      <div className="panel grid cols-2">
        <label>
          Normal Urlaub lead days
          <input
            type="number"
            min={0}
            value={calendarPolicy.normalVacationLeadDays}
            onChange={(event) => setCalendarPolicy((prev) => ({ ...prev, normalVacationLeadDays: Number(event.target.value) }))}
          />
        </label>
        <label>
          Allow normal Urlaub in current month
          <select
            value={String(calendarPolicy.allowNormalVacationCurrentMonth)}
            onChange={(event) =>
              setCalendarPolicy((prev) => ({ ...prev, allowNormalVacationCurrentMonth: event.target.value === "true" }))
            }
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </label>
        <label>
          Allow multi-day booking
          <select
            value={String(calendarPolicy.allowMultiDayBooking)}
            onChange={(event) => setCalendarPolicy((prev) => ({ ...prev, allowMultiDayBooking: event.target.value === "true" }))}
          >
            <option value="false">No (day by day only)</option>
            <option value="true">Yes (allow multiple days)</option>
          </select>
        </label>
        <button onClick={savePolicy}>Save calendar policy</button>
      </div>
      <p className={status.toLowerCase().includes("saved") ? "status-ok" : "status-bad"}>{status}</p>
    </div>
  );
}
