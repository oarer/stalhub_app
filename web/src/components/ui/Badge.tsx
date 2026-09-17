import type { VariantProps } from 'class-variance-authority'
import { badgeVariants } from '@/constants/ui/badge.const'
import { cn } from '@/lib/cn'

export interface IBadgeProps
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: IBadgeProps) {
	return (
		<div className={cn(badgeVariants({ variant }), className)} {...props} />
	)
}

export { Badge, badgeVariants }
