import React from 'react';

/**
 * TagZtack brand mark — "indexed inventory" style.
 * Renders as an inline SVG so it stays crisp at any size and inherits color.
 *
 * Usage:
 *   <TagZtackMark size={26} />
 *   <TagZtackMark size={64} background="#1E3A5F" rx={8} />
 */
export default function TagZtackMark({
  size = 26,
  background = 'transparent',
  rx = 0,
  accent = '#5B8CB8',
  fg = '#ffffff',
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="TagZtack"
    >
      {background !== 'transparent' && (
        <rect x="0" y="0" width="64" height="64" rx={rx} fill={background} />
      )}
      {/* vertical column rule */}
      <line x1="22" y1="12" x2="22" y2="52" stroke={accent} strokeWidth="1" />
      {/* indexed rows */}
      <rect x="28" y="16" width="22" height="2.5" fill={fg} />
      <rect x="28" y="22" width="16" height="2.5" fill={fg} opacity="0.7" />
      <rect x="28" y="28" width="20" height="2.5" fill={fg} />
      <rect x="28" y="34" width="14" height="2.5" fill={fg} opacity="0.7" />
      <rect x="28" y="40" width="22" height="2.5" fill={fg} />
      <rect x="28" y="46" width="18" height="2.5" fill={fg} opacity="0.7" />
      {/* margin bullets */}
      <circle cx="14" cy="17" r="1.5" fill={accent} />
      <circle cx="14" cy="29" r="1.5" fill={accent} />
      <circle cx="14" cy="41" r="1.5" fill={accent} />
    </svg>
  );
}
