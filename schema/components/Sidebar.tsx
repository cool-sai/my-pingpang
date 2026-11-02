import type { JSX } from 'preact'
import { schema } from '../../cloudfunctions/common/models'
import type { Selection } from '../lib'
import { collectionMatches } from '../lib'

type Props = {
  query: string
  selection: Selection
  hotEdge: number
  onSelectCollection: (name: string) => void
  onSelectEdge: (index: number) => void
}

export function Sidebar({
  query,
  selection,
  hotEdge,
  onSelectCollection,
  onSelectEdge,
}: Props): JSX.Element {
  const q = query.trim().toLowerCase()
  return (
    <aside class="sidebar">
      <div class="panel-head">Collections</div>
      <div class="side-list" id="collection-list">
        {Object.entries(schema.collections).map(([name, col]) => {
          const match = collectionMatches(name, col, q)
          const active = selection?.kind === 'collection' && selection.name === name
          return (
            <button
              type="button"
              class={`side-item${active ? ' is-active' : ''}${q && !match ? ' is-dim' : ''}`}
              data-name={name}
              onClick={() => onSelectCollection(name)}
            >
              <span class="dot" />
              <span class="name">{name}</span>
              <span class="meta">{Object.keys(col.fields).length}</span>
            </button>
          )
        })}
      </div>
      <div class="panel-head">Relations</div>
      <div class="side-list" id="edge-list">
        {schema.edges.map((edge, index) => {
          const active = selection?.kind === 'edge' && selection.index === index
          return (
            <button
              type="button"
              class={`side-item${active ? ' is-active' : ''}${hotEdge === index ? ' is-hot' : ''}`}
              data-edge={String(index)}
              onClick={() => onSelectEdge(index)}
            >
              <span class={`dot ${edge.kind}`} />
              <span class="name">{edge.label}</span>
              <span class="meta">{edge.kind}</span>
            </button>
          )
        })}
      </div>
      <div class="panel-head">Notes</div>
      <div class="side-notes">
        {schema.footnotes.map((n) => (
          <p dangerouslySetInnerHTML={{ __html: n }} />
        ))}
      </div>
    </aside>
  )
}
