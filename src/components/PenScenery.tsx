import { useId } from 'react';
import './pen-scenery.css';

/** Decorative paddock materials stay behind the existing pen button content. */
export default function PenScenery({ occupied }: { occupied: boolean }) {
  const id = `pen-${useId().replace(/:/g, '')}`;
  return <svg className="pen-scenery" viewBox="0 0 240 180" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs><radialGradient id={`${id}-grass`} cx=".35" cy=".3" r=".8"><stop stopColor={occupied ? '#d9e5aa' : '#e7e2bc'} /><stop offset="1" stopColor={occupied ? '#abc47d' : '#c6ca9b'} /></radialGradient></defs>
    <ellipse cx="120" cy="112" rx="94" ry="42" fill="#7a8c5540" /><path d="m26 83 94-38 94 38v42l-94 36-94-36Z" fill={`url(#${id}-grass)`} /><path d="m26 125 94 36 94-36v5l-94 36-94-36Z" fill="#9bad72" opacity=".7" />
    <g fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="m29 80 91-37 91 37m-182 9 91-37 91 37" stroke="#bca06d" strokeWidth="4" /><path d="m29 77 91-37 91 37" stroke="#f7e5b1" strokeWidth="3" />
      <path d="M29 90V67m29 11V55m31 11V43m31 11V31m31 35V43m31 35V55m29 35V67" stroke="#bd9f6b" strokeWidth="5" /><path d="m28 69 2-3m27-9 2-3m29-9 2-3m29-9 2-3m29 15 2-3m29 15 2-3m27 15 2-3" stroke="#f8e7b9" strokeWidth="3" />
      <path d="m26 122 37 15m114 0 37-15" stroke="#b99b68" strokeWidth="4" /><path d="m26 116 37 15m114 0 37-15" stroke="#f1deb1" strokeWidth="3" /><path d="M26 128v-22m19 30v-22m18 30v-22m114 22v-22m19 14v-22m18 14v-22" stroke="#bca06e" strokeWidth="4" />
      <path d="m49 97 2-5m1 6 4-3m121 11 2-5m1 6 4-3m-93 22 2-5m44-41 2-4" stroke="#8aa566" strokeWidth="1.5" opacity=".65" />
    </g>
  </svg>;
}
