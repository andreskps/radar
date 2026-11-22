// Indicador de Fase 0: confirma que Radar se cargó en Instagram.
// Se usan px (no rem) para que el tamaño no dependa del font-size de Instagram.
export function StatusIndicator() {
  return (
    <div
      data-testid="radar-status"
      className="fixed right-[16px] bottom-[16px] z-[2147483647] flex items-center gap-[8px] rounded-full bg-radar-surface px-[12px] py-[6px] font-sans text-[12px] font-semibold text-radar-text shadow-lg"
    >
      <span className="size-[8px] rounded-full bg-radar-accent" />
      Radar activo
    </div>
  );
}
