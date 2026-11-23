// Gõ tay quy cách: "400x400" → hiện ngay các kích thước khớp trong thư viện; ↑↓ đổi kích thước, Enter / Tab / bấm để chọn
import { useEffect, useRef, useState } from 'react';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[×*＊Ｘｘ]/g, 'x');
const key = (code: string) => norm(code.replace(/^[^\d]*-?/, ''));

/** Các quy cách khớp chuỗi gõ: khớp đúng → bắt đầu bằng → chứa */
export function matchCodes(codes: string[], q: string): string[] {
  const n = norm(q);
  if (!n) return codes;
  const kq = key(n) || n;
  const exact = codes.filter((c) => norm(c) === n || key(c) === kq);
  const starts = codes.filter((c) => !exact.includes(c) && (key(c).startsWith(kq) || norm(c).startsWith(n)));
  const has = codes.filter((c) => !exact.includes(c) && !starts.includes(c) && norm(c).includes(kq));
  return [...exact, ...starts, ...has];
}

export default function SecCodeInput({ value, codes, onChange }: { value: string; codes: string[]; onChange: (code: string) => void }) {
  const [txt, setTxt] = useState(value);
  const [typing, setTyping] = useState(false);
  const [hi, setHi] = useState(0);
  // nhóm kích thước để ↑↓ (theo lần gõ gần nhất)
  const [fam, setFam] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!typing) setTxt(value); }, [value, typing]);
  const list = typing ? matchCodes(codes, txt) : [];
  const open = typing && txt.trim() !== '' && list.length > 0;
  useEffect(() => { boxRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }, [hi]);
  const pick = (c: string, keepFam?: string[]) => {
    onChange(c);
    setTxt(c);
    setTyping(false);
    if (keepFam) setFam(keepFam);
  };
  const resolve = () => {
    if (!typing) return;
    if (!txt.trim() || !list.length) { setTyping(false); setTxt(value); return; }
    pick(list[Math.min(hi, list.length - 1)], list.length > 1 ? list : []);
  };
  const step = (d: number) => {
    const L = fam.length > 1 && fam.includes(value) ? fam : codes;
    const k = L.indexOf(value);
    const n = L[(k < 0 ? 0 : k + d + L.length) % L.length];
    if (n) pick(n);
  };
  const famK = fam.indexOf(value);
  return (
    <span className="sec-in">
      <span className="sec-in-box">
        <input
          type="text"
          value={txt}
          placeholder="vd 400x400"
          onFocus={(e) => e.target.select()}
          onChange={(e) => { setTxt(e.target.value); setTyping(true); setHi(0); }}
          onBlur={resolve}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // đang gõ: Enter = chọn size, vẫn ở ô này (↑↓ để đổi); Enter lần nữa mới sang dòng kế
              if (typing) {
                e.preventDefault();
                e.stopPropagation();
                resolve();
              }
            } else if (e.key === 'Escape') {
              setTyping(false);
              setTxt(value);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              e.stopPropagation();
              const d = e.key === 'ArrowDown' ? 1 : -1;
              if (open) {
                const n = (hi + d + list.length) % list.length;
                setHi(n);
                onChange(list[n]); // xem ngay thông số
                setFam(list);
              } else step(d);
            }
          }}
        />
        {open && (
          <div className="sec-in-list" ref={boxRef} onMouseDown={(e) => e.preventDefault()}>
            {list.slice(0, 60).map((c, i) => (
              <div key={c} className={i === hi ? 'on' : ''} onClick={() => pick(c, list.length > 1 ? list : [])}>{c}</div>
            ))}
            {list.length > 60 && <div className="muted small">… còn {list.length - 60}</div>}
          </div>
        )}
      </span>
      {open ? <span className="sec-in-n">{list.length} size · ↑↓</span> : fam.length > 1 && famK >= 0 && <span className="sec-in-n">{famK + 1}/{fam.length} ↑↓</span>}
    </span>
  );
}
