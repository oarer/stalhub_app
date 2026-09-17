import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function LoadingArsenal() {
	return (
		<section className="mx-auto max-w-7xl space-y-6 px-4 pt-42 pb-12 sm:px-6">
			<div className="space-y-2">
				<Skeleton className="h-9 w-40" />
				<Skeleton className="h-5 w-32" />
			</div>

			<Card.Root>
				<div className="space-y-3 p-4">
					{[...Array(10)].map((_, i) => (
						<div className="flex gap-4" key={i}>
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-5 w-16" />
							<Skeleton className="h-5 w-20" />
							<Skeleton className="h-5 w-16" />
							<Skeleton className="h-5 w-24" />
						</div>
					))}
				</div>
			</Card.Root>
		</section>
	)
}
