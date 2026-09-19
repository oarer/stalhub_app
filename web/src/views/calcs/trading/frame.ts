// Exact comparison avoids missing a changed digit in an otherwise static table.
// Pixels are compared at OCR resolution, not using a lossy thumbnail/hash.
export function sameFrame(
	previous: Uint8ClampedArray | null,
	next: Uint8ClampedArray
): boolean {
	if (!previous || previous.length !== next.length) return false
	for (let i = 0; i < next.length; i++)
		if (previous[i] !== next[i]) return false
	return true
}
