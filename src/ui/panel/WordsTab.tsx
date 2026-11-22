import { useMemo } from 'react';
import type { TermStat } from '../../metrics/terms';
import type { PanelPost } from '../../db/views';
import { multiplierText } from '../format';
import { words } from './analytics';
import { Card, SampleNote } from './parts';

function TermList({ terms, empty }: { terms: TermStat[]; empty: string }) {
  if (terms.length === 0) return <div className="text-[12px] text-[var(--p-muted)]">{empty}</div>;
  const max = Math.max(...terms.map((t) => t.medianMultiplier));
  return (
    <div className="flex flex-col gap-[3px]">
      {terms.map((t) => (
        <div key={t.term} className="flex items-center gap-[8px] text-[11px]">
          <span className="w-[130px] shrink-0 truncate font-semibold" title={t.term}>
            {t.term}
          </span>
          <div className="h-[8px] flex-1 overflow-hidden rounded-full bg-[var(--p-border)]">
            <div className="h-full rounded-full bg-radar-accent" style={{ width: `${(t.medianMultiplier / max) * 100}%` }} />
          </div>
          <span className="w-[40px] text-right tabular-nums">{multiplierText(t.medianMultiplier)}</span>
          <span className="w-[34px] text-right text-[var(--p-muted)] tabular-nums">n={t.count}</span>
        </div>
      ))}
    </div>
  );
}

export function WordsTab({ posts }: { posts: PanelPost[] }) {
  const w = useMemo(() => words(posts), [posts]);
  const note = (
    <>
      <SampleNote n={w.sampleSize} unit="posts con nivel" /> · ordenado por multiplicador mediano; solo términos usados en 3 o más posts
    </>
  );
  return (
    <div className="flex flex-col gap-[10px]">
      <Card title="Hashtags que más rinden" note={note}>
        <TermList terms={w.hashtags} empty="Ningún hashtag aparece en 3 o más posts con nivel." />
      </Card>
      <Card title="Palabras del texto que más rinden" note={note}>
        <TermList terms={w.words} empty="Ninguna palabra aparece en 3 o más posts con nivel." />
      </Card>
      <Card title="Ganchos de los virales">
        <div className="text-[12px] text-[var(--p-muted)]">Llega con la transcripción (Fase 8): las primeras frases de cada reel viral.</div>
      </Card>
    </div>
  );
}
