import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { ratioNumber, useEditor } from '../store/editor';
import { rotateRect, rotatedSize, unrotateRect } from '../lib/rotation';
/** These controls edit the source selection, not the exported image dimensions. */
export default function CropSizeFields() {
    const meta = useEditor(s => s.meta);
    const crop = useEditor(s => s.crop);
    const ratio = useEditor(s => s.ratio);
    const rotation = useEditor(s => s.rotation);
    const dimensions = rotatedSize(meta?.width || 1, meta?.height || 1, rotation);
    const oriented = rotateRect(crop, meta?.width || 1, meta?.height || 1, rotation);
    const setCrop = useEditor(s => s.setCrop);
    const [widthDraft, setWidthDraft] = useState(String(Math.round(oriented.width)));
    const [heightDraft, setHeightDraft] = useState(String(Math.round(oriented.height)));
    useEffect(() => setWidthDraft(String(Math.round(oriented.width))), [oriented.width]);
    useEffect(() => setHeightDraft(String(Math.round(oriented.height))), [oriented.height]);
    function commit(axis: 'width' | 'height') {
        if (!meta)
            return;
        const raw = Number(axis === 'width' ? widthDraft : heightDraft);
        if (!Number.isFinite(raw) || raw < 1) {
            setWidthDraft(String(Math.round(oriented.width)));
            setHeightDraft(String(Math.round(oriented.height)));
            return;
        }
        const sourceRatio = ratioNumber(ratio, meta);
        const aspect = sourceRatio && ratio === 'original' && (rotation === 90 || rotation === 270) ? 1 / sourceRatio : sourceRatio;
        let width = axis === 'width' ? Math.min(dimensions.width, Math.round(raw)) : oriented.width;
        let height = axis === 'height' ? Math.min(dimensions.height, Math.round(raw)) : oriented.height;
        if (aspect) {
            if (axis === 'width') {
                height = Math.min(dimensions.height, Math.max(1, Math.round(width / aspect)));
                width = Math.min(width, Math.max(1, Math.round(height * aspect)));
            }
            else {
                width = Math.min(dimensions.width, Math.max(1, Math.round(height * aspect)));
                height = Math.min(height, Math.max(1, Math.round(width / aspect)));
            }
        }
        // Preserve the center as far as the source bounds allow.
        const centerX = oriented.x + oriented.width / 2;
        const centerY = oriented.y + oriented.height / 2;
        setCrop(unrotateRect({
            x: Math.max(0, Math.min(dimensions.width - width, centerX - width / 2)),
            y: Math.max(0, Math.min(dimensions.height - height, centerY - height / 2)),
            width, height,
        }, meta.width, meta.height, rotation));
        const updated = useEditor.getState().crop;
        const shown = rotateRect(updated, meta.width, meta.height, rotation);
        setWidthDraft(String(Math.round(shown.width)));
        setHeightDraft(String(Math.round(shown.height)));
    }
    function keys(e: KeyboardEvent<HTMLInputElement>, axis: 'width' | 'height') {
        if (e.key === 'Enter')
            e.currentTarget.blur();
        if (e.key === 'Escape') {
            if (axis === 'width')
                setWidthDraft(String(Math.round(oriented.width)));
            else
                setHeightDraft(String(Math.round(oriented.height)));
            e.currentTarget.blur();
        }
    }
    return <div className="crop-dimension-fields">
    <div className="field-grid">
      <label className="field"><span>Crop width (px)</span><input type="number" min={1} max={dimensions.width} inputMode="numeric" value={widthDraft} onChange={e => setWidthDraft(e.target.value)} onBlur={() => commit('width')} onKeyDown={e => keys(e, 'width')}/></label>
      <div className="dimension-chain" title={ratio === 'free' ? 'Free aspect ratio' : 'Crop aspect ratio locked'} aria-label={ratio === 'free' ? 'Free aspect ratio' : 'Crop aspect ratio locked'}>
        {ratio === 'free' ? <LockKeyholeOpen size={16}/> : <LockKeyhole size={16}/>}
      </div>
      <label className="field"><span>Crop height (px)</span><input type="number" min={1} max={dimensions.height} inputMode="numeric" value={heightDraft} onChange={e => setHeightDraft(e.target.value)} onBlur={() => commit('height')} onKeyDown={e => keys(e, 'height')}/></label>
    </div>
    <p className="crop-fields-note">{ratio === 'free' ? 'Free crop · dimensions can be adjusted independently.' : 'Aspect ratio locked · editing one value updates the other.'}</p>
  </div>;
}
