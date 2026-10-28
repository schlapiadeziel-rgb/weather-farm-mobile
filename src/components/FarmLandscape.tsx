import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { getFarmLayoutItem, initialFarmLayout } from '../lib/farmLayout';
import type { FarmLayout, FarmLayoutItemId, FarmLayoutPlacement } from '../lib/farmLayoutTypes';
import './farm-landscape.css';
import ScenicTerrain from './ScenicTerrain';

export type FarmMapArea = 'livestock' | 'production' | 'explore' | 'town';
export type FarmLandscapeProps = {
  onVisit?(area: FarmMapArea): void;
  className?: string;
  layout?: FarmLayout;
  fit?: 'cover' | 'contain';
  children?: ReactNode;
  selectedItem?: FarmLayoutItemId;
  editing?: boolean;
};

/** Ground anchors are saved independently of the original illustration's origin. */
function LayoutItem({ item, selected, children }: { item: FarmLayoutPlacement; selected?: FarmLayoutItemId; children: ReactNode }) {
  if (!item.placed) return null;
  const definition = getFarmLayoutItem(item.id);
  return <g className="fl-layout-item" data-layout-item={item.id} data-layout-selected={selected === item.id ? 'true' : undefined} transform={`translate(${item.x - definition.defaultX} ${item.y - definition.defaultY})`}>
    <rect className="fl-layout-footprint" x={definition.defaultX} y={definition.defaultY} width={definition.width} height={definition.height} rx="8" fill="transparent" />
    {children}
  </g>;
}

function Flowerbed({ alternate = false }: { alternate?: boolean }) {
  const flowers = alternate ? ['#f4d987', '#fff3d1', '#e8ad84'] : ['#d5b9e7', '#efd6ee', '#ac9acb'];
  return <g className="fl-flowerbed" aria-hidden="true">
    <ellipse cx="52" cy="42" rx="46" ry="12" fill="#385c3a" opacity=".16" />
    <path d="m2 24 49-24 47 23-49 26Z" fill="#e8d5ab" stroke="#b5a074" strokeWidth="1.8" />
    <path d="m2 24 47 25v8L2 33Z" fill="#c8ac7d" /><path d="m49 49 49-26v9L49 57Z" fill="#aa8e63" />
    <path d="m12 24 39-18 36 17-38 19Z" fill="#896a47" /><path d="m16 24 35-15 30 14-32 15Z" fill="#66834a" />
    {[{ x: 27, y: 24, color: flowers[0] }, { x: 49, y: 15, color: flowers[1] }, { x: 69, y: 24, color: flowers[2] }, { x: 48, y: 32, color: flowers[0] }].map(({ x, y, color }) => <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
      <path d="M0 4V-14m0 10-9-6m9 1 9-8" stroke="#477946" strokeWidth="2.4" fill="none" strokeLinecap="round" /><path d="M-1-5c-8 2-12-2-12-7 7-2 12 2 12 7Zm3-5c7 0 10-4 10-9-7 0-11 4-10 9Z" fill="#77a859" />
      <g transform="translate(0 -18)" fill={color}><circle cx="-4" cy="-3" r="4.2" /><circle cx="3" cy="-4" r="4.2" /><circle cx="5" cy="3" r="4.2" /><circle cx="-2" cy="5" r="4.2" /><circle cx="-6" cy="2" r="4.2" /></g><circle cy="-18" r="2.6" fill="#f7d787" /><path d="m-3-23 2-1" stroke="#fff7df" strokeWidth="1.6" strokeLinecap="round" />
    </g>)}
    <path d="m8 29 34 18m15-3 33-17" stroke="#f9e7bf" strokeWidth="2" opacity=".7" fill="none" />
  </g>;
}

function Hedge({ alternate = false }: { alternate?: boolean }) {
  return <g className="fl-hedge" aria-hidden="true">
    <ellipse cx="52" cy="38" rx="47" ry="12" fill="#385c3a" opacity=".18" />
    <path d="m6 29 47-23 43 24-48 23Z" fill="#8f9f64" /><path d="m6 29 42 24 48-23v5L48 59 6 35Z" fill="#759159" />
    {[{ x: 20, y: 21 }, { x: 46, y: 9 }, { x: 73, y: 22 }].map(({ x, y }) => <g key={x} transform={`translate(${x} ${y})`}>
      <path d="M-15 10c-9-6-9-20-2-24 0-12 18-19 27-10 12-2 21 11 17 21 5 10-4 19-14 18-8 8-24 5-28-5Z" fill={alternate ? '#658f61' : '#5d9250'} />
      <path d="M-13-4c-3-9 4-17 13-16 6-7 16-2 17 6 7 4 7 11 4 15-8 4-15 2-19-3-5 5-11 5-15-2Z" fill={alternate ? '#99b879' : '#95ba67'} />
      <path d="m-7-12 4-3m11 2 4 3m-16 8 3 2" stroke="#c5d99b" strokeWidth="2.5" strokeLinecap="round" opacity=".65" />
      {alternate && <g fill="#f7e5b7"><circle cx="-8" cy="-4" r="2.1" /><circle cx="9" cy="-10" r="2.1" /><circle cx="10" cy="5" r="1.8" /></g>}
    </g>)}
  </g>;
}

function DecorativeFence({ alternate = false }: { alternate?: boolean }) {
  return <g className="fl-decorative-fence" aria-hidden="true">
    <ellipse cx="52" cy="34" rx="46" ry="11" fill="#385c3a" opacity=".14" />
    <Fence points={[[7, 20], [29, 31], [51, 42], [73, 31], [95, 20]]} />
    <path d="m14 33 2-8m69 9 2-8" stroke="#739d51" strokeWidth="2.5" fill="none" />
    <g fill={alternate ? '#d9b4cd' : '#f5df9d'}><circle cx="16" cy="24" r="3.5" /><circle cx="87" cy="25" r="3" /></g>
    {alternate && <path d="m28 20 23 12 22-12" stroke="#8eaf6e" strokeWidth="3" strokeLinecap="round" fill="none" />}
  </g>;
}

function Decoration({ item }: { item: FarmLayoutPlacement }) {
  const kind = getFarmLayoutItem(item.id).kind;
  const alternate = item.id.endsWith('-2');
  return <g transform={`translate(${getFarmLayoutItem(item.id).defaultX} ${getFarmLayoutItem(item.id).defaultY})`}>
    {kind === 'flowerbed' ? <Flowerbed alternate={alternate} /> : kind === 'hedge' ? <Hedge alternate={alternate} /> : <DecorativeFence alternate={alternate} />}
  </g>;
}

function Tree({ x, y, paint, size = 1, autumn = false }: { x: number; y: number; paint: string; size?: number; autumn?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <g className="fl-tree" transform={`translate(${x} ${y}) scale(${size})`}>
    <ellipse cx="11" cy="8" rx="27" ry="11" fill="#355e35" opacity=".2" /><ellipse cx="5" cy="5" rx="11" ry="4" fill="#385b2d" opacity=".22" />
    {!imageFailed ? <image className="fl-painted-tree" href="/art/meadow-tree.webp" x="-51" y="-106" width="108" height="118" preserveAspectRatio="xMidYMax meet" filter={autumn ? `url(#${paint}-autumn-tone)` : undefined} onError={() => setImageFailed(true)} /> : <g className="fl-tree-fallback">
    <path d="M-4 4V-38h9V2l-7 7Z" fill={`url(#${paint}-bark)`} /><path d="m-1-14 11-10m-9 7-11-12" stroke="#7f603a" strokeWidth="3" fill="none" /><path d="M-1-4v-25m4 22v-9" stroke="#c4a264" strokeWidth="1.2" fill="none" />
    <path d="M-28-42c-12-18 0-39 18-40 9-22 41-19 49 4 21 2 29 28 13 43-10 19-32 20-47 10-13 7-31-1-33-17Z" fill={`url(#${paint}-${autumn ? 'autumn' : 'crown'})`} />
    <path d="M-24-49c-9-17 4-30 19-31 7-16 31-15 39 2 17 1 20 20 10 32-16 10-29 3-34-4-11 13-27 12-34 1Z" fill={autumn ? '#e8d28b' : '#a1cd65'} opacity=".43" />
    <path d="M-17-57c-2-11 6-19 18-19 6-10 22-7 25 4" stroke={autumn ? '#f5e6ac' : '#c4e688'} strokeWidth="4" strokeLinecap="round" fill="none" opacity=".8" />
    <g className="fl-leaf-light" fill={autumn ? '#fff1bc' : '#d5eaa2'} opacity=".42"><ellipse cx="-13" cy="-65" rx="4" ry="2.1" transform="rotate(-22 -13 -65)" /><ellipse cx="7" cy="-78" rx="3.6" ry="1.6" /><ellipse cx="27" cy="-60" rx="3" ry="1.8" transform="rotate(28 27 -60)" /></g>
    <path d="M-17-38c5 5 14 6 20 2m7-5c10 8 22 5 27-2m-39 11c8 6 20 3 27-2" stroke={autumn ? '#a7914f' : '#4d823b'} strokeWidth="2" strokeLinecap="round" fill="none" opacity=".45" />
    </g>}

  </g>;
}

function Fence({ points }: { points: [number, number][] }) {
  const line = points.map(point => point.join(',')).join(' ');
  return <g><polyline points={line} fill="none" stroke="#89724f" strokeWidth="7" strokeLinejoin="round" opacity=".22" transform="translate(4 3)" /><polyline points={line} fill="none" stroke="#cdb98c" strokeWidth="6" strokeLinejoin="round" /><polyline points={points.map(([x, y]) => `${x},${y - 12}`).join(' ')} fill="none" stroke="#f5e4b4" strokeWidth="5" strokeLinejoin="round" />{points.map(([x, y], index) => <g key={index}><path d={`M${x - 3} ${y + 6}v-29l3-4 4 2v30Z`} fill="#c1a377" /><path d={`M${x - 3} ${y - 23}l3-4 4 2-3 4Z`} fill="#ffedc0" /></g>)}</g>;
}

function roofTone(color: string, shift: number): string {
  return `#${[1, 3, 5].map(index => Math.max(0, Math.min(255, Number.parseInt(color.slice(index, index + 2), 16) + shift)).toString(16).padStart(2, '0')).join('')}`;
}

function Cottage({ x, y, scale = 1, roof = '#ce7350', barn = false }: { x: number; y: number; scale?: number; roof?: string; barn?: boolean }) {
  const paint = `fl-house-${useId().replace(/:/g, '')}`;
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <defs>
      <linearGradient id={`${paint}-roof`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor={roofTone(roof, 12)} /><stop offset=".55" stopColor={roof} /><stop offset="1" stopColor={roofTone(roof, -28)} /></linearGradient>
      <linearGradient id={`${paint}-wall`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={barn ? '#d78656' : '#ffeac4'} /><stop offset="1" stopColor={barn ? '#aa5038' : '#d5b882'} /></linearGradient>
      <linearGradient id={`${paint}-glass`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d5eeea" /><stop offset=".45" stopColor="#8fbfc4" /><stop offset="1" stopColor="#51858c" /></linearGradient>
      <clipPath id={`${paint}-tiles`}><path d="m64 42 79-39 30 61-85 45Z" /></clipPath>
      <clipPath id={`${paint}-boards`}><path d="m88 103 78-39v52l-78 37Z" /></clipPath>
    </defs>
    <ellipse cx="107" cy="148" rx="90" ry="21" fill="#3e6333" opacity=".24" /><ellipse cx="110" cy="149" rx="57" ry="12" fill="#3e5a2e" opacity=".13" />
    <path d="m25 137 87-43 80 40-88 47Z" fill="#bfd18b" /><path d="m25 137 79 44 88-47v7l-88 46-79-43Z" fill="#88a75c" />
    <path d="M40 79 88 103v50l-48-24Z" fill={barn ? '#d98b60' : '#fff1ce'} /><path d="m88 103 78-39v52l-78 37Z" fill={`url(#${paint}-wall)`} />
    <g clipPath={`url(#${paint}-boards)`} fill="none" stroke={barn ? '#804d36' : '#be9e67'} strokeWidth=".8" opacity={barn ? '.46' : '.17'}><path d="m90 115 79-40m-79 50 79-40m-79 50 79-40m-79 50 79-40m-79 50 79-40" />{barn && <path d="M98 95v64m11-68v64m11-70v64m11-70v64m11-70v64m11-70v64" />}</g>
    <path d="m40 79 24-37 24 61Z" fill={barn ? '#e89966' : '#f6e6b7'} />
    <path d="m64 42 79-39 30 61-85 45Z" fill={`url(#${paint}-roof)`} /><path d="m64 42 24 67-53-29Z" fill={roofTone(roof, -31)} />
    <g clipPath={`url(#${paint}-tiles)`} fill="none" strokeLinecap="round"><path d="m63 52 89-44m-85 55 91-45m-87 56 93-46m-89 57 94-47m-90 58 94-47m-90 58 94-47" stroke={roofTone(roof, -58)} strokeWidth="1.4" opacity=".32" /><path d="m62 50 89-44m-85 55 91-45m-87 56 93-46m-89 57 94-47m-90 58 94-47m-90 58 94-47" stroke="#ffedc6" strokeWidth=".9" opacity=".3" /><path d="M80 43l4 9M105 31l4 9M130 19l4 9M85 57l4 9M110 44l4 9M135 32l4 9M158 20l4 9M89 72l4 9M114 59l4 9M139 47l4 9M163 35l4 9M95 88l4 9M120 75l4 9M145 63l4 9M169 51l4 9" stroke={roofTone(roof, -43)} strokeWidth="1" opacity=".32" /></g>
    <path d="m35 80 53 29 85-45v7l-85 46-53-30Z" fill={roofTone(roof, -38)} />
    <path d="m66 42 77-38m-78 39 23 64m1 0 83-43" stroke="#f9dfaa" strokeWidth="1.6" opacity=".55" fill="none" /><path d="m41 88 46 25 79-41v7l-79 40-46-24Z" fill="#785c36" opacity=".15" />
    <path d="m55 105 22 11v31l-22-12Z" fill={barn ? '#9c5c41' : '#b5905e'} stroke={barn ? '#f6dda8' : '#927545'} strokeWidth="2" />
    {barn ? <><path d="m57 108 18 33m-18-14 18-10m-9-6v31" stroke="#f2dfb2" strokeWidth="2" /><path d="m103 107 23-11v26l-23 11Z" fill="#8c674b" stroke="#f3dfb0" strokeWidth="2" /><path d="m105 109 19 11m-19 9 19-30" stroke="#eddfb8" strokeWidth="2" /></> : <><path d="m56 107 19 10v11l-19-10Z" fill={`url(#${paint}-glass)`} /><circle cx="71" cy="134" r="1.6" fill="#fff1ba" /><path d="m106 102 22-11v21l-22 11Z" fill={`url(#${paint}-glass)`} stroke="#fff3cf" strokeWidth="3" /><path d="m108 104 9-4v8l-9 4Z" fill="#eaf8ef" opacity=".55" /><path d="m117 97v21m-11-7 22-11" stroke="#fff6d5" strokeWidth="2" /><path d="m142 84 11-5v20l-11 5Z" fill={`url(#${paint}-glass)`} stroke="#fff0c7" strokeWidth="2" /><path d="m104 126 26-13m11-8 14-7" stroke="#94764b" strokeWidth="2.3" /><path d="m105 124 24-12m12-9 13-6" stroke="#fff1c8" strokeWidth="1.2" /></>}
    <path d="m87 155 22-11 21 10-23 13Z" fill="#ede0ac" /><path d="m87 160 20 11 23-12" fill="none" stroke="#bca677" strokeWidth="4" />
    {!barn && <><path d="M128 40V17l12-6 10 7v32" fill="#c6a778" /><path d="m125 17 15-8 14 9-15 8Z" fill="#ebd8aa" /><path d="m42 125 9 5 1 9-11-5Z" fill="#ae8959" /><g fill="#e9b76c"><circle cx="47" cy="122" r="4" /><circle cx="51" cy="126" r="3" /></g></>}
  </g>;
}

/** Painted materials keep the existing origins, footprints and landmark hit areas. */
function PaintedLandmark({ kind }: { kind: 'house' | 'barn' | 'windmill' }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (imageFailed) return <g className="fl-building-fallback" data-building-art={kind} data-art-status="fallback">{kind === 'house' ? <Cottage x={136} y={147} scale={1.05} /> : kind === 'barn' ? <Cottage x={128} y={351} scale={1.03} roof="#729399" barn /> : <Windmill x={845} y={148} />}</g>;
  const mill = kind === 'windmill';
  const x = mill ? 845 : kind === 'house' ? 136 : 128;
  const y = mill ? 148 : kind === 'house' ? 147 : 351;
  const scale = mill ? 1 : kind === 'house' ? 1.05 : 1.03;
  return <g className="fl-painted-building" data-building-art={kind} data-art-status="painted" transform={`translate(${x} ${y}) scale(${scale})`}>
    <ellipse cx={mill ? 94 : 107} cy={mill ? 161 : 153} rx={mill ? 90 : 82} ry="20" fill="#365832" opacity=".22" />
    {mill ? <path d="m-18 142 110-49 97 44-111 57Z" fill="#b9cc89" /> : <><path d="m25 137 87-43 80 40-88 47Z" fill="#b9cc89" /><path d="m25 137 79 44 88-47v7l-88 46-79-43Z" fill="#85a357" /></>}
    <image href={`/art/${kind === 'house' ? 'farmhouse' : kind}.webp`} x={mill ? -32 : 20} y={mill ? -27 : -3} width={mill ? 220 : 170} height={mill ? 210 : 185} preserveAspectRatio="xMidYMax meet" aria-hidden="true" onError={() => setImageFailed(true)} />
  </g>;
}

function Windmill({ x, y }: { x: number; y: number }) {
  const paint = `fl-mill-${useId().replace(/:/g, '')}`;
  return <g transform={`translate(${x} ${y})`}>
    <defs><linearGradient id={`${paint}-plaster`} x1="0" y1="0" x2="1" y2=".7"><stop stopColor="#fff0c7" /><stop offset=".5" stopColor="#e7ce92" /><stop offset="1" stopColor="#bca76f" /></linearGradient><clipPath id={`${paint}-tower`}><path d="m67 45 40-18 21 111-49 24-27-14Z" /></clipPath></defs>
    <Cottage x={-27} y={13} scale={.95} roof="#83a39d" />
    <path d="m67 45 40-18 21 111-49 24-27-14Z" fill={`url(#${paint}-plaster)`} /><path d="m107 27 21 111-22 11-16-110Z" fill="#b69c65" opacity=".6" />
    <g clipPath={`url(#${paint}-tower)`} fill="none"><path d="m61 66 50-25m-54 44 57-29m-61 47 64-32m-62 48 65-33m-62 47 65-33m-59 46 61-31" stroke="#c3a96e" strokeWidth=".7" opacity=".27" /><path d="m67 45-13 99m16 10 47-23" stroke="#fff1c3" strokeWidth="2.2" opacity=".8" /></g>
    <path d="m62 47 26-35 26 12 8 26-41 20Z" fill="#a67750" /><path d="m62 47 19 23 41-20v7L81 78 62 55Z" fill="#87634b" />
    <path d="m91 114 16-8 3 35-18 9Z" fill="#7c8b66" /><path d="m88 88 15-7 2 14-15 7Z" fill="#98bec1" stroke="#fff1c9" strokeWidth="2" />
    <path d="m94 116 1 29m4-33 2 30m4-32 2 29" stroke="#a8b58c" strokeWidth="1" /><circle cx="104" cy="128" r="1.5" fill="#ead19a" />
    <g transform="translate(88 58)"><g className="fl-windmill-blades"><path d="M0 0V-45m0 45h45M0 0v45m0-45h-45" stroke="#8f7952" strokeWidth="4" /><path d="M-4-14v-32l13-6 3 34ZM14-4h32l6 13-34 3ZM4 14v32l-13 6-3-34ZM-14 4h-32l-6-13 34-3Z" fill="#fff3c8" stroke="#cbb47e" strokeWidth="1.3" /><path d="M0-17v-29m17 46h29M0 17v29m-17-46h-29" stroke="#dec58a" strokeWidth="2" /></g><circle r="8" fill="#ad8a58" stroke="#f7df9e" strokeWidth="3" /></g>
    <path d="m144 137 30-16 14 7v27l-31 16-13-8Z" fill="#c0a36f" /><path d="m144 137 13 8 31-17-14-7Z" fill="#ead6a4" /><path d="m148 146 8 4m7-5 19-10m-33 20 8 4m7-5 17-9" stroke="#9c8156" strokeWidth="2" />
  </g>;
}

function Cow({ x, y, paint, flip = false }: { x: number; y: number; paint: string; flip?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}><ellipse cx="5" cy="17" rx="24" ry="7" fill="#436439" opacity=".23" />{!imageFailed ? <image className="fl-painted-herd" href="/art/animals/cow.webp" x="-29" y="-35" width="62" height="57" preserveAspectRatio="xMidYMax meet" onError={() => setImageFailed(true)} /> : <g className="fl-herd-fallback"><path d="m-17 6 1 13h5l2-13m23-1 2 14h5l-1-16" stroke="#a39c7c" strokeWidth="4" /><path d="M-22-3c2-16 41-15 46 1v12c-11 12-40 8-46-2Z" fill={`url(#${paint}-milk)`} stroke="#aaa27d" strokeWidth="1" /><path d="M-12-12c16-4 20 5 13 13-8 5-20-2-13-13m18 19c8-5 16-2 15 6-7 6-18 5-15-6Z" fill="#61715c" /><path d="M20-8c12-3 21 5 19 17-1 9-13 13-19 5-6-7-7-15 0-22Z" fill="#f5eacc" stroke="#b3ae8c" /><path d="m22-8-7-7 2 10m16-4 8-5-2 9" fill="#b3b18b" /><ellipse cx="29" cy="12" rx="10" ry="6" fill="#dda992" /><path d="m24 13 1 1m7-1 1 1" stroke="#ac8069" strokeWidth="1.4" strokeLinecap="round" /><circle className="fl-cow-eye" cx="27" cy="0" r="1.8" fill="#425940" /><path className="fl-cow-tail" d="m-21-6-8 2-3 12" stroke="#b4b39a" strokeWidth="2" fill="none" /></g>}</g>;
}

function MapHen() {
  const [imageFailed, setImageFailed] = useState(false);
  return <g transform="translate(350 475)"><ellipse rx="19" ry="7" cy="14" fill="#739d57" opacity=".2" />{!imageFailed ? <image className="fl-painted-flock" href="/art/animals/chicken.webp" x="-15" y="-25" width="42" height="48" preserveAspectRatio="xMidYMax meet" onError={() => setImageFailed(true)} /> : <g className="fl-chicken-fallback"><path d="M-12 3c0-13 20-16 27-4 5 14-24 18-27 4Z" fill="#fff2d6" /><circle cx="16" cy="-8" r="7" fill="#fff4db" /><path d="m22-8 8 3-8 2" fill="#dfa84c" /><path d="m12-15 1-5 4 3 3-2 2 6" fill="#d87953" /><circle cx="17" cy="-9" r="1.3" fill="#4c6240" /><path d="m-5 12-2 6m12-7 2 6" stroke="#bd9a51" strokeWidth="2" /></g>}</g>;
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
export function FarmLandscape({ onVisit, className = '', layout, fit = 'cover', children, selectedItem, editing = false }: FarmLandscapeProps) {
  const paint = `fl-${useId().replace(/:/g, '')}`;
  const placements = (layout ?? initialFarmLayout()).placements;
  const placement = (id: FarmLayoutItemId) => placements.find(item => item.id === id)!;
  const decorations = placements.filter(item => !['house', 'production', 'livestock'].includes(item.id) && item.placed).sort((first, second) => first.y - second.y || first.x - second.x);
  return <div className={`farm-landscape ${className}`} data-layout-fit={fit} data-layout-editing={editing ? 'true' : undefined}><svg viewBox="0 0 1200 700" preserveAspectRatio={`xMidYMid ${fit === 'contain' ? 'meet' : 'slice'}`} aria-label="农场地图，田地中央，建筑与水塘分布在四周">
    <defs>
      <linearGradient id={`${paint}-grass`} x1="0" y1="0" x2=".75" y2="1"><stop stopColor="#c5dc91" /><stop offset=".44" stopColor="#a4c96c" /><stop offset="1" stopColor="#7faa58" /></linearGradient>
      <radialGradient id={`${paint}-meadow-light`} cx=".38" cy=".3" r=".75"><stop stopColor="#e5edaa" stopOpacity=".65" /><stop offset="1" stopColor="#d0e79a" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${paint}-crown`} cx=".35" cy=".2" r=".84"><stop stopColor="#a8cd67" /><stop offset=".5" stopColor="#77ab4b" /><stop offset="1" stopColor="#477f42" /></radialGradient>
      <radialGradient id={`${paint}-autumn`} cx=".32" cy=".15" r=".86"><stop stopColor="#e8d98a" /><stop offset=".5" stopColor="#c6b55e" /><stop offset="1" stopColor="#9a944d" /></radialGradient>
      <linearGradient id={`${paint}-bark`}><stop stopColor="#bb965b" /><stop offset=".45" stopColor="#a97f49" /><stop offset="1" stopColor="#7d5d39" /></linearGradient>
      <linearGradient id={`${paint}-water`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#9de1d4" /><stop offset=".4" stopColor="#65c1c8" /><stop offset="1" stopColor="#318ba9" /></linearGradient>
      <linearGradient id={`${paint}-milk`} x1="0" y1="0" x2=".1" y2="1"><stop stopColor="#fff8e5" /><stop offset=".5" stopColor="#f5e7c2" /><stop offset="1" stopColor="#cfcea9" /></linearGradient>
      <linearGradient id={`${paint}-soil`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dcbf83" /><stop offset=".6" stopColor="#c9a06b" /><stop offset="1" stopColor="#ac844e" /></linearGradient>
      <pattern id={`${paint}-meadow`} width="84" height="64" patternUnits="userSpaceOnUse"><path d="m15 18-3-5m6 6 2-5m38 29-2-4m5 5 2-5" stroke="#70a34e" strokeWidth="1.3" opacity=".3" /><path d="m39 52 2-4m-1 6 5-3" stroke="#c9df8c" strokeWidth="1.4" opacity=".6" /><ellipse cx="36" cy="53" rx="2.7" ry=".9" fill="#edf0b3" opacity=".55" /></pattern>
      <filter id={`${paint}-autumn-tone`} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="1.05 .25 0 0 -.05  0 .82 .05 0 .02  .02 .05 .52 0 .02  0 0 0 1 0" /></filter>
      <radialGradient id={`${paint}-water-depth`}><stop stopColor="#287a92" stopOpacity=".42" /><stop offset="1" stopColor="#287a92" stopOpacity="0" /></radialGradient>
      <clipPath id={`${paint}-pond`}><path d="M943 423c39-32 85-20 134-14 64-8 101 31 77 62-26 35-85 48-143 41-66 7-99-28-82-58 3-16 5-22 14-31Z" /></clipPath>
    </defs>
    <g aria-hidden="true">
      <rect width="1200" height="700" fill={`url(#${paint}-grass)`} /><ellipse cx="560" cy="274" rx="560" ry="268" fill={`url(#${paint}-meadow-light)`} /><rect width="1200" height="700" fill={`url(#${paint}-meadow)`} />
      <path d="M0 106C82 59 137 25 213 63S327 139 413 89 525 46 611 91 736 116 814 74 949 43 1030 89 1156 94 1200 54V182c-180 35-336-20-531-2S248 195 0 140Z" fill="#7caa77" opacity=".69" />
      <path d="M0 44C98-8 166 15 242 41S368 83 448 39 578 3 650 40 789 60 862 29 1000 3 1085 37 1169 46 1200 29V0H0Z" fill="#b0d194" />
      <ScenicTerrain paint={paint} />
      <path d="M-60 77C61 75 94 205 64 282S2 402 33 492s67 159-26 235" fill="none" stroke="#628d56" strokeWidth="100" /><path d="M-60 77C61 75 94 205 64 282S2 402 33 492s67 159-26 235" fill="none" stroke="#dae1ad" strokeWidth="77" /><path d="M-60 77C61 75 94 205 64 282S2 402 33 492s67 159-26 235" fill="none" stroke={`url(#${paint}-water)`} strokeWidth="60" />
      <g className="fl-river-glints" fill="none" stroke="#e3fff1" strokeLinecap="round"><path d="M-60 77C61 75 94 205 64 282S2 402 33 492s67 159-26 235" strokeWidth="1.7" strokeDasharray="25 38 11 61" opacity=".45" /><path d="M-51 77C70 75 103 205 73 282S11 402 42 492s67 159-26 235" strokeWidth="1" strokeDasharray="6 63 18 42" opacity=".3" /></g>
      <path d="M150 289C312 308 328 235 466 228s199-75 335-12 192 97 339 86M339 306c33 102 76 176 196 219s211 64 423 15" fill="none" stroke="#759b50" strokeWidth="42" opacity=".4" /><path d="M150 289C312 308 328 235 466 228s199-75 335-12 192 97 339 86M339 306c33 102 76 176 196 219s211 64 423 15" fill="none" stroke="#c2a974" strokeWidth="34" /><path d="M150 289C312 308 328 235 466 228s199-75 335-12 192 97 339 86M339 306c33 102 76 176 196 219s211 64 423 15" fill="none" stroke="#e9d29b" strokeWidth="28" /><path d="m408 248 9-3m-19 7 4-1m156-31 6-2m117-12 9 3m-270 230 5 5m89 70 6 3m110 47 9 2m49 8 4 1m117-1 9-1m99-17 5-2" fill="none" stroke="#f9eac2" strokeWidth="2.3" strokeLinecap="round" opacity=".7" />
      <path d="M436 291 625 195q24-12 45 0l187 92q20 12 5 29L682 483q-24 22-49 9L434 391q-22-13-20-33Z" fill="#7b9e59" opacity=".35" transform="translate(0 10)" /><path d="M436 285 625 189q24-12 45 0l187 92q20 12 5 29L682 477q-24 22-49 9L434 385q-22-13-20-33Z" fill={`url(#${paint}-soil)`} stroke="#e1c696" strokeWidth="5" />
      <path d="m446 304 42-21m-55 54 32 17m235 102 39-31m63-125 30-17" stroke="#b99868" strokeWidth="3" opacity=".35" fill="none" /><g fill="#e7cf9e" opacity=".65"><ellipse cx="468" cy="369" rx="5" ry="2" /><ellipse cx="644" cy="205" rx="6" ry="2" /><ellipse cx="816" cy="322" rx="5" ry="2" /><ellipse cx="680" cy="457" rx="6" ry="2" /></g>
      <path d="m218 280 26-12 49 23-27 15Z" fill="#c6b88b" /><path d="m225 280 28-8m-10 18 29-12m-11 20 23-10" stroke="#f0e4ba" strokeWidth="6" />
    </g>
    <LayoutItem item={placement('house')} selected={selectedItem}>
      <PaintedLandmark kind="house" />
      <Fence points={[[119,293],[151,308],[187,325],[223,343]]} />
      <path d="m128 339 3-11m12 16 2-12m226-55 3-12m9 18 3-14" stroke="#7eaa57" strokeWidth="3" /><g fill="#fff0ae"><circle cx="131" cy="326" r="4" /><circle cx="145" cy="332" r="3" /><circle cx="375" cy="263" r="4" /><circle cx="386" cy="269" r="3" /></g>
    </LayoutItem>
    <g aria-hidden="true"><Tree paint={paint} x={119} y={248} size={.83} /><Tree paint={paint} x={339} y={201} size={.85} /><Tree paint={paint} x={383} y={262} size={.7} /><Tree paint={paint} x={412} y={166} size={.68} /><Tree paint={paint} x={496} y={140} size={.7} /><Tree paint={paint} x={602} y={113} size={.84} /><Tree paint={paint} x={724} y={145} size={.78} /><Tree paint={paint} x={834} y={136} size={.86} /><Tree paint={paint} x={982} y={114} size={.8} /></g>
    <LayoutItem item={placement('production')} selected={selectedItem}>
    <MapPlace area="production" label="前往工坊，制作农场产品" hit="M825 152 1018 119 1065 292 889 342 811 256Z" onVisit={onVisit}>
      <PaintedLandmark kind="windmill" /><Sign x={949} y={318} label="工坊" />
    </MapPlace>
    </LayoutItem>
    <g aria-hidden="true"><Tree paint={paint} x={1082} y={209} size={.82} /><Tree paint={paint} x={840} y={341} size={.67} /><path d="m998 334 36-19 30 13-36 19Z" fill="#ded2a4" /><path d="m1007 334 28-14m-18 22 28-14" stroke="#f1e5b5" strokeWidth="4" /></g>
    <LayoutItem item={placement('livestock')} selected={selectedItem}>
    <MapPlace area="livestock" label="前往牧场，照料农场动物" hit="M142 341 364 324 466 429 383 523 142 548 91 462Z" onVisit={onVisit}>
      <path d="m239 396 145-58 72 49-142 71Z" fill="#a4c56f" stroke="#91b561" strokeWidth="4" /><Fence points={[[244,397],[282,381],[320,365],[359,349],[388,344],[415,362],[443,380],[455,391]]} />
      <Cow paint={paint} x={322} y={393} /><Cow paint={paint} x={386} y={386} flip />
      <path d="m292 424 37-18 29 15-37 19Z" fill="#d6c992" /><path d="m299 422 22 10 28-14" fill="none" stroke="#d7b76d" strokeWidth="5" />
      <Fence points={[[243,409],[274,428],[306,448],[343,430],[379,412],[419,395],[455,391]]} />
      <PaintedLandmark kind="barn" />
      <MapHen />
      <Sign x={335} y={535} label="牧场" />
    </MapPlace>
    </LayoutItem>
    <MapPlace area="town" label="进入农场小镇，接待游戏访客" hit="M1029 232 1175 205 1200 339 1080 384 1004 333Z" onVisit={onVisit}>
      <path d="m1040 307 107-39 53 52-102 43Z" fill="#c9cf91" /><Cottage x={1036} y={229} scale={.57} roof="#d0945d" /><Cottage x={1108} y={216} scale={.53} roof="#90aaa2" /><Cottage x={1080} y={280} scale={.5} roof="#b78384" /><Sign x={1113} y={355} label="小镇" />
    </MapPlace>
    <MapPlace area="explore" label="前往水塘，探索钓鱼与果园" hit="M911 376 1128 374 1200 477 1125 563 940 581 886 498Z" onVisit={onVisit}>
      <path d="M927 418c33-41 95-29 151-19 73-8 122 40 89 87-19 38-91 58-163 49-89 11-127-40-97-76 1-17 5-28 20-41Z" fill="#6b9f68" opacity=".3" transform="translate(5 11)" /><path d="M927 414c33-41 95-29 151-19 73-8 122 40 89 87-19 38-91 58-163 49-89 11-127-40-97-76 1-17 5-28 20-41Z" fill="#d7d6a2" stroke="#94b275" strokeWidth="5" /><path d="M943 423c39-32 85-20 134-14 64-8 101 31 77 62-26 35-85 48-143 41-66 7-99-28-82-58 3-16 5-22 14-31Z" fill={`url(#${paint}-water)`} />
      <g clipPath={`url(#${paint}-pond)`} pointerEvents="none"><ellipse cx="1074" cy="468" rx="94" ry="42" fill={`url(#${paint}-water-depth)`} /><path d="M958 449q44-14 83-9m-28 46q51 11 88-7" fill="none" stroke="#a7e3ce" strokeWidth="1.2" opacity=".28" /><g fill="#277c81" opacity=".35"><path d="m1031 473 8-4 7 3-7 3-7-2-4 3v-6Z" /><path d="m1092 483 6-3 6 2-5 3-6-1-4 3v-6Z" /></g><path d="M939 433c35-28 86-24 132-16 57-5 99 15 90 44" fill="none" stroke="#e2f4c8" strokeWidth="4" opacity=".45" /><path d="M938 452c-8 43 54 62 119 49 42-7 74-22 91-45" fill="none" stroke="#2e8292" strokeWidth="3" opacity=".3" /><ellipse className="fl-pond-sunlight" cx="1009" cy="433" rx="63" ry="7" fill="#e8fff0" opacity=".15" /><path d="m1001 441 41 4m-29 5 20 2m53-1 15-2" stroke="#d3f7e7" strokeWidth="1.5" strokeLinecap="round" opacity=".42" /></g>
      <path d="m917 466 5 10 4-3m53 59 10 3m105-15 8-4m54-48 3-9" stroke="#eff0be" strokeWidth="2.8" strokeLinecap="round" fill="none" opacity=".7" />
      <g className="fl-water-ripples"><path d="M949 429c33-25 73-17 109-14m-70 71c25 11 65 13 92 4m-40-47 47 4m-34 29 40-3" stroke="#d9f3e8" strokeWidth="3" strokeLinecap="round" opacity=".7" fill="none" /><ellipse className="fl-water-ring" cx="1103" cy="447" rx="13" ry="4" fill="none" stroke="#dcf5eb" strokeWidth="1.7" /></g>
      <path d="m918 456 64-30 22 13-66 32Z" fill="#c9a371" stroke="#937b52" strokeWidth="2" /><path d="m925 455 23 13m-13-19 23 13m-13-18 23 13m-13-19 23 14m-12-18 23 14" stroke="#f0d6a3" strokeWidth="3" /><path d="M925 463v13m50-41v15" stroke="#987b50" strokeWidth="4" />
      <path d="m939 437 6-29 6-3m-6 4 34 21-1 16" stroke="#756e48" strokeWidth="2" fill="none" /><path d="m976 446 3 7 3-6" fill="#e8bc67" />
      <path d="m1109 432 28-13 27 16-27 14Z" fill="#dfb976" stroke="#9b8758" strokeWidth="2" /><path d="m1116 431 20 11 20-8" stroke="#ba965b" strokeWidth="2" fill="none" />
      <g className="fl-pond-reeds"><path d="M918 509v-21m7 18 5-22m201-93-3-25m12 31 5-23m-12 128 4-18m6 12 4-21" stroke="#729d65" strokeWidth="3" fill="none" /><path d="M918 490v-9m12 4v-8m198-111-1-8m18 16 1-9m-9 119 2-8" stroke="#aa9a53" strokeWidth="5" strokeLinecap="round" /></g>
      <Sign x={967} y={548} label="探索" />
    </MapPlace>
    {decorations.map(item => <LayoutItem key={item.id} item={item} selected={selectedItem}><Decoration item={item} /></LayoutItem>)}
    <g aria-hidden="true"><Tree paint={paint} x={1180} y={384} size={.74} /><Tree paint={paint} x={880} y={429} size={.56} /><Tree paint={paint} x={860} y={540} size={.8} /><Tree paint={paint} x={1162} y={594} size={.93} /><Tree paint={paint} x={86} y={425} size={.95} /><Tree paint={paint} x={127} y={568} size={.74} /><Tree paint={paint} x={409} y={573} size={.8} autumn /><Tree paint={paint} x={308} y={634} size={.87} /><Tree paint={paint} x={699} y={636} size={.85} /><Tree paint={paint} x={952} y={664} size={.74} />
      <path d="m454 557 77 34m-57-41 2 28m35-13 1 26m44 2 7-15" stroke="#d8c79a" strokeWidth="5" fill="none" /><g fill="#fff0b1"><circle cx="735" cy="547" r="4" /><circle cx="749" cy="554" r="3" /><circle cx="778" cy="566" r="4" /><circle cx="787" cy="554" r="3" /></g><g fill="#d6a37c"><circle cx="735" cy="547" r="1.6" /><circle cx="778" cy="566" r="1.6" /></g>
    </g>
    {children}
  </svg></div>;
}

export default FarmLandscape;
