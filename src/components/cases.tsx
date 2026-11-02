'use client';
import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {
  Search,
  SlidersHorizontal,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  X,
  Columns3,
  Bookmark,
  Plus,
  ListFilter,
  UserRoundPlus,
  Check,
  ArrowUpRight,
} from 'lucide-react';
import { api, useAction } from '@/lib/client';
import type { Case } from '@/lib/types';
import { statuses, priorities } from '@/lib/types';
import type { Filters, CaseEdit } from '@/lib/service';
import { useWorkspace } from './workspace';
import { SectionHeading, Button, Badge, Avatar, Modal, ErrorBox, Loading, Empty } from './ui';
import { formatInTimeZone } from 'date-fns-tz';
import { CaseDetail } from './case-detail';
import { validCalendarDate } from '@/lib/dates';

export function readFilters(params: URLSearchParams): Filters {
  const valid = (key: string, values: readonly string[], fallback: string) =>
    values.includes(params.get(key) ?? '') ? params.get(key)! : fallback;
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    status: valid('status', [...statuses, 'Open'], '') as Filters['status'],
    completedDays: [7, 14, 30].includes(Number(params.get('completedDays')))
      ? (Number(params.get('completedDays')) as 7 | 14 | 30)
      : 0,
    priority: valid('priority', priorities, '') as Filters['priority'],
    assignee: params.get('assignee') ?? '',
    type: params.get('type') ?? '',
    from: validCalendarDate(params.get('from') ?? '') ? params.get('from')! : '',
    to: validCalendarDate(params.get('to') ?? '') ? params.get('to')! : '',
    sort: valid(
      'sort',
      ['updated', 'created', 'patient', 'priority'],
      'updated',
    ) as Filters['sort'],
    direction: valid('direction', ['asc', 'desc'], 'desc') as Filters['direction'],
    page: Math.min(10000, Math.max(1, Number.parseInt(params.get('page') ?? '1') || 1)),
  };
}
export function Cases() {
  const { data: boot, slug, key } = useWorkspace();
  const params = useSearchParams(),
    router = useRouter(),
    base = `/app/${slug}/cases`;
  const filters = readFilters(params),
    signature = JSON.stringify(filters);
  const [filterOpen, setFilterOpen] = useState(false),
    [saveOpen, setSaveOpen] = useState(false),
    [viewName, setViewName] = useState(''),
    [panel, setPanel] = useState<string | null>(null),
    [visibility, setVisibility] = useState<VisibilityState>(boot.columns),
    [selected, setSelected] = useState<{ key: string; ids: string[] }>({
      key: '',
      ids: [],
    }),
    [bulkOpen, setBulkOpen] = useState(false),
    [bulkAssignee, setBulkAssignee] = useState('unchanged'),
    [bulkStatus, setBulkStatus] = useState('unchanged');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selectedIds = selected.key === signature ? selected.ids : [];
  const q = useQuery({
    queryKey: [key, slug, 'cases', signature],
    queryFn: ({ signal }) => api.cases.query({ slug, filters }, { signal }),
  });
  const bulk = useAction((items: CaseEdit[]) => api.bulkEdit.mutate({ slug, items }));
  const save = useAction((name: string) => api.saveView.mutate({ slug, name, filters }));
  const preferences = useAction((density: 'comfortable' | 'compact') =>
    api.preferences.mutate({
      slug,
      appearance: boot.user.appearance as 'light' | 'dark',
      density,
    }),
  );
  const saveColumns = useAction((columns: VisibilityState) =>
    api.tableColumns.mutate({ slug, columns }),
  );
  function update(values: Record<string, string | number>, resetPage = true) {
    const next = new URLSearchParams(params.toString());
    if (resetPage) next.delete('page');
    for (const [k, v] of Object.entries(values)) {
      if (v === '') next.delete(k);
      else next.set(k, String(v));
    }
    router.push(`${base}?${next}`, { scroll: false });
  }
  function open(e: React.MouseEvent, id: string) {
    if (window.innerWidth >= 1024 && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      setPanel(id);
    }
  }
  function toggle(id: string) {
    setSelected({
      key: signature,
      ids: selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    });
  }
  function sort(field: Filters['sort']) {
    update({
      sort: field,
      direction: filters.sort === field && filters.direction === 'desc' ? 'asc' : 'desc',
    });
  }
  const rows = q.data?.rows ?? [];
  const columns: ColumnDef<Case>[] = [
    {
      id: 'selection',
      header: () => (
        <input
          type="checkbox"
          aria-label="Select all cases on this page"
          checked={!!rows.length && rows.every((r) => selectedIds.includes(r.id))}
          onChange={(e) =>
            setSelected({
              key: signature,
              ids: e.target.checked ? rows.map((r) => r.id) : [],
            })
          }
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.original.number}`}
          checked={selectedIds.includes(row.original.id)}
          onChange={() => toggle(row.original.id)}
        />
      ),
    },
    {
      accessorKey: 'number',
      header: 'Case',
      cell: ({ row }) => (
        <Link
          className="case-number"
          href={`${base}/${row.original.id}`}
          onClick={(e) => open(e, row.original.id)}
        >
          {row.original.number}
          <ArrowUpRight size={12} />
        </Link>
      ),
    },
    {
      accessorKey: 'patient',
      header: () => (
        <button className="sort-button" onClick={() => sort('patient')}>
          Patient <ArrowDownUp size={12} />
        </button>
      ),
      cell: ({ row }) => (
        <div className="patient-cell">
          <Avatar name={row.original.patient} size="small" />
          <div>
            <Link href={`${base}/${row.original.id}`} onClick={(e) => open(e, row.original.id)}>
              {row.original.patient}
            </Link>
            <small>{row.original.type}</small>
          </div>
        </div>
      ),
    },
    { accessorKey: 'type', header: 'Case type' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => <Badge value={getValue() as string} />,
    },
    {
      accessorKey: 'priority',
      header: () => (
        <button className="sort-button" onClick={() => sort('priority')}>
          Priority <ArrowDownUp size={12} />
        </button>
      ),
      cell: ({ getValue }) => (
        <span className={`priority priority-${String(getValue()).toLowerCase()}`}>
          <span />
          {String(getValue())}
        </span>
      ),
    },
    {
      accessorKey: 'assignee',
      header: 'Assignee',
      cell: ({ getValue }) =>
        getValue() ? (
          <span className="assignee-cell">
            <Avatar name={String(getValue())} size="small" />
            {String(getValue()).split(' ')[0]}
          </span>
        ) : (
          <span className="unassigned">
            <UserRoundPlus size={14} />
            Unassigned
          </span>
        ),
    },
    {
      accessorKey: 'created_at',
      header: () => (
        <button className="sort-button" onClick={() => sort('created')}>
          Created <ArrowDownUp size={12} />
        </button>
      ),
      cell: ({ getValue }) => (
        <span className="date-cell">
          {formatInTimeZone(getValue() as number, boot.clinic.timezone, 'MMM d, yyyy')}
        </span>
      ),
    },
    {
      accessorKey: 'updated_at',
      header: () => (
        <button className="sort-button" onClick={() => sort('updated')}>
          Updated <ArrowDownUp size={12} />
        </button>
      ),
      cell: ({ getValue }) => (
        <span className="date-cell">
          {formatInTimeZone(getValue() as number, boot.clinic.timezone, 'MMM d, h:mm a')}
        </span>
      ),
    },
  ];
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table owns mutable table state; React Compiler is not enabled.
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: { columnVisibility: visibility },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater(visibility) : updater;
      setVisibility(next);
      saveColumns.mutate(next);
    },
  });
  const active = Object.entries(filters).filter(
    ([k, v]) =>
      ['q', 'status', 'priority', 'assignee', 'type', 'from', 'to', 'completedDays'].includes(k) &&
      v,
  );
  return (
    <>
      <SectionHeading
        eyebrow="A CLEAR NEXT STEP FOR EVERY REQUEST"
        title="Cases"
        description="From first intake to final follow-up. Keep every detail together."
        action={
          <Button variant="secondary" onClick={() => setSaveOpen(true)}>
            <Bookmark size={16} />
            Save current view
          </Button>
        }
      />
      <section className="panel cases-panel">
        {saveColumns.error && <ErrorBox error={saveColumns.error} />}
        {preferences.error && <ErrorBox error={preferences.error} />}
        <div className="case-tabs">
          <button
            className={!filters.assignee ? 'case-tab active' : 'case-tab'}
            onClick={() => update({ assignee: '' })}
          >
            All cases <span>{q.data?.total ?? '…'}</span>
          </button>
          <button
            className={filters.assignee === 'me' ? 'case-tab active' : 'case-tab'}
            onClick={() => update({ assignee: 'me' })}
          >
            My cases
          </button>
          <button
            className={filters.assignee === 'unassigned' ? 'case-tab active' : 'case-tab'}
            onClick={() => update({ assignee: 'unassigned' })}
          >
            Unassigned
          </button>
          <button
            className="case-tab"
            onClick={() =>
              update({
                from: formatInTimeZone(Date.now(), boot.clinic.timezone, 'yyyy-MM-dd'),
                to: formatInTimeZone(Date.now(), boot.clinic.timezone, 'yyyy-MM-dd'),
              })
            }
          >
            New today
          </button>
          <Dropdown.Root>
            <Dropdown.Trigger className="case-tab">
              <Bookmark size={14} />
              Saved views <ChevronRight size={13} />
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content className="dropdown-content" sideOffset={8}>
                {boot.views.length ? (
                  boot.views.map((view) => (
                    <Dropdown.Item
                      className="dropdown-item"
                      key={view.id}
                      onSelect={() => {
                        const saved = JSON.parse(view.filters) as Filters;
                        const next = new URLSearchParams();
                        for (const [k, v] of Object.entries(saved)) if (v) next.set(k, String(v));
                        router.push(`${base}?${next}`);
                      }}
                    >
                      {view.name}
                    </Dropdown.Item>
                  ))
                ) : (
                  <Dropdown.Label className="dropdown-label">No saved views yet</Dropdown.Label>
                )}
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
        </div>
        <div className="case-toolbar">
          <div className="table-search">
            <Search size={17} />
            <input
              key={filters.q}
              defaultValue={filters.q}
              aria-label="Search cases"
              placeholder="Search patient or case number…"
              onChange={(e) => {
                const value = e.target.value;
                clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => update({ q: value }), 350);
              }}
            />
          </div>
          <div className="toolbar-buttons">
            <Button variant="secondary" onClick={() => setFilterOpen(true)}>
              <SlidersHorizontal size={15} />
              Filters
              {active.length > 0 && <span className="filter-count">{active.length}</span>}
            </Button>
            <Dropdown.Root>
              <Dropdown.Trigger className="btn btn-secondary column-button">
                <Columns3 size={15} />
                Display
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content className="dropdown-content" align="end">
                  <Dropdown.Label className="dropdown-label">VISIBLE COLUMNS</Dropdown.Label>
                  {table
                    .getAllLeafColumns()
                    .filter((c) => !['selection', 'number', 'patient'].includes(c.id))
                    .map((c) => (
                      <Dropdown.CheckboxItem
                        className="dropdown-item"
                        key={c.id}
                        checked={c.getIsVisible()}
                        onCheckedChange={(v) => c.toggleVisibility(v)}
                      >
                        <span className="menu-check">
                          {c.getIsVisible() && <Check size={14} />}
                        </span>
                        {c.id.replaceAll('_', ' ')}
                      </Dropdown.CheckboxItem>
                    ))}
                  <Dropdown.Separator className="dropdown-separator" />
                  <Dropdown.Item
                    className="dropdown-item"
                    onSelect={() =>
                      preferences.mutate(
                        boot.user.density === 'compact' ? 'comfortable' : 'compact',
                      )
                    }
                  >
                    Use {boot.user.density === 'compact' ? 'comfortable' : 'compact'} density
                  </Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          </div>
        </div>
        {active.length > 0 && (
          <div className="active-filters">
            {active.map(([k, v]) => (
              <button key={k} onClick={() => update({ [k]: '' })}>
                {k}:{' '}
                {String(v) === 'me'
                  ? 'My cases'
                  : String(v) === 'unassigned'
                    ? 'Unassigned'
                    : String(v)}
                <X size={12} />
              </button>
            ))}
            <button className="clear-filters" onClick={() => router.push(base)}>
              Clear all
            </button>
          </div>
        )}
        {selectedIds.length > 0 && (
          <div className="bulk-bar">
            <span>
              <strong>{selectedIds.length}</strong> selected on this page
            </span>
            {boot.member.role !== 'viewer' && (
              <Button
                variant="secondary"
                onClick={() => {
                  bulk.reset();
                  setBulkOpen(true);
                }}
              >
                Edit selected
              </Button>
            )}
            <button
              className="text-button"
              onClick={() => setSelected({ key: signature, ids: [] })}
            >
              Clear selection
            </button>
          </div>
        )}
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} retry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <Empty title="No cases in this view">
            Adjust your filters or clear them to see your clinic’s cases.
          </Empty>
        ) : (
          <>
            <div
              className="table-scroller"
              role="region"
              aria-label="Clinic cases table"
              tabIndex={0}
            >
              <table className="cases-table">
                <thead>
                  {table.getHeaderGroups().map((g) => (
                    <tr key={g.id}>
                      {g.headers.map((h) => (
                        <th
                          key={h.id}
                          scope="col"
                          aria-sort={
                            h.id === `${filters.sort}_at` || h.id === filters.sort
                              ? filters.direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : undefined
                          }
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((r) => (
                    <tr key={r.id} data-selected={selectedIds.includes(r.original.id)}>
                      {r.getVisibleCells().map((c) => (
                        <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-cases">
              {rows.map((item) => (
                <article className="mobile-case" key={item.id}>
                  <div>
                    <label className="card-select">
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.number}`}
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                      <span>{item.number}</span>
                    </label>
                    <Badge value={item.status} />
                  </div>
                  <Link href={`${base}/${item.id}`}>
                    <Avatar name={item.patient} />
                    <span>
                      <strong>{item.patient}</strong>
                      <small>{item.type}</small>
                    </span>
                    <ChevronRight size={18} />
                  </Link>
                  <div>
                    <span className={`priority priority-${item.priority.toLowerCase()}`}>
                      <span />
                      {item.priority} priority
                    </span>
                    <span className="muted">{item.assignee ?? 'Unassigned'}</span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        <div className="pagination">
          <p>
            {q.data?.total
              ? `${(filters.page - 1) * 15 + 1}–${Math.min(filters.page * 15, q.data.total)} of ${q.data.total} cases`
              : '0 cases'}
            <span> · Page-only selection</span>
          </p>
          <div>
            <button
              className="icon-btn"
              disabled={filters.page <= 1}
              onClick={() => update({ page: filters.page - 1 }, false)}
              aria-label="Previous page"
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              Page {filters.page} of {q.data?.pages ?? 1}
            </span>
            <button
              className="icon-btn"
              disabled={filters.page >= (q.data?.pages ?? 1)}
              onClick={() => update({ page: filters.page + 1 }, false)}
              aria-label="Next page"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>
      <div className="table-hint">
        <ListFilter size={14} />
        <span>Filters and sorting travel with your URL. Share a link to the exact view.</span>
        <span>{boot.clinic.timezone}</span>
      </div>
      <Modal
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="Find the right cases"
        description="Refine this clinic’s case list. Filters are saved in the URL."
        sheet
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            update(Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)])));
            setFilterOpen(false);
          }}
          className="stacked-form"
        >
          <label>
            Status
            <select name="status" aria-label="Status" defaultValue={filters.status}>
              <option value="">All statuses</option>
              <option value="Open">Open (all incomplete)</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select name="priority" aria-label="Priority" defaultValue={filters.priority}>
              <option value="">All priorities</option>
              {priorities.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Assignee
            <select name="assignee" aria-label="Assignee" defaultValue={filters.assignee}>
              <option value="">Everyone</option>
              <option value="me">My cases</option>
              <option value="unassigned">Unassigned</option>
              {boot.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Case type
            <select name="type" defaultValue={filters.type}>
              <option value="">All types</option>
              {[
                'New patient intake',
                'Follow-up coordination',
                'Referral review',
                'Document request',
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Created from
              <input name="from" type="date" defaultValue={filters.from} />
            </label>
            <label>
              Created through
              <input name="to" type="date" defaultValue={filters.to} />
            </label>
          </div>
          <label>
            Sort by
            <select name="sort" defaultValue={filters.sort}>
              <option value="updated">Last updated</option>
              <option value="created">Created date</option>
              <option value="patient">Patient name</option>
              <option value="priority">Priority</option>
            </select>
          </label>
          <label>
            Order
            <select name="direction" defaultValue={filters.direction}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
          <div className="form-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.push(base);
                setFilterOpen(false);
              }}
            >
              Reset filters
            </Button>
            <Button type="submit">Apply filters</Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title="Save this view"
        description="Keep these filters handy. Saved views belong to you and this clinic."
      >
        <form
          className="stacked-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(viewName, {
              onSuccess: () => {
                setSaveOpen(false);
                setViewName('');
              },
            });
          }}
        >
          <label>
            View name
            <input
              maxLength={40}
              required
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="e.g. High-priority referrals"
            />
          </label>
          {save.error && <ErrorBox error={save.error} />}
          <div className="form-actions">
            <Button pending={save.isPending} type="submit">
              <Plus size={16} />
              Save view
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title={`Update ${selectedIds.length} selected cases`}
        description="Only cases selected on this page are affected. Each record is checked independently."
      >
        <div className="stacked-form">
          <label>
            Assign to
            <select value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)}>
              <option value="unchanged">Keep current assignee</option>
              <option value="">Unassigned</option>
              {boot.members
                .filter((m) => m.active && m.role !== 'viewer')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Move to status
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
              <option value="unchanged">Keep current status</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <p className="muted">
            Status transitions still apply. Reopening completed cases requires a reason from the
            individual case screen.
          </p>
          {bulk.error && <ErrorBox error={bulk.error} />}
          <div className="form-actions">
            <Button
              disabled={bulkStatus === 'unchanged' && bulkAssignee === 'unchanged'}
              pending={bulk.isPending}
              onClick={() =>
                bulk.mutate(
                  rows
                    .filter((r) => selectedIds.includes(r.id))
                    .map((r) => ({
                      id: r.id,
                      version: r.version,
                      ...(bulkStatus !== 'unchanged'
                        ? { status: bulkStatus as Case['status'] }
                        : {}),
                      ...(bulkAssignee !== 'unchanged' ? { assigneeId: bulkAssignee || null } : {}),
                    })),
                )
              }
            >
              Confirm update of {selectedIds.length} cases
            </Button>
          </div>
          {bulk.data && (
            <div className="bulk-results" role="status">
              <strong>
                {bulk.data.filter((x) => x.success).length} saved ·{' '}
                {bulk.data.filter((x) => !x.success).length} need review
              </strong>
              {bulk.data.map((result) => (
                <p key={result.id}>
                  {rows.find((r) => r.id === result.id)?.number ?? result.id}:{' '}
                  {result.success ? 'Saved' : result.error}
                </p>
              ))}
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={!!panel}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="Case workspace"
        description="Review the case, update ownership, and follow its history."
        sheet
      >
        {panel && <CaseDetail key={panel} id={panel} embedded />}
      </Modal>
    </>
  );
}
