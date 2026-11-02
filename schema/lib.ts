import {
  schema,
  type CollectionDef,
  type FieldDef,
  type FieldPath,
} from './models'

export const CARD_W = 280
export const GAP_X = 64
export const GAP_Y = 72

export type Selection =
  | { kind: 'collection'; name: string }
  | { kind: 'field'; collection: string; field: string; path: string }
  | { kind: 'edge'; index: number }
  | null

export type Pos = { x: number; y: number }

export function asList(v: FieldPath | FieldPath[] | undefined): FieldPath[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

export function portId(collection: string, field: string) {
  return collection + '.' + field
}

export function fieldMatches(name: string, field: FieldDef, q: string): boolean {
  if (!q) return true
  const bag = [
    name,
    field.type,
    field.note || '',
    field.ref || '',
    ...(field.values || []),
    ...asList(field.copyFrom),
  ]
    .join(' ')
    .toLowerCase()
  return bag.includes(q)
}

export function collectionMatches(name: string, col: CollectionDef, q: string): boolean {
  if (!q) return true
  if (
    name.toLowerCase().includes(q) ||
    col.label.toLowerCase().includes(q) ||
    col.blurb.toLowerCase().includes(q)
  ) {
    return true
  }
  return Object.entries(col.fields).some(([fn, f]) => fieldMatches(fn, f, q))
}

export function findField(collection: string, fieldPath: string): FieldDef | undefined {
  const col = schema.collections[collection]
  if (!col) return undefined
  const parts = fieldPath.split('.')
  let cur: FieldDef | undefined = col.fields[parts[0]!]
  for (let i = 1; i < parts.length; i++) {
    cur = cur?.fields?.[parts[i]!]
  }
  return cur
}

function estimateCardHeight(name: string): number {
  const col = schema.collections[name]
  if (!col) return 360
  let rows = 0
  for (const f of Object.values(col.fields)) {
    rows += 1
    if (f.fields) rows += Object.keys(f.fields).length
  }
  // header + blurb + field rows + padding (matches has many nested rows)
  return 88 + 44 + rows * 38 + 20
}

export function defaultPositions(): Record<string, Pos> {
  const top = schema.layout.top
  const bottom = schema.layout.bottom
  const pos: Record<string, Pos> = {}
  top.forEach((name, i) => {
    pos[name] = { x: i * (CARD_W + GAP_X), y: 0 }
  })
  const topBottom = Math.max(420, ...top.map(estimateCardHeight))
  bottom.forEach((name, i) => {
    const totalW = Math.max(top.length, 1) * (CARD_W + GAP_X) - GAP_X
    const rowW = bottom.length * (CARD_W + GAP_X) - GAP_X
    const x =
      Math.max(0, (totalW - rowW) / 2) + i * (CARD_W + GAP_X)
    pos[name] = { x, y: topBottom + GAP_Y }
  })
  return pos
}

export function collectionOfPort(port: string) {
  return port.split('.')[0] || ''
}
