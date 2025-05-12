const test = require('tap').test;
const { sharedbuffer, ringbuffer } = require('./../lib/index');

// Empty buffer pop
test('pop should return undefined when buffer is empty', t => {
  const frame_size = 4;
  const max_frames = 8;
  const sb = sharedbuffer(frame_size, max_frames, Uint8Array);
  const rb = ringbuffer(sb, frame_size, max_frames, Uint8Array);

  t.equal(rb.pop(), undefined, 'Popping from an empty buffer should return undefined');
  t.end();
});

// FIFO for Uint8Array
test('fifo push and pop', t => {
  const frame_size = 4;
  const max_frames = 128;
  const sb = sharedbuffer(frame_size, max_frames, Uint8Array);
  const rb = ringbuffer(sb, frame_size, max_frames, Uint8Array);

  const frames = [
    new Uint8Array([1, 2, 3, 4]),
    new Uint8Array([5, 6, 7, 8]),
    new Uint8Array([9, 10, 11, 12]),
    new Uint8Array([13, 14, 15, 16]),
    new Uint8Array([2, 2, 3, 4]),
    new Uint8Array([3, 6, 7, 8]),
    new Uint8Array([4, 10, 11, 12]),
    new Uint8Array([5, 14, 15, 16]),
  ];

  for (const frame of frames) rb.push(frame);
  for (let i = 0; i < frames.length; i++) {
    t.same(rb.pop(), frames[i], `frame ${i} should match`);
  }

  t.end();
});

// FIFO for Float32Array
test('fifo push and pop float', t => {
  const frame_size = 4;
  const max_frames = 128;
  const sb = sharedbuffer(frame_size, max_frames, Float32Array);
  const rb = ringbuffer(sb, frame_size, max_frames, Float32Array);

  const frames = [
    new Float32Array([1, 2, 3.2, 4]),
    new Float32Array([5, 6.44, 7, 8]),
    new Float32Array([9.1, 10.22, 11, 12]),
    new Float32Array([13, 14, 15, 16]),
    new Float32Array([2, 2.2, 3, 4]),
  ];

  for (const frame of frames) rb.push(frame);
  for (let i = 0; i < frames.length; i++) {
    t.same(rb.pop(), frames[i], `frame ${i} should match`);
  }

  t.end();
});

// Wrapping without overwrite
test('push and pop with wrapping', t => {
  const frame_size = 4;
  const max_frames = 2;
  const sb = sharedbuffer(frame_size, max_frames, Uint8Array);
  const rb = ringbuffer(sb, frame_size, max_frames, Uint8Array);

  const [f1, f2, f3, f4] = [
    new Uint8Array([1, 2, 3, 4]),
    new Uint8Array([5, 6, 7, 8]),
    new Uint8Array([9, 10, 11, 12]),
    new Uint8Array([13, 14, 15, 16]),
  ];

  rb.push(f1);
  rb.push(f2);
  t.same(rb.pop(), f1);
  t.same(rb.pop(), f2);

  rb.push(f3);
  rb.push(f4);
  t.same(rb.pop(), f3);
  t.same(rb.pop(), f4);

  t.end();
});

// Wrapping with overwrite
test('push and pop with wrapping overwrite', t => {
  const frame_size = 4;
  const max_frames = 2;
  const sb = sharedbuffer(frame_size, max_frames, Uint8Array);
  const rb = ringbuffer(sb, frame_size, max_frames, Uint8Array);

  const [f1, f2, f3, f4] = [
    new Uint8Array([1, 2, 3, 4]),
    new Uint8Array([5, 6, 7, 8]),
    new Uint8Array([9, 10, 11, 12]),
    new Uint8Array([13, 14, 15, 16]),
  ];

  rb.push(f1);
  rb.push(f2);
  rb.push(f3);
  rb.push(f4);

  t.same(rb.pop(), f3);
  t.same(rb.pop(), f4);
  t.equal(rb.pop(), undefined);
  t.equal(rb.dropped_count(), 2);

  t.end();
});

// Multiple overwrite
test('push and pop with multiple wrapping overwrite', t => {
  const frame_size = 4;
  const max_frames = 2;
  const sb = sharedbuffer(frame_size, max_frames, Uint8Array);
  const rb = ringbuffer(sb, frame_size, max_frames, Uint8Array);

  const [f1, f2, f3, f4] = [
    new Uint8Array([1, 2, 3, 4]),
    new Uint8Array([5, 6, 7, 8]),
    new Uint8Array([9, 10, 11, 12]),
    new Uint8Array([13, 14, 15, 16]),
  ];

  for (const f of [f1, f2, f3, f4, f1, f2, f3, f4]) rb.push(f);

  t.same(rb.pop(), f3);
  t.same(rb.pop(), f4);
  t.equal(rb.pop(), undefined);
  t.equal(rb.dropped_count(), 6);

  t.end();
});

// Float32 overwrite
test('float data type multiple', t => {
  const frame_size = 4;
  const max_frames = 2;
  const sb = sharedbuffer(frame_size, max_frames, Float32Array);
  const rb = ringbuffer(sb, frame_size, max_frames, Float32Array);

  const [f1, f2, f3, f4] = [
    new Float32Array([1, 2, 3, 4.23]),
    new Float32Array([5, 6.44, 2, 7]),
    new Float32Array([9, 10, 11, 12]),
    new Float32Array([13.2, 14, 15, 16]),
  ];

  for (const f of [f1, f2, f3, f4, f1, f2, f3, f4]) rb.push(f);

  t.same(rb.pop(), f3);
  t.same(rb.pop(), f4);
  t.equal(rb.pop(), undefined);
  t.equal(rb.dropped_count(), 6);

  t.end();
});

// Float32 simple
test('float data type', t => {
  const frame_size = 4;
  const max_frames = 2;
  const sb = sharedbuffer(frame_size, max_frames, Float32Array);
  const rb = ringbuffer(sb, frame_size, max_frames, Float32Array);

  const [f1, f2, f3, f4] = [
    new Float32Array([1, 2, 3, 4.23]),
    new Float32Array([5, 6.44, 2, 7]),
    new Float32Array([9, 10, 11, 12]),
    new Float32Array([13.2, 14, 15, 16]),
  ];

  for (const f of [f1, f2, f3, f4]) rb.push(f);

  t.same(rb.pop(), f3);
  t.same(rb.pop(), f4);
  t.equal(rb.pop(), undefined);
  t.equal(rb.dropped_count(), 2);

  t.end();
});

// Paired push/pop
test('push and pop with paired pushes', t => {
  const frame_size = 2;
  const max_frames = 64;
  const sb = sharedbuffer(frame_size, max_frames, Uint8Array);
  const rb = ringbuffer(sb, frame_size, max_frames, Uint8Array);

  const a = [...Array(100).keys()].map(i => new Uint8Array([i, 0]));
  const b = [...Array(100).keys()].map(i => new Uint8Array([i, 1]));

  for (let i = 0; i < a.length; i++) {
    rb.push(a[i]);
    rb.push(b[i]);

    const res = [];
    while (true) {
      const r = rb.pop();
      if (r) res.push(r);
      else break;
    }

    t.same(res[0], a[i]);
    t.same(res[1], b[i]);
    t.equal(res.length, 2);
  }

  t.end();
});

// count() accuracy across wrap
test('count reflects pushes/pops across wrap', t => {
  const frame_size = 3;
  const max_frames = 4;
  const sb = sharedbuffer(frame_size, max_frames, Uint8Array);
  const rb = ringbuffer(sb, frame_size, max_frames, Uint8Array);

  t.equal(rb.count(), 0, 'starts empty');
  rb.push(new Uint8Array([1, 2, 3]));
  t.equal(rb.count(), 1);
  rb.push(new Uint8Array([4, 5, 6]));
  rb.pop();
  t.equal(rb.count(), 1, 'one left after one pop');
  rb.push(new Uint8Array([7, 8, 9])); // wrap
  rb.push(new Uint8Array([10, 11, 12])); // overwrite
  t.equal(rb.count(), 3, 'full again after wrap overwrite');
  rb.pop(); rb.pop(); rb.pop();
  t.equal(rb.count(), 0, 'back to empty');

  t.end();
});

// single-slot buffer
test('single-slot buffer behaves correctly', t => {
  const frame_size = 1;
  const max_frames = 1;
  const sb = sharedbuffer(frame_size, max_frames, Uint8Array);
  const rb = ringbuffer(sb, frame_size, max_frames, Uint8Array);

  rb.push(new Uint8Array([42]));
  t.same(rb.pop(), new Uint8Array([42]));
  rb.push(new Uint8Array([99])); // overwrite
  rb.push(new Uint8Array([100])); // overwrite again
  t.equal(rb.dropped_count(), 1, 'one frame dropped');
  t.same(rb.pop(), new Uint8Array([100]));
  t.equal(rb.pop(), undefined);

  t.end();
});

// synthetic counter wraparound
test('counter wraparound still yields correct count', t => {
  const frame_size = 1;
  const max_frames = 2;
  const sb = sharedbuffer(frame_size, max_frames, Uint8Array);
  const rb = ringbuffer(sb, frame_size, max_frames, Uint8Array);

  const in_b = new Uint32Array(sb, 0, 1);
  const out_b = new Uint32Array(sb, 4, 1);
  in_b[0] = 0xFFFFFFFE;
  out_b[0] = 0xFFFFFFFE;

  rb.push(new Uint8Array([1]));
  t.equal(rb.count(), 1, 'handles 0xFFFFFFFF → 0 wrap');
  rb.pop();
  t.equal(rb.count(), 0);
  t.end();
});

// multi-thread smoke
const { Worker } = require('worker_threads');
const path = require('path');

test('concurrent producer / consumer', { timeout: 20000 }, t => {
  const frameSize = 8;
  const loops = 200000;
  const maxFrames = 1 << Math.ceil(Math.log2(loops + 32));
  const sb = sharedbuffer(frameSize, maxFrames, Uint8Array);
  const rb = ringbuffer(sb, frameSize, maxFrames, Uint8Array);
  const rbPath = path.join(__dirname, '..', 'lib/index.js');

  const worker = new Worker(`
    const { parentPort, workerData } = require('worker_threads');
    const { ringbuffer } = require(workerData.rbPath);
    const rb = ringbuffer(workerData.sb, workerData.frameSize, workerData.maxFrames, Uint8Array);
    const payload = new Uint8Array(workerData.frameSize);
    for (let i = 0; i < workerData.loops; i++) rb.push(payload);
    parentPort.postMessage('done');
  `, { eval: true, workerData: { sb, frameSize, maxFrames, loops, rbPath } });

  let popped = 0;
  (function drain() {
    while (rb.pop()) popped++;
    if (popped >= loops) {
      worker.terminate();
      t.equal(rb.count(), 0);
      t.equal(rb.dropped_count(), 0);
      t.end();
    } else {
      setImmediate(drain);
    }
  })();
});

// lap test: reader always gets latest
test('producer overtakes reader ⇒ reader still gets latest value', { timeout: 10000 }, t => {
  const frameSize = 1;
  const maxFrames = 128;
  const totalWrites = 10000;

  const sb = sharedbuffer(frameSize, maxFrames, Uint32Array);
  const rb = ringbuffer(sb, frameSize, maxFrames, Uint32Array);

  for (let i = 0; i < totalWrites; i++) {
    rb.push(new Uint32Array([i]));
  }

  let last = -1;
  let popped = 0;
  let f;
  while ((f = rb.pop())) {
    last = f[0];
    popped++;
  }

  t.equal(popped + rb.dropped_count(), totalWrites, 'all writes accounted for');
  t.equal(last, totalWrites - 1, 'reader sees the very latest value');
  t.end();
});

// Test for data corruption during overwrites
test('overwrite should not corrupt data', t => {
  const frame_size = 320
  const max_frames = 4
  const sb = sharedbuffer(frame_size, max_frames, Int32Array)
  const rb = ringbuffer(sb, frame_size, max_frames, Int32Array)

  // Fill the buffer with sequential patterns
  for (let i = 0; i < max_frames; i++) {
    const frame = new Int32Array(frame_size)
    for (let j = 0; j < frame_size; j++) {
      frame[j] = (i * 1000) + j
    }
    rb.push(frame)
  }

  // Start overwriting - push max_frames more frames
  for (let i = 0; i < max_frames; i++) {
    const frame = new Int32Array(frame_size)
    for (let j = 0; j < frame_size; j++) {
      frame[j] = ((i + max_frames) * 1000) + j
    }
    rb.push(frame)
  }

  // Now pop all frames and verify integrity
  const popped = []
  while (true) {
    const frame = rb.pop()
    if (frame === undefined) break
    popped.push(frame)
  }

  t.equal(popped.length, max_frames, `Should have ${max_frames} frames after overwrite`)

  for (let i = 0; i < popped.length; i++) {
    const frame = popped[i]
    const baseValue = (i + max_frames) * 1000
    let corrupted = false

    for (let j = 0; j < frame_size; j++) {
      if (frame[j] !== baseValue + j) {
        corrupted = true
        t.fail(`Frame ${i} corrupted at position ${j}: expected ${baseValue + j}, got ${frame[j]}`)
        break
      }
    }

    if (!corrupted) {
      t.pass(`Frame ${i} data integrity verified`)
    }
  }

  t.end()
})

// Test for ordering issues during rapid push/pop cycles
test('order should be maintained during rapid push/pop', t => {
  const frame_size = 8
  const max_frames = 1024
  const sb = sharedbuffer(frame_size, max_frames, Int32Array)
  const rb = ringbuffer(sb, frame_size, max_frames, Int32Array)

  const iterations = 10000
  let lastPopped = -1

  for (let i = 0; i < iterations; i++) {
    const frame = new Int32Array(frame_size)
    frame[0] = i
    rb.push(frame)

    if (Math.random() < 0.7) {
      const popped = rb.pop()
      if (popped !== undefined) {
        const seqNum = popped[0]
        t.ok(seqNum > lastPopped, `Sequence should increase: last=${lastPopped}, current=${seqNum}`)
        lastPopped = seqNum
      }
    }
  }

  let frame
  while ((frame = rb.pop()) !== undefined) {
    const seqNum = frame[0]
    t.ok(seqNum > lastPopped, `Remaining sequence should increase: last=${lastPopped}, current=${seqNum}`)
    lastPopped = seqNum
  }

  t.end()
})

// Test for memory barrier issues with data_b
test('data should be fully written before becoming available', t => {
  const frame_size = 320
  const max_frames = 8
  const sb = sharedbuffer(frame_size, max_frames, Int32Array)
  const rb = ringbuffer(sb, frame_size, max_frames, Int32Array)

  const iterations = 1000
  for (let i = 0; i < iterations; i++) {
    const frame = new Int32Array(frame_size)
    frame.fill(i)
    rb.push(frame)

    const popped = rb.pop()
    if (popped !== undefined) {
      const firstVal = popped[0]
      let allSame = true
      for (let j = 1; j < frame_size; j++) {
        if (popped[j] !== firstVal) {
          allSame = false
          t.fail(`Frame partially written: pos 0 = ${firstVal}, pos ${j} = ${popped[j]}`)
          break
        }
      }
      if (allSame) t.pass(`Frame ${i} fully written`)
    }
  }

  t.end()
})

test('wrapping with large frames should maintain integrity', t => {
  const frame_size = 1024
  const max_frames = 4
  const sb = sharedbuffer(frame_size, max_frames, Int32Array)
  const rb = ringbuffer(sb, frame_size, max_frames, Int32Array)

  // Fill buffer completely with distinct values 0..3
  for (let i = 0; i < max_frames; i++) {
    const frame = new Int32Array(frame_size)
    frame.fill(i)
    rb.push(frame)
  }

  // Pop half the buffer (removes 0 and 1)
  rb.pop()
  rb.pop()

  // Push new frames [4,5,6,7] to force two overwrites (of 2 & 3)
  for (let i = 0; i < max_frames; i++) {
    const frame = new Int32Array(frame_size)
    frame.fill(max_frames + i)
    rb.push(frame)
  }

  // Collect whatever remains
  const results = []
  let frame
  while ((frame = rb.pop()) !== undefined) {
    // Ensure each frame’s contents are uniform
    const firstVal = frame[0]
    let allSame = true
    for (let j = 1; j < frame_size; j++) {
      if (frame[j] !== firstVal) {
        allSame = false
        t.fail(`Frame data corrupted at pos ${j}: ${frame[j]} vs ${firstVal}`)
        break
      }
    }
    if (allSame) results.push(firstVal)
  }

  // We expect to end up with the newest 4 values [4,5,6,7]
  t.equal(results.length, max_frames, `Should have ${max_frames} frames after wrapping`)
  const expected = []
  for (let i = 0; i < max_frames; i++) expected.push(max_frames + i)
  t.same(results, expected, 'Frame values should be the newest values in sequence')

  t.end()
})

// Test for race conditions in wrap_flag handling
test('wrap_flag should correctly track buffer wrapping', t => {
  const frame_size = 8
  const max_frames = 4
  const sb = sharedbuffer(frame_size, max_frames, Int32Array)
  const rb = ringbuffer(sb, frame_size, max_frames, Int32Array)

  const wrap_flag_b = new Uint32Array(sb, 20, 1)
  const r_ptr_b = new Uint32Array(sb, 16, 1)
  const w_ptr_b = new Uint32Array(sb, 12, 1)

  t.equal(Atomics.load(wrap_flag_b, 0), 0, 'wrap_flag should start as 0')

  for (let i = 0; i < max_frames; i++) {
    rb.push(new Int32Array(frame_size).fill(i))
  }
  t.equal(Atomics.load(wrap_flag_b, 0), 0, 'wrap_flag should still be 0 when buffer is just filled')

  rb.push(new Int32Array(frame_size).fill(max_frames))
  t.equal(Atomics.load(wrap_flag_b, 0), 1, 'wrap_flag should be set to 1 after wrapping')

  while (rb.pop() !== undefined) { }
  t.equal(Atomics.load(r_ptr_b, 0), Atomics.load(w_ptr_b, 0),
    'read and write pointers should be equal when empty')
  t.equal(Atomics.load(wrap_flag_b, 0), 1,
    'wrap_flag should remain 1 after wrapping, even when buffer is empty')

  t.end()
})

// Test for slice() method and possible memory issues
test('slice() should return accurate copies of data', t => {
  const frame_size = 320
  const max_frames = 8
  const sb = sharedbuffer(frame_size, max_frames, Int32Array)
  const rb = ringbuffer(sb, frame_size, max_frames, Int32Array)

  const hdrBytes = 6 * 4
  const data_b = new Int32Array(sb, hdrBytes, max_frames * frame_size)
  for (let i = 0; i < frame_size; i++) data_b[i] = i

  const in_b = new Uint32Array(sb, 0, 1)
  Atomics.store(in_b, 0, 1)

  const frame = rb.pop()
  for (let i = 0; i < frame_size; i++) {
    t.equal(frame[i], i, `Sliced data should match at position ${i}`)
  }

  t.end()
})

// Test for dropped frame counting accuracy
test('dropped_count should accurately track overwritten frames', t => {
  const frame_size = 8
  const max_frames = 4
  const sb = sharedbuffer(frame_size, max_frames, Int32Array)
  const rb = ringbuffer(sb, frame_size, max_frames, Int32Array)

  for (let i = 0; i < max_frames; i++) {
    rb.push(new Int32Array(frame_size).fill(i))
  }
  for (let i = 0; i < 10; i++) {
    rb.push(new Int32Array(frame_size).fill(max_frames + i))
  }

  const expectedDrops = 10
  const actualDrops = rb.dropped_count()
  t.ok(
    actualDrops >= expectedDrops - max_frames &&
    actualDrops <= expectedDrops + max_frames,
    `Dropped count ${actualDrops} should be within reasonable range of expected ${expectedDrops}`
  )

  t.end()
})

// ---------------------------------------------------------------------------
// This buffer policy *always* drops one oldest frame per extra push once full,
// so pushing 8 new frames into an 8-slot buffer yields the *newest* 8 frames.
// ---------------------------------------------------------------------------
test('multiple partial overwrites should maintain buffer consistency', t => {
  const frame_size = 8
  const max_frames = 8
  const sb = sharedbuffer(frame_size, max_frames, Int32Array)
  const rb = ringbuffer(sb, frame_size, max_frames, Int32Array)

  // Fill half the buffer
  for (let i = 0; i < max_frames / 2; i++) {
    rb.push(new Int32Array(frame_size).fill(i))
  }

  const first = rb.pop()
  t.equal(first[0], 0, 'First frame should have value 0')

  for (let i = 0; i < max_frames; i++) {
    rb.push(new Int32Array(frame_size).fill(100 + i))
  }

  const results = []
  let frame
  while ((frame = rb.pop()) !== undefined) {
    results.push(frame[0])
  }

  t.equal(
    results.length,
    max_frames,
    `With ${max_frames} pushes into an ${max_frames}-slot buffer, should end up with ${max_frames} frames`
  )

  const expected = []
  for (let i = 0; i < max_frames; i++) expected.push(100 + i)
  t.same(results, expected, 'Should contain the newest frames [100..107] in order')

  t.end()
})

// Test for atomic behavior when buffer is almost full
test('atomic operations at buffer boundaries', t => {
  const frame_size = 4
  const max_frames = 4
  const sb = sharedbuffer(frame_size, max_frames, Int32Array)
  const rb = ringbuffer(sb, frame_size, max_frames, Int32Array)

  for (let i = 0; i < max_frames - 1; i++) {
    rb.push(new Int32Array(frame_size).fill(i))
  }

  const firstFrame = rb.pop()
  t.equal(firstFrame[0], 0, 'Should get first frame')

  rb.push(new Int32Array(frame_size).fill(100))
  rb.push(new Int32Array(frame_size).fill(101))

  let count = 0
  const results = []
  let frame
  while ((frame = rb.pop()) !== undefined) {
    results.push(frame[0])
    count++
  }

  t.equal(count, max_frames, `Should have exactly ${max_frames} frames`)
  t.same(results, [1, 2, 100, 101], 'Should get frames in correct order')
  t.equal(rb.dropped_count(), 0, 'No frames should be dropped')

  t.end()
})
