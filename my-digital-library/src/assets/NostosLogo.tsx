export function NostosLogo() {
  return (
    <div className="flex items-center px-6 py-4 bg-white">
      {/* Icon */}
      <div className="flex items-center justify-center h-10 w-10 rounded-md bg-slate-800">
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
        >
          <path d="M32 4L6 20v36h52V20L32 4z" fill="#1E293B" />
          <path
            d="M22 46c2.667-2 6.667-2 10 0s7.333 2 10 0"
            stroke="#F8FAFC"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <text
            x="32"
            y="36"
            textAnchor="middle"
            fill="#F8FAFC"
            fontSize="18"
            fontFamily="'Georgia', 'Lora', serif"
            fontWeight="bold"
          >
            N
          </text>
        </svg>
      </div>

      {/* Text */}
      <div className="ml-3 leading-tight">
        <div className="text-lg font-serif text-slate-800 tracking-tight">
          Nostos
        </div>
        <div className="text-xs font-sans text-slate-500">
          Your Intellectual Homecoming
        </div>
      </div>
    </div>
  );
}
