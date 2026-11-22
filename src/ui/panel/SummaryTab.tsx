import type { PanelPost } from '../../db/views';
import { compact, multiplierText, percent } from '../format';
import { TIER_ORDER, type Summary } from './analytics';
import { BUCKET_STYLE, Card, Pill, SampleNote, StatCard, igUrl } from './parts';

export function SummaryTab({ summary }: { summary: Summary }) {
  const max = Math.max(1, ...Object.values(summary.tiers));
  return (
    <div className="flex flex-col gap-[10px]">
      <div className="grid grid-cols-2 gap-[8px]">
        <StatCard label="Mediana de vistas (reels)" stat={summary.medianViews} format={compact} unit="reels" />
        <StatCard label="% virales (≥ 2×)" stat={summary.viralPct} format={percent} unit="con nivel" />
        <StatCard label="ER mediano" stat={summary.medianEr} format={percent} />
        <StatCard label="Publicaciones por semana" stat={summary.perWeek} format={(v) => v.toFixed(1)} />
      </div>

      <Card title="Posts por nivel" note={<SampleNote n={summary.count} />}>
        <div className="flex flex-col gap-[4px]" data-testid="radar-tier-histogram">
          {TIER_ORDER.map((t) => (
            <div key={t} className="flex items-center gap-[8px] text-[11px]">
              <span className="w-[120px] shrink-0 truncate">
                {BUCKET_STYLE[t].icon} {BUCKET_STYLE[t].label}
              </span>
              <div className="h-[10px] flex-1 overflow-hidden rounded-full bg-[var(--p-border)]">
                <div className="h-full rounded-full" style={{ width: `${(summary.tiers[t] / max) * 100}%`, background: BUCKET_STYLE[t].color }} />
              </div>
              <span className="w-[42px] text-right tabular-nums">{summary.tiers[t].toLocaleString('es-CO')}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Top 6 por multiplicador" note={summary.top.length < 6 ? 'Solo cuentan los posts con nivel (sin "pocos datos" ni "en curso").' : undefined}>
        {summary.top.length === 0 ? (
          <div className="text-[12px] text-[var(--p-muted)]">Todavía no hay posts con nivel en este rango.</div>
        ) : (
          <div className="grid grid-cols-3 gap-[6px]">
            {summary.top.map((p) => (
              <TopCard key={p.code} post={p} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function Cover({ post, className = '' }: { post: PanelPost; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[8px] bg-[var(--p-border)] ${className}`}>
      {post.coverUrl && (
        <img
          src={post.coverUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
          // Las URL de portada de Instagram vencen: si falla, queda el fondo.
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
    </div>
  );
}

function TopCard({ post }: { post: PanelPost }) {
  return (
    <a href={igUrl(post.code, post.type)} target="_blank" rel="noreferrer" className="group flex flex-col gap-[4px] text-[var(--p-text)] no-underline">
      <Cover post={post} className="aspect-[3/4] w-full" />
      <Pill bucket={post.tier!} text={multiplierText(post.multiplier)} />
      <span className="text-[10px] text-[var(--p-muted)] tabular-nums">{post.type === 'reel' ? `${compact(post.views)} vistas` : `${compact(post.likes)} likes`}</span>
    </a>
  );
}
