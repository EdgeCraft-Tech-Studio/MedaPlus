import { useEffect, useMemo, useState } from "react";
import type { OwnerStats } from "../lib/pitches";
import s from "./css/OwnerInsights.module.css";

/* Self-contained: no new packages, no shared state, only reads `stats`. */

type Props = { stats: OwnerStats | null; loading: boolean };

const ICONS: Record<string, string> = {
  cash: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v.01M18 14v.01",
  cal: "M4 5h16v15H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4",
  check: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l3 3 5-6",
  avg: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  trophy: "M7 4h10v4a5 5 0 0 1-10 0zM7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5M12 13v3M8 20h8l-1-4H9z",
  chart: "M3 17l5-6 4 3 8-9M3 21h18",
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0 0 12 2z",
  replay: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  leaf: "M5 19c0-9 5-14 14-14 0 9-5 14-14 14zM5 19l7-7",
};

function Ico({ n, size = 22 }: { n: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[n]} />
    </svg>
  );
}

const birr = (v: number | string | undefined) =>
  `${(Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} Br`;

/* rank 1 = stronger light green, everyone else = softer light green */
const BAR_COLORS = [
  ["#22c55e", "#4ade80"],
  ["#86efac", "#bbf7d0"],
];

function hourLabel(h: number) {
  const x = h % 12 === 0 ? 12 : h % 12;
  return `${x}${h < 12 ? "AM" : "PM"}`;
}

/* count how many items cover each hour of today */
function countByHour(items: { start_iso: string; end_iso: string }[]) {
  const out: Record<number, number> = {};
  items.forEach((it) => {
    const a = new Date(it.start_iso);
    const b = new Date(it.end_iso);
    const endH = b.getMinutes() > 0 ? b.getHours() + 1 : b.getHours();
    for (let h = a.getHours(); h < Math.min(endH, 24); h++) out[h] = (out[h] || 0) + 1;
  });
  return out;
}

/* smooth SVG path through points */


/* ------------------------------ KPI tiles ------------------------------ */
function Kpis({ stats, loading }: Props) {
  const total = Number(stats?.total_revenue) || 0;
  const bookings = stats?.total_bookings ?? 0;
  const avg = bookings > 0 ? total / bookings : 0;
  const tiles = [
    { icon: "cash", label: "Money you made", value: birr(total), hint: "All confirmed bookings, total" },
    { icon: "cal", label: "Times people booked", value: String(bookings), hint: "Number of confirmed bookings" },
    { icon: "check", label: "Pitches open for booking", value: String(stats?.active_pitches ?? 0), hint: "Approved and ready" },
    { icon: "avg", label: "Average per booking", value: birr(avg), hint: "Money made ÷ bookings" },
  ] as const;

  return (
    <div className={s.kpiGrid}>
      {tiles.map((t, i) => (
        <div key={t.label} className={s.kpi} style={{ animationDelay: `${i * 70}ms` }}>
          <div className={s.kpiIcon}><Ico n={t.icon as keyof typeof ICONS} size={24} /></div>
          <div className={s.kpiBody}>
            <div className={s.kpiLabel}>{t.label}</div>
            {loading ? <div className={s.kpiSkel} /> : <div className={s.kpiValue}>{t.value}</div>}
            <div className={s.kpiHint}>{t.hint}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- Race bar chart ---------------------------- */
function RaceChart({ stats, loading }: Props) {
  const rows = useMemo(
    () =>
      (stats?.pitch_stats || [])
        .filter((p) => Number(p.revenue) > 0)
        .sort((a, b) => Number(b.revenue) - Number(a.revenue))
        .slice(0, 8),
    [stats]
  );
  const total = Number(stats?.total_revenue) || 0;
  const max = rows.length ? Number(rows[0].revenue) : 0;
  const [go, setGo] = useState(false);

  useEffect(() => {
    setGo(false);
    const t = setTimeout(() => setGo(true), 120);
    return () => clearTimeout(t);
  }, [rows.length, max]);

  function replay() {
    setGo(false);
    setTimeout(() => setGo(true), 120);
  }

  return (
    <div className={`${s.panel} ${s.race}`}>
      <div className={s.panelHead}>
        <div className={s.panelIcon}><Ico n="trophy" size={20} /></div>
        <div>
          <div className={s.panelTitle}>Who earns the most?</div>
          <div className={s.panelSub}>Longest bar = the pitch that made the most money</div>
        </div>
        {rows.length > 0 && (
          <button className={s.replayBtn} onClick={replay} type="button">
            <Ico n="replay" size={14} /> Refresh
          </button>
        )}
      </div>

      {loading ? (
        <div className={s.skelRows}>{[0, 1, 2, 3].map((i) => <div key={i} className={s.skelRow} />)}</div>
      ) : rows.length === 0 ? (
        <div className={s.empty}>
          <Ico n="leaf" size={30} />
          <p>No earnings yet. When people book your pitches, the race starts here!</p>
        </div>
      ) : (
        <div className={s.raceList}>
          {rows.map((p, i) => {
            const val = Number(p.revenue);
            const pct = max > 0 ? Math.max(6, (val / max) * 100) : 0;
            const share = total > 0 ? Math.round((val / total) * 100) : 0;
            const [c1, c2] = BAR_COLORS[Math.min(i, 1)];
            return (
              <div className={s.raceRow} key={p.pitch_id}>
                <div className={`${s.raceRank} ${i === 0 ? s.raceRankTop : ""}`}>{i + 1}</div>
                <div className={s.raceMain}>
                  <div className={s.raceTop}>
                    <span className={s.raceName}>{p.name}</span>
                    <span className={s.raceVal}>{birr(val)}</span>
                  </div>
                  <div className={s.track}>
                    <div
                      className={s.bar}
                      style={{
                        width: go ? `${pct}%` : "0%",
                        background: `linear-gradient(90deg, ${c1}, ${c2})`,
                        transitionDelay: `${i * 110}ms`,
                      }}
                    />
                  </div>
                  <div className={s.raceNote}>
                    {p.bookings_count} {p.bookings_count === 1 ? "booking" : "bookings"} · {share}% of all your money
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Line chart ------------------------------ */

/* ------------------------- Hour-by-hour columns ------------------------- */
function TodayHours({ stats, loading }: Props) {
  const [sel, setSel] = useState<number | null>(null);

  const data = useMemo(() => {
    const booked = countByHour(stats?.today_bookings || []);
    const free = countByHour(stats?.today_free || []);
    const hrs = [...Object.keys(booked), ...Object.keys(free)].map(Number);
    if (!hrs.length) return null;
    const lo = Math.max(0, Math.min(...hrs));
    const hi = Math.min(23, Math.max(...hrs));
    const list: { h: number; booked: number; free: number }[] = [];
    for (let h = lo; h <= hi; h++) list.push({ h, booked: booked[h] || 0, free: free[h] || 0 });
    return list;
  }, [stats]);

  const maxTotal = data ? Math.max(1, ...data.map((d) => d.booked + d.free)) : 1;
  const busiest = data ? [...data].sort((a, b) => b.booked - a.booked)[0] : null;
  const emptiest = data ? [...data].sort((a, b) => b.free - a.free)[0] : null;

  // the hour shown in the readout box: hovered one, otherwise the busiest hour
  const active =
    data && (sel !== null ? data.find((d) => d.h === sel) : busiest && busiest.booked > 0 ? busiest : data[0]);

  const plural = (n: number) => (n === 1 ? "pitch" : "pitches");

  return (
    <div className={`${s.panel} ${s.line}`}>
      <div className={s.panelHead}>
        <div className={s.panelIcon}><Ico n="chart" size={20} /></div>
        <div>
          <div className={s.panelTitle}>Your day today</div>
          <div className={s.panelSub}>Each column is one hour. See how many pitches are booked or free.</div>
        </div>
      </div>

      {loading ? (
        <div className={s.skelChart} />
      ) : !data ? (
        <div className={s.empty}>
          <Ico n="leaf" size={30} />
          <p>Nothing to show for today yet. Bookings and free hours will appear here.</p>
        </div>
      ) : (
        <>
          <div className={s.legend}>
            <span><i className={s.dotBooked} /> Booked</span>
            <span><i className={s.dotFree} /> Free</span>
          </div>

          <div className={s.cols}>
            {data.map((d) => (
              <button
                type="button"
                key={d.h}
                className={`${s.col} ${active?.h === d.h ? s.colActive : ""}`}
                onMouseEnter={() => setSel(d.h)}
                onClick={() => setSel(d.h)}
                aria-label={`${hourLabel(d.h)}: ${d.booked} booked, ${d.free} free`}
              >
                <span className={s.stack}>
                  <span className={s.segFree} style={{ height: `${(d.free / maxTotal) * 100}%` }} />
                  <span className={s.segBooked} style={{ height: `${(d.booked / maxTotal) * 100}%` }}>
                    {d.booked > 0 ? d.booked : ""}
                  </span>
                </span>
                <span className={s.colHour}>{hourLabel(d.h)}</span>
              </button>
            ))}
          </div>

          {active && (
            <div className={s.readout}>
              <div className={s.readoutHour}>At {hourLabel(active.h)}</div>
              <div className={s.readoutRows}>
                <div><i className={s.dotBooked} /> <b>{active.booked}</b> {plural(active.booked)} booked</div>
                <div><i className={s.dotFree} /> <b>{active.free}</b> {plural(active.free)} free</div>
              </div>
            </div>
          )}

          <div className={s.chips}>
            {busiest && busiest.booked > 0 && (
              <div className={s.chip}>
                <div className={s.chipIcon}><Ico n="clock" size={16} /></div>
                <div>
                  <div className={s.chipLabel}>Busiest hour</div>
                  <div className={s.chipValue}>
                    {hourLabel(busiest.h)} <span>· {busiest.booked} {plural(busiest.booked)} booked</span>
                  </div>
                </div>
              </div>
            )}
            {emptiest && emptiest.free > 0 && (
              <div className={`${s.chip} ${s.chipSoft}`}>
                <div className={s.chipIcon}><Ico n="leaf" size={16} /></div>
                <div>
                  <div className={s.chipLabel}>Most empty hour</div>
                  <div className={s.chipValue}>
                    {hourLabel(emptiest.h)} <span>· {emptiest.free} {plural(emptiest.free)} free</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}



export default function OwnerInsights({ stats, loading }: Props) {
  return (
    <section className={s.root}>
      <div className={s.heading}>
        <span className={s.headingDot} />
        <h2>Your business at a glance</h2>
      </div>
      <Kpis stats={stats} loading={loading} />
      <div className={s.twoCol}>
        <RaceChart stats={stats} loading={loading} />
        <TodayHours stats={stats} loading={loading} />
      </div>
    </section>
  );
}