'use client'

import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Map as MapIcon, Store, Plus, Trash2, Check, X, ChevronDown, ChevronUp, Settings2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { catalogCopy, consoleCopy, settingsCopy } from '@/lib/console/copy'
import { cn } from '@/lib/utils'
import type { Branch } from '@/lib/console/settings'
import { addBranchNode, renameBranch, setBranchActive, moveBranch, deleteBranchNode } from '@/app/console/branches/actions'

const c = { ...catalogCopy, ...consoleCopy, ...settingsCopy }

type Node = Branch & { children: Node[] }
const COMPANY = '__company__'

function buildTree(branches: Branch[]): Node[] {
  const byId = new Map<string, Node>(branches.map((b) => [b.id, { ...b, children: [] }]))
  const roots: Node[] = []
  for (const n of byId.values()) {
    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(n)
    else roots.push(n)
  }
  const sort = (list: Node[]) => {
    list.sort((a, b) => a.sort - b.sort)
    list.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}

export function BranchTree({ branches, companyName }: { branches: Branch[]; companyName: string }) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const treeRef = useRef<HTMLDivElement>(null)
  const [path, setPath] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)

  const roots = buildTree(branches)

  // Draw curved connectors from each parent node to its children, measured
  // from the rendered boxes (so it survives collapse, rename, resize).
  const drawCurves = useCallback(() => {
    const tree = treeRef.current
    if (!tree) return
    const base = tree.getBoundingClientRect()
    let d = ''
    tree.querySelectorAll('li').forEach((li) => {
      const pn = li.querySelector(':scope > .bt-node') as HTMLElement | null
      const cu = li.querySelector(':scope > ul') as HTMLElement | null
      if (!pn || !cu) return
      const pr = pn.getBoundingClientRect()
      const sx = pr.left + pr.width / 2 - base.left
      const sy = pr.bottom - base.top
      cu.querySelectorAll(':scope > li > .bt-node').forEach((cnEl) => {
        const cr = (cnEl as HTMLElement).getBoundingClientRect()
        const ex = cr.left + cr.width / 2 - base.left
        const ey = cr.top - base.top
        const my = sy + (ey - sy) * 0.5
        d += `M${sx} ${sy} C ${sx} ${my} ${ex} ${my} ${ex} ${ey} `
      })
    })
    setPath(d)
  }, [])

  useLayoutEffect(() => {
    drawCurves()
    const ro = new ResizeObserver(() => drawCurves())
    if (treeRef.current) ro.observe(treeRef.current)
    window.addEventListener('resize', drawCurves)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', drawCurves)
    }
  }, [drawCurves, branches, collapsed])

  const act = (task: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    task().then((r) => {
      setBusy(false)
      if (r.ok) router.refresh()
      else window.alert(tr(c.failed ?? { th: 'ไม่สำเร็จ', en: 'Failed' }))
    })
  }

  const startRename = (n: Node) => {
    setEditId(n.id)
    setEditName(n.name)
  }
  const commitRename = () => {
    const id = editId
    const name = editName.trim()
    setEditId(null)
    if (id && name) act(() => renameBranch(id, name))
  }

  // ---- drag & drop reparent ----
  const onDrop = (targetId: string | null) => {
    const id = dragId
    setDropId(null)
    setDragId(null)
    if (id && id !== targetId) act(() => moveBranch(id, targetId))
  }

  function NodeBox({ n }: { n: Node }) {
    const isGroup = n.kind === 'group'
    const Icon = isGroup ? MapIcon : Store
    const kids = n.children.length
    return (
      <div
        className={cn(
          'bt-node relative inline-block cursor-grab select-none rounded-2xl border bg-card p-3 text-left shadow-sm',
          isGroup ? 'border-[color:var(--group,theme(colors.amber.600))]/40' : 'border-accent/50',
          dropId === n.id && 'outline outline-2 outline-dashed outline-primary',
          dragId === n.id && 'opacity-40',
        )}
        style={{ minWidth: 168, maxWidth: 230, zIndex: 1 }}
        draggable={editId !== n.id}
        onDragStart={(e) => (setDragId(n.id), e.stopPropagation())}
        onDragEnd={() => (setDragId(null), setDropId(null))}
        onDragOver={(e) => {
          if (dragId && dragId !== n.id) {
            e.preventDefault()
            setDropId(n.id)
          }
        }}
        onDragLeave={() => setDropId((d) => (d === n.id ? null : d))}
        onDrop={(e) => (e.preventDefault(), e.stopPropagation(), onDrop(n.id))}
      >
        <div className="flex items-center gap-2">
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', isGroup ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-accent/15 text-accent')}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            {editId === n.id ? (
              <input
                autoFocus
                value={editName}
                maxLength={60}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => (e.key === 'Enter' ? commitRename() : e.key === 'Escape' ? setEditId(null) : null)}
                className="w-full rounded-md border border-primary bg-background px-1.5 py-0.5 text-sm font-semibold outline-none"
              />
            ) : (
              <div className="truncate text-sm font-semibold" title={tr(c.branchDblRename)} onDoubleClick={() => startRename(n)}>
                {n.name}
              </div>
            )}
            <div className="text-[11px] text-muted-foreground">{isGroup ? tr(c.branchKindGroup) : tr(c.branchKindBranch)}</div>
          </div>
          {!isGroup && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => setBranchActive(n.id, !n.active))}
              className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', n.active ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground')}
            >
              {tr(n.active ? c.branchOn : c.branchOff)}
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {isGroup ? (
            <>
              <MiniBtn onClick={() => act(() => addBranchNode(n.id, 'group', tr(c.branchNewGroup)))}>+ {tr(c.branchKindGroup)}</MiniBtn>
              <MiniBtn onClick={() => act(() => addBranchNode(n.id, 'branch', tr(c.branchNewBranch)))}>+ {tr(c.branchKindBranch)}</MiniBtn>
            </>
          ) : (
            <MiniBtn primary onClick={() => router.push(`/console/settings/branch/${n.id}`)}>
              <Settings2 className="mr-1 inline h-3 w-3" /> {tr(c.branchConfig)}
            </MiniBtn>
          )}
          <MiniBtn danger onClick={() => window.confirm(tr(c.branchDeleteAsk).replace('{name}', n.name)) && act(() => deleteBranchNode(n.id))} aria-label={tr(c.branchDelete)}>
            <Trash2 className="h-3.5 w-3.5" />
          </MiniBtn>
        </div>

        {kids > 0 && (
          <button
            type="button"
            draggable={false}
            onClick={() => setCollapsed((m) => ({ ...m, [n.id]: !m[n.id] }))}
            className="absolute -bottom-3 left-1/2 z-[4] flex h-6 -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-card px-2 text-[11px] font-bold text-muted-foreground hover:border-primary hover:text-primary"
            aria-label={tr(c.branchCollapse)}
          >
            {collapsed[n.id] ? (
              <>
                <ChevronDown className="h-3 w-3" /> {kids}
              </>
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
    )
  }

  const renderNode = (n: Node) => (
    <li key={n.id} className="relative px-2 pt-6 text-center">
      <NodeBox n={n} />
      {n.children.length > 0 && !collapsed[n.id] && <ul className="m-0 flex list-none justify-center gap-0 p-0 pt-6">{n.children.map(renderNode)}</ul>}
    </li>
  )

  return (
    <div className="w-full overflow-x-auto px-4 py-6">
      <div ref={treeRef} className="relative mx-auto inline-block min-w-full">
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ zIndex: 0 }} aria-hidden="true">
          <path d={path} fill="none" stroke="var(--border, #d8cdc4)" strokeWidth={2} />
        </svg>
        <ul className="m-0 flex list-none justify-center p-0">
          <li className="relative px-2 text-center">
            {/* Company root — fixed, not a branch row */}
            <div
              className={cn('bt-node relative inline-block rounded-2xl border-2 border-primary bg-card p-3 text-left shadow-sm', dropId === COMPANY && 'outline outline-2 outline-dashed outline-primary')}
              style={{ minWidth: 180, zIndex: 1 }}
              onDragOver={(e) => {
                if (dragId) {
                  e.preventDefault()
                  setDropId(COMPANY)
                }
              }}
              onDragLeave={() => setDropId((d) => (d === COMPANY ? null : d))}
              onDrop={(e) => (e.preventDefault(), onDrop(null))}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{companyName}</div>
                  <div className="text-[11px] text-muted-foreground">{tr(c.branchCompany)}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <MiniBtn onClick={() => act(() => addBranchNode(null, 'group', tr(c.branchNewGroup)))}>+ {tr(c.branchKindGroup)}</MiniBtn>
                <MiniBtn onClick={() => act(() => addBranchNode(null, 'branch', tr(c.branchNewBranch)))}>+ {tr(c.branchKindBranch)}</MiniBtn>
              </div>
            </div>
            {roots.length > 0 && <ul className="m-0 flex list-none justify-center gap-0 p-0 pt-6">{roots.map(renderNode)}</ul>}
          </li>
        </ul>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">{tr(c.branchTreeHint)}</p>
    </div>
  )
}

function MiniBtn({ children, onClick, primary, danger, ...rest }: { children: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      draggable={false}
      onClick={(e) => (e.stopPropagation(), onClick())}
      className={cn(
        'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        primary ? 'border-accent text-accent hover:bg-accent hover:text-white' : danger ? 'border-border text-muted-foreground hover:border-primary hover:text-destructive' : 'border-border text-muted-foreground hover:border-primary hover:text-primary',
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
