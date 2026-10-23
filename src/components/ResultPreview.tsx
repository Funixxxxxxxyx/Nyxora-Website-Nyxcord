import { useEffect, useState } from 'react';
import { Maximize2, Scan } from 'lucide-react';
import type { ExportResult } from '../store/editor';
/** Shows the actual encoded file, never a second canvas render.
 * Fit is the default, including square (1:1) exports. Actual size is opt-in. */
export default function ResultPreview({ result }: {
    result: ExportResult;
}) {
    const [scale, setScale] = useState<'fit' | 'actual'>('fit');
    useEffect(() => { setScale('fit'); }, [result.url]);
    return <div className="result-visual">
    <div className="result-preview-top">
      <span>RESULT PREVIEW <span className="result-preview-resolution">/ {result.width} × {result.height}</span></span>
      <div className="result-view-switch" role="group" aria-label="Result preview zoom">
        <button type="button" className={scale === 'fit' ? 'active' : ''} aria-pressed={scale === 'fit'} onClick={() => setScale('fit')} title="Show complete output"><Maximize2 size={13}/> Fit</button>
        <button type="button" className={scale === 'actual' ? 'active' : ''} aria-pressed={scale === 'actual'} onClick={() => setScale('actual')} title="View at output pixel size"><Scan size={13}/> 100%</button>
      </div>
    </div>
    <div className={`result-preview-stage checkerboard ${scale === 'actual' ? 'actual-size' : 'fit-size'}`}>
      <img key={result.url} className="result-preview-image" src={result.url} alt={`Final exported image, ${result.width} by ${result.height} pixels`} draggable={false} style={scale === 'actual' ? { width: `${result.width}px`, height: `${result.height}px`, maxWidth: 'none', maxHeight: 'none' } : undefined}/>
    </div>
    <div className="result-preview-bottom"><span>{scale === 'fit' ? 'Entire output visible' : '1 image pixel = 1 screen pixel'}</span><span>Actual exported file</span></div>
  </div>;
}
