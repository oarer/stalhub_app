'use client'

import TierListsView from '@/views/tierlists/TierListsView'

// SessionGate establishes the user's session before this private query mounts.
// Do not prefetch private data anonymously in a shared server Axios client.
export default function Page() {
 return <TierListsView mine />
}
