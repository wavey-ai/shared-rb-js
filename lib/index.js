'use strict'
function sharedbuffer(frame_size, max_frames, dataType) {
  if ((max_frames & (max_frames - 1)) !== 0) throw new RangeError('max_frames must be a power of two')
  const headerBytes = 6 * 4
  const elBytes = dataType.BYTES_PER_ELEMENT
  const dataBytes = frame_size * elBytes * max_frames
  return new SharedArrayBuffer(headerBytes + dataBytes)
}

function ringbuffer(sab, frame_size, max_frames, dataType) {
  const mask = max_frames - 1
  const hdrBytes = 6 * 4
  const elBytes = dataType.BYTES_PER_ELEMENT

  const in_b = new Uint32Array(sab, 0, 1)
  const out_b = new Uint32Array(sab, 4, 1)
  const dropped_b = new Uint32Array(sab, 8, 1)
  const w_ptr_b = new Uint32Array(sab, 12, 1)
  const r_ptr_b = new Uint32Array(sab, 16, 1)
  const wrap_b = new Uint32Array(sab, 20, 1)

  const frames = Array.from(
    { length: max_frames },
    (_, i) => new dataType(sab, hdrBytes + i * frame_size * elBytes, frame_size)
  )

  const wrapping_add = i => (i + 1) & mask
  const in_count = () => Atomics.load(in_b, 0)
  const out_count = () => Atomics.load(out_b, 0)

  function push(frame) {
    const ic = in_count()
    const oc = out_count()
    if (ic - oc >= max_frames) {
      Atomics.add(dropped_b, 0, 1)
      Atomics.store(out_b, 0, oc + 1)
      Atomics.store(r_ptr_b, 0, wrapping_add(Atomics.load(r_ptr_b, 0)))
      Atomics.store(wrap_b, 0, 1)
    }
    const slot = Atomics.load(w_ptr_b, 0)
    frames[slot].set(frame)                      // copy only, no alloc
    Atomics.store(w_ptr_b, 0, wrapping_add(slot))
    Atomics.store(in_b, 0, ic + 1)
    return true
  }

  function pop() {
    while (true) {
      const ic = in_count()
      const oc = out_count()
      if (ic - oc === 0) return
      if (Atomics.compareExchange(out_b, 0, oc, oc + 1) !== oc) continue
      const slot = Atomics.load(r_ptr_b, 0)
      Atomics.store(r_ptr_b, 0, wrapping_add(slot))
      return frames[slot]                        // reused object
    }
  }

  const count = () => in_count() - out_count()
  const dropped_count = () => Atomics.load(dropped_b, 0)
  return { sab, push, pop, count, dropped_count }
}

if (typeof module !== 'undefined') {
  module.exports = { sharedbuffer, ringbuffer }
}

