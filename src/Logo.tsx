/** The app's mark: a minimal mask with an eye, drawn as a single stroke. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return <svg className="logo-mark-svg" viewBox="0 0 42 42" width={size} height={size} aria-hidden="true" focusable="false">
    <path d="M8 19c4-10 22-14 28-2-1 11-6 17-14 18C14 34 9 28 8 19Z" />
    <path d="M13 21c5-5 12-5 17 0-5 5-12 5-17 0Z" />
    <path d="M21 18v7M12 8l3 5M30 8l-3 5" />
  </svg>;
}

/** Mark plus the two-line wordmark. */
export default function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-mark ${compact ? 'compact' : ''}`}>
    <span className="brand-logo"><LogoMark size={compact ? 20 : 24} /></span>
    <span className="brand-word"><b>MAFIA</b><i>SHADOWS</i></span>
  </div>;
}
