export function Logo({ className = 'w-8 h-8', showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className={`relative flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-sm">
          {/* Shield Base */}
          <path
            d="M18 3L4 8V17C4 25.5 10 31.5 18 34C26 31.5 32 25.5 32 17V8L18 3Z"
            className="fill-[#0B1B3A] dark:fill-indigo-950 stroke-[#10B981] stroke-[2]"
          />
          {/* Inner Interlocking Trust Link */}
          <path
            d="M13 18C13 15.2386 15.2386 13 18 13C20.7614 13 23 15.2386 23 18C23 20.7614 20.7614 23 18 23"
            className="stroke-[#10B981] stroke-[2.5] stroke-linecap-round"
          />
          <circle cx="18" cy="18" r="2.5" className="fill-[#10B981]" />
        </svg>
      </div>
      {showText && (
        <span className="font-heading font-black text-xl tracking-tight text-slate-900 dark:text-white">
          Trust<span className="text-emerald-500">Link</span>
        </span>
      )}
    </div>
  );
}
