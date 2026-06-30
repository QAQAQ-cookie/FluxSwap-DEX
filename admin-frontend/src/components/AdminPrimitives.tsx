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
      <p className={`mt-1 truncate text-sm font-semibold ${valueClassName}`}>{value}</p>
      {helper ? <p className="mt-1 truncate text-xs text-slate-400">{helper}</p> : null}
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
