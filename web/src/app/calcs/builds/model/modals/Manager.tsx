import { Suspense } from 'react'
import type { ModalManagerProps } from '@/types/build.type'
import ArmorModal from './Armors'
import ArtModal from './Artefacts'
import BoostModal from './Consumables'
import ContModal from './Containers'

const MODALS = {
	armor: {
		LMB: BoostModal,
		RMB: ArmorModal,
	},
	cont: {
		LMB: ArtModal,
		RMB: ContModal,
	},
} satisfies Record<
	ModalManagerProps['type'],
	Record<ModalManagerProps['clickType'], React.FC<{ onClose: () => void }>>
>

export default function ModalManager({
	clickType,
	type,
	onClose,
}: ModalManagerProps) {
	const Modal = MODALS[type][clickType]
	return Modal ? (
		<Suspense fallback={<div>Loading...</div>}>
			<Modal onClose={onClose} />
		</Suspense>
	) : null
}
