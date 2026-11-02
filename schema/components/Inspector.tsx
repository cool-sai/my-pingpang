import type { JSX } from 'preact'
import { schema } from '../../cloudfunctions/common/models'
import { asList, findField, type Selection } from '../lib'

type Props = {
  selection: Selection
  onJump: (path: string) => void
}

export function Inspector({ selection, onJump }: Props): JSX.Element {
  if (!selection) {
    return (
      <aside class="inspector">
        <div class="panel-head">Inspector</div>
        <div class="inspector-body">
          <p class="insp-empty">选择集合或字段查看详情。点击 canvas 上的字段、侧栏项或连线。</p>
          <div class="insp-block">
            <div class="insp-k">Product</div>
            <div class="insp-v">{schema.meta.product}</div>
          </div>
          <div class="insp-block">
            <div class="insp-k">About</div>
            <div class="insp-v muted">{schema.meta.blurb}</div>
          </div>
        </div>
      </aside>
    )
  }

  let body: JSX.Element | null = null

  if (selection.kind === 'collection') {
    const col = schema.collections[selection.name]!
    body = (
      <>
        <div class="insp-block">
          <div class="insp-k">Collection</div>
          <div class="insp-v mono">{selection.name}</div>
        </div>
        <div class="insp-block">
          <div class="insp-k">Label</div>
          <div class="insp-v">{col.label}</div>
        </div>
        <div class="insp-row">
          <span>Primary key</span>
          <span class="mono">{col.key}</span>
        </div>
        <div class="insp-row">
          <span>Fields</span>
          <span>{Object.keys(col.fields).length}</span>
        </div>
        <div class="insp-block">
          <div class="insp-k">Description</div>
          <div class="insp-v muted">{col.blurb}</div>
        </div>
        <div class="insp-block">
          <div class="insp-k">Fields</div>
          <ul class="insp-list">
            {Object.entries(col.fields).map(([n, f]) => (
              <li>
                <code>{n}</code> · {f.type}
                {f.ref ? ` · ref ${f.ref}` : ''}
              </li>
            ))}
          </ul>
        </div>
      </>
    )
  }

  if (selection.kind === 'field') {
    const field = findField(selection.collection, selection.field)
    if (!field) {
      body = <p class="insp-empty">字段不存在</p>
    } else {
      const isKey = schema.collections[selection.collection]?.key === selection.field
      body = (
        <>
          <div class="insp-block">
            <div class="insp-k">Field</div>
            <div class="insp-v mono">{selection.path}</div>
          </div>
          <div class="insp-row">
            <span>Type</span>
            <span class="mono">{field.type}</span>
          </div>
          {field.optional ? (
            <div class="insp-row">
              <span>Optional</span>
              <span>yes</span>
            </div>
          ) : null}
          {isKey ? (
            <div class="insp-row">
              <span>Role</span>
              <span class="mono">primary key</span>
            </div>
          ) : null}
          {field.ref ? (
            <div class="insp-row">
              <span>ref</span>
              <button type="button" class="chip chip-ref" onClick={() => onJump(field.ref!)}>
                {field.ref}
              </button>
            </div>
          ) : null}
          {field.copyFrom ? (
            <div class="insp-row">
              <span>copyFrom</span>
              <span class="mono">{asList(field.copyFrom).join(', ')}</span>
            </div>
          ) : null}
          {field.values?.length ? (
            <div class="insp-block">
              <div class="insp-k">Enum</div>
              <ul class="insp-list">
                {field.values.map((v) => (
                  <li>
                    <code>{v}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {field.note ? (
            <div class="insp-block">
              <div class="insp-k">Note</div>
              <div class="insp-v muted">{field.note}</div>
            </div>
          ) : null}
          {field.detail ? (
            <div class="insp-block">
              <div class="insp-k">Detail</div>
              <div class="insp-v muted">{field.detail}</div>
            </div>
          ) : null}
          {field.copyFrom ? (
            <div class="insp-block">
              <div class="insp-k">Denorm</div>
              <div class="insp-v muted">
                写入时从 <code>{asList(field.copyFrom).join(', ')}</code> 抄一份。
                <strong>不会回填</strong>：源字段更新后快照保持旧值。
              </div>
            </div>
          ) : field.copied ? (
            <div class="insp-block">
              <div class="insp-k">Denorm</div>
              <div class="insp-v muted">该字段会被其它集合在写入时抄走；源更新后历史快照不回填。</div>
            </div>
          ) : null}
          {field.fields ? (
            <div class="insp-block">
              <div class="insp-k">Nested</div>
              <ul class="insp-list">
                {Object.entries(field.fields).map(([n, f]) => (
                  <li>
                    <code>{n}</code> · {f.type}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )
    }
  }

  if (selection.kind === 'edge') {
    const edge = schema.edges[selection.index]!
    body = (
      <>
        <div class="insp-block">
          <div class="insp-k">Relation</div>
          <div class="insp-v mono">{edge.label}</div>
        </div>
        <div class="insp-row">
          <span>Kind</span>
          <span class="mono">{edge.kind}</span>
        </div>
        <div class="insp-row">
          <span>Style</span>
          <span class="mono">{edge.style}</span>
        </div>
        <div class="insp-block">
          <div class="insp-k">From</div>
          <ul class="insp-list">
            {asList(edge.from).map((p) => (
              <li>
                <button type="button" class="chip chip-ref" onClick={() => onJump(p)}>
                  {p}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div class="insp-block">
          <div class="insp-k">To</div>
          <ul class="insp-list">
            {asList(edge.to).map((p) => (
              <li>
                <button type="button" class="chip chip-ref" onClick={() => onJump(p)}>
                  {p}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div class="insp-block">
          <div class="insp-k">Meaning</div>
          <div class="insp-v muted">
            {edge.kind === 'ref'
              ? '逻辑外键（云库无真正 FK）。绿实线。'
              : '写入时 denorm 抄一份。琥珀虚线；源更新不回填。'}
          </div>
        </div>
      </>
    )
  }

  return (
    <aside class="inspector">
      <div class="panel-head">Inspector</div>
      <div class="inspector-body">{body}</div>
    </aside>
  )
}
