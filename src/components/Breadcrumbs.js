import Link from "next/link";

export default function Breadcrumbs({ items }) {
  return (
    <nav className="no-print mb-4 flex flex-wrap items-center gap-1 text-sm text-slate-500">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {item.href ? (
            <Link href={item.href} className="hover:text-brand-600">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-slate-700">{item.label}</span>
          )}
          {i < items.length - 1 && <span className="text-slate-300">/</span>}
        </span>
      ))}
    </nav>
  );
}
