import { useId } from 'react';
import type { ReactNode } from 'react';
import './farm-landscape.css';

export type FarmMapArea = 'livestock' | 'production' | 'explore' | 'town';
export type FarmLandscapeProps = { onVisit?(area: FarmMapArea): void; className?: string };

function Tree({ x, y, size = 1, autumn = false }: { x: number; y: number; size?: number; autumn?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${size})`}>
    <ellipse cx="11" cy="8" rx="27" ry="11" fill="#385c3a" opacity=".16" />
    <path d="M-4 4V-38h9V2l-7 7Z" fill="#98714b" /><path d="m-1-14 11-10m-9 7-11-12" stroke="#805a39" strokeWidth="3" fill="none" />
    <path d="M-28-42c-12-18 0-39 18-40 9-22 41-19 49 4 21 2 29 28 13 43-10 19-32 20-47 10-13 7-31-1-33-17Z" fill={autumn ? '#c5b46c' : '#5b9955'} />
    <path d="M-24-49c-9-17 4-30 19-31 7-16 31-15 39 2 17 1 20 20 10 32-16 10-29 3-34-4-11 13-27 12-34 1Z" fill={autumn ? '#e1cf83' : '#8abf62'} />
    <path d="M-17-57c-2-11 6-19 18-19 6-10 22-7 25 4" stroke={autumn ? '#f2df9f' : '#aed77b'} strokeWidth="5" strokeLinecap="round" fill="none" opacity=".65" />
    <path d="M-15-29c7 5 20 4 27-1" stroke="#487e48" strokeWidth="2" fill="none" opacity=".35" />
  </g>;
}

function Fence({ points }: { points: [number, number][] }) {
  const line = points.map(point => point.join(',')).join(' ');
  return <g><polyline points={line} fill="none" stroke="#89724f" strokeWidth="7" strokeLinejoin="round" opacity=".22" transform="translate(4 3)" /><polyline points={line} fill="none" stroke="#cdb98c" strokeWidth="6" strokeLinejoin="round" /><polyline points={points.map(([x, y]) => `${x},${y - 12}`).join(' ')} fill="none" stroke="#f5e4b4" strokeWidth="5" strokeLinejoin="round" />{points.map(([x, y], index) => <g key={index}><path d={`M${x - 3} ${y + 6}v-29l3-4 4 2v30Z`} fill="#c1a377" /><path d={`M${x - 3} ${y - 23}l3-4 4 2-3 4Z`} fill="#ffedc0" /></g>)}</g>;
}

function Cottage({ x, y, scale = 1, roof = '#ce7350', barn = false }: { x: number; y: number; scale?: number; roof?: string; barn?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <ellipse cx="107" cy="148" rx="90" ry="21" fill="#4c7040" opacity=".2" />
    <path d="m25 137 87-43 80 40-88 47Z" fill="#c1cb89" /><path d="m25 137 79 44 88-47v7l-88 46-79-43Z" fill="#94ae68" />
    <path d="M40 79 88 103v50l-48-24Z" fill={barn ? '#d8875c' : '#fff1cc'} /><path d="m88 103 78-39v52l-78 37Z" fill={barn ? '#b96146' : '#e4cf98'} />
    <path d="m40 79 24-37 24 61Z" fill={barn ? '#e89966' : '#f6e6b7'} />
    <path d="m64 42 79-39 30 61-85 45Z" fill={roof} /><path d="m64 42 24 67-53-29Z" fill={barn ? '#5d7890' : '#ad573f'} />
    <path d="m35 80 53 29 85-45v7l-85 46-53-30Z" fill={barn ? '#536579' : '#aa573d'} />
    <path d="m69 43 74-36m-66 54 74-36m-67 53 76-39" stroke="#fff0cb" strokeWidth="2" opacity=".19" fill="none" />
    <path d="m55 105 22 11v31l-22-12Z" fill={barn ? '#9c5c41' : '#b5905e'} stroke={barn ? '#f6dda8' : '#927545'} strokeWidth="2" />
    {barn ? <><path d="m57 108 18 33m-18-14 18-10m-9-6v31" stroke="#f2dfb2" strokeWidth="2" /><path d="m103 107 23-11v26l-23 11Z" fill="#8c674b" stroke="#f3dfb0" strokeWidth="2" /><path d="m105 109 19 11m-19 9 19-30" stroke="#eddfb8" strokeWidth="2" /></> : <><path d="m56 107 19 10v11l-19-10Z" fill="#98bfc0" /><circle cx="71" cy="134" r="1.6" fill="#fff1ba" /><path d="m106 102 22-11v21l-22 11Z" fill="#8fc4cb" stroke="#fff3cf" strokeWidth="3" /><path d="m117 97v21m-11-7 22-11" stroke="#fff6d5" strokeWidth="2" /><path d="m142 84 11-5v20l-11 5Z" fill="#81b1bb" stroke="#fff0c7" strokeWidth="2" /></>}
    <path d="m87 155 22-11 21 10-23 13Z" fill="#ede0ac" /><path d="m87 160 20 11 23-12" fill="none" stroke="#bca677" strokeWidth="4" />
    {!barn && <><path d="M128 40V17l12-6 10 7v32" fill="#c6a778" /><path d="m125 17 15-8 14 9-15 8Z" fill="#ebd8aa" /><path d="m42 125 9 5 1 9-11-5Z" fill="#ae8959" /><g fill="#e9b76c"><circle cx="47" cy="122" r="4" /><circle cx="51" cy="126" r="3" /></g></>}
  </g>;
}

function Windmill({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <Cottage x={-27} y={13} scale={.95} roof="#83a39d" />
    <path d="m67 45 40-18 21 111-49 24-27-14Z" fill="#f3e1af" /><path d="m107 27 21 111-22 11-16-110Z" fill="#d0b982" />
    <path d="m62 47 26-35 26 12 8 26-41 20Z" fill="#a67750" /><path d="m62 47 19 23 41-20v7L81 78 62 55Z" fill="#87634b" />
    <path d="m91 114 16-8 3 35-18 9Z" fill="#7c8b66" /><path d="m88 88 15-7 2 14-15 7Z" fill="#98bec1" stroke="#fff1c9" strokeWidth="2" />
    <g transform="translate(88 58)"><path d="M0 0V-45m0 45h45M0 0v45m0-45h-45" stroke="#8f7952" strokeWidth="4" /><path d="M-4-14v-32l13-6 3 34ZM14-4h32l6 13-34 3ZM4 14v32l-13 6-3-34ZM-14 4h-32l-6-13 34-3Z" fill="#fff3c8" stroke="#cbb47e" strokeWidth="1.3" /><path d="M0-17v-29m17 46h29M0 17v29m-17-46h-29" stroke="#dec58a" strokeWidth="2" /><circle r="8" fill="#ad8a58" stroke="#f7df9e" strokeWidth="3" /></g>
    <path d="m144 137 30-16 14 7v27l-31 16-13-8Z" fill="#c0a36f" /><path d="m144 137 13 8 31-17-14-7Z" fill="#ead6a4" /><path d="m148 146 8 4m7-5 19-10m-33 20 8 4m7-5 17-9" stroke="#9c8156" strokeWidth="2" />
  </g>;
}

function Cow({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}><ellipse cx="5" cy="17" rx="24" ry="7" fill="#527347" opacity=".19" /><path d="m-17 6 1 13h5l2-13m23-1 2 14h5l-1-16" stroke="#9f9678" strokeWidth="4" /><path d="M-22-3c2-16 41-15 46 1v12c-11 12-40 8-46-2Z" fill="#fff3d8" stroke="#b5ad8d" strokeWidth="1" /><path d="M-12-12c16-4 20 5 13 13-8 5-20-2-13-13m18 19c8-5 16-2 15 6-7 6-18 5-15-6Z" fill="#6c7560" /><path d="M20-8c12-3 21 5 19 17-1 9-13 13-19 5-6-7-7-15 0-22Z" fill="#f3e9c9" stroke="#b3ae8c" /><path d="m22-8-7-7 2 10m16-4 8-5-2 9" fill="#b3b18b" /><ellipse cx="29" cy="12" rx="10" ry="6" fill="#ddb7a0" /><circle cx="27" cy="0" r="1.8" fill="#425940" /><path d="m-21-6-8 2-3 12" stroke="#b4b39a" strokeWidth="2" fill="none" /></g>;
}

function Sign({ x, y, label }: { x: number; y: number; label: string }) {
  return <g className="fl-sign" transform={`translate(${x} ${y})`}><path d="M-27 10v14m54-14v14" stroke="#9d8252" strokeWidth="4" /><rect x="-42" y="-12" width="84" height="29" rx="8" fill="#fff0bc" stroke="#b99c62" strokeWidth="2" /><path d="M-33-7h65" stroke="#fff9d8" strokeWidth="2" /><text x="0" y="7" textAnchor="middle" fill="#6c7648" fontSize="15" fontWeight="800">{label}</text></g>;
}

function MapPlace({ area, label, hit, onVisit, children }: { area: FarmMapArea; label: string; hit: string; onVisit?: FarmLandscapeProps['onVisit']; children: ReactNode }) {
  return <g className="fl-place" data-interactive={Boolean(onVisit)} data-area={area} role={onVisit ? 'button' : undefined} tabIndex={onVisit ? 0 : undefined} aria-label={onVisit ? label : undefined} onClick={() => onVisit?.(area)} onKeyDown={event => { if (onVisit && !event.repeat && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); onVisit(area); } }}>
    <path className="fl-hit" d={hit} fill="transparent" />{children}
  </g>;
}

/** A continuous original game world. The central clearing remains free for live plot controls. */
export function FarmLandscape({ onVisit, className = '' }: FarmLandscapeProps) {
  const paint = `fl-${useId().replace(/:/g, '')}`;
  return <div className={`farm-landscape ${className}`}><svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-label="农场地图，田地中央，建筑与水塘分布在四周">
    <defs>
      <linearGradient id={`${paint}-grass`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#b7d985" /><stop offset=".5" stopColor="#a7ce73" /><stop offset="1" stopColor="#8fbb66" /></linearGradient>
      <linearGradient id={`${paint}-water`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#a0dfdf" /><stop offset=".55" stopColor="#70bfcf" /><stop offset="1" stopColor="#4c9dbb" /></linearGradient>
      <linearGradient id={`${paint}-soil`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d7ba86" /><stop offset=".6" stopColor="#cba675" /><stop offset="1" stopColor="#ba9568" /></linearGradient>
      <pattern id={`${paint}-meadow`} width="84" height="64" patternUnits="userSpaceOnUse"><path d="m15 18-3-5m6 6 2-5m38 29-2-4m5 5 2-5" stroke="#7eae5e" strokeWidth="1.5" opacity=".32" /><ellipse cx="36" cy="53" rx="3" ry="1.1" fill="#dae6a4" opacity=".5" /></pattern>
    </defs>
    <g aria-hidden="true">
      <rect width="1200" height="700" fill={`url(#${paint}-grass)`} /><rect width="1200" height="700" fill={`url(#${paint}-meadow)`} />
      <path d="M0 140 153 21l184 98 130-89 183 104 149-95 221 87 180-95v151c-180 35-336-20-531-2S248 195 0 140Z" fill="#86b581" opacity=".72" />
      <path d="m99 51 54-30 90 48-69-13-28 12Zm285 19 83-40 112 64-90-32-35 21Zm315 0 100-31 147 53-117-22-42 15Z" fill="#add09b" />
      <path d="M-60 77C61 75 94 205 64 282S2 402 33 492s67 159-26 235" fill="none" stroke="#729b67" strokeWidth="100" /><path d="M-60 77C61 75 94 205 64 282S2 402 33 492s67 159-26 235" fill="none" stroke="#d4ddb1" strokeWidth="77" /><path d="M-60 77C61 75 94 205 64 282S2 402 33 492s67 159-26 235" fill="none" stroke={`url(#${paint}-water)`} strokeWidth="60" />
      <path d="M150 289C312 308 328 235 466 228s199-75 335-12 192 97 339 86M339 306c33 102 76 176 196 219s211 64 423 15" fill="none" stroke="#83a75e" strokeWidth="42" opacity=".35" /><path d="M150 289C312 308 328 235 466 228s199-75 335-12 192 97 339 86M339 306c33 102 76 176 196 219s211 64 423 15" fill="none" stroke="#e6d39e" strokeWidth="34" /><path d="M150 289C312 308 328 235 466 228s199-75 335-12 192 97 339 86M339 306c33 102 76 176 196 219s211 64 423 15" fill="none" stroke="#f2dfa7" strokeWidth="24" />
      <path d="M436 291 625 195q24-12 45 0l187 92q20 12 5 29L682 483q-24 22-49 9L434 391q-22-13-20-33Z" fill="#7b9e59" opacity=".35" transform="translate(0 10)" /><path d="M436 285 625 189q24-12 45 0l187 92q20 12 5 29L682 477q-24 22-49 9L434 385q-22-13-20-33Z" fill={`url(#${paint}-soil)`} stroke="#e1c696" strokeWidth="5" />
      <path d="m446 304 42-21m-55 54 32 17m235 102 39-31m63-125 30-17" stroke="#b99868" strokeWidth="3" opacity=".35" fill="none" /><g fill="#e7cf9e" opacity=".65"><ellipse cx="468" cy="369" rx="5" ry="2" /><ellipse cx="644" cy="205" rx="6" ry="2" /><ellipse cx="816" cy="322" rx="5" ry="2" /><ellipse cx="680" cy="457" rx="6" ry="2" /></g>
      <path d="m218 280 26-12 49 23-27 15Z" fill="#c6b88b" /><path d="m225 280 28-8m-10 18 29-12m-11 20 23-10" stroke="#f0e4ba" strokeWidth="6" />
      <Cottage x={136} y={147} scale={1.05} />
      <Tree x={119} y={248} size={.83} /><Tree x={339} y={201} size={.85} /><Tree x={383} y={262} size={.7} /><Tree x={412} y={166} size={.68} /><Tree x={496} y={140} size={.7} /><Tree x={602} y={113} size={.84} /><Tree x={724} y={145} size={.78} /><Tree x={834} y={136} size={.86} /><Tree x={982} y={114} size={.8} />
      <Fence points={[[119,293],[151,308],[187,325],[223,343]]} />
      <path d="m128 339 3-11m12 16 2-12m226-55 3-12m9 18 3-14" stroke="#7eaa57" strokeWidth="3" /><g fill="#fff0ae"><circle cx="131" cy="326" r="4" /><circle cx="145" cy="332" r="3" /><circle cx="375" cy="263" r="4" /><circle cx="386" cy="269" r="3" /></g>
    </g>
    <MapPlace area="production" label="前往工坊，制作农场产品" hit="M825 152 1018 119 1065 292 889 342 811 256Z" onVisit={onVisit}>
      <Windmill x={845} y={148} /><Sign x={949} y={318} label="工坊" />
    </MapPlace>
    <g aria-hidden="true"><Tree x={1082} y={209} size={.82} /><Tree x={840} y={341} size={.67} /><path d="m998 334 36-19 30 13-36 19Z" fill="#ded2a4" /><path d="m1007 334 28-14m-18 22 28-14" stroke="#f1e5b5" strokeWidth="4" /></g>
    <MapPlace area="livestock" label="前往牧场，照料农场动物" hit="M142 341 364 324 466 429 383 523 142 548 91 462Z" onVisit={onVisit}>
      <path d="m239 396 145-58 72 49-142 71Z" fill="#a4c56f" stroke="#91b561" strokeWidth="4" /><Fence points={[[244,397],[282,381],[320,365],[359,349],[388,344],[415,362],[443,380],[455,391]]} />
      <Cow x={322} y={393} /><Cow x={386} y={386} flip />
      <path d="m292 424 37-18 29 15-37 19Z" fill="#d6c992" /><path d="m299 422 22 10 28-14" fill="none" stroke="#d7b76d" strokeWidth="5" />
      <Fence points={[[243,409],[274,428],[306,448],[343,430],[379,412],[419,395],[455,391]]} />
      <Cottage x={128} y={351} scale={1.03} roof="#729399" barn />
      <g transform="translate(350 475)"><ellipse rx="19" ry="7" cy="14" fill="#739d57" opacity=".2" /><path d="M-12 3c0-13 20-16 27-4 5 14-24 18-27 4Z" fill="#fff2d6" /><circle cx="16" cy="-8" r="7" fill="#fff4db" /><path d="m22-8 8 3-8 2" fill="#dfa84c" /><path d="m12-15 1-5 4 3 3-2 2 6" fill="#d87953" /><circle cx="17" cy="-9" r="1.3" fill="#4c6240" /><path d="m-5 12-2 6m12-7 2 6" stroke="#bd9a51" strokeWidth="2" /></g>
      <Sign x={335} y={535} label="牧场" />
    </MapPlace>
    <MapPlace area="town" label="进入农场小镇，查看真实农业服务" hit="M1029 232 1175 205 1200 339 1080 384 1004 333Z" onVisit={onVisit}>
      <path d="m1040 307 107-39 53 52-102 43Z" fill="#c9cf91" /><Cottage x={1036} y={229} scale={.57} roof="#d0945d" /><Cottage x={1108} y={216} scale={.53} roof="#90aaa2" /><Cottage x={1080} y={280} scale={.5} roof="#b78384" /><Sign x={1113} y={355} label="小镇" />
    </MapPlace>
    <MapPlace area="explore" label="前往水塘，探索钓鱼与果园" hit="M911 376 1128 374 1200 477 1125 563 940 581 886 498Z" onVisit={onVisit}>
      <path d="M927 418c33-41 95-29 151-19 73-8 122 40 89 87-19 38-91 58-163 49-89 11-127-40-97-76 1-17 5-28 20-41Z" fill="#6b9f68" opacity=".3" transform="translate(5 11)" /><path d="M927 414c33-41 95-29 151-19 73-8 122 40 89 87-19 38-91 58-163 49-89 11-127-40-97-76 1-17 5-28 20-41Z" fill="#d7d6a2" stroke="#94b275" strokeWidth="5" /><path d="M943 423c39-32 85-20 134-14 64-8 101 31 77 62-26 35-85 48-143 41-66 7-99-28-82-58 3-16 5-22 14-31Z" fill={`url(#${paint}-water)`} />
      <path d="M949 429c33-25 73-17 109-14m-70 71c25 11 65 13 92 4m-40-47 47 4m-34 29 40-3" stroke="#d9f3e8" strokeWidth="3" strokeLinecap="round" opacity=".7" fill="none" />
      <path d="m918 456 64-30 22 13-66 32Z" fill="#c9a371" stroke="#937b52" strokeWidth="2" /><path d="m925 455 23 13m-13-19 23 13m-13-18 23 13m-13-19 23 14m-12-18 23 14" stroke="#f0d6a3" strokeWidth="3" /><path d="M925 463v13m50-41v15" stroke="#987b50" strokeWidth="4" />
      <path d="m939 437 6-29 6-3m-6 4 34 21-1 16" stroke="#756e48" strokeWidth="2" fill="none" /><path d="m976 446 3 7 3-6" fill="#e8bc67" />
      <path d="m1109 432 28-13 27 16-27 14Z" fill="#dfb976" stroke="#9b8758" strokeWidth="2" /><path d="m1116 431 20 11 20-8" stroke="#ba965b" strokeWidth="2" fill="none" />
      <path d="M918 509v-21m7 18 5-22m201-93-3-25m12 31 5-23m-12 128 4-18m6 12 4-21" stroke="#729d65" strokeWidth="3" fill="none" /><path d="M918 490v-9m12 4v-8m198-111-1-8m18 16 1-9m-9 119 2-8" stroke="#aa9a53" strokeWidth="5" strokeLinecap="round" />
      <Sign x={967} y={548} label="探索" />
    </MapPlace>
    <g aria-hidden="true"><Tree x={1180} y={384} size={.74} /><Tree x={880} y={429} size={.56} /><Tree x={860} y={540} size={.8} /><Tree x={1162} y={594} size={.93} /><Tree x={86} y={425} size={.95} /><Tree x={127} y={568} size={.74} /><Tree x={409} y={573} size={.8} autumn /><Tree x={308} y={634} size={.87} /><Tree x={699} y={636} size={.85} /><Tree x={952} y={664} size={.74} />
      <path d="m454 557 77 34m-57-41 2 28m35-13 1 26m44 2 7-15" stroke="#d8c79a" strokeWidth="5" fill="none" /><g fill="#fff0b1"><circle cx="735" cy="547" r="4" /><circle cx="749" cy="554" r="3" /><circle cx="778" cy="566" r="4" /><circle cx="787" cy="554" r="3" /></g><g fill="#d6a37c"><circle cx="735" cy="547" r="1.6" /><circle cx="778" cy="566" r="1.6" /></g>
    </g>
  </svg></div>;
}

export default FarmLandscape;
