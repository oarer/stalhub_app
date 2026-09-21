import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { sameFrame } from './frame'

test('first frame and resized frames require recognition', () => {
	assert.equal(sameFrame(null, new Uint8ClampedArray(4)), false)
	assert.equal(
		sameFrame(new Uint8ClampedArray(4), new Uint8ClampedArray(8)),
		false
	)
})
test('identical frames are skipped but even a single changed pixel is recognized', () => {
	const previous = new Uint8ClampedArray(4000)
	const next = previous.slice()
	assert.equal(sameFrame(previous, next), true)
	next[1999] = 1
	assert.equal(sameFrame(previous, next), false)
})
