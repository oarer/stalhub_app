'use client'

import TierListsView from '@/views/tierlists/TierListsView'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'
import MeTierListsDesktopShell from './desktop-shell'

// SessionGate establishes the user's session before this private query mounts.
// Do not prefetch private data anonymously in a shared server Axios client.
export default function Page() {
	if (IS_STATIC_EXPORT) return <MeTierListsDesktopShell />
	return <TierListsView mine />
}
