import { Suspense } from 'react'
import CallbackInner from './callback-inner'

type Provider = 'discord' | 'telegram' | 'exbo'

// Провайдеры конечны — static export пререндерит все три напрямую,
// path-схема сохраняется и на сайте, и в десктопе.
export function generateStaticParams(): { provider: Provider }[] {
	return [{ provider: 'discord' }, { provider: 'telegram' }, { provider: 'exbo' }]
}

export default function CallbackPage() {
	return (
		<Suspense>
			<CallbackInner />
		</Suspense>
	)
}
