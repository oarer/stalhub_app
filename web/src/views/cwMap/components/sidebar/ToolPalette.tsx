import { Icon } from '@iconify/react'

import { Button } from '@/components/ui/Button'
import { DRAW_TOOLS, type Tool } from '../../types'

interface ToolPaletteProps {
	selectedTool: Tool
	onSelect: (tool: Tool) => void
}

export function ToolPalette({ selectedTool, onSelect }: ToolPaletteProps) {
	return (
		<div className="grid grid-cols-4 gap-1">
			{DRAW_TOOLS.map((t) => (
				<Button
					className="gap-1.5"
					key={t.key}
					onClick={() => onSelect(t.key)}
					size="sm"
					variant={selectedTool === t.key ? 'outline' : 'secondary'}
				>
					<Icon className="text-base" icon={t.icon} />
				</Button>
			))}
		</div>
	)
}
