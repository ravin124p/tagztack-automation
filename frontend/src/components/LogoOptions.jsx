import React from 'react';

export const LOGO_VARIANTS = [
  { id: 'original', name: 'Original (indexed rows)', render: OriginalMark },
  { id: 'stacked-cards', name: 'Stacked cards', render: StackedCardsMark },
  { id: 'tz-mono', name: 'TZ monogram', render: TzMonoMark },
  { id: 'price-tag', name: 'Price tag + check', render: PriceTagMark },
  { id: 'bolt-z', name: 'Bolt Z', render: BoltZMark },
  { id: 'dot-grid', name: 'Dot grid', render: DotGridMark },
  { id: 'angle-z', name: 'Angle brackets Z', render: AngleZMark },
];

export function getLogoById(id) {
  return LOGO_VARIANTS.find((v) => v.id === id) || LOGO_VARIANTS[0];
}

const SIZE = 64;

function frame({ size, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="TagZtack"
    >
      {children}
    </svg>
  );
}

function OriginalMark({ size = 26, accent = '#f5c518', fg = '#fff' }) {
  return frame({
    size,
    children: (
      <>
        <line x1="22" y1="12" x2="22" y2="52" stroke={accent} strokeWidth="1" />
        <rect x="28" y="16" width="22" height="2.5" fill={fg} />
        <rect x="28" y="22" width="16" height="2.5" fill={fg} opacity="0.7" />
        <rect x="28" y="28" width="20" height="2.5" fill={fg} />
        <rect x="28" y="34" width="14" height="2.5" fill={fg} opacity="0.7" />
        <rect x="28" y="40" width="22" height="2.5" fill={fg} />
        <rect x="28" y="46" width="18" height="2.5" fill={fg} opacity="0.7" />
        <circle cx="14" cy="17" r="1.5" fill={accent} />
        <circle cx="14" cy="29" r="1.5" fill={accent} />
        <circle cx="14" cy="41" r="1.5" fill={accent} />
      </>
    ),
  });
}

function StackedCardsMark({ size = 26, accent = '#f5c518', fg = '#fff' }) {
  return frame({
    size,
    children: (
      <>
        <rect x="10" y="14" width="40" height="22" rx="4" fill={accent} opacity="0.35" transform="rotate(-7 30 25)" />
        <rect x="12" y="22" width="40" height="22" rx="4" fill={accent} opacity="0.65" transform="rotate(-1 32 33)" />
        <rect x="14" y="30" width="40" height="22" rx="4" fill={accent} transform="rotate(5 34 41)" />
        <circle cx="46" cy="38" r="3" fill={fg} />
      </>
    ),
  });
}

function TzMonoMark({ size = 26, accent = '#f5c518', fg = '#fff' }) {
  return frame({
    size,
    children: (
      <>
        <rect x="6" y="14" width="22" height="5" fill={fg} />
        <rect x="14" y="14" width="6" height="36" fill={fg} />
        <path
          d="M 32 14 L 56 14 L 56 19 L 40 45 L 56 45 L 56 50 L 32 50 L 32 45 L 48 19 L 32 19 Z"
          fill={accent}
        />
      </>
    ),
  });
}

function PriceTagMark({ size = 26, accent = '#f5c518', fg = '#fff' }) {
  return frame({
    size,
    children: (
      <>
        <path
          d="M 10 22 L 32 8 L 56 22 L 56 50 L 32 56 L 10 50 Z"
          fill="none"
          stroke={accent}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="20" r="3" fill={accent} />
        <path
          d="M 22 36 L 30 44 L 44 28"
          fill="none"
          stroke={fg}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  });
}

function BoltZMark({ size = 26, accent = '#f5c518', fg = '#fff' }) {
  return frame({
    size,
    children: (
      <>
        <polygon
          points="42,8 18,32 32,32 22,56 50,28 36,28 46,8"
          fill={accent}
        />
        <circle cx="14" cy="14" r="2" fill={fg} opacity="0.7" />
        <circle cx="52" cy="50" r="2" fill={fg} opacity="0.7" />
      </>
    ),
  });
}

function DotGridMark({ size = 26, accent = '#f5c518', fg = '#fff' }) {
  const dots = [];
  const positions = [16, 32, 48];
  for (const y of positions) {
    for (const x of positions) {
      const isHighlight = (x === 32 && y === 32);
      const isAccent = (x === 16 && y === 48) || (x === 48 && y === 16);
      dots.push(
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={isHighlight ? 5 : 3}
          fill={isHighlight || isAccent ? accent : fg}
          opacity={isHighlight ? 1 : isAccent ? 1 : 0.5}
        />
      );
    }
  }
  return frame({ size, children: <>{dots}</> });
}

function AngleZMark({ size = 26, accent = '#f5c518', fg = '#fff' }) {
  return frame({
    size,
    children: (
      <>
        <path
          d="M 18 16 L 8 32 L 18 48"
          fill="none"
          stroke={accent}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M 46 16 L 56 32 L 46 48"
          fill="none"
          stroke={accent}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M 24 18 L 40 18 L 24 46 L 40 46"
          fill="none"
          stroke={fg}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  });
}
