export default function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#124e66" stroke="#1d6a88" />
      <path d="M8 11h10a4 4 0 0 1 0 8h-4l6 6" fill="none" stroke="#d3d9d4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="11" r="2" fill="#d3d9d4" />
    </svg>
  );
}
