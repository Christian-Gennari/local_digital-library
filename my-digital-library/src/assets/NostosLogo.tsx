export function NostosLogo() {
  return (
    <div className="flex items-center px-2 py-2 bg-white">
      {/* Icon */}
      <div className="flex items-center justify-center h-10 w-10 rounded-md bg-slate-800">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 32 32"
          width="32"
          height="32"
        >
          <rect width="32" height="32" rx="8" fill="#1d283c" />
          <path d="M8 8 L8 24 L16 22 L24 24 L24 8 L16 10 Z" fill="#ffffff" />
          <path d="M16 10 L16 22" stroke="#1d283c" stroke-width="1.5" />
        </svg>
      </div>

      {/* Text */}
      <div className="ml-3 leading-tight">
        <div className="text-lg font-serif text-slate-800 tracking-tight">
          Nostos
        </div>
        <div className="text-xs italic font-sans text-slate-500">
          Your Intellectual Homecoming
        </div>
      </div>
    </div>
  );
}
