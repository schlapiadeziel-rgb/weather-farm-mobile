import { memo, useId } from 'react';
import { CROPS } from '../lib/game';
import type { AnimalId, CropId } from '../lib/game';
import './farm-visual.css';

/** Original decorative game scenery; separate from photo assessment inputs. */
export const FARM_ART_URL = '/farm-art-v2.png';

export type CropVisualProps = {
  crop: CropId | null;
  growth: number;
  health: number;
  /** Optional simulated game moisture, on the game's 0–100 scale. */
  moisture?: number;
  className?: string;
};
export type AnimalVisualProps = {
  animal: AnimalId | null;
  healthy: boolean;
  className?: string;
};

function Paint({ id }: { id: string }) {
  return <defs>
    <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2=".85" y2="1"><stop stopColor="#a4d366" /><stop offset=".45" stopColor="#5eab55" /><stop offset="1" stopColor="#286c47" /></linearGradient>
    <linearGradient id={`${id}-leaf-light`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#c6e789" /><stop offset="1" stopColor="#5d9e51" /></linearGradient>
    <linearGradient id={`${id}-red`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ff9470" /><stop offset=".45" stopColor="#eb5d50" /><stop offset="1" stopColor="#ae3441" /></linearGradient>
    <linearGradient id={`${id}-root`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#f7a09b" /><stop offset=".4" stopColor="#da6478" /><stop offset=".78" stopColor="#f3d8ca" /><stop offset="1" stopColor="#fff1db" /></linearGradient>
    <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffe6a0" /><stop offset=".55" stopColor="#e3b251" /><stop offset="1" stopColor="#b87935" /></linearGradient>
    <linearGradient id={`${id}-cream`} x1="0" y1="0" x2=".6" y2="1"><stop stopColor="#fffdf1" /><stop offset=".58" stopColor="#f1e9cc" /><stop offset="1" stopColor="#c8be9d" /></linearGradient>
    <linearGradient id={`${id}-ivory`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fffef6" /><stop offset="1" stopColor="#dbdfca" /></linearGradient>
    <linearGradient id={`${id}-soil`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ab7752" /><stop offset="1" stopColor="#735039" /></linearGradient>
  </defs>;
}

function Soil({ id, dry = false, empty = false }: { id: string; dry?: boolean; empty?: boolean }) {
  return <g className="fv-soil">
    <ellipse cx="60" cy="100" rx="43" ry="9" fill="#573d28" opacity=".16" />
    <ellipse cx="60" cy="97" rx="38" ry="7" fill={`url(#${id}-soil)`} opacity={empty ? '.65' : '.8'} />
    <path d="M29 96c7-2 14-2 19-1m19 1c6-2 13-2 20-1" stroke="#d0a078" strokeWidth="1.5" opacity=".55" />
    <ellipse cx="35" cy="100" rx="2.6" ry="1.1" fill="#d0a077" /><ellipse cx="80" cy="94" rx="2" ry=".8" fill="#e0b185" />
    <ellipse cx="48" cy="102" rx="1.4" ry=".8" fill="#64452e" /><ellipse cx="72" cy="100" rx="1.4" ry=".8" fill="#674a33" />
    {dry && <path d="m39 94 7 4-3 4m3-4 11-1m8-3-3 5 7 3m-7-3-8 3m23-7-5 4 4 3" fill="none" stroke="#5f4530" strokeWidth="1.3" opacity=".8" />}
    {empty && <g fill="#e8c08b"><ellipse cx="53" cy="95" rx="2" ry="1.1" transform="rotate(-20 53 95)" /><ellipse cx="64" cy="98" rx="2.3" ry="1" transform="rotate(25 64 98)" /></g>}
  </g>;
}

function YoungPlant({ id, seedling }: { id: string; seedling: boolean }) {
  return <g className="fv-wind">
    <path d={seedling ? 'M60 94Q59 79 61 69' : 'M60 95Q59 75 60 55'} stroke="#4d8050" strokeWidth="3.5" fill="none" />
    <path d={seedling ? 'M60 82C46 83 41 75 44 68C56 68 61 74 60 82Z' : 'M60 76C42 78 33 67 37 55C51 54 61 65 60 76Z'} fill={`url(#${id}-leaf)`} />
    <path d={seedling ? 'M60 75C62 64 71 61 77 66C76 76 68 80 60 75Z' : 'M60 65C61 49 73 44 83 50C83 63 73 70 60 65Z'} fill={`url(#${id}-leaf-light)`} />
    <path d={seedling ? 'M47 72 59 80m2-8 11-5' : 'm42 60 16 13m5-14 15-6'} stroke="#d9efa9" strokeWidth="1.2" opacity=".65" fill="none" />
    {!seedling && <path d="M59 59C53 49 55 39 62 35C68 44 66 52 59 59Z" fill={`url(#${id}-leaf)`} />}
  </g>;
}

function Radish({ id, fruiting }: { id: string; fruiting: boolean }) {
  return <g className="fv-wind">
    {fruiting && <>
      <path d="M46 76C45 62 56 58 64 60C80 60 83 74 74 83L62 96C59 91 51 85 46 76Z" fill={`url(#${id}-root)`} stroke="#ba6876" strokeWidth=".8" />
      <path d="M62 94q-1 6 4 9" stroke="#e9d5b7" strokeWidth="1.7" fill="none" />
      <path d="M52 67c-4 4-3 8-1 11" stroke="#ffd5c6" strokeWidth="3" opacity=".65" fill="none" />
      <path d="m67 77 6-2m-10 10 5-2" stroke="#b4676d" strokeWidth="1.2" opacity=".45" />
    </>}
    <path d={fruiting ? 'M60 64V43' : 'M60 94V45'} stroke="#4b8050" strokeWidth="4" fill="none" />
    <path d="M60 60C43 61 31 53 31 38L40 41 44 35C49 41 56 45 60 60Z" fill={`url(#${id}-leaf)`} />
    <path d="M60 57C61 39 68 27 80 24L78 34 86 38C79 47 73 53 60 57Z" fill={`url(#${id}-leaf-light)`} />
    <path d="M57 51C45 43 44 29 49 19L55 26 61 24C65 35 63 42 57 51Z" fill={`url(#${id}-leaf)`} />
    <path d="M63 60C75 48 88 47 95 52L88 57 91 63C82 68 72 68 63 60Z" fill={`url(#${id}-leaf)`} />
    <path d="m39 44 18 12m10-10 10-13m-23-6 3 19m14 16 15-7" stroke="#d8eead" strokeWidth="1.1" opacity=".65" fill="none" />
    {!fruiting && <path d="M53 86q7-7 14 0" stroke="#d2a085" strokeWidth="2" fill="none" />}
  </g>;
}

function TomatoFruit({ id, x, y, small = false }: { id: string; x: number; y: number; small?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${small ? '.73' : '1'})`}>
    <path d="M-13-1C-12-13-4-15 0-11C7-17 16-10 15 0C14 12 6 15-2 13C-10 12-15 6-13-1Z" fill={`url(#${id}-red)`} stroke="#b44942" strokeWidth=".7" />
    <path d="m-7-11 6 3 2-7 3 6 7-2-5 5 2 3-8-3-7 2 2-4Z" fill="#42784c" />
    <path d="M-8-4q-3 3-1 7" stroke="#ffd2b5" strokeWidth="2.8" strokeLinecap="round" opacity=".7" fill="none" />
  </g>;
}

function Tomato({ id, fruiting }: { id: string; fruiting: boolean }) {
  return <g className="fv-wind">
    <path d="M67 95V30" stroke="#ad8657" strokeWidth="3.5" /><path d="M60 95Q65 66 61 39m1 28L43 50m19 9L79 43m-17 34L81 65" stroke="#4a8350" strokeWidth="3.7" fill="none" />
    <path d="M57 52C38 52 31 41 37 30C48 33 56 38 57 52Zm4-9C51 34 54 23 63 17C70 27 69 34 61 43Zm5 13C68 39 81 31 91 36C90 48 82 54 66 56ZM58 75C42 78 28 67 32 56C45 54 55 62 58 75Zm9 7C72 66 84 60 96 67C92 78 82 85 67 82Z" fill={`url(#${id}-leaf)`} />
    <path d="m40 36 13 11m11-22-2 13m7 13 17-11m-49 21 17 11m19 7 16-8" stroke="#c1df91" strokeWidth="1.2" opacity=".65" fill="none" />
    {fruiting ? <><TomatoFruit id={id} x={42} y={72} /><TomatoFruit id={id} x={80} y={54} small /><TomatoFruit id={id} x={73} y={88} small /></> : <>
      <g transform="translate(45 62)"><path d="m0-6 2 4 4-1-2 4 2 3-5-1-3 3v-5l-3-2 4-1Z" fill="#f7d979" /><circle r="1.6" fill="#bc913a" /></g>
      <g transform="translate(80 53)"><path d="m0-5 2 3 4-1-2 3 1 4-4-2-3 2 1-4-3-2 4-1Z" fill="#f7d979" /><circle r="1.4" fill="#bc913a" /></g>
    </>}
    <path d="m59 77 10 1m-9-24 9 1" stroke="#dfc397" strokeWidth="1.2" />
  </g>;
}

function WheatHead({ id, x, y, tilt = 0 }: { id: string; x: number; y: number; tilt?: number }) {
  return <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
    <path d="M0 27V-7" stroke="#b68e47" strokeWidth="1.5" />
    {[0, 7, 14, 21].map((n) => <g key={n} transform={`translate(0 ${n})`}><path d="M0 5C-9 3-11-3-8-6C-3-5 0-1 0 5ZM0 5C9 3 11-3 8-6C3-5 0-1 0 5Z" fill={`url(#${id}-gold)`} stroke="#ba944e" strokeWidth=".5" /></g>)}
    <path d="M0-5C-5-9-3-15 0-17C4-13 4-9 0-5Z" fill={`url(#${id}-gold)`} />
    <path d="m-8-5-4-9m20 9 4-9m-20 16-5-6m21 6 5-6" stroke="#d0ae60" strokeWidth=".8" />
  </g>;
}

function WheatPlant({ id, fruiting }: { id: string; fruiting: boolean }) {
  return <g className="fv-wind">
    <path d="M58 96Q52 70 38 45m23 52V31m2 65Q72 66 84 47m-29 46L45 68m18 27L73 76" stroke={fruiting ? '#b6a35d' : '#709955'} strokeWidth="2.8" fill="none" />
    <path d="M56 86C36 82 31 70 29 60C44 66 53 77 56 86ZM64 86C81 82 89 72 92 61C77 66 68 77 64 86ZM59 73C51 62 48 53 50 43C58 51 62 64 59 73Z" fill={`url(#${id}-${fruiting ? 'gold' : 'leaf'})`} opacity=".9" />
    {fruiting ? <><WheatHead id={id} x={38} y={42} tilt={-23} /><WheatHead id={id} x={61} y={29} /><WheatHead id={id} x={84} y={44} tilt={23} /></> : <>
      <path d="M38 54C26 47 28 37 27 29C39 34 43 44 38 54ZM61 40C51 33 55 21 61 16C67 23 69 33 61 40ZM83 55C79 44 85 36 95 31C94 43 91 50 83 55Z" fill={`url(#${id}-leaf-light)`} />
    </>}
  </g>;
}

function Berry({ id, x, y, size = 1 }: { id: string; x: number; y: number; size?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${size})`}>
    <path d="M-12-5C-13-13-4-16 0-11C5-16 14-12 13-4C11 6 5 13 0 17C-6 12-11 6-12-5Z" fill={`url(#${id}-red)`} stroke="#b0494a" strokeWidth=".8" />
    <path d="m-11-10 7 1 3-5 3 4 7-4-2 7 6 2-8 2-5-4-7 3Z" fill="#497f49" />
    <path d="M-7-5q-2 3-1 5" fill="none" stroke="#ffd4b6" strokeWidth="2" opacity=".6" />
    <g fill="#ffe7a2"><ellipse cx="-5" cy="0" rx=".9" ry="1.5" transform="rotate(-20 -5 0)" /><ellipse cx="3" cy="-2" rx=".9" ry="1.5" /><ellipse cx="7" cy="3" rx=".8" ry="1.3" /><ellipse cx="0" cy="6" rx=".9" ry="1.4" /><ellipse cx="-4" cy="7" rx=".8" ry="1.3" /><ellipse cy="11" rx=".8" ry="1.1" /></g>
  </g>;
}

function Strawberry({ id, fruiting }: { id: string; fruiting: boolean }) {
  return <g className="fv-wind">
    <path d="M60 96Q50 69 41 54m19 42V52m1 44Q72 70 84 55m-24 40-19-9m21 9 18-13" stroke="#52824b" strokeWidth="3" fill="none" />
    <path d="M45 64C29 68 22 54 26 46C38 45 45 51 45 64Zm0-2C33 50 36 37 44 34C54 41 55 52 45 62Zm2 2C44 49 58 42 65 45C66 57 56 66 47 64Zm29 0C62 62 57 50 63 43C74 44 79 53 76 64Zm2 0C75 50 80 38 89 37C97 48 90 61 78 64Zm2 3C88 51 99 52 104 60C98 71 88 73 80 67Z" fill={`url(#${id}-leaf)`} />
    <path d="m30 52 12 10m1-23 3 20m11-9-9 12m20-12 8 11m11-18-8 18m17 0-13 4" stroke="#c4de94" strokeWidth="1" opacity=".55" fill="none" />
    <path d="M57 85C39 90 28 77 33 69C45 68 56 76 57 85ZM62 85C67 72 79 68 88 74C84 86 74 91 62 85Z" fill={`url(#${id}-leaf-light)`} />
    {fruiting ? <><Berry id={id} x={43} y={82} size={.82} /><Berry id={id} x={73} y={75} /><Berry id={id} x={60} y={93} size={.66} /></> : <>
      <g transform="translate(53 62)"><path d="M0 0C-9 0-10-7-5-9C-3-15 3-14 4-9C11-9 13-3 7 0C10 7 3 11 0 6C-6 11-11 6-6 1Z" fill="#fff8e2" /><circle r="3" fill="#e5b64e" /></g>
      <g transform="translate(81 78) scale(.75)"><path d="M0 0C-9 0-10-7-5-9C-3-15 3-14 4-9C11-9 13-3 7 0C10 7 3 11 0 6C-6 11-11 6-6 1Z" fill="#fff8e2" /><circle r="3" fill="#e5b64e" /></g>
    </>}
  </g>;
}

function WiltedPlant() {
  return <g><path d="M58 97C61 83 66 64 73 64C80 63 83 72 80 77" stroke="#9b8052" strokeWidth="3" fill="none" /><path d="M62 85C45 86 41 76 43 68C57 69 63 76 62 85ZM68 69C59 60 61 49 69 47C76 53 74 61 68 69ZM79 76C86 70 96 74 98 82C88 86 83 85 79 76Z" fill="#b29a68" /><path d="m42 96 10-1-4-4Zm36 6 10-3-6-4Z" fill="#b58c55" /></g>;
}

function Sparkles() {
  return <g className="fv-sparkles" fill="#fff4ad"><path className="fv-sparkle" d="m22 38 2-6 2 6 6 2-6 2-2 6-2-6-6-2Z" /><path className="fv-sparkle fv-sparkle-late" d="m99 62 1.5-4 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5Z" /></g>;
}

/** Decorative SVG. The surrounding control supplies the accessible state label. */
export const CropVisual = memo(function CropVisual({ crop, growth, health, moisture, className = '' }: CropVisualProps) {
  const id = `fv-c-${useId().replace(/:/g, '')}`;
  const progress = Number.isFinite(growth) ? Math.max(0, Math.min(100, growth)) : 0;
  const alive = Number.isFinite(health) && health > 0;
  const dry = Boolean(crop && alive && moisture !== undefined && Number.isFinite(moisture) && moisture < (CROPS.find(item => item.id === crop)?.minMoisture ?? 0));
  const ripe = Boolean(crop && alive && progress >= 100);
  const stage = !crop ? 'empty' : !alive ? 'withered' : progress < 12 ? 'seedling' : progress < 32 ? 'sprout' : progress < 68 ? 'leafy' : ripe ? 'ripe' : 'fruiting';
  const condition = !crop ? 'empty' : !alive ? 'withered' : dry ? 'dry' : health < 40 ? 'stressed' : ripe ? 'ripe' : 'healthy';
  return <span className={`fv-visual fv-crop ${className}`} data-crop={crop ?? 'empty'} data-stage={stage} data-condition={condition} aria-hidden="true">
    <svg viewBox="0 0 120 112" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <Paint id={id} /><Soil id={id} dry={dry} empty={!crop} />
      <g className="fv-plant-art">
        {crop && (!alive ? <WiltedPlant /> : progress < 32 ? <YoungPlant id={id} seedling={progress < 12} /> : crop === 'radish' ? <Radish id={id} fruiting={progress >= 68} /> : crop === 'tomato' ? <Tomato id={id} fruiting={progress >= 68} /> : crop === 'wheat' ? <WheatPlant id={id} fruiting={progress >= 68} /> : <Strawberry id={id} fruiting={progress >= 68} />)}
      </g>
      {ripe && !dry && <Sparkles />}
      {dry && <g className="fv-water-cue" transform="translate(101 24)"><circle r="10" fill="#fff3d5" stroke="#d3aa66" strokeWidth="1" /><path d="M0-6C-2-2-5 1-5 3A5 5 0 0 0 5 3C5 1 2-2 0-6Z" fill="#a7c8cf" /><path d="M-2 2q-1 3 2 3" stroke="#fff9e9" strokeWidth="1.3" fill="none" /></g>}
    </svg>
  </span>;
});

function Chicken({ id, healthy }: { id: string; healthy: boolean }) {
  return <g className="fv-animal-body">
    <path d="m51 87-2 12m20-12 1 12m-25 0h10m9 0h11" fill="none" stroke="#c39449" strokeWidth="3" />
    <path d="M40 71C23 66 23 53 28 46C30 56 36 55 37 60C29 48 35 38 41 36C39 50 45 52 49 63Z" fill={`url(#${id}-cream)`} stroke="#baae86" strokeWidth="1" />
    <path d="M34 70C35 56 49 51 62 55C80 53 91 67 83 82C75 94 43 94 35 81Z" fill={`url(#${id}-cream)`} stroke="#c5b78f" strokeWidth="1" />
    <path d="M49 65C63 58 74 64 72 74C70 84 56 86 47 76C45 72 46 69 49 65Z" fill="#e6d9b7" /><path d="M52 69q10-4 15 1m-15 4q7 2 12 0" fill="none" stroke="#c3b18c" strokeWidth="1.3" />
    <path d="M70 58C67 49 70 37 79 33C91 31 97 42 93 52L85 71Z" fill={`url(#${id}-ivory)`} stroke="#c5b78f" strokeWidth="1" />
    <path d="M76 34C70 32 71 24 75 23C78 22 81 28 81 29C79 19 85 17 88 22L89 28C92 24 99 28 95 34Z" fill="#d96959" stroke="#b85149" strokeWidth=".7" />
    <path d="m94 44 12 4-12 5Z" fill="#e5b054" /><path d="M91 51c8 2 7 9 1 9-4-1-3-5-1-9Z" fill="#d56b5f" />
    {healthy ? <><circle cx="86" cy="42" r="2.3" fill="#3d4b3b" /><circle cx="86.6" cy="41.4" r=".7" fill="#fff" /></> : <path d="m83 44 5-1" stroke="#5b5a42" strokeWidth="1.6" />}
    <path d="M42 61q9-6 19-3" stroke="#fffef4" strokeWidth="2" opacity=".75" fill="none" />
  </g>;
}

function Cow({ id, healthy }: { id: string; healthy: boolean }) {
  return <g className="fv-animal-body">
    <path d="M30 75V98h9l2-24m25 1v23h9l3-24" fill="#dadcca" stroke="#89937e" strokeWidth="1" /><path d="M31 92h8v7h-8m35-7h9v7h-9" fill="#586354" />
    <path d="M46 80C43 88 48 92 55 90l5-10" fill="#e8bca7" /><path d="m49 88v4m7-5v4" stroke="#c59588" strokeWidth="2" />
    <path d="M24 58C20 49 17 55 18 68l-2 11" fill="none" stroke="#9caa91" strokeWidth="2.5" /><path d="m16 75-4 8 6 1 2-7" fill="#657665" />
    <path d="M26 52C37 39 68 40 82 54L86 70C84 85 64 89 44 85C24 82 20 67 26 52Z" fill={`url(#${id}-ivory)`} stroke="#a2ad94" strokeWidth="1.1" />
    <path d="M32 46C41 44 50 44 54 49C57 56 53 64 45 65C36 67 30 58 32 46ZM59 71C62 63 71 63 77 68L80 79C73 85 59 87 57 80Z" fill="#536654" />
    <path d="M72 47c-1-8 2-13 7-15l1 9m15-1 4-10c4 5 4 10 0 15" fill="#ead8ab" stroke="#b9aa82" strokeWidth=".9" />
    <path d="M80 45C69 36 65 44 73 52l8-1m14-6c10-10 16-3 8 6l-8-1" fill="#d6dbc0" stroke="#9fab92" strokeWidth="1" />
    <path d="M76 43C81 37 94 39 98 46L100 68C98 81 77 79 74 68Z" fill={`url(#${id}-ivory)`} stroke="#a2ad94" strokeWidth="1" />
    <path d="M83 40C87 39 93 41 96 44L94 54C85 54 81 48 83 40Z" fill="#5b6d57" />
    <ellipse cx="87" cy="68" rx="13" ry="9" fill="#e7c2ac" stroke="#caab92" strokeWidth=".8" /><ellipse cx="82" cy="68" rx="1.6" ry="2" fill="#8f7c68" /><ellipse cx="92" cy="68" rx="1.6" ry="2" fill="#8f7c68" />
    {healthy ? <g fill="#354839"><circle cx="80" cy="55" r="1.8" /><circle cx="94" cy="55" r="1.8" /><circle cx="80.5" cy="54.4" r=".5" fill="#fff" /></g> : <path d="m78 57 4-1m10 0 4 1" stroke="#556449" strokeWidth="1.6" />}
    <path d="M29 56q-2 9 2 13" stroke="#fffef6" strokeWidth="2.4" opacity=".7" fill="none" /><path d="M83 73q4 2 8 0" stroke="#ba937f" strokeWidth="1" fill="none" />
  </g>;
}

function Sheep({ id, healthy }: { id: string; healthy: boolean }) {
  return <g className="fv-animal-body">
    <path d="m34 78 1 20h8l2-21m23 0 1 21h8l3-24" fill="#8e9c82" stroke="#6c7e68" strokeWidth="1" /><path d="M35 93h8v5h-8m34-5h8v5h-8" fill="#56674f" />
    <path d="M26 57C17 45 11 53 15 62l11 4" fill={`url(#${id}-cream)`} stroke="#c6bd9a" strokeWidth="1" />
    <path d="M29 47C25 37 37 29 45 34C49 26 60 27 64 33C74 28 84 34 84 43C96 44 97 56 90 63C96 74 87 84 77 83C73 93 59 92 53 87C43 94 32 88 31 82C18 83 18 68 24 64C18 56 21 49 29 47Z" fill={`url(#${id}-cream)`} stroke="#c6bd9a" strokeWidth="1.2" />
    <g fill="none" stroke="#d6cdb0" strokeWidth="1.4"><path d="M35 42c-5 0-6 7-1 9m15-11c5-6 12-1 9 4m10-3c7-3 10 6 5 9M28 64c-1-8 9-8 11-3m11-6c-6-3-11 6-4 10m11-7c9-3 12 8 5 11m10-8c7 0 8 7 3 10M35 76c5-3 9 2 6 6m10-3c4 5 11 4 12-2" /></g>
    <path d="M77 54C67 47 66 54 74 62m16-7c7-9 15-4 8 4" fill="#7e9076" stroke="#657a61" strokeWidth="1" />
    <path d="M77 49C87 43 96 49 97 59L95 73C91 86 76 82 73 71Z" fill="#8c9d80" stroke="#6b7e65" strokeWidth="1" />
    <path d="M76 51C73 42 77 38 81 42C84 37 91 39 92 44C99 41 103 48 97 52C90 55 81 55 76 51Z" fill={`url(#${id}-cream)`} stroke="#c6bd9a" strokeWidth=".8" />
    {healthy ? <g fill="#304b39"><circle cx="80" cy="62" r="1.8" /><circle cx="92" cy="62" r="1.8" /><circle cx="80.5" cy="61.3" r=".5" fill="#fff" /></g> : <path d="m78 64 4-1m8 0 4 1" stroke="#3e5840" strokeWidth="1.5" />}
    <path d="m84 70 4 0-2 3Zm2 3v3m0 0-3 1m3-1 3 1" fill="#4b624c" stroke="#4b624c" strokeWidth=".9" />
    <path d="M30 46q4-9 13-7" stroke="#fffdf0" strokeWidth="3" opacity=".8" fill="none" />
  </g>;
}

function EmptyPen({ id }: { id: string }) {
  return <g>
    <path d="M26 80h70m-70 10h70m-64-15v23m22-25v25m23-25v25m16-23v23" stroke="#b5a075" strokeWidth="3" fill="none" />
    <path d="m39 87 14-10 17 8-10 9Z" fill={`url(#${id}-gold)`} opacity=".75" />
    <path d="m45 88 10-6m-4 9 11-6m-5 8 8-5" stroke="#a9894d" strokeWidth="1" />
    <path d="M63 58V39m-9 9h18" stroke="#93a57c" strokeWidth="2.8" />
  </g>;
}

/** Vector livestock art stays inside its layout box on small phone screens. */
export const AnimalVisual = memo(function AnimalVisual({ animal, healthy, className = '' }: AnimalVisualProps) {
  const id = `fv-a-${useId().replace(/:/g, '')}`;
  return <span className={`fv-visual fv-animal ${className}`} data-animal={animal ?? 'empty'} data-condition={animal ? healthy ? 'healthy' : 'resting' : 'empty'} aria-hidden="true">
    <svg viewBox="0 0 120 112" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <Paint id={id} /><ellipse cx="61" cy="101" rx="40" ry="6" fill="#657247" opacity=".17" />
      <path d="m23 99-2-5m5 5 2-4m62 4 1-5m3 5 3-3" stroke="#9aaa69" strokeWidth="1.3" />
      <g className="fv-livestock-art">{animal === 'chicken' ? <Chicken id={id} healthy={healthy} /> : animal === 'cow' ? <Cow id={id} healthy={healthy} /> : animal === 'sheep' ? <Sheep id={id} healthy={healthy} /> : <EmptyPen id={id} />}</g>
    </svg>
  </span>;
});
