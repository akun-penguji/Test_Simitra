import { useEffect, useRef, useState } from 'react';

// ---------- angka count-up ----------
export function useCountUp(target, dur = 900) {
  const [val, setVal] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    let raf, start;
    const from = ref.current;
    const to = Number(target) || 0;
    function tick(t) {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = from + (to - from) * eased;
      setVal(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
      else ref.current = to;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return val;
}

// ---------- stat card dengan count-up ----------
export function StatCard({ icon, value, label, color = 'var(--green)', suffix = '', sub }) {
  const v = useCountUp(value);
  return (
    <div className="statcard">
      <div className="statcard-ic" style={{ background: color + '1f', color }}>{icon}</div>
      <div>
        <div className="statcard-num" style={{ color }}>{Math.round(v)}{suffix}</div>
        <div className="statcard-lbl">{label}</div>
        {sub && <div className="statcard-sub">{sub}</div>}
      </div>
    </div>
  );
}

// ---------- donut chart animasi ----------
export function Donut({ data, size = 170, thickness = 24, centerLabel = 'Total' }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShown(true), 60); return () => clearTimeout(t); }, []);

  let offset = 0;
  const gap = total > 0 ? 2 : 0; // gap 2px antar segmen
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f1" strokeWidth={thickness} />
        {total > 0 && data.map((d, i) => {
          const frac = d.value / total;
          const len = Math.max(frac * c - gap, 0);
          const dash = `${shown ? len : 0} ${c}`;
          const seg = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={d.color} strokeWidth={thickness} strokeLinecap="round"
              strokeDasharray={dash} strokeDashoffset={-offset}
              style={{ transition: 'stroke-dasharray .9s cubic-bezier(.2,.8,.2,1)' }}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          );
          offset += frac * c;
          return seg;
        })}
        <text x="50%" y="46%" textAnchor="middle" className="donut-total">{total}</text>
        <text x="50%" y="60%" textAnchor="middle" className="donut-cap">{centerLabel}</text>
      </svg>
      <div className="donut-legend">
        {data.map((d, i) => (
          <div key={i} className="legend-item">
            <span className="legend-dot" style={{ background: d.color }} />
            <span className="legend-lbl">{d.label}</span>
            <span className="legend-val">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- bar list horizontal (funnel / magnitude) ----------
export function BarList({ data, color = 'var(--green)', showZero = true, maks, format }) {
  const max = maks ?? Math.max(1, ...data.map((d) => d.value));
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShown(true), 60); return () => clearTimeout(t); }, []);
  return (
    <div className="barlist">
      {data.filter((d) => showZero || d.value > 0).map((d, i) => (
        <div key={i} className="barrow">
          <div className="barrow-lbl">{d.label}</div>
          <div className="barrow-track">
            <div className="barrow-fill"
              style={{ width: shown ? `${(d.value / max) * 100}%` : 0, background: d.color || color, transitionDelay: `${i * 55}ms` }}>
            </div>
          </div>
          <div className="barrow-val">{format ? format(d) : d.value}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- radial progress ring ----------
export function RadialProgress({ value, max = 100, size = 150, thickness = 14, label, color = 'var(--green)' }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShown(true), 60); return () => clearTimeout(t); }, []);
  const v = useCountUp(Math.round(pct * 100));
  return (
    <div className="radial">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f1" strokeWidth={thickness} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={thickness}
          strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={shown ? c * (1 - pct) : c}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="48%" textAnchor="middle" className="donut-total">{Math.round(v)}%</text>
        {label && <text x="50%" y="62%" textAnchor="middle" className="donut-cap">{label}</text>}
      </svg>
    </div>
  );
}

// ---------- tooltip melayang bersama untuk grafik ----------
function useTip() {
  const [tip, setTip] = useState(null);
  const pasang = (isi) => ({
    onMouseMove: (e) => setTip({ x: e.clientX, y: e.clientY, isi }),
    onMouseLeave: () => setTip(null),
  });
  const el = tip && (
    <div className="chart-tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 240), top: tip.y + 14 }}>{tip.isi}</div>
  );
  return [pasang, el];
}

// ---------- legenda (selalu tampil untuk ≥ 2 seri) ----------
export function Legenda({ items }) {
  return (
    <div className="legenda">
      {items.map((it) => (
        <span key={it.label} className="legenda-item">
          <span className={`legenda-dot ${it.pola || ''}`} style={{ background: it.color }} />{it.label}
        </span>
      ))}
    </div>
  );
}

// ---------- batang bertumpuk horizontal: komposisi per kelompok ----------
// rows: [{ label, [key]: angka }], keys berurutan dari strata tertinggi.
export function StackedBars({ rows, keys, colors, labels, satuan = 'satuan', lebarLabel = 140 }) {
  const [pasang, tipEl] = useTip();
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShown(true), 60); return () => clearTimeout(t); }, []);
  const total = (r) => keys.reduce((a, k) => a + (r[k] || 0), 0);
  const max = Math.max(1, ...rows.map(total));
  return (
    <div className="sbar">
      {rows.map((r, i) => {
        const tot = total(r);
        const isi = keys.filter((k) => r[k] > 0);
        return (
          <div className="sbar-row" key={r.id || r.label}>
            <div className="sbar-lbl" style={{ width: lebarLabel }} title={r.label}>{r.label}</div>
            <div className="sbar-track">
              <div className="sbar-fill" style={{ width: shown ? `${(tot / max) * 100}%` : 0, transitionDelay: `${i * 40}ms` }}>
                {isi.map((k) => (
                  <div key={k} className="sbar-seg" style={{ flexGrow: r[k], background: colors[k] }}
                    {...pasang(<><b>{r.label}</b><br /><span className="tip-dot" style={{ background: colors[k] }} />{labels[k]}: <b>{r[k]}</b> dari {tot} {satuan}</>)} />
                ))}
              </div>
            </div>
            <div className="sbar-val">{tot}</div>
          </div>
        );
      })}
      {tipEl}
    </div>
  );
}

// ---------- dua batang per baris: pembanding dua ukuran sejenis ----------
// rows: [{ label, a, b, color }] — a = ukuran pembanding (abu-abu), b = ukuran utama (warna baris)
export function PairBars({ rows, labelA, labelB, satuan = 'satuan', lebarLabel = 140 }) {
  const [pasang, tipEl] = useTip();
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShown(true), 60); return () => clearTimeout(t); }, []);
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  return (
    <div className="pbar">
      {rows.map((r) => (
        <div className="pbar-row" key={r.label} {...pasang(<><b>{r.label}</b><br />{labelA}: <b>{r.a}</b> {satuan}<br />{labelB}: <b>{r.b}</b> {satuan}</>)}>
          <div className="sbar-lbl" style={{ width: lebarLabel }}>{r.label}</div>
          <div className="pbar-pair">
            <div className="pbar-line">{r.a > 0 && <div className="pbar-fill a" style={{ width: shown ? `${(r.a / max) * 100}%` : 0 }} />}<span>{r.a}</span></div>
            <div className="pbar-line">{r.b > 0 && <div className="pbar-fill" style={{ width: shown ? `${(r.b / max) * 100}%` : 0, background: r.color }} />}<span>{r.b}</span></div>
          </div>
        </div>
      ))}
      {tipEl}
    </div>
  );
}
