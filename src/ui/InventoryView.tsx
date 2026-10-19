import type { InventoryItem, InventoryState } from '../domain/model.ts';
import { emptyInventoryQuery, queryInventory } from '../domain/inventory-query.ts';
import type { ExpirationFilter, InventoryQuery, InventorySort } from '../domain/inventory-query.ts';
import { expiryLabel, locationName, storageLocations } from './labels.ts';
import { quantityLabel } from '../domain/quantity.ts';

interface Props {
  state: InventoryState;
  today: string;
  query: InventoryQuery;
  busy: boolean;
  onQuery: (query: InventoryQuery) => void;
  onLocate: (item: InventoryItem) => void;
  onEdit: (item: InventoryItem) => void;
  onRemove: (item: InventoryItem) => void;
  onAdd: () => void;
}

export function InventoryView({ state, today, query, busy, onQuery, onLocate, onEdit, onRemove, onAdd }: Props) {
  const results = queryInventory(state.items, query, today);
  const filtered = query.search.trim() !== '' || query.locationId !== '' || query.expiration !== 'all' || query.sort !== 'expiration';
  return <section className="inventory-view" id="inventory" aria-label="全部库存">
    <div className="inventory-tools">
      <label className="search-field"><span className="sr-only">搜索食物</span><input type="search" value={query.search}
        onChange={event => onQuery({ ...query, search: event.target.value })} placeholder="搜索食物" /></label>
      <button className="primary inventory-add" disabled={busy} onClick={onAdd}><span aria-hidden="true">＋</span> 添加食物</button>
      <div className="inventory-filters">
        <label><span className="sr-only">库存位置</span><select value={query.locationId} onChange={event => onQuery({ ...query, locationId: event.target.value })}>
          <option value="">全部位置</option>{storageLocations(state).map(node => <option key={node.id} value={node.id}>{locationName(state, node.id)}</option>)}
        </select></label>
        <label><span className="sr-only">到期状态</span><select value={query.expiration} onChange={event => onQuery({ ...query, expiration: event.target.value as ExpirationFilter })}>
          <option value="all">全部状态</option><option value="due-soon">3 天内到期</option><option value="past-date">已过期</option><option value="later">超过 3 天到期</option><option value="unknown">保质期待确认</option>
        </select></label>
        <label><span className="sr-only">库存排序</span><select value={query.sort} onChange={event => onQuery({ ...query, sort: event.target.value as InventorySort })}>
          <option value="expiration">到期日优先</option><option value="name">按名称排序</option>
        </select></label>
        {filtered && <button className="text-button clear-filters" onClick={() => onQuery({ ...emptyInventoryQuery })}>清除筛选</button>}
      </div>
    </div>
    <p className="inventory-result-count" role="status" aria-live="polite">{results.length} / {state.items.length} 条</p>
    {results.length ? <ul className="inventory-results">{results.map(item => {
      const expiry = expiryLabel(item.expiration, today);
      const path = locationName(state, item.locationId);
      return <li key={item.id} className="inventory-row">
        <div className="inventory-name"><h2>{item.name}{item.quantity && <span className="food-quantity">{quantityLabel(item)}</span>}</h2><button className="location-link" aria-label={`在冰箱中定位${item.name}：${path}`} onClick={() => onLocate(item)}>{path}<span aria-hidden="true"> ↗</span></button></div>
        <div className="inventory-expiration"><p className={`expiry ${expiry.status}`}>{expiry.text}</p><span>{expiry.detail}</span></div>
        <div className="inventory-actions"><button className="text-button" disabled={busy} aria-label={`编辑或移动${item.name}`} onClick={() => onEdit(item)}>编辑</button><button className="text-button" disabled={busy} aria-label={`移除${item.name}`} onClick={() => onRemove(item)}>移除</button></div>
      </li>;
    })}</ul> : <p className="inventory-empty">{state.items.length ? '没有匹配的食物' : '暂无食物'}</p>}
  </section>;
}
