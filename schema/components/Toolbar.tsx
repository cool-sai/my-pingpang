import type { JSX } from 'preact'

type Props = {
  title: string
  subtitle: string
  query: string
  zoom: number
  onQuery: (q: string) => void
  onFit: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  searchRef: { current: HTMLInputElement | null }
}

export function Toolbar({
  title,
  subtitle,
  query,
  zoom,
  onQuery,
  onFit,
  onZoomIn,
  onZoomOut,
  onReset,
  searchRef,
}: Props): JSX.Element {
  return (
    <header class="toolbar">
      <div class="toolbar-brand">
        <span class="brand-mark">◇</span>
        <div>
          <div class="brand-title">{title}</div>
          <div class="brand-sub">{subtitle}</div>
        </div>
      </div>
      <div class="toolbar-search">
        <kbd>/</kbd>
        <input
          ref={searchRef}
          id="search"
          type="search"
          placeholder="搜索集合、字段、类型、ref…"
          autocomplete="off"
          spellcheck={false}
          value={query}
          onInput={(e) => onQuery((e.target as HTMLInputElement).value)}
        />
      </div>
      <div class="toolbar-legend" aria-hidden="true">
        <span class="leg leg-ref">
          <i />
          ref
        </span>
        <span class="leg leg-copy">
          <i />
          copyFrom
        </span>
        <span class="leg leg-pk">
          <i />
          key
        </span>
      </div>
      <div class="toolbar-actions">
        <button type="button" class="btn" onClick={onFit} title="Fit (F)">
          Fit
        </button>
        <button type="button" class="btn" onClick={onZoomOut} title="Zoom out">
          −
        </button>
        <span class="zoom-label">{Math.round(zoom * 100)}%</span>
        <button type="button" class="btn" onClick={onZoomIn} title="Zoom in">
          +
        </button>
        <button type="button" class="btn" onClick={onReset} title="Reset layout">
          Reset
        </button>
      </div>
    </header>
  )
}
