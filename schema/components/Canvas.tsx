import type { JSX } from 'preact'
import { useMemo } from 'preact/hooks'
import { schema } from '../models'
import { Card } from './Card'
import { Edges } from './Edges'
import {
  CARD_W,
  collectionMatches,
  type Pos,
  type Selection,
} from '../lib'

type Props = {
  positions: Record<string, Pos>
  zoom: number
  panX: number
  panY: number
  selection: Selection
  hotPorts: Set<string>
  hotEdge: number
  query: string
  tick: number
  onSelectField: (collection: string, field: string, path: string) => void
  onSelectCollection: (name: string) => void
  onSelectEdge: (index: number) => void
  onJump: (path: string) => void
  onHot: (ports: string[]) => void
  onHotEdge: (index: number, ports: string[]) => void
  onHotClear: () => void
  onClearSelection: () => void
  onDragStart: (name: string, e: PointerEvent) => void
  onViewportPointerDown: (e: PointerEvent) => void
  onViewportPointerMove: (e: PointerEvent) => void
  onViewportPointerUp: (e: PointerEvent) => void
  onWheel: (e: WheelEvent) => void
  worldRef: { current: HTMLDivElement | null }
  viewportRef: { current: HTMLDivElement | null }
}

export function Canvas(props: Props): JSX.Element {
  const {
    positions,
    zoom,
    panX,
    panY,
    selection,
    hotPorts,
    hotEdge,
    query,
    tick,
    worldRef,
    viewportRef,
  } = props

  const q = query.trim().toLowerCase()
  const hasFocus = hotPorts.size > 0 || selection !== null || Boolean(q)

  const { worldW, worldH } = useMemo(() => {
    let maxR = CARD_W
    let maxB = 520
    for (const p of Object.values(positions)) {
      maxR = Math.max(maxR, p.x + CARD_W)
      maxB = Math.max(maxB, p.y + 520)
    }
    // Origin stays at 0,0 so negative card left/top can extend freely past the box.
    return { worldW: Math.max(maxR + 80, 400), worldH: Math.max(maxB + 80, 400) }
  }, [positions, tick])

  return (
    <section class="canvas-pane">
      <div
        class="canvas-viewport"
        id="viewport"
        ref={viewportRef}
        onPointerDown={(e) => props.onViewportPointerDown(e as unknown as PointerEvent)}
        onPointerMove={(e) => props.onViewportPointerMove(e as unknown as PointerEvent)}
        onPointerUp={(e) => props.onViewportPointerUp(e as unknown as PointerEvent)}
        onPointerCancel={(e) => props.onViewportPointerUp(e as unknown as PointerEvent)}
        onWheel={(e) => {
          e.preventDefault()
          props.onWheel(e as unknown as WheelEvent)
        }}
        onClick={(e) => {
          const t = e.target as HTMLElement
          if (t.closest('.card') || t.closest('path.edge')) return
          props.onClearSelection()
        }}
      >
        <div
          class="canvas-world"
          id="world"
          ref={worldRef}
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            width: `${worldW}px`,
            height: `${worldH}px`,
          }}
        >
          <Edges
            worldRef={worldRef}
            positions={positions}
            zoom={zoom}
            selection={selection}
            hotEdge={hotEdge}
            hotPorts={hotPorts}
            worldW={worldW}
            worldH={worldH}
            onSelectEdge={props.onSelectEdge}
            onHotEdge={props.onHotEdge}
            onHotClear={props.onHotClear}
            tick={tick}
          />
          <div class="cards-layer" id="cards">
            {Object.entries(schema.collections).map(([name, col]) => {
              const pos = positions[name] || { x: 0, y: 0 }
              const match = collectionMatches(name, col, q)
              const related =
                !hotPorts.size ||
                [...hotPorts].some((p) => p.startsWith(name + '.')) ||
                (selection?.kind === 'collection' && selection.name === name)
              const dim =
                Boolean(hasFocus && q && !match) ||
                Boolean(hotPorts.size && !related && selection)
              return (
                <Card
                  key={name}
                  name={name}
                  col={col}
                  x={pos.x}
                  y={pos.y}
                  dim={dim}
                  active={selection?.kind === 'collection' && selection.name === name}
                  hot={related && hotPorts.size > 0}
                  selection={selection}
                  hotPorts={hotPorts}
                  onSelectField={props.onSelectField}
                  onSelectCollection={props.onSelectCollection}
                  onJump={props.onJump}
                  onHot={props.onHot}
                  onHotClear={props.onHotClear}
                  onDragStart={props.onDragStart}
                />
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
