'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  CalendarCheck,
  Check,
  CalendarDays,
  Clock,
  Coins,
  FileClock,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Lock,
  MessageSquareHeart,
  Minus,
  Network,
  Package,
  Palette,
  Plus,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Tablet,
  Tag,
  Trash2,
  UserCog,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { ACTIONS, AREAS, expandPermissions, withAncestors, type Area } from '@/lib/auth/permission-catalog'
import { TEAM_PATH } from '@/lib/auth/roles'
import { rolesCopy as c, rolesErrors } from '@/lib/console/copy'
import type { RoleRow } from '@/lib/console/roles'
import { createRole, deleteRole, updateRole } from '@/app/console/team/roles/actions'
import { cn } from '@/lib/utils'

// Back Office › Team & roles › Roles (RBAC phase 3a, v0.44.4). Left: the
// roles (system ones read only — immutable on purpose, v0.44.5); right: what the picked role
// may open — Module → Menu (→ Report) from AREAS — and, under each module,
// the actions done there. Ticking a module gives everything beneath it.

// The side menu's icons, so the tree reads like the menu.
const ICON: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  storefront: Receipt,
  'storefront.desk': Receipt,
  'storefront.cash': Wallet,
  'storefront.bookings': CalendarCheck,
  'storefront.members': Users,
  'storefront.feedback': MessageSquareHeart,
  'storefront.leads': Inbox,
  team: Users,
  'team.time': Clock,
  'team.calendar': CalendarDays,
  'team.roles': UserCog,
  operations: ListChecks,
  'operations.checklist': ListChecks,
  'operations.maintenance': Wrench,
  catalog: Package,
  'catalog.products': Package,
  'catalog.holidays': CalendarDays,
  'catalog.promotions': Tag,
  'catalog.commission': Coins,
  reports: BarChart3,
  'reports.sales': BarChart3,
  'reports.hours': FileClock,
  'reports.commission': Coins,
  system: Settings,
  'system.settings': Settings,
  'system.brand': Palette,
  'system.branches': Network,
  'system.devices': Tablet,
  'system.audit': ScrollText,
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((k) => b.includes(k))

export function RolesView({ roles, canEdit }: { roles: RoleRow[]; canEdit: boolean }) {
  const { tr, lang } = useLanguage()
  const [pickedId, setPickedId] = useState(roles.find((r) => !r.isSystem)?.id ?? roles[0]?.id ?? '')
  const [adding, setAdding] = useState(false)
  const picked = roles.find((r) => r.id === pickedId) ?? roles[0]
  const roleName = (r: RoleRow) => (lang === 'en' ? r.nameEn : r.nameTh)

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-6 md:py-8 xl:px-8">
      <div>
        <a href={TEAM_PATH} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          {tr(c.back)}
        </a>
        <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-extrabold md:text-3xl">
          <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          {tr(c.title)}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{tr(c.intro)}</p>
        {!canEdit && <p className="mt-2 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.readOnly)}</p>}
      </div>

      {/* Short side pinned, long side scrolls (CLAUDE.md §5). */}
      <div className="grid gap-5 md:grid-cols-[17rem_minmax(0,1fr)] md:items-start">
        <aside className="flex flex-col gap-2 md:sticky md:top-[73px] md:max-h-[calc(100dvh-89px)] md:overflow-y-auto xl:top-[81px] xl:max-h-[calc(100dvh-97px)]">
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setPickedId(r.id)}
              aria-pressed={r.id === picked?.id}
              className={cn(
                'flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-left transition-colors',
                r.id === picked?.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-secondary',
              )}
            >
              {r.isSystem ? <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <UserCog className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{roleName(r)}</span>
                <span className="block text-xs text-muted-foreground">
                  {tr(r.isSystem ? c.system : c.custom)}
                  {r.holders > 0 && ` · ${tr(c.holders).replace('{n}', String(r.holders))}`}
                </span>
              </span>
            </button>
          ))}
          {canEdit &&
            (adding ? (
              <NewRole onDone={(id) => {
                  setAdding(false)
                  if (id) setPickedId(id)
                }} />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border px-3.5 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {tr(c.newRole)}
              </button>
            ))}
        </aside>

        {picked && <RoleEditor key={`${picked.id}-${picked.perms.join(',')}`} role={picked} canEdit={canEdit} />}
      </div>
    </div>
  )
}

function NewRole({ onDone }: { onDone: (id?: string) => void }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [th, setTh] = useState('')
  const [en, setEn] = useState('')
  const [pending, start] = useTransition()
  const field = 'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm'
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl border border-primary/40 bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await createRole(th, en)
          if (!res.ok) {
            toast({ kind: 'error', text: tr(rolesErrors[res.error] ?? rolesErrors.failed) })
            return
          }
          router.refresh()
          onDone(res.id)
        })
      }}
    >
      <input value={th} onChange={(e) => setTh(e.target.value)} placeholder={tr(c.nameTh)} aria-label={tr(c.nameTh)} maxLength={80} required autoFocus className={field} />
      <input value={en} onChange={(e) => setEn(e.target.value)} placeholder={tr(c.nameEn)} aria-label={tr(c.nameEn)} maxLength={80} className={field} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !th.trim()} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {pending && <Spinner className="h-3.5 w-3.5" />}
          {tr(c.create)}
        </button>
        <button type="button" onClick={() => onDone()} className="h-9 rounded-full border border-border px-3 text-sm font-semibold hover:bg-secondary">
          {tr(c.cancel)}
        </button>
      </div>
    </form>
  )
}

function RoleEditor({ role, canEdit }: { role: RoleRow; canEdit: boolean }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [th, setTh] = useState(role.nameTh)
  const [en, setEn] = useState(role.nameEn)
  // The ticked keys (as stored). A system role (read only) also shows its
  // built-in keys — the floor every holder gets.
  const [sel, setSel] = useState<string[]>(role.perms)
  const readOnly = role.isSystem || !canEdit
  const held = useMemo(() => expandPermissions([...sel, ...role.base]), [sel, role.base])
  const dirty = !sameSet(sel, role.perms) || th.trim() !== role.nameTh || en.trim() !== role.nameEn

  /** A key comes from a ticked parent (can't be unticked on its own). */
  const lockOf = (k: string): 'parent' | null => (withAncestors(k).slice(1).some((a) => sel.includes(a)) ? 'parent' : null)
  const toggle = (k: string) => {
    if (readOnly || lockOf(k)) return
    setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s.filter((x) => !x.startsWith(`${k}.`)), k]))
  }

  const save = () =>
    start(async () => {
      const res = await updateRole(role.id, { nameTh: th, nameEn: en, perms: sel })
      if (!res.ok) {
        toast({ kind: 'error', text: tr(rolesErrors[res.error] ?? rolesErrors.failed) })
        return
      }
      toast({ kind: 'success', text: tr(c.saved) })
      router.refresh()
    })
  const remove = () => {
    if (!window.confirm(tr(c.confirmDelete).replace('{r}', role.nameTh).replace('{n}', String(role.holders)))) return
    start(async () => {
      const res = await deleteRole(role.id)
      if (!res.ok) {
        toast({ kind: 'error', text: tr(rolesErrors[res.error] ?? rolesErrors.failed) })
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-border bg-card">
      {/* Header stays while the tree scrolls past (page scroll). */}
      <div className="sticky top-[57px] z-10 flex flex-wrap items-end gap-3 rounded-t-2xl border-b border-border bg-card px-4 py-3 md:px-5 xl:top-[65px]">
        {readOnly ? (
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-display text-lg font-extrabold">
              <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {tr({ th: role.nameTh, en: role.nameEn })}
            </p>
            {role.isSystem && <p className="text-xs text-muted-foreground">{tr(role.key === 'admin' ? c.lockedAdmin : c.lockedBase)}</p>}
          </div>
        ) : (
          <div className="grid w-full min-w-0 gap-2 sm:w-auto sm:flex-1 sm:grid-cols-2">
            <input value={th} onChange={(e) => setTh(e.target.value)} aria-label={tr(c.nameTh)} maxLength={80} className="h-10 w-full rounded-xl border border-border bg-background px-3 font-semibold" />
            <input value={en} onChange={(e) => setEn(e.target.value)} aria-label={tr(c.nameEn)} maxLength={80} className="h-10 w-full rounded-xl border border-border bg-background px-3" />
          </div>
        )}
        {!readOnly && (
          <div className="ml-auto flex items-center gap-2">
            {dirty && <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">{tr(c.unsaved)}</span>}
            <button type="button" onClick={remove} disabled={pending} title={tr(c.delete)} aria-label={tr(c.delete)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-destructive hover:bg-destructive/10 disabled:opacity-50">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={save} disabled={!dirty || pending} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {pending && <Spinner className="h-3.5 w-3.5" />}
              {tr(c.save)}
            </button>
          </div>
        )}
      </div>

      <div className="divide-y divide-border">
        {AREAS.map((m) => (
          <ModuleBlock key={m.key} module={m} held={held} lockOf={lockOf} toggle={toggle} readOnly={readOnly} />
        ))}
      </div>
    </section>
  )
}

function ModuleBlock({
  module: m,
  held,
  lockOf,
  toggle,
  readOnly,
}: {
  module: Area
  held: Set<string>
  lockOf: (k: string) => 'parent' | null
  toggle: (k: string) => void
  readOnly: boolean
}) {
  const { tr } = useLanguage()
  const kids = m.children ?? []
  const some = kids.some((k) => held.has(`access:${k.key}`))
  const actions = ACTIONS.filter((a) => a.area === m.key)
  return (
    <div className="px-4 py-3 md:px-5">
      <Tick k={`access:${m.key}`} label={tr(m.label)} icon={ICON[m.key]} strong held={held} partial={!held.has(`access:${m.key}`) && some} lockOf={lockOf} toggle={toggle} readOnly={readOnly} />
      {kids.length > 0 && (
        <div className="mt-1 ml-3 border-l border-border pl-4">
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{tr(c.access)}</p>
          <div className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
            {kids.map((k) => (
              <Tick key={k.key} k={`access:${k.key}`} label={tr(k.label)} icon={ICON[k.key]} held={held} lockOf={lockOf} toggle={toggle} readOnly={readOnly} />
            ))}
          </div>
          {actions.length > 0 && (
            <>
              <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{tr(c.actions)}</p>
              <div className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
                {actions.map((a) => (
                  <Tick key={a.key} k={`action:${a.key}`} label={tr(a.label)} held={held} lockOf={lockOf} toggle={toggle} readOnly={readOnly} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Tick({
  k,
  label,
  icon: Icon,
  strong,
  partial,
  held,
  lockOf,
  toggle,
  readOnly,
}: {
  k: string
  label: string
  icon?: LucideIcon
  strong?: boolean
  partial?: boolean
  held: Set<string>
  lockOf: (k: string) => 'parent' | null
  toggle: (k: string) => void
  readOnly: boolean
}) {
  const { tr } = useLanguage()
  const lock = lockOf(k)
  const on = held.has(k)
  // Read only (a system role): a plain mark, no checkbox to tick.
  if (readOnly) {
    const Mark = on ? Check : partial ? Minus : null
    return (
      <div className={cn('flex min-w-0 items-center gap-2 py-1.5 text-sm', strong ? 'font-bold' : 'font-medium', !on && 'text-muted-foreground')}>
        <span
          className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full', on ? 'bg-primary text-primary-foreground' : partial ? 'bg-primary/15 text-primary' : 'border border-border')}
          aria-label={on ? '✓' : undefined}
        >
          {Mark && <Mark className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
        </span>
        {Icon && <Icon className={cn('h-4 w-4 shrink-0', on ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />}
        <span className="min-w-0 truncate">{label}</span>
      </div>
    )
  }
  return (
    <label
      title={lock === 'parent' ? tr(c.inherited) : undefined}
      className={cn('flex min-w-0 items-center gap-2 rounded-lg py-1.5 text-sm', strong ? 'font-bold' : 'font-medium', lock && 'cursor-default', !on && 'text-muted-foreground')}
    >
      <input
        type="checkbox"
        checked={on}
        ref={(el) => {
          if (el) el.indeterminate = Boolean(partial)
        }}
        disabled={Boolean(lock)}
        onChange={() => toggle(k)}
        className="h-4 w-4 shrink-0 rounded border-border accent-[var(--brand)] disabled:opacity-60"
      />
      {Icon && <Icon className={cn('h-4 w-4 shrink-0', on ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />}
      <span className="min-w-0 truncate">{label}</span>
      {lock && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </label>
  )
}
