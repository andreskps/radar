// Centro: trabajo entre perfiles (docs/design.md §6.3). Vacío en Fase 0; se llena en la Fase 7.
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
          {SECTIONS.map((s) => (
            <li key={s} className="rounded px-2 py-1.5 opacity-60">
              {s}
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold">Centro</h1>
        <p className="mt-2 text-sm opacity-70">Aquí verás clientes, ranking del nicho y comparaciones. Disponible desde la Fase 7.</p>
      </main>
    </div>
  );
}
