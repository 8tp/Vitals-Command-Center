interface Props {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
}

export function EmptyState({ title, hint, icon }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 text-ink-mute">
      {icon && <div className="mb-3 text-ink-mute opacity-70">{icon}</div>}
      <div className="text-sm font-semibold text-ink-dim">{title}</div>
      {hint && <div className="mt-1.5 text-xs text-ink-mute max-w-xs leading-relaxed">{hint}</div>}
    </div>
  );
}
