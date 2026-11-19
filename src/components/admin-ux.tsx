import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CornerDownLeft, Search, X } from "lucide-react";

export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="search-field admin-search">
      <Search aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")}>
          <X aria-hidden="true" />
        </button>
      )}
    </label>
  );
}

export function FilterChips<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string; count?: number }[];
}) {
  return (
    <div className="filter-chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          className={value === option.id ? "active" : ""}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {option.count !== undefined && <span>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function AdminSkeleton() {
  return (
    <div className="admin-layout admin-skeleton" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading administration…</span>
      <aside className="admin-sidebar">
        <div className="admin-sidebar-inner">
          {Array.from({ length: 5 }, (_, index) => (
            <i className="skeleton-line nav" key={index} />
          ))}
        </div>
      </aside>
      <section className="admin-content">
        <i className="skeleton-line title" />
        <div className="skeleton-stats">
          {Array.from({ length: 4 }, (_, index) => (
            <i className="skeleton-block" key={index} />
          ))}
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <i className="skeleton-line row" key={index} />
        ))}
      </section>
    </div>
  );
}

export type CommandItem = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  keywords?: string;
  run: () => void;
};

export function CommandPalette({ items, onClose }: { items: CommandItem[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return items.filter((item) => !item.group.startsWith("Find"));
    return items
      .filter((item) => {
        const haystack = `${item.label} ${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, 30);
  }, [items, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(item: CommandItem | undefined) {
    if (!item) return;
    onClose();
    item.run();
  }

  let lastGroup = "";
  return (
    <div
      className="viewer-backdrop command-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search or jump to"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => Math.min(current + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(results[active]);
          }
        }}
      >
        <div className="command-input">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search students, registrations, modules, or jump to a section…"
            aria-label="Search or jump to"
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-results" id="command-results" role="listbox" ref={listRef}>
          {results.length === 0 && <p className="command-empty">Nothing matches “{query}”.</p>}
          {results.map((item, index) => {
            const heading = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {heading && <p className="command-group">{heading}</p>}
                <button
                  type="button"
                  role="option"
                  id={`command-${item.id}`}
                  data-index={index}
                  aria-selected={index === active}
                  className={index === active ? "active" : ""}
                  onMouseMove={() => setActive(index)}
                  onClick={() => choose(item)}
                >
                  <span className="command-icon">{item.icon}</span>
                  <span className="command-copy">
                    <strong>{item.label}</strong>
                    {item.hint && <small>{item.hint}</small>}
                  </span>
                  {index === active && <CornerDownLeft aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>
        <p className="command-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>Enter</kbd> to open
          </span>
        </p>
      </div>
    </div>
  );
}
