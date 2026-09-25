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
	<div className="flex flex-col gap-3 rounded-lg bg-accent/50 p-4 sm:flex-row sm:items-center sm:justify-between">
		<div className="flex min-w-0 flex-col gap-1">
				<span className="font-semibold text-sm">{title}</span>
				<span className="font-semibold text-text-accent text-xs">
					{description}
				</span>
			</div>
			{children}
		</div>
	)
}
