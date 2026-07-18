import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface SizeStock {
  taglia: string;
  stock: number;
}

/** Common size presets offered as quick-add chips, grouped by kind. */
const PRESETS: { label: string; sizes: string[] }[] = [
  { label: 'Lettere', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { label: 'Numeri (IT)', sizes: ['38', '40', '42', '44', '46', '48', '50'] },
  { label: 'Scarpe (EU)', sizes: ['35', '36', '37', '38', '39', '40', '41'] },
  { label: 'Unica', sizes: ['Unica'] },
];

/**
 * Structured taglia ↔ stock editor. Left column lists the size labels, right
 * column holds an admin-editable stock quantity for each. Replaces the old
 * free-text "S:10, M:5" input so quantities can't be mistyped into a string.
 */
export function SizeStockEditor({
  value,
  onChange,
}: {
  value: SizeStock[];
  onChange: (next: SizeStock[]) => void;
}) {
  const [custom, setCustom] = useState('');

  const has = (t: string) => value.some((s) => s.taglia.toLowerCase() === t.toLowerCase());

  function addSize(taglia: string) {
    const t = taglia.trim();
    if (!t || has(t)) return;
    onChange([...value, { taglia: t, stock: 0 }]);
  }

  function addCustom() {
    // Allow comma/space separated bulk entry: "S, M, L".
    custom
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach(addSize);
    setCustom('');
  }

  function setStock(taglia: string, stock: number) {
    onChange(value.map((s) => (s.taglia === taglia ? { ...s, stock } : s)));
  }

  function remove(taglia: string) {
    onChange(value.filter((s) => s.taglia !== taglia));
  }

  const totalStock = value.reduce((n, s) => n + (Number(s.stock) || 0), 0);

  return (
    <div className="space-y-4">
      {/* Quick-add presets */}
      <div className="space-y-2">
        {PRESETS.map((group) => (
          <div key={group.label} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 w-24 shrink-0 text-xs font-medium text-muted-foreground">{group.label}</span>
            {group.sizes.map((sz) => {
              const active = has(sz);
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => (active ? remove(sz) : addSize(sz))}
                  className={
                    'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ' +
                    (active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background hover:bg-muted')
                  }
                >
                  {sz}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Custom size add */}
      <div className="flex items-center gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Aggiungi taglia personalizzata (es. 3XL)…"
          className="h-9"
        />
        <Button type="button" variant="outline" size="sm" onClick={addCustom} disabled={!custom.trim()}>
          <Plus /> Aggiungi
        </Button>
      </div>

      {/* Taglia ↔ stock rows */}
      {value.length > 0 ? (
        <div className="overflow-hidden rounded-md border">
          <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span className="flex-1">Taglia</span>
            <span className="w-28 text-right">Stock disponibile</span>
            <span className="w-8" />
          </div>
          {value.map((s) => (
            <div key={s.taglia} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
              <span className="flex-1 font-medium">{s.taglia}</span>
              <Input
                type="number"
                min={0}
                value={String(s.stock)}
                onChange={(e) => setStock(s.taglia, Math.max(0, Number(e.target.value) || 0))}
                className={
                  'h-8 w-28 text-right ' + (Number(s.stock) === 0 ? 'text-destructive' : '')
                }
              />
              <button
                type="button"
                onClick={() => remove(s.taglia)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                aria-label={`Rimuovi taglia ${s.taglia}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-3 bg-muted/30 px-3 py-2 text-sm">
            <span className="flex-1 font-medium">Totale</span>
            <span className="w-28 text-right font-semibold">{totalStock}</span>
            <span className="w-8" />
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Nessuna taglia. Aggiungi una taglia dai preset o dal campo personalizzato, poi imposta lo stock.
        </p>
      )}
    </div>
  );
}
