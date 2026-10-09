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

const BAR_COLORS = [
  ["#0ea5e9", "#38bdf8"], // rank 1: slightly stronger
  ["#38bdf8", "#7dd3fc"], // everyone else: soft light blue
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
function smooth(pts: { x: number; y: number }[]) {
  if (!pts.length) return "";
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1].x + pts[i].x) / 2;
    d += ` C${mx},${pts[i - 1].y} ${mx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
  }
  return d;
}

/* ------------------------------ KPI tiles ------------------------------ */
function Kpis({ stats, loading }: Props) {
  const total = Number(stats?.total_revenue) || 0;
  const bookings = stats?.total_bookings ?? 0;
  const avg = bookings > 0 ? total / bookings : 0;
  const tiles = [
    { icon: "cash", label: "Money you made", value: birr(total), hint: "All confirmed bookings, total", c: "gold" },
    { icon: "cal", label: "Times people booked", value: String(bookings), hint: "Number of confirmed bookings", c: "green" },
    { icon: "check", label: "Pitches open for booking", value: String(stats?.active_pitches ?? 0), hint: "Approved and ready", c: "blue" },
    { icon: "avg", label: "Average per booking", value: birr(avg), hint: "Money made ÷ bookings", c: "purple" },
  ] as const;

  return (
    <div className={s.kpiGrid}>
      {tiles.map((t) => (
        <div key={t.label} className={`${s.kpi} ${s[`kpi_${t.c}`]}`}>
          <div className={s.kpiIcon}><Ico n={t.icon as keyof typeof ICONS} size={26} /></div>
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
        <div className={`${s.panelIcon} ${s.ic_gold}`}><Ico n="trophy" size={20} /></div>
        <div>
          <div className={s.panelTitle}>Who earns the most?</div>
          <div className={s.panelSub}>Longest bar = the pitch that made the most money</div>
        </div>
        {rows.length > 0 && (
          <button className={s.replayBtn} onClick={replay} type="button">
            <Ico n="replay" size={14} /> Replay race
          </button>
        )}
      </div>

      {loading ? (
        <div className={s.skelRows}>{[0, 1, 2, 3].map((i) => <div key={i} className={s.skelRow} />)}</div>
      ) : rows.length === 0 ? (
        <div className={s.empty}>
          <Ico n="bulb" size={28} />
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
                        background: `linear-gradient(180deg, ${c2}, ${c1})`,
                        boxShadow: "none",
                        transitionDelay: `${i * 110}ms`,
                      }}
                    >
                      
                    </div>
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
function TodayLine({ stats, loading }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const data = useMemo(() => {
    const booked = countByHour(stats?.today_bookings || []);
    const free = countByHour(stats?.today_free || []);
    const hrs = [...Object.keys(booked), ...Object.keys(free)].map(Number);
    if (!hrs.length) return null;
    const lo = Math.max(0, Math.min(...hrs) - 0);
    const hi = Math.min(23, Math.max(...hrs));
    const list = [];
    for (let h = lo; h <= hi; h++) list.push({ h, booked: booked[h] || 0, free: free[h] || 0 });
    return list;
  }, [stats]);

  const W = 600, H = 230, L = 34, R = 14, T = 16, B = 34;
  const maxY = data ? Math.max(1, ...data.map((d) => Math.max(d.booked, d.free))) : 1;
  const x = (i: number) => (data && data.length > 1 ? L + (i * (W - L - R)) / (data.length - 1) : W / 2);
  const y = (v: number) => T + (1 - v / maxY) * (H - T - B);

  const bookedPts = data?.map((d, i) => ({ x: x(i), y: y(d.booked) })) || [];
  const freePts = data?.map((d, i) => ({ x: x(i), y: y(d.free) })) || [];
  const bookedPath = smooth(bookedPts);
  const freePath = smooth(freePts);
  const area = bookedPts.length
    ? `${bookedPath} L${bookedPts[bookedPts.length - 1].x},${H - B} L${bookedPts[0].x},${H - B} Z`
    : "";

  const busiest = data ? [...data].sort((a, b) => b.booked - a.booked)[0] : null;
  const step = data ? Math.ceil(data.length / 8) : 1;
  const hv = hover !== null && data ? data[hover] : null;

  return (
    <div className={`${s.panel} ${s.line}`}>
      <div className={s.panelHead}>
        <div className={`${s.panelIcon} ${s.ic_blue}`}><Ico n="chart" size={20} /></div>
        <div>
          <div className={s.panelTitle}>Your day today</div>
          <div className={s.panelSub}>How many pitches are busy or empty, hour by hour</div>
        </div>
      </div>

      {loading ? (
        <div className={s.skelChart} />
      ) : !data ? (
        <div className={s.empty}>
          <Ico n="bulb" size={28} />
          <p>Nothing to show for today yet. Bookings and free hours will appear here.</p>
        </div>
      ) : (
        <>
          <div className={s.legend}>
            <span><i style={{ background: "#0ea5e9" }} /> Booked (busy)</span>
            <span><i style={{ background: "#94a3b8" }} /> Free (empty)</span>
          </div>
          <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => setHover(null)}>
            <defs>
              <linearGradient id="oiArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.38" />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
              </linearGradient>
            </defs>
            {Array.from({ length: maxY + 1 }).map((_, v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={s.grid} />
                <text x={L - 8} y={y(v) + 4} className={s.axis} textAnchor="end">{v}</text>
              </g>
            ))}
            <path d={area} fill="url(#oiArea)" />
            <path d={freePath} className={s.lineFree} pathLength={1} />
            <path d={bookedPath} className={s.lineBooked} pathLength={1} />
            {data!.map((d, i) => (
              <g key={d.h}>
                {i % step === 0 && (
                  <text x={x(i)} y={H - 10} className={s.axis} textAnchor="middle">{hourLabel(d.h)}</text>
                )}
                <circle cx={x(i)} cy={y(d.free)} r={hover === i ? 4.5 : 0} fill="#94a3b8" stroke="#fff" strokeWidth="2" />
                <circle cx={x(i)} cy={y(d.booked)} r={hover === i ? 5.5 : 0} fill="#0ea5e9" stroke="#fff" strokeWidth="2" />
                <rect x={x(i) - 14} y={T} width={28} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            ))}
            {hv && (
              <g transform={`translate(${Math.min(Math.max(x(hover!), 70), W - 70)},${T + 4})`}>
                <rect x="-64" y="0" width="128" height="46" rx="10" className={s.tip} />
                <text x="0" y="17" textAnchor="middle" className={s.tipTitle}>{hourLabel(hv.h)}</text>
                <text x="0" y="35" textAnchor="middle" className={s.tipText}>
                  {hv.booked} busy · {hv.free} free
                </text>
              </g>
            )}
          </svg>
          {busiest && busiest.booked > 0 && (
            <div className={s.insight}>
              <Ico n="bulb" size={16} /> Your busiest time today is <b>{hourLabel(busiest.h)}</b> with{" "}
              <b>{busiest.booked}</b> {busiest.booked === 1 ? "pitch" : "pitches"} booked.
            </div>
          )}
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
        <TodayLine stats={stats} loading={loading} />
      </div>
    </section>
  );
}
