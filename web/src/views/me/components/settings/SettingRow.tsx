export function SettingRow({
	title,
	description,
	children,
}: {
	title: string
	description: string
	children: React.ReactNode
}) {
	return (
	<div className="flex items-center justify-between gap-3 rounded-lg bg-accent/50 p-4">
		<div className="flex min-w-0 flex-1 flex-col gap-1">
			<span className="font-semibold text-sm">{title}</span>
			<span className="font-semibold text-text-accent text-xs">
				{description}
			</span>
		</div>
		<div className="shrink-0">{children}</div>
	</div>
	)
}
