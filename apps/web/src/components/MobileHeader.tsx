"use client";

export function MobileHeader() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-black/5 bg-[var(--recess-cream)]/95 px-4 py-3 backdrop-blur-md md:hidden">
      <button
        type="button"
        aria-label="Scroll to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="flex h-11 w-full items-center justify-center"
      >
        <span className="brand text-4xl font-bold tracking-tight text-black">
          RECESS
        </span>
      </button>
    </header>
  );
}
