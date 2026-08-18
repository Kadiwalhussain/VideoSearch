import { useMemo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Camera,
  Clapperboard,
  FileText,
  Highlighter,
  PieChart,
  Radar,
  CalendarDays,
  Trophy,
  Sparkles,
  Tv,
  Clock3,
} from "lucide-react";
import { SessionLoader } from "../components/SessionLoader";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Bar, Doughnut, Line, Radar as RadarChart } from "react-chartjs-2";
import { useVault } from "../store/VaultContext";
import { useTheme } from "../store/ThemeContext";
import { buildAnalytics, chartTheme } from "../lib/analytics";
import { ytThumb } from "../lib/format";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend
);

function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 750);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="ana-spark" aria-hidden>
      {values.map((v, i) => (
        <i
          key={i}
          style={{
            height: `${Math.max(12, (v / max) * 100)}%`,
            background: color,
            opacity: 0.35 + (v / max) * 0.65,
          }}
        />
      ))}
    </div>
  );
}

function Heatmap({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="ana-heat">
      {values.map((v, i) => {
        const t = v / max;
        return (
          <div key={labels[i]} className="ana-heat-cell">
            <div
              className="ana-heat-box"
              style={{
                background: `rgba(52, 211, 153, ${0.08 + t * 0.75})`,
                boxShadow:
                  t > 0.5 ? `0 0 12px rgba(52,211,153,${t * 0.35})` : "none",
              }}
              title={`${labels[i]}: ${v}`}
            />
            <span>{labels[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function AnalyticsPage() {
  const { stats, rows, loading } = useVault();
  const { theme } = useTheme();
  const dark = theme !== "light";
  const c = chartTheme(dark);
  const model = useMemo(() => buildAnalytics(rows, stats), [rows, stats]);
  const topChannels = model.channels.slice(0, 8);

  const commonOpts = useMemo((): ChartOptions => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: c.text,
            boxWidth: 10,
            boxHeight: 10,
            font: { size: 11, family: "Inter, system-ui, sans-serif" },
          },
        },
        tooltip: {
          backgroundColor: dark
            ? "rgba(8,12,20,0.95)"
            : "rgba(15,23,42,0.92)",
          titleColor: "#fff",
          bodyColor: "#e2e8f0",
          borderColor: c.grid,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
        },
      },
      scales: {
        x: {
          ticks: { color: c.muted, font: { size: 10 } },
          grid: { color: c.grid },
          border: { display: false },
        },
        y: {
          ticks: { color: c.muted, font: { size: 10 } },
          grid: { color: c.grid },
          border: { display: false },
          beginAtZero: true,
        },
      },
    };
  }, [c, dark]);

  const weekData: ChartData<"bar"> = {
    labels: model.week.labels,
    datasets: [
      {
        label: "Marks",
        data: model.week.marks,
        backgroundColor: c.accent,
        borderRadius: 6,
        borderSkipped: false,
      },
      {
        label: "Shots",
        data: model.week.shots,
        backgroundColor: c.accent2,
        borderRadius: 6,
        borderSkipped: false,
      },
      {
        label: "Videos touched",
        data: model.week.videos,
        backgroundColor: c.accent3,
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  const lineData: ChartData<"line"> = {
    labels: model.last14.labels,
    datasets: [
      {
        label: "Captures (14 days)",
        data: model.last14.values,
        borderColor: c.accent,
        backgroundColor: dark
          ? "rgba(52,211,153,0.15)"
          : "rgba(4,120,87,0.12)",
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: c.accent,
        pointBorderColor: dark ? "#0c101a" : "#fff",
        pointBorderWidth: 2,
      },
    ],
  };

  const mixData: ChartData<"doughnut"> = {
    labels: ["Videos", "Marks", "Shots", "Written notes"],
    datasets: [
      {
        data: [
          model.composition.videos,
          model.composition.marks,
          model.composition.shots,
          model.composition.written,
        ],
        backgroundColor: [c.accent3, c.accent, c.accent2, c.accent4],
        borderColor: dark ? "#0c101a" : "#ffffff",
        borderWidth: 3,
        hoverOffset: 8,
      },
    ],
  };

  const ringData: ChartData<"doughnut"> = {
    labels: ["With notes", "Silent marks/shots"],
    datasets: [
      {
        data: [model.noteDensity, Math.max(0, 100 - model.noteDensity)],
        backgroundColor: [
          c.accent,
          dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)",
        ],
        borderWidth: 0,
        circumference: 270,
        rotation: 225,
      },
    ],
  };

  const radarData: ChartData<"radar"> = {
    labels: ["Videos", "Marks", "Shots", "Notes", "Depth", "Saved"],
    datasets: [
      {
        label: "Vault strength",
        data: model.radar,
        backgroundColor: dark
          ? "rgba(52,211,153,0.18)"
          : "rgba(4,120,87,0.12)",
        borderColor: c.accent,
        pointBackgroundColor: c.accent,
        pointBorderColor: "#fff",
        borderWidth: 2,
      },
    ],
  };

  const doughnutOpts: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "68%",
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: c.text,
          boxWidth: 10,
          padding: 12,
          font: { size: 11 },
        },
      },
      tooltip: commonOpts.plugins?.tooltip,
    },
  };

  const radarOpts: ChartOptions<"radar"> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        angleLines: { color: c.grid },
        grid: { color: c.grid },
        pointLabels: {
          color: c.muted,
          font: { size: 10 },
        },
        ticks: {
          display: false,
          backdropColor: "transparent",
        },
        suggestedMin: 0,
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: commonOpts.plugins?.tooltip,
    },
  };

  return (
    <div className="view analytics-view">
      <header className="view-head ana-head">
        <div>
          <h1>
            <BarChart3 size={22} /> Analytics
          </h1>
          <p className="view-sub">
            Live intelligence from your vault — channels you engage with, marks,
            shots, and notes from the extension.
          </p>
        </div>
        <span className="ana-pill">
          <Sparkles size={12} /> Chart.js · live
        </span>
      </header>

      <div className="ana-banner glass-card">
        <div>
          <strong>Studio pulse</strong>
          <p>
            {model.totalPulse ? (
              <>
                Peak activity on{" "}
                <em style={{ color: "var(--accent)", fontStyle: "normal" }}>
                  {model.peakDay}
                </em>
                {model.topChannel !== "—" ? (
                  <>
                    {" "}
                    · most time with{" "}
                    <em style={{ color: "var(--accent-2)", fontStyle: "normal" }}>
                      {model.topChannel}
                    </em>
                  </>
                ) : null}{" "}
                · {model.noteDensity}% note density · {stats.videos} videos
              </>
            ) : (
              "Capture on YouTube to light up these charts."
            )}
          </p>
        </div>
        <span className="ana-pill gold">Channels · vault</span>
      </div>

      {loading && !rows.length ? (
        <SessionLoader
          variant="inline"
          title="Loading analytics"
          sub="Crunching marks, shots, and activity from your vault…"
        />
      ) : null}

      <div className="ana-kpi-strip">
        <div
          className="ana-kpi glass-card"
          style={{ ["--kpi-glow" as string]: "rgba(167,139,250,0.45)" }}
        >
          <div className="ana-kpi-label">
            <Clapperboard size={14} /> Videos
          </div>
          <div className="ana-kpi-val">
            <CountUp value={stats.videos} />
          </div>
          <div className="ana-kpi-meta">
            <span className="up">Library</span> synced titles
          </div>
          <Spark
            values={model.week.videos.map((v) => v + 0.5)}
            color={c.accent3}
          />
        </div>
        <div
          className="ana-kpi glass-card"
          style={{ ["--kpi-glow" as string]: "rgba(52,211,153,0.45)" }}
        >
          <div className="ana-kpi-label">
            <Highlighter size={14} /> Highlights
          </div>
          <div className="ana-kpi-val">
            <CountUp value={stats.marks} />
          </div>
          <div className="ana-kpi-meta">
            <span className="up">{model.avgMarks}</span> avg / video
          </div>
          <Spark
            values={model.week.marks.map((v) => v + 0.5)}
            color={c.accent}
          />
        </div>
        <div
          className="ana-kpi glass-card"
          style={{ ["--kpi-glow" as string]: "rgba(56,189,248,0.45)" }}
        >
          <div className="ana-kpi-label">
            <Camera size={14} /> Screenshots
          </div>
          <div className="ana-kpi-val">
            <CountUp value={stats.shots} />
          </div>
          <div className="ana-kpi-meta">
            <span className="up">{model.avgShots}</span> avg / video
          </div>
          <Spark
            values={model.week.shots.map((v) => v + 0.5)}
            color={c.accent2}
          />
        </div>
        <div
          className="ana-kpi glass-card"
          style={{ ["--kpi-glow" as string]: "rgba(251,191,36,0.4)" }}
        >
          <div className="ana-kpi-label">
            <FileText size={14} /> Written notes
          </div>
          <div className="ana-kpi-val">
            <CountUp value={model.writtenNotes} />
          </div>
          <div className="ana-kpi-meta">
            <span className="up">{model.noteDensity}%</span> note density
          </div>
          <Spark
            values={[
              model.writtenNotes || 1,
              stats.marks || 1,
              stats.shots || 1,
              stats.videos || 1,
              model.writtenNotes || 1,
              Math.max(1, stats.marks - model.writtenNotes),
              2,
            ]}
            color={c.accent4}
          />
        </div>
      </div>

      {/* Channel time first — real channel data from your vault videos */}
      <section className="glass-card pad ana-card ana-channels" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3>
            <Tv size={16} /> Where you spend time
          </h3>
          <span className="ana-pill sm">
            <Clock3 size={11} /> real channels
          </span>
        </div>
        <p className="ana-insight" style={{ marginTop: 0 }}>
          Built from your vault videos’ real YouTube channel names. Focus time
          is estimated from mark/shot positions on each video (when you
          actually annotated — original timestamps).
        </p>

        {topChannels.length ? (
          <div className="ana-channels-layout">
            <div className="ana-chart ana-channels-chart">
              <Bar
                data={{
                  labels: topChannels.map((ch) =>
                    ch.name.length > 22 ? `${ch.name.slice(0, 20)}…` : ch.name
                  ),
                  datasets: [
                    {
                      label: "Focus minutes",
                      data: topChannels.map((ch) => ch.minutes),
                      backgroundColor: c.accent2,
                      borderRadius: 8,
                      borderSkipped: false,
                    },
                    {
                      label: "Marks",
                      data: topChannels.map((ch) => ch.marks),
                      backgroundColor: c.accent,
                      borderRadius: 8,
                      borderSkipped: false,
                    },
                    {
                      label: "Shots",
                      data: topChannels.map((ch) => ch.shots),
                      backgroundColor: c.accent3,
                      borderRadius: 8,
                      borderSkipped: false,
                    },
                  ],
                }}
                options={{
                  ...commonOpts,
                  indexAxis: "y" as const,
                  plugins: {
                    ...commonOpts.plugins,
                    legend: {
                      position: "top",
                      align: "end",
                      labels: {
                        color: c.text,
                        boxWidth: 8,
                        boxHeight: 8,
                        font: { size: 11 },
                      },
                    },
                  },
                  scales: {
                    x: {
                      stacked: false,
                      ticks: { color: c.muted, font: { size: 10 } },
                      grid: { color: c.grid },
                      border: { display: false },
                      beginAtZero: true,
                    },
                    y: {
                      ticks: { color: c.text, font: { size: 11 } },
                      grid: { display: false },
                      border: { display: false },
                    },
                  },
                }}
              />
            </div>

            <div className="ana-channel-list">
              <div className="ana-channel-summary">
                <div>
                  <b>{model.channels.length}</b>
                  <span>channels</span>
                </div>
                <div>
                  <b>{formatMinutes(model.totalChannelMinutes)}</b>
                  <span>est. focus</span>
                </div>
                <div>
                  <b title={model.topChannel}>
                    {model.topChannel.length > 18
                      ? `${model.topChannel.slice(0, 16)}…`
                      : model.topChannel}
                  </b>
                  <span>top channel</span>
                </div>
              </div>
              {topChannels.map((ch, i) => {
                const max = topChannels[0]?.score || 1;
                return (
                  <div key={ch.name} className="ana-channel-row">
                    <span className="rank">{i + 1}</span>
                    {ch.sampleVideoId ? (
                      <img
                        src={ytThumb(ch.sampleVideoId)}
                        alt=""
                        className="ana-top-thumb"
                      />
                    ) : (
                      <div className="ana-top-thumb ana-thumb-ph" />
                    )}
                    <div className="ana-top-main">
                      {ch.url ? (
                        <a
                          href={ch.url}
                          target="_blank"
                          rel="noreferrer"
                          className="ana-channel-name"
                        >
                          <strong>{ch.name}</strong>
                        </a>
                      ) : (
                        <strong className="ana-channel-name">{ch.name}</strong>
                      )}
                      <span>
                        {ch.videos} video{ch.videos === 1 ? "" : "s"} ·{" "}
                        {formatMinutes(ch.minutes)} focus · {ch.marks} marks ·{" "}
                        {ch.shots} shots
                      </span>
                      <div className="ana-top-bar">
                        <i style={{ width: `${(ch.score / max) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="empty">
            No channel data yet. Mark or capture on YouTube — channel names
            fill in automatically from each video.
          </div>
        )}
      </section>

      <div className="ana-grid-2" style={{ marginTop: 16 }}>
        <section className="glass-card pad ana-card">
          <div className="card-head">
            <h3>
              <Activity size={16} /> Weekly pulse
            </h3>
            <span className="ana-pill sm">by capture day</span>
          </div>
          <div className="ana-chart lg">
            <Bar
              data={weekData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: "top",
                    align: "end",
                    labels: {
                      color: c.text,
                      boxWidth: 8,
                      boxHeight: 8,
                      font: { size: 10 },
                    },
                  },
                  tooltip: commonOpts.plugins?.tooltip,
                },
                scales: {
                  x: {
                    stacked: true,
                    ticks: { color: c.muted, font: { size: 10 } },
                    grid: { color: c.grid },
                    border: { display: false },
                  },
                  y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { color: c.muted, font: { size: 10 } },
                    grid: { color: c.grid },
                    border: { display: false },
                  },
                },
              }}
            />
          </div>
          <p className="ana-insight">
            Counts use original mark/shot timestamps (when you captured), not
            last vault sync time.
          </p>
        </section>

        <section className="glass-card pad ana-card">
          <div className="card-head">
            <h3>
              <PieChart size={16} /> Vault composition
            </h3>
            <span className="ana-pill sm">mix</span>
          </div>
          <div className="ana-chart">
            <Doughnut data={mixData} options={doughnutOpts} />
          </div>
        </section>
      </div>

      <div className="ana-grid-2" style={{ marginTop: 16 }}>
        <section className="glass-card pad ana-card">
          <div className="card-head">
            <h3>
              <Activity size={16} /> 14-day capture trend
            </h3>
            <span className="ana-pill sm">marks + shots</span>
          </div>
          <div className="ana-chart lg">
            <Line
              data={lineData}
              options={commonOpts as ChartOptions<"line">}
            />
          </div>
        </section>

        <div className="ana-grid-2-inner">
          <section className="glass-card pad ana-card">
            <div className="card-head">
              <h3>
                <FileText size={16} /> Note density
              </h3>
            </div>
            <div className="ana-chart sm ana-ring-wrap">
              <Doughnut
                data={ringData}
                options={{
                  ...doughnutOpts,
                  plugins: {
                    legend: { display: false },
                    tooltip: doughnutOpts.plugins?.tooltip,
                  },
                }}
              />
              <div className="ana-ring-center">
                <b>{model.noteDensity}%</b>
                <span>notes</span>
              </div>
            </div>
            <p className="ana-insight">
              Share of annotations with written text — denser notes improve
              search and recall.
            </p>
          </section>

          <section className="glass-card pad ana-card">
            <div className="card-head">
              <h3>
                <Radar size={16} /> Capability map
              </h3>
            </div>
            <div className="ana-chart">
              <RadarChart data={radarData} options={radarOpts} />
            </div>
          </section>
        </div>
      </div>

      <div className="ana-grid-2" style={{ marginTop: 16 }}>
        <section className="glass-card pad ana-card">
          <div className="card-head">
            <h3>
              <CalendarDays size={16} /> Activity heat
            </h3>
            <span className="ana-pill sm">weekday</span>
          </div>
          <Heatmap
            values={model.week.activity}
            labels={[...model.week.labels]}
          />
          <p className="ana-insight">
            Darker emerald = more captures that weekday (from original mark/shot
            times).
          </p>
          <div className="ana-mini-stats">
            <div>
              <b>{model.savedShare}%</b>
              <span>videos saved</span>
            </div>
            <div>
              <b>{model.watchLaterShare}%</b>
              <span>watch later</span>
            </div>
            <div>
              <b>{model.peakDay}</b>
              <span>peak day</span>
            </div>
          </div>
        </section>

        <section className="glass-card pad ana-card">
          <div className="card-head">
            <h3>
              <Trophy size={16} /> Top annotated videos
            </h3>
            <Link className="link-btn" to="/library">
              Library →
            </Link>
          </div>
          <div className="ana-top-list">
            {model.top.map((t, i) => {
              const max = model.top[0]?.score || 1;
              return (
                <div key={t.id} className="ana-top-row">
                  <span className="rank">{i + 1}</span>
                  <img src={ytThumb(t.id)} alt="" className="ana-top-thumb" />
                  <div className="ana-top-main">
                    <Link to={`/video/${t.id}`}>
                      <strong>{t.title}</strong>
                    </Link>
                    <span>
                      {t.channel ? `${t.channel} · ` : ""}
                      {t.marks} marks · {t.shots} shots · {t.notes} notes
                    </span>
                    <div className="ana-top-bar">
                      <i style={{ width: `${(t.score / max) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {!model.top.length ? (
              <div className="empty">No annotated videos yet</div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
