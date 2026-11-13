// Lightweight SVG charts (no chart library). Thin marks, recessive grid, hover tooltips.
import { useState, useRef } from 'react';
import { fmtNum } from '../lib/util';

export const SERIES_COLORS = { email: '#4f7fe8', sms: '#c7741f', whatsapp: '#1a9e8b', all: '#6fb3cc', delivered: '#1a9e8b', failed: '#e66767', replied: '#4f7fe8' };

function niceMax(v) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = Math.ceil(v / p);
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// Multi-series line chart with crosshair tooltip.
export function LineChart({ labels, series, height = 220, onPointClick, yFormat = fmtNum }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const W = 720, H = height, pl = 36, pr = 12, pt = 12, pb = 26;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = labels.length;
  const x = (i) => pl + (n <= 1 ? 0 : (i / (n - 1)) * (W - pl - pr));
  const y = (v) => pt + (1 - v / max) * (H - pt - pb);
  const ticks = [0, max / 2, max];
  const step = Math.max(1, Math.ceil(n / 7));
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pl) / (W - pl - pr)) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };
  return (
    <div style={{ position: 'relative' }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="chart-svg" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={() => hover != null && onPointClick?.(hover)} style={{ cursor: onPointClick ? 'pointer' : 'default' }} role="img" aria-label={`Line chart: ${series.map((s) => s.label).join(', ')}`}>
        {ticks.map((t) => <g key={t}><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t ? '2 4' : ''} /><text x={pl - 8} y={y(t) + 4} textAnchor="end">{yFormat(Math.round(t))}</text></g>)}
        {labels.map((l, i) => i % step === 0 && <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{l}</text>)}
        {series.map((s) => (
          <path key={s.key} d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pt} y2={H - pb} stroke="var(--border-strong)" />}
        {hover != null && series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r="4.5" fill={s.color} stroke="var(--bg-elev)" strokeWidth="2" />)}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%`, top: 0, transform: `translateX(${hover > n / 2 ? '-105%' : '8%'})` }}>
          <div className="strong" style={{ marginBottom: 4 }}>{labels[hover]}</div>
          {series.map((s) => <div key={s.key} className="row" style={{ gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />{s.label}<span className="strong" style={{ marginLeft: 'auto', paddingLeft: 12 }}>{yFormat(s.values[hover])}</span></div>)}
          {onPointClick && <div className="faint xs" style={{ marginTop: 4 }}>Click to view messages</div>}
        </div>
      )}
    </div>
  );
}

// Stacked vertical bars.
export function StackedBars({ labels, series, height = 220, onBarClick }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = height, pl = 36, pr = 8, pt = 10, pb = 26;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + s.values[i], 0));
  const max = niceMax(Math.max(1, ...totals));
  const n = labels.length;
  const bw = Math.max(4, ((W - pl - pr) / n) * 0.62);
  const x = (i) => pl + ((i + 0.5) / n) * (W - pl - pr) - bw / 2;
  const h = (v) => (v / max) * (H - pt - pb);
  const step = Math.max(1, Math.ceil(n / 8));
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Stacked bar chart" onMouseLeave={() => setHover(null)}>
        {[0, max / 2, max].map((t) => <g key={t}><line x1={pl} x2={W - pr} y1={H - pb - h(t)} y2={H - pb - h(t)} stroke="var(--border)" strokeDasharray={t ? '2 4' : ''} /><text x={pl - 8} y={H - pb - h(t) + 4} textAnchor="end">{fmtNum(Math.round(t))}</text></g>)}
        {labels.map((l, i) => {
          let acc = 0;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onClick={() => onBarClick?.(i)} style={{ cursor: onBarClick ? 'pointer' : 'default' }}>
              <rect x={x(i) - 4} y={pt} width={bw + 8} height={H - pt - pb} fill="transparent" />
              {series.map((s, si) => {
                const v = s.values[i];
                if (!v) return null;
                const yTop = H - pb - h(acc + v);
                const hh = Math.max(1, h(v) - (acc > 0 ? 2 : 0));
                acc += v;
                const isTop = series.slice(si + 1).every((o) => !o.values[i]);
                return <rect key={s.key} x={x(i)} y={yTop} width={bw} height={hh} rx={isTop ? 3 : 0} fill={s.color} opacity={hover == null || hover === i ? 1 : 0.55} />;
              })}
              {i % step === 0 && <text x={x(i) + bw / 2} y={H - 6} textAnchor="middle">{l}</text>}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${((x(hover) + bw / 2) / W) * 100}%`, top: 0, transform: `translateX(${hover > n / 2 ? '-105%' : '8%'})` }}>
          <div className="strong" style={{ marginBottom: 4 }}>{labels[hover]}</div>
          {series.map((s) => <div key={s.key} className="row" style={{ gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />{s.label}<span className="strong" style={{ marginLeft: 'auto', paddingLeft: 12 }}>{fmtNum(s.values[hover])}</span></div>)}
          <div className="faint xs" style={{ marginTop: 4 }}>Total {fmtNum(totals[hover])}</div>
        </div>
      )}
    </div>
  );
}

// Horizontal bars with direct labels — used for channel breakdown and comparisons.
export function HBars({ rows, format = fmtNum, onRowClick, max: forcedMax }) {
  const max = forcedMax || Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="col" style={{ gap: 12 }}>
      {rows.map((r) => (
        <button key={r.key} type="button" onClick={() => onRowClick?.(r)} className="col" style={{ gap: 5, background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: onRowClick ? 'pointer' : 'default' }} title={`${r.label}: ${format(r.value)}`}>
          <div className="between small"><span className="row" style={{ gap: 8 }}>{r.icon}{r.label}</span><span className="strong">{format(r.value)}{r.sub && <span className="faint" style={{ fontWeight: 400, marginLeft: 6 }}>{r.sub}</span>}</span></div>
          <div style={{ height: 8, background: 'var(--bg-active)', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${(r.value / max) * 100}%`, background: r.color || 'var(--accent)', borderRadius: 4 }} /></div>
        </button>
      ))}
    </div>
  );
}

export const Legend = ({ items }) => <div className="legend">{items.map((i) => <span key={i.key}><i style={{ background: i.color }} />{i.label}</span>)}</div>;
