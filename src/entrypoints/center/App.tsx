// Centro: trabajo entre perfiles (docs/design.md §6.3). En la Fase 6 solo funciona "Datos"
// (exportar e importar); el resto se llena en la Fase 7.
import { DataView } from './DataView';

const SECTIONS = ['Clientes', 'Ranking', 'Comparar', 'Colecciones', 'Cola', 'Ajustes'];

export function App() {
  return (
    <div className="flex min-h-screen bg-radar-bg font-sans text-radar-text">
      <nav className="w-56 shrink-0 bg-radar-surface p-4">
        <p className="mb-6 flex items-center gap-2 text-lg font-bold">
          <span className="size-2.5 rounded-full bg-radar-accent" />
          Radar
        </p>
        <ul className="space-y-1 text-sm">
          <li className="rounded bg-white/10 px-2 py-1.5 font-semibold">Datos</li>
          {SECTIONS.map((s) => (
            <li key={s} className="rounded px-2 py-1.5 opacity-40" title="Disponible desde la Fase 7">
              {s}
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 p-8">
        <DataView />
      </main>
    </div>
  );
}
