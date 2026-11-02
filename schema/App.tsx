import type { JSX } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { schema } from './models'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { Inspector } from './components/Inspector'
import { Canvas } from './components/Canvas'
import {
  asList,
  CARD_W,
  defaultPositions,
  findField,
  type Pos,
  type Selection,
} from './lib'

export function App(): JSX.Element {
  const [positions, setPositions] = useState<Record<string, Pos>>(() => defaultPositions())
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(40)
  const [panY, setPanY] = useState(40)
  const [selection, setSelection] = useState<Selection>(null)
  const [query, setQuery] = useState('')
  const [hotPorts, setHotPorts] = useState<Set<string>>(() => new Set())
  const [hotEdge, setHotEdge] = useState(-1)
  const [tick, setTick] = useState(0)

  const worldRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const panDrag = useRef<{ x: number; y: number; panX: number; panY: number; id: number } | null>(
    null
  )
  const cardDrag = useRef<{
    name: string
    dx: number
    dy: number
    pointerId: number
  } | null>(null)
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  const bump = () => setTick((t) => t + 1)

  const relatedPortsForSelection = useCallback((sel: Selection): Set<string> => {
    const ports = new Set<string>()
    if (!sel) return ports
    if (sel.kind === 'field') {
      ports.add(sel.path)
      const field = findField(sel.collection, sel.field)
      if (field?.ref) ports.add(field.ref)
      asList(field?.copyFrom).forEach((p) => ports.add(p))
    }
    if (sel.kind === 'collection') {
      Object.entries(schema.collections[sel.name]?.fields || {}).forEach(([f, def]) => {
        if (def.port) ports.add(sel.name + '.' + f)
        if (def.ref) ports.add(def.ref)
        asList(def.copyFrom).forEach((p) => ports.add(p))
      })
    }
    if (sel.kind === 'edge') {
      const edge = schema.edges[sel.index]
      if (edge) {
        asList(edge.from).forEach((p) => ports.add(p))
        asList(edge.to).forEach((p) => ports.add(p))
      }
    }
    return ports
  }, [])

  const select = useCallback(
    (next: Selection) => {
      setSelection(next)
      if (next?.kind === 'edge') {
        const edge = schema.edges[next.index]
        setHotEdge(next.index)
        setHotPorts(new Set(edge ? [...asList(edge.from), ...asList(edge.to)] : []))
      } else if (next?.kind === 'field') {
        setHotEdge(-1)
        setHotPorts(new Set([next.path]))
      } else {
        setHotEdge(-1)
        setHotPorts(new Set())
      }
    },
    []
  )

  const focusCollection = useCallback(
    (name: string) => {
      const pos = positions[name]
      const viewport = viewportRef.current
      if (!pos || !viewport) return
      const rect = viewport.getBoundingClientRect()
      setPanX(rect.width / 2 - (pos.x + CARD_W / 2) * zoom)
      setPanY(rect.height / 2 - (pos.y + 80) * zoom)
    },
    [positions, zoom]
  )

  const fitView = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    let minX = Infinity
    let minY = Infinity
    let maxR = -Infinity
    let maxB = -Infinity
    Object.values(positions).forEach((p) => {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxR = Math.max(maxR, p.x + CARD_W)
      maxB = Math.max(maxB, p.y + 360)
    })
    if (!Number.isFinite(minX)) {
      minX = 0
      minY = 0
      maxR = CARD_W
      maxB = 360
    }
    const pad = 80
    const contentW = Math.max(maxR - minX, 1)
    const contentH = Math.max(maxB - minY, 1)
    const zx = (rect.width - pad) / contentW
    const zy = (rect.height - pad) / contentH
    const nextZoom = Math.max(0.35, Math.min(1.2, Math.min(zx, zy)))
    setZoom(nextZoom)
    setPanX(rect.width / 2 - (minX + contentW / 2) * nextZoom)
    setPanY(rect.height / 2 - (minY + contentH / 2) * nextZoom)
    bump()
  }, [positions])

  const jumpTo = useCallback(
    (path: string) => {
      if (!path) return
      const [collection, ...rest] = path.split('.')
      if (!collection || !schema.collections[collection]) return
      const field = rest.join('.')
      focusCollection(collection)
      if (field) select({ kind: 'field', collection, field, path })
      else select({ kind: 'collection', name: collection })
    },
    [focusCollection, select]
  )

  const onHot = useCallback((ports: string[]) => {
    setHotPorts(new Set(ports))
  }, [])

  const onHotClear = useCallback(() => {
    const sel = selectionRef.current
    if (sel?.kind === 'field' || sel?.kind === 'edge') return
    setHotEdge(-1)
    setHotPorts(new Set())
  }, [])

  const onHotEdge = useCallback((index: number, ports: string[]) => {
    setHotEdge(index)
    setHotPorts(new Set(ports))
  }, [])

  const onDragStart = useCallback(
    (name: string, event: PointerEvent) => {
      if (event.button !== 0) return
      const world = worldRef.current?.getBoundingClientRect()
      if (!world) return
      const pos = positions[name] || { x: 0, y: 0 }
      const z = zoomRef.current || 1
      const x = (event.clientX - world.left) / z
      const y = (event.clientY - world.top) / z
      cardDrag.current = {
        name,
        dx: x - pos.x,
        dy: y - pos.y,
        pointerId: event.pointerId,
      }
      try {
        ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
      event.stopPropagation()
      event.preventDefault()

      const move = (ev: PointerEvent) => {
        const drag = cardDrag.current
        if (!drag || drag.pointerId !== ev.pointerId) return
        const w = worldRef.current?.getBoundingClientRect()
        if (!w) return
        const z = zoomRef.current || 1
        const nx = (ev.clientX - w.left) / z - drag.dx
        const ny = (ev.clientY - w.top) / z - drag.dy
        setPositions((prev) => ({
          ...prev,
          [drag.name]: { x: nx, y: ny },
        }))
        bump()
      }
      const up = (ev: PointerEvent) => {
        if (!cardDrag.current || cardDrag.current.pointerId !== ev.pointerId) return
        cardDrag.current = null
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        bump()
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [positions, zoom]
  )

  const onViewportPointerDown = useCallback(
    (event: PointerEvent) => {
      if (event.button !== 0) return
      const t = event.target as HTMLElement
      if (t.closest('.card') || t.closest('path.edge')) return
      panDrag.current = {
        x: event.clientX,
        y: event.clientY,
        panX,
        panY,
        id: event.pointerId,
      }
      viewportRef.current?.classList.add('is-panning')
      try {
        viewportRef.current?.setPointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
    },
    [panX, panY]
  )

  const onViewportPointerMove = useCallback((event: PointerEvent) => {
    const p = panDrag.current
    if (!p || p.id !== event.pointerId) return
    setPanX(p.panX + (event.clientX - p.x))
    setPanY(p.panY + (event.clientY - p.y))
  }, [])

  const onViewportPointerUp = useCallback((event: PointerEvent) => {
    if (!panDrag.current || panDrag.current.id !== event.pointerId) return
    panDrag.current = null
    viewportRef.current?.classList.remove('is-panning')
  }, [])

  const onWheel = useCallback(
    (event: WheelEvent) => {
      const viewport = viewportRef.current
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      const mx = event.clientX - rect.left
      const my = event.clientY - rect.top
      const before = zoom
      const next = Math.min(2, Math.max(0.35, before * (event.deltaY > 0 ? 0.9 : 1.1)))
      const wx = (mx - panX) / before
      const wy = (my - panY) / before
      setZoom(next)
      setPanX(mx - wx * next)
      setPanY(my - wy * next)
      bump()
    },
    [zoom, panX, panY]
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName
      if (event.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
      if (event.key === 'Escape') {
        if (searchRef.current) searchRef.current.value = ''
        setQuery('')
        select(null)
      }
      if ((event.key === 'f' || event.key === 'F') && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        event.preventDefault()
        fitView()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fitView, select])

  useEffect(() => {
    requestAnimationFrame(() => fitView())
  }, [])

  const displayHotPorts = useMemo(() => {
    const fromSel = relatedPortsForSelection(selection)
    return new Set([...hotPorts, ...fromSel])
  }, [hotPorts, selection, relatedPortsForSelection])

  const statusLeft = useMemo(() => {
    const nCol = Object.keys(schema.collections).length
    const nEdge = schema.edges.length
    const focus = selection
      ? selection.kind === 'collection'
        ? selection.name
        : selection.kind === 'field'
          ? selection.path
          : `edge:${schema.edges[selection.index]?.label}`
      : '—'
    return `${nCol} collections · ${nEdge} relations · focus ${focus}`
  }, [selection])

  return (
    <div class="app" id="app-root">
      <Toolbar
        title={schema.meta.title}
        subtitle={schema.meta.product + ' · models.ts · Preact'}
        query={query}
        zoom={zoom}
        onQuery={setQuery}
        onFit={fitView}
        onZoomIn={() => {
          setZoom((z) => Math.min(2, z * 1.1))
          bump()
        }}
        onZoomOut={() => {
          setZoom((z) => Math.max(0.35, z / 1.1))
          bump()
        }}
        onReset={() => {
          setPositions(defaultPositions())
          requestAnimationFrame(() => fitView())
        }}
        searchRef={searchRef}
      />
      <div class="workspace">
        <Sidebar
          query={query}
          selection={selection}
          hotEdge={hotEdge}
          onSelectCollection={(name) => {
            select({ kind: 'collection', name })
            focusCollection(name)
          }}
          onSelectEdge={(index) => select({ kind: 'edge', index })}
        />
        <Canvas
          positions={positions}
          zoom={zoom}
          panX={panX}
          panY={panY}
          selection={selection}
          hotPorts={displayHotPorts}
          hotEdge={hotEdge}
          query={query}
          tick={tick}
          worldRef={worldRef}
          viewportRef={viewportRef}
          onSelectField={(collection, field, path) => select({ kind: 'field', collection, field, path })}
          onSelectCollection={(name) => select({ kind: 'collection', name })}
          onSelectEdge={(index) => select({ kind: 'edge', index })}
          onJump={jumpTo}
          onHot={onHot}
          onHotEdge={onHotEdge}
          onHotClear={onHotClear}
          onClearSelection={() => select(null)}
          onDragStart={onDragStart}
          onViewportPointerDown={onViewportPointerDown}
          onViewportPointerMove={onViewportPointerMove}
          onViewportPointerUp={onViewportPointerUp}
          onWheel={onWheel}
        />
        <Inspector selection={selection} onJump={jumpTo} />
      </div>
      <footer class="statusbar">
        <span>{statusLeft}</span>
        <span>Esc 清除 · F fit · / 搜索 · Preact</span>
      </footer>
    </div>
  )
}
