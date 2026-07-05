import { AlertCircle } from 'lucide-react';

export function shortAddress(address?: string) {
  if (!address) {
    return '--';
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </section>
  );
}

export function MetricCard({
  label,
  value,
  helper,
  valueClassName = 'text-slate-950',
}: {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold leading-6 ${valueClassName}`}>{value}</p>
      {helper ? <p className="mt-1 text-xs leading-5 text-slate-400">{helper}</p> : null}
    </div>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'neutral' | 'danger';
  children: React.ReactNode;
}) {
  const classNameByTone = {
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    neutral: 'bg-slate-100 text-slate-600',
    danger: 'bg-rose-50 text-rose-700',
  };

  return (
    <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold ${classNameByTone[tone]}`}>
      {children}
    </span>
  );
}

export function PageErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <AlertCircle size={18} />
      {message}
    </div>
  );
}

export function SectionPlaceholder({
  icon,
  title,
  description,
  className = '',
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 px-8 py-10 text-center ${className}`}>
      {icon ? (
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          {icon}
        </span>
      ) : null}
      <div className="max-w-md space-y-1">
        <p className="text-base font-semibold text-slate-900">{title}</p>
        {description ? <p className="text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
    </div>
  );
}

export function TablePlaceholderRow({
  colSpan,
  icon,
  title,
  description,
}: {
  colSpan: number;
  icon?: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-0">
        <SectionPlaceholder
          icon={icon}
          title={title}
          description={description}
          className="min-h-[176px] py-12"
        />
      </td>
    </tr>
  );
}

type TableAlign = 'left' | 'center' | 'right';

function getTableAlignClass(align: TableAlign) {
  if (align === 'right') {
    return 'text-right';
  }

  if (align === 'center') {
    return 'text-center';
  }

  return 'text-left';
}

export function AdminTable({
  children,
  minWidth,
  className = '',
}: {
  children: React.ReactNode;
  minWidth?: string;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-left" style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  );
}

export function AdminTableHead({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <thead className={`bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 ${className}`}>
      {children}
    </thead>
  );
}

export function AdminTableBody({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <tbody className={`divide-y divide-slate-200 bg-white ${className}`}>{children}</tbody>;
}

export function AdminTableHeaderCell({
  children,
  align = 'left',
  className = '',
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  align?: TableAlign;
}) {
  return (
    <th className={`px-5 py-3.5 ${getTableAlignClass(align)} ${className}`} {...props}>
      {children}
    </th>
  );
}

export function AdminTableCell({
  children,
  align = 'left',
  className = '',
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: TableAlign;
}) {
  return (
    <td className={`px-5 py-4 align-middle ${getTableAlignClass(align)} ${className}`} {...props}>
      {children}
    </td>
  );
}

export function SectionHeader({
  icon,
  title,
  description,
  badge,
  className = '',
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col justify-between gap-4 md:flex-row md:items-center ${className}`}>
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            {icon}
          </span>
        ) : null}
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
    </div>
  );
}

export function PanelToolbar({
  title,
  description,
  icon,
  actions,
  className = '',
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col justify-between gap-4 xl:flex-row xl:items-center ${className}`}>
      <SectionHeader icon={icon} title={title} description={description} />
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function StatChip({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export function SummaryStatCard({
  label,
  value,
  helper,
  icon,
  tone = 'neutral',
  action,
}: {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'success' | 'warning' | 'neutral' | 'danger';
  action?: React.ReactNode;
}) {
  const toneClassByTone = {
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    neutral: 'bg-slate-100 text-slate-600',
    danger: 'bg-rose-50 text-rose-700',
  };

  return (
    <Card className="p-5">
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
            {helper ? <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p> : null}
          </div>
          {icon ? (
            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClassByTone[tone]}`}
            >
              {icon}
            </span>
          ) : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
    </Card>
  );
}
