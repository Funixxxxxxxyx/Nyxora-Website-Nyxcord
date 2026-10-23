import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { orientedCrop, useEditor } from '../store/editor';
export default function CanvasSizeFields() {
    const width = useEditor(s => s.outputWidth);
    const height = useEditor(s => s.outputHeight);
    const crop = useEditor(s => s.crop);
    const rotation = useEditor(s => s.rotation);
    const bounds = orientedCrop(crop, rotation);
    const setWidth = useEditor(s => s.setWidth);
    const setHeight = useEditor(s => s.setHeight);
    const [widthDraft, setWidthDraft] = useState(String(width));
    const [heightDraft, setHeightDraft] = useState(String(height));
    useEffect(() => setWidthDraft(String(width)), [width]);
    useEffect(() => setHeightDraft(String(height)), [height]);
    function commit(axis: 'width' | 'height', draftValue?: string) {
        const draft = draftValue ?? (axis === 'width' ? widthDraft : heightDraft);
        const numeric = Number(draft);
        if (Number.isFinite(numeric) && numeric >= 1) {
            if (axis === 'width') {
                setWidth(numeric);
                setWidthDraft(String(useEditor.getState().outputWidth));
            }
            else {
                setHeight(numeric);
                setHeightDraft(String(useEditor.getState().outputHeight));
            }
        }
        else {
            if (axis === 'width')
                setWidthDraft(String(width));
            else
                setHeightDraft(String(height));
        }
    }
    function handleKeys(event: KeyboardEvent<HTMLInputElement>, axis: 'width' | 'height') {
        if (event.key === 'Enter') {
            event.currentTarget.blur();
        }
        else if (event.key === 'Escape') {
            if (axis === 'width')
                setWidthDraft(String(width));
            else
                setHeightDraft(String(height));
            event.currentTarget.blur();
        }
    }
    function update(axis: 'width' | 'height', next: string) {
        if (axis === 'width') setWidthDraft(next); else setHeightDraft(next);
        if (/^[1-9]\d*$/.test(next)) commit(axis, next);
    }
    return <div className="field-grid">
    <label className="field"><span>Width (px)</span><input aria-label="Canvas width in pixels" type="number" inputMode="numeric" min="1" max={Math.floor(bounds.width)} value={widthDraft} onChange={e => update('width', e.target.value)} onBlur={() => commit('width')} onKeyDown={e => handleKeys(e, 'width')}/></label>
    <div className="dimension-chain" aria-label="Aspect ratio locked" title="Aspect ratio locked"><LockKeyhole size={16}/></div>
    <label className="field"><span>Height (px)</span><input aria-label="Canvas height in pixels" type="number" inputMode="numeric" min="1" max={Math.floor(bounds.height)} value={heightDraft} onChange={e => update('height', e.target.value)} onBlur={() => commit('height')} onKeyDown={e => handleKeys(e, 'height')}/></label>
  </div>;
}
