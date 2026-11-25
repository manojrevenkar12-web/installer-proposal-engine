import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "Projects", end: true },
  { to: "/aftercare", label: "Aftercare" },
  { to: "/study", label: "Study" },
];

export function Layout({ connected, onDisconnect }: { connected: boolean; onDisconnect: () => void }) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[13.5rem_1fr]">
      <aside className="border-b border-line bg-surface md:min-h-screen md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-5 py-5 md:block">
          <SunMark />
          <p className="font-semibold leading-tight md:mt-3">Proposal engine</p>
          <p className="hidden text-xs text-ink-3 md:block">for solar and heat-pump installers</p>
        </div>
        <nav aria-label="Main" className="flex gap-1 px-3 pb-3 md:flex-col md:pb-0">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}
              className={({ isActive }) => `rounded-[var(--radius-mark)] px-3 py-2 text-sm ${isActive ? "bg-sunk font-semibold text-ink" : "text-ink-2 hover:bg-sunk/60"}`}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        {connected && (
          <button type="button" onClick={onDisconnect} className="mx-5 mb-4 mt-6 hidden text-xs text-ink-3 underline-offset-2 hover:underline md:block">
            Use a different company key
          </button>
        )}
      </aside>
      <main className="mx-auto w-full max-w-6xl px-5 py-8 md:px-10">
        <Outlet />
      </main>
    </div>
  );
}

function SunMark() {
  // The sun's daily arc over a roof line: the product's subject in one glyph.
  return (
    <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden>
      <path d="M3 18 Q17 -4 31 18" fill="none" stroke="var(--flow-pv)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17" cy="7" r="3.2" fill="var(--flow-pv)" />
      <path d="M1 21 H33" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
