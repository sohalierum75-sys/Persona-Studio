/** Shared, original Persona Studio monogram. */
export default function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="brand"><svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="26" rx="7" fill="currentColor"/><path d="M14 9h8a7 7 0 0 1 0 14h-8V9Z" fill="var(--bg-base)"/><path d="M17 12h5a4 4 0 0 1 0 8h-5v-8Z" fill="currentColor"/></svg>{!compact && <span>Persona <span className="brand-studio">Studio</span></span>}</span>;
}
