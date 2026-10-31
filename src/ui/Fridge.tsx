import type { CSSProperties } from 'react';
import type { InventoryState } from '../domain/model.ts';
import { fridgeGeometry as geometry, regionOutline } from '../config/fridge-geometry.ts';
import { label } from './labels.ts';
import { quantityLabel } from '../domain/quantity.ts';
import { fridgeSummary } from './fridgeSummary.ts';

interface Props { state: InventoryState; selected: string; today: string; onSelect: (id: string) => void }
export function Fridge({ state, selected, today, onSelect }: Props) {
  const regions = geometry.regions.filter(region => state.locations.some(node => node.id === region.locationId));
  const unmapped = state.locations.filter(node => node.canHoldItems && !regions.some(region => region.locationId === node.id));
  return <div className="fridge-visual">
    <div className="drawing-labels" aria-hidden="true"><span>冷藏 / 冷冻</span><span>门架</span></div>
    <div className="fridge-drawing" style={{ aspectRatio: `${geometry.width} / ${geometry.height}` }}>
      <svg className="fridge-outline" viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true">
        {geometry.frames.map((frame, index) => <rect key={index} {...frame} />)}
        {geometry.lines.map((line, index) => <path key={index} {...line} />)}
        {geometry.captions.map(caption => <text key={caption.text} x={caption.x} y={caption.y} textAnchor="middle" className="drawing-caption">{caption.text}</text>)}
      </svg>
      {regions.map(region => {
        const node = state.locations.find(node => node.id === region.locationId)!;
        const summary = fridgeSummary(state.items, node.id, today);
        const limit = region.width >= 180 && region.height >= 64 ? 2 : 1;
        const preview = summary.items.slice(0, limit);
        const style: CSSProperties = { left: `${region.x / geometry.width * 100}%`, top: `${region.y / geometry.height * 100}%`, width: `${region.width / geometry.width * 100}%`, height: `${region.height / geometry.height * 100}%` };
        return <button key={node.id} className={`drawing-region ${region.shape} ${region.height < 64 ? 'short-region' : ''} ${selected === node.id ? 'selected' : ''}`} style={style}
          type="button" aria-pressed={selected === node.id} aria-controls="location-details" data-location-id={node.id}
          aria-label={`${label(node.label)}，${summary.count} 条库存${summary.attentionText ? `，${summary.attentionText}` : ''}${preview.length ? `，${preview.map(item => item.name).join('、')}${summary.count > preview.length ? `，另 ${summary.count - preview.length} 条` : ''}` : ''}`}
          onClick={() => onSelect(node.id)}>
          <svg viewBox={`0 0 ${region.width} ${region.height}`} preserveAspectRatio="none" aria-hidden="true">
            <path d={regionOutline(region)} className="region-surface" />
            {region.shape === 'shelf' ? <path d={`M2 ${region.height - 3}H${region.width - 2}`} className="shelf-edge" />
              : <path d={`M4 11H${region.width - 4}`} className="bin-rim" />}
            {region.shape === 'drawer' && <path d={`M${region.width / 2 - 15} ${region.height - 13}h30`} className="drawer-handle" />}
          </svg>
          <span className="region-mark" aria-hidden="true">{region.mark}</span>
          <span className="region-content" aria-hidden="true">{preview.map((item, index) => <span className="region-item-line" key={item.id}>
            <span className="region-item-name" title={`${item.name}${item.quantity ? ` · ${quantityLabel(item)}` : ''}`}>{item.name}{item.quantity && ` · ${quantityLabel(item)}`}</span>
            {index === preview.length - 1 && summary.count > preview.length && <span className="region-more region-more-wide">+{summary.count - preview.length}</span>}
            {index === 0 && summary.count > 1 && <span className="region-more region-more-compact">+{summary.count - 1}</span>}
          </span>)}</span>
          <span className="region-count" aria-hidden="true" title={`${summary.count} 条库存`}>{summary.count > 99 ? '99+' : summary.count || ''}{summary.attentionCount > 0 && <b title={summary.attentionText}>!</b>}</span>
        </button>;
      })}
    </div>
    {unmapped.length > 0 && <div className="other-locations">{unmapped.map(node => <button key={node.id} data-location-id={node.id} aria-pressed={selected === node.id} onClick={() => onSelect(node.id)}>{label(node.label)}</button>)}</div>}
  </div>;
}
