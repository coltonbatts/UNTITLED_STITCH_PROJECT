import { applyPreset, commitTransient, setView, updateDimensions, updateSettings, useAppState } from '@/app/store';
import { rotate } from '@/app/controller';
import { deriveEngineParams, PRESET_LABELS } from '@/engine/embroidery/params';
import { IDENTITY_ADJUST, isIdentityAdjust } from '@/engine/image/adjust';
import { DEFAULT_FABRIC_TOLERANCE, suggestFabricColor } from '@/engine/image/fabric';
import type { Hoop, Preset, StrandCount } from '@/engine/types';
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
  const fabric = settings.fabric ?? { enabled: false, hex: '#1f1a14', tolerance: DEFAULT_FABRIC_TOLERANCE };
  const setFabric = (patch: Partial<typeof fabric>, transient = false) => updateSettings({ fabric: { ...fabric, ...patch } }, { transient });
  const pickFromEdges = () => { if (s.sourceRaster) setFabric({ hex: suggestFabricColor(s.sourceRaster), enabled: true }); };

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
        <div className="field">
          <label htmlFor="preset">Preset</label>
          <select id="preset" className="select" value={settings.preset} onChange={(e) => applyPreset(e.target.value as Preset)}>
            {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => <option key={p} value={p}>{PRESET_LABELS[p]}</option>)}
          </select>
        </div>
        {settings.preset === 'flat' && <div className="note">Flat art: no smoothing, hard corners, a sparse palette, and thin strokes become line stitches.</div>}
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

      <Section title="Fabric">
        <Check label="Leave the fabric bare" checked={fabric.enabled}
          onChange={(on) => { if (on && !settings.fabric && s.sourceRaster) setFabric({ enabled: true, hex: suggestFabricColor(s.sourceRaster) }); else setFabric({ enabled: on }); }} />
        <div className="field">
          <label htmlFor="fabric-hex">Fabric colour</label>
          <div className="row">
            <input id="fabric-hex" type="color" className="input" style={{ width: 44, padding: 1, height: 24 }} value={fabric.hex} disabled={disabled || !fabric.enabled}
              onChange={(e) => setFabric({ hex: e.target.value }, true)} onBlur={commit} />
            <span className="num" style={{ alignSelf: 'center' }}>{fabric.hex}</span>
            <button className="btn" disabled={disabled} onClick={pickFromEdges}>Pick from edges</button>
          </div>
        </div>
        {fabric.enabled && (
          <Slider label="Tolerance" value={fabric.tolerance} min={0} max={1} step={0.01} display={pct} ends={['Exact', 'Loose']}
            onInput={(v) => setFabric({ tolerance: v }, true)} onCommit={commit} />
        )}
        <div className="note">Anything close to the fabric colour is left unstitched and drops out of the palette, the regions, and the estimate. Made for subjects stitched onto dark cloth.</div>
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
              {est.lineMm > 0 && <><dt>Line work</dt><dd>{s.result!.lines.strokes.length} lines · {num(est.lineMm / 10)} cm</dd></>}
              <dt>Stitches (rough)</dt><dd>~{fmtInt(est.stitchesApprox)}</dd>
            </dl>
            {s.result!.pattern.lineLegend.length > 0 && (
              <ul className="lines" aria-label="Line threads">
                {s.result!.pattern.lineLegend.map((row) => (
                  <li key={`${row.thread.number}-${row.stitch}`}>
                    <i className="sw" style={{ background: row.thread.hex }} />
                    <span className="num">DMC {row.thread.number}</span>
                    <span>{row.stitch} stitch · {row.strokeCount} line{row.strokeCount > 1 ? 's' : ''} · {Math.round(row.lengthMm)} mm</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="meter" aria-label={`Effort ${est.score} of 100`}><i style={{ width: `${est.score}%` }} /></div>
            <div className="note">Effort {est.score}/100 at {dimensions.strands} strand{dimensions.strands > 1 ? 's' : ''}, {fmtMm(dimensions.widthMm)} × {fmtMm(dimensions.heightMm)} mm. Stitch counts assume long-and-short stitch and are approximate.</div>
          </>
        ) : <div className="note">Import an image to see effort estimates.</div>}
      </Section>
    </aside>
  );
}
