/** Decorative world-space materials. No game state, hit areas or moving layers. */
const grassTufts = Array.from({ length: 160 }, (_, index) => ({
  x: 100 + index * 137 % 1080,
  y: 160 + index * 83 % 525,
  scale: .6 + index % 5 * .16,
})).filter(({ x, y }) => !(x > 415 && x < 875 && y > 180 && y < 505));

export default function ScenicTerrain({ paint }: { paint: string }) {
  return <g className="fl-scenic-terrain" aria-hidden="true" pointerEvents="none">
    <defs>
      <radialGradient id={`${paint}-turf-shade`}><stop stopColor="#478347" stopOpacity=".28" /><stop offset=".6" stopColor="#70a351" stopOpacity=".12" /><stop offset="1" stopColor="#70a351" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${paint}-turf-sun`}><stop stopColor="#e6eeb0" stopOpacity=".4" /><stop offset="1" stopColor="#dbe9a0" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${paint}-pebble`} x1="0" y1="0" x2=".6" y2="1"><stop stopColor="#e8dfb8" /><stop offset=".5" stopColor="#bdbb94" /><stop offset="1" stopColor="#8e9978" /></linearGradient>
    </defs>
    {[[180,380,160,130],[390,609,165,100],[1060,580,205,117],[970,224,180,90],[228,168,178,70],[700,658,290,78]].map(([x,y,rx,ry]) => <ellipse key={x} cx={x} cy={y} rx={rx} ry={ry} fill={`url(#${paint}-turf-shade)`} />)}
    <ellipse cx="519" cy="142" rx="294" ry="86" fill={`url(#${paint}-turf-sun)`} /><ellipse cx="615" cy="558" rx="208" ry="103" fill={`url(#${paint}-turf-sun)`} />
    {grassTufts.map(({ x, y, scale }, index) => <g key={index} transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-7 2Q-1 0 8 2" fill="none" stroke="#4e8144" strokeWidth="2" opacity=".14" />
      <path d="M0 2Q-4-4-7-5M1 2Q0-7 3-9M2 3Q6-3 10-3" fill="none" stroke={index % 3 ? '#679a47' : '#749e50'} strokeWidth="1.5" strokeLinecap="round" opacity=".6" />
      <path d="M1 0Q0-4 2-6m1 7 4-3" fill="none" stroke="#d5e79a" strokeWidth="1" strokeLinecap="round" opacity=".75" />
      {index % 13 === 0 && <g><path d="M-3 1v-8" stroke="#6d934f" strokeWidth="1" /><circle cx="-3" cy="-8" r="2.3" fill={index % 2 ? '#f7e5a4' : '#f4f0cc'} /><circle cx="-3" cy="-8" r=".9" fill="#d8af65" /></g>}
    </g>)}
    {[[158,334],[200,354],[400,480],[429,502],[560,548],[685,585],[804,588],[1002,333],[1054,354],[966,577],[150,584]].map(([x,y], index) => <g key={x} transform={`translate(${x} ${y}) rotate(${index % 2 ? -14 : 18})`}><ellipse cy="3" rx="7" ry="2.5" fill="#4e7543" opacity=".17" /><path d="m-6 1 3-5 7-1 4 6-5 3-7-1Z" fill={`url(#${paint}-pebble)`} /><path d="m-3-3 6-1 3 3" stroke="#f6ecc8" strokeWidth="1.2" fill="none" opacity=".75" /></g>)}
  </g>;
}
