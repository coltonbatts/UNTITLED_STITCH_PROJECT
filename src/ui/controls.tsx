import type { ReactNode } from 'react';

export function Slider(props: {
  label: string; value: number; min: number; max: number; step: number;
  display?: (v: number) => string; ends?: [string, string];
  onInput: (v: number) => void; onCommit: () => void;
}) {
  const { label, value, min, max, step, display, ends, onInput, onCommit } = props;
  return (
    <div className="field">
      <label>{label}</label>
      <span className="value">{display ? display(value) : value}</span>
      <input
        className="slider wide" type="range" min={min} max={max} step={step} value={value}
        aria-label={label} aria-valuetext={display ? display(value) : String(value)}
        onChange={(e) => onInput(Number(e.target.value))}
        onPointerUp={onCommit} onKeyUp={onCommit} onBlur={onCommit}
      />
      {ends && <div className="ends"><span>{ends[0]}</span><span>{ends[1]}</span></div>}
    </div>
  );
}

export function NumberField(props: { label: string; value: number; unit?: string; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
  const { label, value, unit, min, max, step, onChange } = props;
  return (
    <div className="field">
      <label>{label}{unit ? ` (${unit})` : ''}</label>
      <input className="input" type="number" value={Number.isFinite(value) ? Math.round(value * 10) / 10 : ''} min={min} max={max} step={step ?? 1}
        aria-label={label} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) onChange(v); }} />
    </div>
  );
}

export function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check"><input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />{props.label}</label>
  );
}

export function Segmented<T extends string>(props: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="segmented" role="group" aria-label={props.ariaLabel}>
      {props.options.map((o) => (
        <button key={o.value} className={o.value === props.value ? 'active' : ''} aria-pressed={o.value === props.value} onClick={() => props.onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Section(props: { title: string; children: ReactNode }) {
  return <section><h2>{props.title}</h2>{props.children}</section>;
}
