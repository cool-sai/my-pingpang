import type { JSX } from 'preact'
import { useLayoutEffect, useState } from 'preact/hooks'
import { schema } from '../../cloudfunctions/common/models'
import { asList, collectionOfPort, CARD_W, type Pos, type Selection } from '../lib'

type Pt = { x: number; y: number }

type Seg = {
  index: number
  kind: 'ref' | 'copy'
  label: string
  d: string
  from: string
  to: string
  labelX: number
  labelY: number
  showLabel: boolean
}

function portPoint(
  worldEl: HTMLElement,
  portName: string,
  side: 'left' | 'right',
  zoom: number
): Pt | null {
  const field = worldEl.querySelector(`[data-port="${portName}"]`) as HTMLElement | null
  if (!field) return null
  const card = field.closest('[data-card]') as HTMLElement
  const world = worldEl.getBoundingClientRect()
  const fieldBox = field.getBoundingClientRect()
  const cardBox = card.getBoundingClientRect()
  const midY = (fieldBox.top + fieldBox.height / 2 - world.top) / zoom
  if (side === 'right') return { x: (cardBox.right - world.left) / zoom, y: midY }
  return { x: (cardBox.left - world.left) / zoom, y: midY }
}

function facing(positions: Record<string, Pos>, fromCard: string, toCard: string): ['left' | 'right', 'left' | 'right'] {
  const a = positions[fromCard] || { x: 0, y: 0 }
  const b = positions[toCard] || { x: 0, y: 0 }
  const ax = a.x + CARD_W / 2
  const bx = b.x + CARD_W / 2
  return ax <= bx ? ['right', 'left'] : ['left', 'right']
}

/** Smooth cubic Bezier: horizontal leave/enter at ports (ERD-style). */
function curve(a: Pt, b: Pt, fromSide: 'left' | 'right', toSide: 'left' | 'right') {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  const pull = Math.max(40, Math.min(180, dx * 0.45 + dy * 0.15))
  const c1x = a.x + (fromSide === 'right' ? pull : -pull)
  const c1y = a.y
  const c2x = b.x + (toSide === 'right' ? pull : -pull)
  const c2y = b.y
  return `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`
}

function curveLabel(a: Pt, b: Pt, fromSide: 'left' | 'right', toSide: 'left' | 'right') {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  const pull = Math.max(40, Math.min(180, dx * 0.45 + dy * 0.15))
  const c1x = a.x + (fromSide === 'right' ? pull : -pull)
  const c1y = a.y
  const c2x = b.x + (toSide === 'right' ? pull : -pull)
  const c2y = b.y
  // Approximate Bezier midpoint at t=0.5
  const t = 0.5
  const mt = 1 - t
  const x =
    mt * mt * mt * a.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * b.x
  const y =
    mt * mt * mt * a.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * b.y
  return { x, y: y - 12 }
}

type Props = {
  worldRef: { current: HTMLDivElement | null }
  positions: Record<string, Pos>
  zoom: number
  selection: Selection
  hotEdge: number
  hotPorts: Set<string>
  worldW: number
  worldH: number
  onSelectEdge: (index: number) => void
  onHotEdge: (index: number, ports: string[]) => void
  onHotClear: () => void
  tick: number
}

export function Edges({
  worldRef,
  positions,
  zoom,
  selection,
  hotEdge,
  hotPorts,
  worldW,
  worldH,
  onSelectEdge,
  onHotEdge,
  onHotClear,
  tick,
}: Props): JSX.Element {
  const [segs, setSegs] = useState<Seg[]>([])

  useLayoutEffect(() => {
    const worldEl = worldRef.current
    if (!worldEl) return
    const next: Seg[] = []
    schema.edges.forEach((edge, index) => {
      const fromPorts = asList(edge.from)
      const toPorts = asList(edge.to)
      const pairCount = Math.max(fromPorts.length, toPorts.length)
      for (let i = 0; i < pairCount; i++) {
        const from = fromPorts[Math.min(i, fromPorts.length - 1)]!
        const to = toPorts[Math.min(i, toPorts.length - 1)]!
        const sides = facing(positions, collectionOfPort(from), collectionOfPort(to))
        const a = portPoint(worldEl, from, sides[0], zoom)
        const b = portPoint(worldEl, to, sides[1], zoom)
        if (!a || !b) continue
        const mid = curveLabel(a, b, sides[0], sides[1])
        next.push({
          index,
          kind: edge.kind,
          label: edge.label,
          d: curve(a, b, sides[0], sides[1]),
          from,
          to,
          labelX: mid.x,
          labelY: mid.y,
          showLabel: i === 0,
        })
      }
    })
    setSegs(next)
  }, [worldRef, positions, zoom, tick])

  return (
    <>
      <svg class="wires" id="wires" width={worldW} height={worldH} viewBox={`0 0 ${worldW} ${worldH}`}>
        <defs>
          <marker
            id="arrow-ref"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5" fill="none" stroke="var(--ref)" stroke-width="1.5" />
          </marker>
          <marker
            id="arrow-copy"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5" fill="none" stroke="var(--copy)" stroke-width="1.5" />
          </marker>
        </defs>
        {segs.map((seg, i) => {
          const hot =
            seg.index === hotEdge ||
            hotPorts.has(seg.from) ||
            hotPorts.has(seg.to) ||
            (selection?.kind === 'edge' && selection.index === seg.index)
          const active = selection?.kind === 'edge' && selection.index === seg.index
          const dim = Boolean(hotPorts.size && !hot && selection)
          return (
            <path
              key={i}
              class={`edge ${seg.kind}${hot && seg.index === hotEdge ? ' is-hot' : ''}${active ? ' is-active' : ''}${dim ? ' is-dim' : ''}`}
              d={seg.d}
              data-edge={String(seg.index)}
              data-from={seg.from}
              data-to={seg.to}
              marker-end={seg.kind === 'ref' ? 'url(#arrow-ref)' : 'url(#arrow-copy)'}
              onMouseEnter={() => onHotEdge(seg.index, [seg.from, seg.to])}
              onMouseLeave={onHotClear}
              onClick={(e) => {
                e.stopPropagation()
                onSelectEdge(seg.index)
              }}
            />
          )
        })}
      </svg>
      <div class="edge-labels" style={{ width: `${worldW}px`, height: `${worldH}px` }}>
        {segs
          .filter((s) => s.showLabel)
          .map((seg) => (
            <div
              key={seg.index}
              class={`edge-label ${seg.kind}${selection?.kind === 'edge' && selection.index !== seg.index ? ' is-dim' : ''}`}
              style={{ left: `${seg.labelX}px`, top: `${seg.labelY}px` }}
            >
              {seg.label}
            </div>
          ))}
      </div>
    </>
  )
}
