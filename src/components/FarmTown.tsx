import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUpRight, BookOpen, CloudSun, House, Radio, ShoppingBasket, Sprout, Stethoscope } from 'lucide-react';
import './farm-town.css';

export type FarmTownVisit = 'home' | 'clinic' | 'weather' | 'advice' | 'market' | 'news';
export type FarmTownProps = { onVisit(id: FarmTownVisit): void; onClose(): void };

const buildings = [
  { id: 'weather', name: '气象站', description: '真实天气 · 农时参考', color: '#468b91', Icon: CloudSun },
  { id: 'clinic', name: 'AI诊所', description: '实拍观察 · 辅助研判', color: '#ba7066', Icon: Stethoscope },
  { id: 'advice', name: '农技学堂', description: '种养知识 · 田间参考', color: '#6c8860', Icon: BookOpen },
  { id: 'market', name: '收购站', description: '市场行情 · 价格参考', color: '#b88439', Icon: ShoppingBasket },
  { id: 'news', name: '农业电台', description: '农业资讯 · 来源可查', color: '#537e9d', Icon: Radio },
  { id: 'home', name: '农场工作室', description: '现实农场记录 · 本机保存', color: '#977553', Icon: House },
] as const;

/** Original decorative buildings. Their services use real-world inputs, not game plots. */
function TownBuilding({ building }: { building: typeof buildings[number] }) {
  const paint = `ft-${useId().replace(/:/g, '')}`;
  const { id, color, Icon } = building;
  return <svg className="ft-building-art" viewBox="0 0 190 138" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${paint}-wall`} x1="0" y1="0" x2="0.9" y2="1"><stop stopColor="#fffae6" /><stop offset="1" stopColor="#dfd3ae" /></linearGradient>
      <linearGradient id={`${paint}-roof`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={color} /><stop offset="1" stopColor={id === 'clinic' ? '#96564f' : id === 'market' ? '#90652d' : '#3f655d'} /></linearGradient>
      <linearGradient id={`${paint}-glass`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e8f3dc" /><stop offset="1" stopColor="#8eafb0" /></linearGradient>
    </defs>
    <ellipse cx="95" cy="122" rx="78" ry="13" fill="#507646" opacity=".16" />
    <path d="M17 119 82 103 171 115 113 132Z" fill="#9fbe70" /><path d="m17 119 96 13 58-17v5l-58 15-96-12Z" fill="#7e9f58" />
    <path d="m76 128 24-6 30 5-25 6Z" fill="#eadab3" />
    <g stroke="#647a48" strokeWidth="1.3" strokeLinecap="round"><path d="M24 112v-20M167 115V94" /><path d="m18 105 6 7 5-9m-12-7 7 9 8-9m129 7 6 8 7-8" /></g>
    <g fill="#6f9d55"><circle cx="24" cy="90" r="12" /><circle cx="19" cy="96" r="9" /><circle cx="30" cy="96" r="10" /><circle cx="166" cy="93" r="12" /><circle cx="172" cy="101" r="9" /><circle cx="160" cy="101" r="10" /></g>
    <g fill="#a8c87b"><circle cx="20" cy="86" r="7" /><circle cx="163" cy="90" r="7" /></g>
    {id === 'weather' ? <>
      <path d="M52 53 116 41 144 57v54l-65 15-27-15Z" fill={`url(#${paint}-wall)`} stroke="#b7ae87" strokeWidth="1" /><path d="m116 41 28 16v54l-28-14Z" fill="#c6c6a2" />
      <path d="m46 54 70-18 36 22-73 19Z" fill={`url(#${paint}-roof)`} /><path d="m46 54 33 23v6L46 61Z" fill="#426d68" />
      <path d="M86 40V23l22-5 19 10v17l-22 7Z" fill="#e8e5c8" /><path d="m108 18 19 10v17l-19-9Z" fill="#bccbad" /><path d="M83 24c0-15 30-21 44 3l-20 7Z" fill="#7ca8a1" /><path d="M107 19V6m0 2 15 3-15 5" fill="#e1ab5b" stroke="#69836c" strokeWidth="1.3" />
      <path d="m63 83 15 4v17l-15-4Zm69-16 7 3v17l-7-3Z" fill={`url(#${paint}-glass)`} stroke="#8ca29b" /><path d="M91 91 109 87v32l-18 4Z" fill="#7a8c71" /><path d="M61 114h19" stroke="#f7efd5" strokeWidth="3" />
    </> : id === 'market' ? <>
      <path d="M49 61 113 47 143 63v48l-62 15-32-16Z" fill={`url(#${paint}-wall)`} /><path d="m113 47 30 16v48l-30-14Z" fill="#ccb98e" />
      <path d="m42 60 71-25 37 29-69 22Z" fill={`url(#${paint}-roof)`} /><path d="m42 60 39 26v5L42 67Z" fill="#946b34" /><path d="m58 83 66-15 22 14-64 17Z" fill="#dc9c64" /><path d="m66 81 9-2 23 17-9 2Zm19-4 9-2 22 17-9 2Zm19-4 9-2 22 16-9 3Z" fill="#fff0cc" />
      <path d="m58 84 24 15v7L58 91Zm24 15 64-17v7l-64 17Z" fill="#bd784d" /><path d="m83 101 51-13v20l-51 13Z" fill="#638069" /><path d="m93 100 27-7v19l-27 7Z" fill="#7f6347" /><path d="m91 99 29-7 9 5-29 8Z" fill="#dabd78" />
      <g fill="#dc9858"><circle cx="104" cy="96" r="4" /><circle cx="113" cy="94" r="4" /><circle cx="120" cy="94" r="3" /></g><path d="m103 92 3-4m7 3 3-4" stroke="#668c50" strokeWidth="2" />
      <path d="m51 104 19 7v13l-19-8Z" fill="#b7965f" /><path d="m51 104 12-4 18 7-11 4Z" fill="#d6b97b" /><path d="m56 110 9 3" stroke="#7e6846" strokeWidth="2" />
    </> : <>
      <path d="M48 59 113 43 145 62v48l-66 17-31-18Z" fill={`url(#${paint}-wall)`} stroke="#bcae8a" strokeWidth=".8" /><path d="m113 43 32 19v48l-32-16Z" fill={id === 'clinic' ? '#ddc5b0' : '#cdbf98'} />
      <path d="m41 59 72-32 40 36-74 25Z" fill={`url(#${paint}-roof)`} /><path d="m41 59 38 29v6L41 66Z" fill={id === 'clinic' ? '#985e53' : '#4a6c51'} /><path d="m60 53 53-23 24 23m-77 6 50-19 34 20" stroke="#fff4ce" strokeOpacity=".2" strokeWidth="1.1" fill="none" />
      <path d="m61 88 13 6v16l-13-6Zm67-16 10 5v17l-10-5Z" fill={`url(#${paint}-glass)`} stroke="#8ca29b" /><path d="m67 91 1 16m-7-11 13 6m60-27v17" stroke="#fff5d7" strokeWidth="1.2" />
      <path d="m93 95 18-5v30l-18 5Z" fill={id === 'clinic' ? '#81948a' : '#858b69'} /><path d="m95 96 14-4v11l-14 4Z" fill={`url(#${paint}-glass)`} /><circle cx="106" cy="113" r="1.2" fill="#f7d385" />
      {id === 'advice' && <><path d="M58 32V18l12-3 8 6v13" fill="#ceb78a" /><path d="m53 18 18-7 12 10-18 7Z" fill="#7d9866" /><path d="m44 112 30 16 4-2-31-17Z" fill="#9c8458" /><path d="M43 108v9m25 0v13" stroke="#866f4f" strokeWidth="2" /><path d="m55 113 10 5m-10-8 11 6" stroke="#d3bd87" strokeWidth="2" /></>}
      {id === 'clinic' && <><path d="m48 113 32 17 66-17" fill="none" stroke="#f6e5c2" strokeWidth="4" /><g fill="#c38d85"><circle cx="51" cy="104" r="3" /><circle cx="55" cy="110" r="2.8" /></g><path d="m50 116 2-8 4 6" stroke="#719551" strokeWidth="2" fill="none" /></>}
      {id === 'news' && <><path d="M122 47V11m-5 35 5-21 6 22m-9-8h7m-5-8h4" stroke="#637d7e" strokeWidth="1.7" fill="none" /><circle cx="122" cy="12" r="3" fill="#ddb86b" /><path className="ft-radio-signal" d="M113 8a13 13 0 0 0 0 10m18-10a13 13 0 0 1 0 10m-23-14a20 20 0 0 0 0 18m27-18a20 20 0 0 1 0 18" stroke="#94b6a0" strokeWidth="1.7" fill="none" /><path d="m57 110 16 8v8l-16-8Z" fill="#b99b67" /></>}
      {id === 'home' && <><path d="m49 96 31 16 66-18v5l-66 18-31-16Z" fill="#b59b69" /><path d="M51 99v18m28-3v15m62-29v13" stroke="#9c855d" strokeWidth="2" /><path d="M57 35V21l11-2 9 5v15" fill="#cdb283" /><path d="m55 20 13-5 12 9-14 4Z" fill="#9d8058" /><path d="m128 106 16 7-2 12-15-8Z" fill="#b69768" /><path d="m130 104 13 6-1 9-13-6Z" fill="#eddfb3" /><path d="m132 113 5-5 5 7" stroke="#86a064" strokeWidth="1.3" fill="none" /></>}
    </>}
    <g transform={id === 'weather' ? 'translate(91 69)' : id === 'market' ? 'translate(88 50)' : 'translate(89 68)'}>
      <rect width="24" height="22" rx="4" fill="#fff8df" stroke={color} strokeWidth="1" /><Icon x="4" y="3" width="16" height="16" color={color} strokeWidth="1.6" />
    </g>
    <g fill="#ead28c"><circle cx="36" cy="119" r="1.6" /><circle cx="156" cy="118" r="1.6" /><circle cx="153" cy="123" r="1.4" /></g>
  </svg>;
}

function TownLandscape() {
  return <svg className="ft-landscape" viewBox="0 0 1100 560" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs><linearGradient id="ft-town-sky" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#c5e0de" /><stop offset="1" stopColor="#eaf0d0" /></linearGradient></defs>
    <rect width="1100" height="560" fill="url(#ft-town-sky)" /><circle cx="962" cy="56" r="29" fill="#fff2bf" />
    <g fill="#f7f7df" opacity=".7"><path d="M66 56c0-17 22-21 32-11 8-22 44-20 52 2 21-4 37 8 35 20H66Z" /><path d="M733 45c3-14 19-18 30-10 11-20 39-17 47 4 18-4 33 7 30 16H733Z" /></g>
    <path d="M0 144 125 60l108 73 121-58 109 65 109-54 107 68 115-70 139 62 100-45 67 57v230H0Z" fill="#93b7a2" />
    <path d="M0 173c127-80 253-8 337-4 132 7 169-77 300-43s257 81 463 14v420H0Z" fill="#b5cb93" />
    <path d="M0 240c157-73 297-43 430-29 137 14 315-61 670-13v362H0Z" fill="#c8d89b" />
    <path d="M0 307c156-20 221 27 375 21 232-8 434-95 725-41v273H0Z" fill="#bfd394" />
    <path d="M541 172c-34 69-43 142 14 181s34 131 4 207" fill="none" stroke="#b8b681" strokeWidth="32" /><path d="M541 172c-34 69-43 142 14 181s34 131 4 207M155 291c235-8 624-19 804-13" fill="none" stroke="#e8dab1" strokeWidth="26" />
    <path d="M95 515c266-60 555-60 920-9" stroke="#b9c486" strokeWidth="3" fill="none" />
    <g fill="#86a565" opacity=".7"><ellipse cx="46" cy="260" rx="40" ry="22" /><ellipse cx="1068" cy="255" rx="45" ry="29" /><ellipse cx="37" cy="470" rx="39" ry="23" /><ellipse cx="1088" cy="453" rx="53" ry="30" /></g>
  </svg>;
}

export function FarmTown({ onVisit, onClose }: FarmTownProps) {
  const titleId = useId();
  const descriptionId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = dialogRef.current;
    const overlay = overlayRef.current;
    if (!dialog || !overlay) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlay && !node.contains(overlay));
    const previousInert = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(node => node.getClientRects().length > 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const onFocusIn = (event: FocusEvent) => { if (event.target instanceof Node && !dialog.contains(event.target)) closeRef.current?.focus({ preventScroll: true }); };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn);
      siblings.forEach((node, index) => { node.inert = previousInert[index]; });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="ft-overlay" ref={overlayRef} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="ft-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
      <header className="ft-header">
        <span className="ft-town-seal" aria-hidden="true"><Sprout size={26} /></span>
        <div className="ft-heading"><span className="ft-eyebrow">田野里的服务驿站</span><h2 id={titleId}>农场小镇</h2><p id={descriptionId}>把真实农业服务带进你的农场</p></div>
        <button className="ft-close" ref={closeRef} onClick={onClose}><ArrowLeft size={17} /><span>回农场</span></button>
      </header>
      <div className="ft-town-map">
        <TownLandscape />
        <span className="ft-map-note"><span aria-hidden="true" />真实农业服务</span>
        <div className="ft-buildings">
          {buildings.map(building => <button className={`ft-building ft-building-${building.id}`} key={building.id} onClick={() => onVisit(building.id)} aria-label={`${building.name}，${building.description}`}>
            <TownBuilding building={building} />
            <span className="ft-building-label"><strong>{building.name}</strong><ArrowUpRight size={14} aria-hidden="true" /><small>{building.description}</small></span>
          </button>)}
        </div>
      </div>
      <footer className="ft-footer"><Sprout size={15} aria-hidden="true" /><p>真实服务与现实农场记录，和游戏经营分开保存。</p><span>轻触建筑，进镇看看</span></footer>
    </div>
  </div>, document.body);
}

export default FarmTown;
