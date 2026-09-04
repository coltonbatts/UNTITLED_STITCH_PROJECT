import { commitTransient, setView, updateDimensions, updateSettings, useAppState } from '@/app/store';
import { rotate } from '@/app/controller';
import { deriveEngineParams } from '@/engine/embroidery/params';
import { IDENTITY_ADJUST, isIdentityAdjust } from '@/engine/image/adjust';
import type { Hoop, StrandCount } from '@/engine/types';
import { Check, NumberField, Section, Slider } from './controls';
import { fmtInt, fmtMm } from './viewModel';

const HOOPS: Array<{ id: string; label: string; hoop?: Hoop }> = [
  { id: 'none', label: 'No hoop' },
  ...[100, 130, 150, 180, 200, 230, 250, 300].map((d) => ({ id: `r${d}`, label: `Round ${d} mm (${(d / 25.4).toFixed(0)}″)`, hoop: { kind: 'round', diameterMm: d } as Hoop })),
];
const hoopId = (h?: Hoop) => (h ? HOOPS.find((x) => x.hoop && x.hoop.kind === h.kind && (h.kind === 'round' ? (x.hoop as { diameterMm: number }).diameterMm === h.diameterMm : false))?.id ?? 'none' : 'none');
const pct = (v: number) => `${Math.round(v * 100)}`;

export function Inspector() {
  const s = useAppState();
  const { settings, dimensions } = s.project;
  const disabled = s.status === 'empty';
  const params = deriveEngineParams(settings, dimensions);
  const aspect = dimensions.widthMm / dimensions.heightMm;
  const est = s.result?.pattern.estimates;
  const commit = () => commitTransient();
  const num = (v: number) => (v < 10 ? v.toFixed(1) : Math.round(v).toString());
  const adj = settings.colorAdjust ?? IDENTITY_ADJUST;
  const setAdj = (patch: Partial<typeof adj>) => updateSettings({ colorAdjust: { ...adj, ...patch } }, { transient: true });
  const signedPct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;

  return (
    <aside className="inspector" aria-label="Inspector">
      <Section title="Embroidery size">
        <NumberField label="Width" unit="mm" value={dimensions.widthMm} min={20} max={600} onChange={(w) => updateDimensions({ widthMm: w, heightMm: Math.round((w / aspect) * 10) / 10 })} />
        <NumberField label="Height" unit="mm" value={dimensions.heightMm} min={20} max={600} onChange={(h) => updateDimensions({ heightMm: h, widthMm: Math.round(h * aspect * 10) / 10 })} />
        <div className="field">
          <label htmlFor="hoop">Hoop</label>
          <select id="hoop" className="select" value={hoopId(dimensions.hoop)} onChange={(e) => updateDimensions({ hoop: HOOPS.find((h) => h.id === e.target.value)?.hoop })}>
            {HOOPS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="strands">Strands</label>
          <select id="strands" className="select" value={dimensions.strands} onChange={(e) => updateDimensions({ strands: Number(e.target.value) as StrandCount })}>
            {[1, 2, 3, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="row">
          <button className="btn" disabled={disabled} onClick={() => rotate(-90)}>↺ Rotate</button>
          <button className="btn" disabled={disabled} onClick={() => rotate(90)}>↻ Rotate</button>
        </div>
      </Section>

      <Section title="Translation">
        <Slider label="Thread colours" value={settings.threadCount} min={4} max={40} step={1} ends={['4', '40']}
          onInput={(v) => updateSettings({ threadCount: v }, { transient: true })} onCommit={commit} />
        <Slider label="Fidelity" value={settings.fidelity} min={0} max={1} step={0.01} display={pct} ends={['Simplified', 'Detailed']}
          onInput={(v) => updateSettings({ fidelity: v }, { transient: true })} onCommit={commit} />
        <Slider label="Complexity" value={settings.complexity} min={0} max={1} step={0.01} display={pct} ends={['Relaxed', 'Intense']}
          onInput={(v) => updateSettings({ complexity: v }, { transient: true })} onCommit={commit} />
        <Slider label="Colour fidelity" value={settings.colorFidelity} min={0} max={1} step={0.01} display={pct} ends={['Fewer threads', 'Exact colour']}
          onInput={(v) => updateSettings({ colorFidelity: v }, { transient: true })} onCommit={commit} />
        <Check label="Set minimum detail by hand" checked={settings.minDetailMm !== undefined}
          onChange={(on) => updateSettings({ minDetailMm: on ? Math.round(params.minFeatureMm * 10) / 10 : undefined })} />
        {settings.minDetailMm !== undefined ? (
          <Slider label="Minimum detail" value={settings.minDetailMm} min={0.4} max={5} step={0.1} display={(v) => `${v.toFixed(1)} mm`} ends={['0.4 mm', '5 mm']}
            onInput={(v) => updateSettings({ minDetailMm: v }, { transient: true })} onCommit={commit} />
        ) : (
          <div className="note">Ignoring details smaller than about <b className="num">{params.minFeatureMm.toFixed(1)} mm</b> ({params.minAreaMm2.toFixed(1)} mm²), up to {params.maxRegions} regions.</div>
        )}
      </Section>

      <Section title="Colour">
        <Slider label="Hue" value={adj.hue} min={-180} max={180} step={1} display={(v) => `${v > 0 ? '+' : ''}${v}°`} ends={['−180°', '+180°']}
          onInput={(v) => setAdj({ hue: v })} onCommit={commit} />
        <Slider label="Saturation" value={adj.saturation} min={-1} max={1} step={0.01} display={signedPct} ends={['Grey', 'Vivid']}
          onInput={(v) => setAdj({ saturation: v })} onCommit={commit} />
        <Slider label="Lightness" value={adj.lightness} min={-1} max={1} step={0.01} display={signedPct} ends={['Darker', 'Lighter']}
          onInput={(v) => setAdj({ lightness: v })} onCommit={commit} />
        <div className="row">
          <button className="btn" disabled={disabled || isIdentityAdjust(adj)} onClick={() => updateSettings({ colorAdjust: { ...IDENTITY_ADJUST } })}>Reset colour</button>
        </div>
        <div className="note">Grading is applied to the photo before thread matching, so the palette re-picks real DMC threads for the new colours.</div>
      </Section>

      <Section title="Pattern">
        <Slider label="Outline strength" value={settings.outlineStrength} min={0} max={1} step={0.01} display={pct} ends={['Hairline', 'Bold']}
          onInput={(v) => updateSettings({ outlineStrength: v }, { transient: true })} onCommit={commit} />
        <Check label="DMC labels" checked={s.view.showLabels} onChange={(v) => setView({ showLabels: v })} />
        <Check label="Tint regions with thread colour" checked={s.view.tintRegions} onChange={(v) => setView({ tintRegions: v })} />
        <Check label="Show hoop" checked={s.view.showHoop} onChange={(v) => setView({ showHoop: v })} />
      </Section>

      <Section title="Estimate">
        {est ? (
          <>
            <dl className="stats">
              <dt>Regions</dt><dd>{fmtInt(est.regionCount)}</dd>
              <dt>Threads used</dt><dd>{est.threadCount}</dd>
              <dt>Boundary length</dt><dd>{num(est.boundaryMm / 10)} cm</dd>
              <dt>Stitched area</dt><dd>{num(est.areaMm2 / 100)} cm²</dd>
              <dt>Stitches (rough)</dt><dd>~{fmtInt(est.stitchesApprox)}</dd>
            </dl>
            <div className="meter" aria-label={`Effort ${est.score} of 100`}><i style={{ width: `${est.score}%` }} /></div>
            <div className="note">Effort {est.score}/100 at {dimensions.strands} strand{dimensions.strands > 1 ? 's' : ''}, {fmtMm(dimensions.widthMm)} × {fmtMm(dimensions.heightMm)} mm. Stitch counts assume long-and-short stitch and are approximate.</div>
          </>
        ) : <div className="note">Import an image to see effort estimates.</div>}
      </Section>
    </aside>
  );
}
