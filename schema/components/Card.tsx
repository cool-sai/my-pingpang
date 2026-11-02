import type { JSX } from 'preact'
import type { CollectionDef, FieldDef } from '../../cloudfunctions/common/models'
import { asList, portId, type Selection } from '../lib'

type Props = {
  name: string
  col: CollectionDef
  x: number
  y: number
  dim: boolean
  active: boolean
  hot: boolean
  selection: Selection
  hotPorts: Set<string>
  onSelectField: (collection: string, field: string, path: string) => void
  onSelectCollection: (name: string) => void
  onJump: (path: string) => void
  onHot: (ports: string[]) => void
  onHotClear: () => void
  onDragStart: (name: string, e: PointerEvent) => void
}

function MetaChips({
  field,
  isKey,
  onJump,
}: {
  field: FieldDef
  isKey?: boolean
  onJump: (path: string) => void
}): JSX.Element | null {
  const chips: JSX.Element[] = []
  if (isKey) chips.push(<span class="chip chip-pk">key</span>)
  if (field.optional) chips.push(<span class="chip chip-opt">optional</span>)
  if (field.ref) {
    chips.push(
      <button
        type="button"
        class="chip chip-ref"
        onClick={(e) => {
          e.stopPropagation()
          onJump(field.ref!)
        }}
      >
        ref → {field.ref}
      </button>
    )
  }
  for (const src of asList(field.copyFrom)) {
    chips.push(
      <button
        type="button"
        class="chip chip-copy"
        key={src}
        onClick={(e) => {
          e.stopPropagation()
          onJump(src)
        }}
      >
        copy ← {src}
      </button>
    )
  }
  if (field.type === 'enum' && field.values?.length) {
    chips.push(<span class="chip chip-enum">{field.values.join(' | ')}</span>)
  }
  if (field.copied) chips.push(<span class="chip chip-copy">copied</span>)
  if (!chips.length) return null
  return <div class="field-meta">{chips}</div>
}

export function Card({
  name,
  col,
  x,
  y,
  dim,
  active,
  hot,
  selection,
  hotPorts,
  onSelectField,
  onSelectCollection,
  onJump,
  onHot,
  onHotClear,
  onDragStart,
}: Props): JSX.Element {
  return (
    <article
      class={`card${dim ? ' is-dim' : ''}${active ? ' is-active' : ''}${hot ? ' is-hot' : ''}`}
      data-card={name}
      style={{ left: `${x}px`, top: `${y}px`, width: '280px', zIndex: active || hot ? 5 : 1 }}
    >
      <header
        class="card-head"
        data-drag-handle="1"
        onPointerDown={(e) => {
          onDragStart(name, e as unknown as PointerEvent)
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelectCollection(name)
        }}
      >
        <div>
          <div class="card-title">{name}</div>
          <div class="card-label">{col.label}</div>
        </div>
        <span class="card-badge">key {col.key}</span>
      </header>
      <div class="card-blurb">{col.blurb}</div>
      <ul class="field-list">
        {Object.entries(col.fields).map(([fn, f]) => {
          const path = portId(name, fn)
          const activeF = selection?.kind === 'field' && selection.path === path
          const hotF =
            hotPorts.has(path) ||
            [...hotPorts].some((p) => path.startsWith(p + '.') || p.startsWith(path + '.'))
          return (
            <li
              key={fn}
              class={`field${activeF ? ' is-active' : ''}${hotF ? ' is-hot' : ''}`}
              data-field-path={path}
              data-collection={name}
              data-field={fn}
              data-port={f.port ? path : undefined}
              onMouseEnter={() => onHot([path])}
              onMouseLeave={onHotClear}
              onClick={(e) => {
                e.stopPropagation()
                onSelectField(name, fn, path)
              }}
            >
              <div class="field-main">
                <span class="field-name">{fn}</span>
              </div>
              <span class="field-type">{f.type}</span>
              <MetaChips field={f} isKey={col.key === fn} onJump={onJump} />
              {f.type === 'object' && f.fields ? (
                <div class="nested">
                  {Object.entries(f.fields).map(([n, nf]) => {
                    const npath = fn + '.' + n
                    const full = portId(name, npath)
                    const nActive = selection?.kind === 'field' && selection.path === full
                    const nHot = hotPorts.has(full)
                    return (
                      <div
                        key={n}
                        class={`field${nActive ? ' is-active' : ''}${nHot ? ' is-hot' : ''}`}
                        data-field-path={full}
                        data-collection={name}
                        data-field={npath}
                        onMouseEnter={() => onHot([full])}
                        onMouseLeave={onHotClear}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectField(name, npath, full)
                        }}
                      >
                        <div class="field-main">
                          <span class="field-name">{n}</span>
                        </div>
                        <span class="field-type">{nf.type}</span>
                        <MetaChips field={nf} onJump={onJump} />
                      </div>
                    )
                  })}
                </div>
              ) : f.detail ? (
                <div class="field-meta">
                  <span class="chip">{f.detail}</span>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </article>
  )
}
