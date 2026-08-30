"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** One scheduled post, flattened for the grid. */
export interface CalendarBooking {
  campaignId: string;
  strategyId: string;
  campaignName: string;
  status: "proposed" | "selected";
  /** Position among the campaigns on screen, which picks its colour. */
  lane: number;
  sequence: number;
  date: string;
  publishTimeLocal: string;
  channel: string;
  assetType: string;
  theme: string;
}

export interface CalendarCampaign {
  campaignId: string;
  strategyId: string;
  campaignName: string;
  status: "proposed" | "selected";
  lane: number;
  startDate: string;
  endDate: string;
  totalAssets: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Dates are plain YYYY-MM-DD, so the whole grid is built in UTC to stop a
 *  local timezone shifting a booking onto the wrong day. */
function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function key(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The grid always starts on a Monday and covers whole weeks. */
function gridDays(month: Date): Date[] {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - offset * DAY_MS);
  const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  const total = Math.ceil(((last.getTime() - start.getTime()) / DAY_MS + 1) / 7) * 7;
  return Array.from({ length: total }, (_, index) => new Date(start.getTime() + index * DAY_MS));
}

export function CampaignCalendar({
  bookings,
  campaigns,
  initialMonth,
}: {
  bookings: CalendarBooking[];
  campaigns: CalendarCampaign[];
  initialMonth: string;
}) {
  const [month, setMonth] = useState(() => utc(initialMonth));
  const [focused, setFocused] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const booking of bookings) {
      map.set(booking.date, [...(map.get(booking.date) ?? []), booking]);
    }
    return map;
  }, [bookings]);

  const days = useMemo(() => gridDays(month), [month]);
  const today = key(new Date());
  const currentMonth = month.getUTCMonth();
  const focusedBookings = focused ? byDate.get(focused) ?? [] : [];

  function shiftMonth(by: number) {
    setFocused(null);
    setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + by, 1)));
  }

  return (
    <section className="card card-pad calendar">
      <div className="calendar-head">
        <div>
          <div className="card-note">Campaign calendar</div>
          <h2 className="section-title" style={{ marginTop: 5 }}>{monthLabel(month)}</h2>
        </div>
        <div className="calendar-nav">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={14} />
          </button>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {campaigns.length > 0 && (
        <div className="calendar-legend">
          {campaigns.map((campaign) => (
            <span key={campaign.campaignId} className={`lane-${campaign.lane % 5}`}>
              <i />
              <b>{campaign.campaignName}</b>
              <em>
                {readable(campaign.startDate)} – {readable(campaign.endDate)} ·{" "}
                {campaign.totalAssets} posts
              </em>
            </span>
          ))}
        </div>
      )}

      <div className="calendar-grid" role="grid">
        {WEEKDAYS.map((day) => (
          <div key={day} className="calendar-weekday">{day}</div>
        ))}
        {days.map((day) => {
          const iso = key(day);
          const dayBookings = byDate.get(iso) ?? [];
          const classes = [
            "calendar-day",
            day.getUTCMonth() === currentMonth ? "" : "outside",
            iso === today ? "today" : "",
            dayBookings.length > 0 ? "booked" : "",
            focused === iso ? "focused" : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              key={iso}
              type="button"
              className={classes}
              onClick={() => setFocused(dayBookings.length > 0 ? iso : null)}
              aria-label={`${iso}, ${dayBookings.length} posts`}
            >
              <span>{day.getUTCDate()}</span>
              {dayBookings.length > 0 && (
                <div className="calendar-marks">
                  {dayBookings.slice(0, 3).map((booking) => (
                    <i
                      key={`${booking.campaignId}-${booking.sequence}`}
                      className={`lane-${booking.lane % 5}`}
                    />
                  ))}
                  {dayBookings.length > 3 && <em>+{dayBookings.length - 3}</em>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {focusedBookings.length > 0 && (
        <div className="calendar-detail">
          <div className="kernel-field-label">{readable(focused!)}</div>
          {focusedBookings.map((booking) => (
            <Link
              key={`${booking.campaignId}-${booking.sequence}`}
              href={`/studio/${booking.sequence}?strategy=${encodeURIComponent(booking.strategyId)}`}
              className={`calendar-detail-row lane-${booking.lane % 5}`}
            >
              <i />
              <span>
                <b>{booking.theme}</b>
                <small>
                  {booking.publishTimeLocal} · {booking.channel} · {booking.assetType}
                </small>
              </span>
              <em>{booking.campaignName}</em>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function readable(iso: string): string {
  return utc(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
