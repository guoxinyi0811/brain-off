interface Props {
  search: string;
  busy: boolean;
  canAdd: boolean;
  onChange: (value: string) => void;
  onSearch: () => void;
  onAdd: () => void;
}

export function HomeActions({ search, busy, canAdd, onChange, onSearch, onAdd }: Props) {
  return <form className="home-actions" role="search" aria-label="搜索全部库存" onSubmit={event => {
    event.preventDefault(); onSearch();
  }}>
    <label><span className="sr-only">搜索食物</span><input type="search" value={search}
      onChange={event => onChange(event.target.value)} placeholder="搜索食物" /></label>
    <button type="submit" className="secondary">查找</button>
    <button type="button" className="primary" disabled={busy || !canAdd} onClick={onAdd}>＋ 添加食物</button>
  </form>;
}
