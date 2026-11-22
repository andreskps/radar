import { useEffect, useMemo, useRef } from 'react';
import { Chart, LinearScale, LogarithmicScale, PointElement, ScatterController, Tooltip } from 'chart.js';
import type { PanelPost } from '../../db/views';
import { compact, multiplierText } from '../format';
import { heatmap, monthlyCounts, timeSeries, TIME_ZONE } from './analytics';
import { BUCKET_STYLE, Card, SampleNote } from './parts';

Chart.register(ScatterController, PointElement, LinearScale, LogarithmicScale, Tooltip);

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const tickDate = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, month: 'short', year: '2-digit' });
const tipDate = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });

function PerformanceChart({ posts, theme }: { posts: PanelPost[]; theme: 'dark' | 'light' }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const points = useMemo(() => timeSeries(posts), [posts]);
  useEffect(() => {
    if (!canvas.current || points.length === 0) return;
    const muted = theme === 'dark' ? '#9BA1B0' : '#5B6170';
    const grid = theme === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
    const chart = new Chart(canvas.current, {
      type: 'scatter',
      data: {
        datasets: [
          {
            data: points.map((p) => ({ x: p.x, y: Math.max(p.y, 1) })),
            pointRadius: points.length > 600 ? 2 : 3,
            pointHoverRadius: 6,
            pointBackgroundColor: points.map((p) => BUCKET_STYLE[p.bucket].color),
            pointBorderWidth: 0,
          },
        ],
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        scales: {
          x: { type: 'linear', min: points[0]!.x, max: points.at(-1)!.x, ticks: { color: muted, maxTicksLimit: 6, callback: (v) => tickDate.format(Number(v)) }, grid: { color: grid } },
          y: { type: 'logarithmic', ticks: { color: muted, maxTicksLimit: 6, callback: (v) => compact(Number(v)) }, grid: { color: grid } },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const p = points[ctx.dataIndex]!;
                return `${tipDate.format(p.x)} · ${compact(p.y)} · ${BUCKET_STYLE[p.bucket].label}`;
              },
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [points, theme]);

  if (points.length === 0) return <div className="text-[12px] text-[var(--p-muted)]">Sin cifras para graficar en este rango.</div>;
  return (
    <div className="h-[200px]">
      <canvas ref={canvas} data-testid="radar-time-chart" />
    </div>
  );
}

function Heatmap({ posts }: { posts: PanelPost[] }) {
  const hm = useMemo(() => heatmap(posts), [posts]);
  const cells = new Map(hm.cells.map((c) => [`${c.day}-${c.hour}`, c]));
  return (
    <Card
      title="Mejor hora para publicar (hora de Bogotá)"
      note={
        hm.enough ? (
          <>
            <SampleNote n={hm.sampleSize} min={30} /> · color = multiplicador mediano de la franja (de 0.5× tenue a 3× o más pleno)
          </>
        ) : (
          <span className="text-[#F59E0B]">Se necesitan al menos 30 posts con nivel para recomendar horas (hay {hm.sampleSize}).</span>
        )
      }
    >
      {hm.enough && hm.top.length > 0 && (
        <div className="mb-[8px] flex flex-wrap gap-[6px] text-[11px]">
          {hm.top.map((t) => (
            <span key={`${t.day}-${t.hour}`} className="rounded-full bg-radar-accent px-[8px] py-[2px] font-semibold text-radar-bg">
              {DAYS[t.day]} {String(t.hour).padStart(2, '0')}:00 · {multiplierText(t.medianMultiplier)} · n={t.count}
            </span>
          ))}
        </div>
      )}
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: '28px repeat(24, 1fr)' }} data-testid="radar-heatmap">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center text-[8px] text-[var(--p-muted)]">
            {h % 3 === 0 ? h : ''}
          </span>
        ))}
        {DAYS.map((d, day) => (
          <Row key={d} label={d}>
            {Array.from({ length: 24 }, (_, hour) => {
              const c = cells.get(`${day}-${hour}`);
              return (
                <span
                  key={hour}
                  title={c ? `${d} ${hour}:00 · ${c.count} posts · ${multiplierText(c.medianMultiplier)}` : `${d} ${hour}:00 · sin posts`}
                  className="h-[12px] rounded-[2px]"
                  style={{ background: c ? `rgba(198,244,50,${heat(c.medianMultiplier)})` : 'var(--p-border)' }}
                />
              );
            })}
          </Row>
        ))}
      </div>
    </Card>
  );
}

/** Intensidad fija de 0.5× (tenue) a 3× (pleno): un valor atípico no apaga el resto. */
const heat = (m: number) => 0.12 + 0.88 * Math.min(Math.max((m - 0.5) / 2.5, 0), 1);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="text-[9px] leading-[12px] text-[var(--p-muted)]">{label}</span>
      {children}
    </>
  );
}

function Calendar({ posts }: { posts: PanelPost[] }) {
  const months = useMemo(() => monthlyCounts(posts).slice(-24), [posts]);
  const max = Math.max(1, ...months.map((m) => m.count));
  return (
    <Card title="Publicaciones por mes (últimos 24 meses del rango)" note="Verde: cuántos de esos posts fueron virales (≥ 2×).">
      {months.length === 0 ? (
        <div className="text-[12px] text-[var(--p-muted)]">Sin publicaciones en este rango.</div>
      ) : (
        <div className="flex h-[90px] items-end gap-[2px]" data-testid="radar-calendar">
          {months.map((m) => (
            <div key={m.key} className="flex h-full flex-1 flex-col justify-end" title={`${m.label}: ${m.count} posts, ${m.virals} virales`}>
              <div className="relative w-full rounded-t-[2px] bg-[var(--p-border)]" style={{ height: `${(m.count / max) * 100}%` }}>
                <div className="absolute bottom-0 w-full rounded-t-[2px] bg-[#22C55E]" style={{ height: m.count ? `${(m.virals / m.count) * 100}%` : 0 }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {months.length > 0 && (
        <div className="mt-[4px] flex justify-between text-[9px] text-[var(--p-muted)]">
          <span>{months[0]!.label}</span>
          <span>{months.at(-1)!.label}</span>
        </div>
      )}
    </Card>
  );
}

export function TimeTab({ posts, theme }: { posts: PanelPost[]; theme: 'dark' | 'light' }) {
  const n = useMemo(() => timeSeries(posts).length, [posts]);
  return (
    <div className="flex flex-col gap-[10px]">
      <Card
        title="Rendimiento en el tiempo"
        note={
          <>
            <SampleNote n={n} /> · vistas (reels) o likes + comentarios (posts), escala logarítmica, color = nivel
          </>
        }
      >
        <PerformanceChart posts={posts} theme={theme} />
      </Card>
      <Heatmap posts={posts} />
      <Calendar posts={posts} />
    </div>
  );
}
