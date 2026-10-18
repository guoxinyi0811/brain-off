import type { InventoryState, StorageNode } from '../domain/model.ts';
import { expiryLabel, label } from './labels.ts';

interface Props { state: InventoryState; selected: string; today: string; onSelect: (id: string) => void }
export function Fridge({ state, selected, today, onSelect }: Props) {
  function renderNode(node: StorageNode) {
    const children = state.locations.filter(n => n.parentId === node.id).sort((a, b) => a.order - b.order);
    const items = state.items.filter(item => item.locationId === node.id);
    const due = items.filter(item => expiryLabel(item.expiration, today).status !== 'later').length;
    const purposes = state.purposes.filter(p => p.locationId === node.id)
      .map(p => label(state.categories.find(c => c.id === p.categoryId)!.label));
    return <div key={node.id} className={`storage-node ${node.kind}`}>
      {node.canHoldItems ? <button type="button" className={`storage-zone ${selected === node.id ? 'selected' : ''}`}
        onClick={() => onSelect(node.id)} aria-pressed={selected === node.id}
        aria-label={`${label(node.label)}，${items.length} 件食物${due ? `，${due} 件需留意` : ''}`}>
        <span className="zone-top"><span>{label(node.label)}</span><span className="zone-count">{items.length.toString().padStart(2, '0')}</span></span>
        <span className="zone-content">{items.length ? items.slice(0, 3).map(item => <span className="food-token" key={item.id}>
          <span className={`food-dot ${expiryLabel(item.expiration, today).status}`} />{item.name}
        </span>) : <span className="zone-empty">空出一点空间，装下新鲜</span>}{items.length > 3 && <span className="food-token">+{items.length - 3}</span>}</span>
        <span className="zone-bottom"><span>{purposes.join(' · ') || '尚未设置用途'}</span>{due > 0 && <span className="due-dot" aria-hidden="true" />}</span>
      </button> : <div className="compartment-label"><span>{node.kind === 'compartment' && node.id === 'freezer' ? '❄' : '○'} {label(node.label)}</span><span>{node.id === 'freezer' ? 'FREEZER' : 'STORAGE'}</span></div>}
      {children.map(renderNode)}
    </div>;
  }
  return <div className="fridge-wrap"><div className="fridge-shell">
    <div className="fridge-brand"><span>brain off</span><span className="power-dot" aria-hidden="true" /></div>
    <div className="fridge-interior">{state.locations.filter(node => node.parentId === null).sort((a, b) => a.order - b.order).map(renderNode)}</div>
    <div className="fridge-base"><span /><span /></div>
  </div><p className="fridge-caption">点击一个位置，看看里面有什么</p></div>;
}
