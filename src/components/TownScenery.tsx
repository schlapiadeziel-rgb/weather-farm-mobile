import { useId, useState } from 'react';

function RoadsideTree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const [failed, setFailed] = useState(false);
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <ellipse cy="1" rx="29" ry="8" fill="#60764a" opacity=".17" />
    {failed ? <g data-town-tree-fallback="true"><path d="M0 0V-48" stroke="#938058" strokeWidth="8" /><g fill="#7da85c"><circle cx="-14" cy="-52" r="22" /><circle cx="15" cy="-57" r="23" /><circle cy="-73" r="24" /></g><circle cx="-7" cy="-78" r="16" fill="#b6cd75" /></g> : <image href="/art/meadow-tree.webp" x="-51" y="-106" width="108" height="118" preserveAspectRatio="xMidYMax meet" onError={() => setFailed(true)} />}
  </g>;
}

/** Static scenery only: no game state, targets, timers or new save data. */
export default function TownScenery() {
  const paint = `ts-${useId().replace(/:/g, '')}`;
  return <svg className="ft-landscape" viewBox="0 0 620 480" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${paint}-sky`} x2="0" y2="1"><stop stopColor="#bddfe1" /><stop offset="1" stopColor="#f5edcf" /></linearGradient>
      <linearGradient id={`${paint}-meadow`} x2=".5" y2="1"><stop stopColor="#c9dba4" /><stop offset="1" stopColor="#b8ce8b" /></linearGradient>
      <pattern id={`${paint}-grass`} width="83" height="71" patternUnits="userSpaceOnUse"><path d="m14 44-2-4m2 4 3-5m38 23-2-4m2 4 3-3" fill="none" stroke="#789e58" strokeWidth="1.5" opacity=".24" /><circle cx="71" cy="28" r="1.5" fill="#f9ecc1" opacity=".65" /></pattern>
    </defs>
    <rect width="620" height="480" fill={`url(#${paint}-sky)`} />
    <circle cx="535" cy="43" r="24" fill="#fff3bc" />
    <g fill="#fff9e8" opacity=".65"><path d="M35 44c0-12 17-17 26-9 9-17 35-17 43 5 17-3 27 6 26 18H35Z" /><path d="M360 33c2-12 16-15 25-8 9-17 33-13 38 3 16-3 26 5 25 16h-88Z" /></g>
    <path d="M0 126C53 113 67 56 117 74s62 64 131 37 91-31 147-4S529 59 620 111v369H0Z" fill="#93b6a0" />
    <path d="M0 149c95-57 167 0 262-16s161-24 358 3v344H0Z" fill="#b0c89a" />
    <path d="M0 213c174-63 290 28 620-28v295H0Z" fill={`url(#${paint}-meadow)`} />
    <path d="M0 353c176-72 344-21 620-66v193H0Z" fill="#b7cc8d" />
    <path d="M0 213c174-63 290 28 620-28v295H0Z" fill={`url(#${paint}-grass)`} />
    <g fill="#e3e8b5" opacity=".45"><ellipse cx="102" cy="266" rx="86" ry="19" /><ellipse cx="500" cy="395" rx="104" ry="28" /></g>
    <path d="M0 177h620" stroke="#9ba27a" strokeWidth="18" /><path d="M0 171h620m-620 12h620" stroke="#d9d8b8" strokeWidth="2" /><path d="M0 177h620" stroke="#9a8062" strokeWidth="12" strokeDasharray="3 12" />
    <path d="M311 190v118c-49 16-133 24-211 10m211-10c67-14 130-8 209 6m-209-6v172" fill="none" stroke="#9fa86d" strokeOpacity=".55" strokeWidth="29" />
    <path d="M311 190v118c-49 16-133 24-211 10m211-10c67-14 130-8 209 6m-209-6v172" fill="none" stroke="#ebdcb5" strokeWidth="23" />
    <path d="M311 207v91m-197 22c70 6 137-1 188-13m22 0c57-8 113-4 179 5m-192 15v151" fill="none" stroke="#fff0cd" strokeOpacity=".55" strokeWidth="4" strokeLinecap="round" />
    <g fill="#cbbd93" opacity=".5"><ellipse cx="306" cy="272" rx="4" ry="2" /><ellipse cx="250" cy="317" rx="3" ry="1.5" /><ellipse cx="323" cy="380" rx="4" ry="2" /><ellipse cx="396" cy="302" rx="3" ry="1.5" /></g>
    <RoadsideTree x={26} y={163} scale={.65} /><RoadsideTree x={134} y={157} scale={.48} /><RoadsideTree x={477} y={158} scale={.55} /><RoadsideTree x={605} y={165} scale={.7} />
    <RoadsideTree x={7} y={382} scale={.72} /><RoadsideTree x={613} y={425} scale={.77} /><RoadsideTree x={22} y={480} scale={.7} />
    <g fill="#f3dfa0"><circle cx="44" cy="369" r="2" /><circle cx="574" cy="411" r="2" /><circle cx="95" cy="420" r="2" /><circle cx="542" cy="241" r="2" /></g>
  </svg>;
}
