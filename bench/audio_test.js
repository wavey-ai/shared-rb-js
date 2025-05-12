'use strict'
const { Worker } = require('worker_threads')
const { performance } = require('perf_hooks')
const path = require('path')
const { sharedbuffer, ringbuffer } = require('./ringbuffer')
const ELEMENT = Int32Array
const FRAME_SIZE = 320
const RING_FRAMES = 1024
const SAMPLE_RATE = 48000
const PRODUCE_INTERVAL_MS = FRAME_SIZE / SAMPLE_RATE * 1000
const WINDOW_MS = 6_000
const NUM_CONSUMERS = 4
const sab = sharedbuffer(FRAME_SIZE, RING_FRAMES, ELEMENT)
const rb = ringbuffer(sab, FRAME_SIZE, RING_FRAMES, ELEMENT)
const stopSab = new SharedArrayBuffer(4)
const stopFlag = new Uint32Array(stopSab)
const validationSab = new SharedArrayBuffer(4 * 3 * NUM_CONSUMERS)
const corruptDetailsSab = new SharedArrayBuffer(16 * 1000)
const detailsCounterSab = new SharedArrayBuffer(4)
const validationData = new Int32Array(validationSab)
const corruptDetails = new Uint32Array(corruptDetailsSab)
const detailsCounter = new Uint32Array(detailsCounterSab)

const workerSrc = `
const { parentPort, workerData } = require('worker_threads')
const { ringbuffer } = require(workerData.rbPath)
const RB = ringbuffer(workerData.sab, workerData.frame, workerData.ring, global[workerData.type])
const stop = new Uint32Array(workerData.stopSab)
const validation = new Int32Array(workerData.validationSab)
const corrupts = new Uint32Array(workerData.corruptDetailsSab)
const counter = new Uint32Array(workerData.detailsCounterSab)
const offset = workerData.id * 3

if (workerData.role === 'prod') {
  const frame = new global[workerData.type](workerData.frame)
  let seqNum = 1
  const iv = setInterval(() => {
    if (Atomics.load(stop, 0)) {
      clearInterval(iv)
      parentPort.postMessage({ totalPushed: seqNum - 1, lastSequence: seqNum - 1 })
      return
    }
    frame[0] = seqNum
    for (let i = 1; i < workerData.frame; i++) {
      frame[i] = (seqNum + i) % 1000000
    }
    RB.push(frame)
    seqNum++
  }, workerData.produceIntervalMs)
} else {
  let count = 0, lastSeq = 0, corrupted = 0, gaps = 0
  while (!Atomics.load(stop, 0)) {
    const frame = RB.pop()
    if (frame !== undefined) {
      count++
      const seq = frame[0]
      let bad = false, badIdx = -1, got, want
      for (let i = 1; i < workerData.frame; i++) {
        want = (seq + i) % 1000000
        got = frame[i]
        if (got !== want) {
          bad = true
          badIdx = i
          break
        }
      }
      if (bad) {
        corrupted++
        const idx = Atomics.add(counter, 0, 1)
        if (idx < workerData.maxCorrupts) {
          const base = idx * 4
          corrupts[base] = workerData.id
          corrupts[base + 1] = seq
          corrupts[base + 2] = badIdx
          corrupts[base + 3] = (got << 16) | (want & 0xFFFF)
        }
      }
      if (lastSeq > 0 && seq > lastSeq + 1) gaps += seq - lastSeq - 1
      lastSeq = seq
    } else {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1)
    }
  }
  let frame
  while ((frame = RB.pop()) !== undefined) {
    count++
    const seq = frame[0]
    let bad = false, badIdx = -1, got, want
    for (let i = 1; i < workerData.frame; i++) {
      want = (seq + i) % 1000000
      got = frame[i]
      if (got !== want) {
        bad = true
        badIdx = i
        break
      }
    }
    if (bad) {
      corrupted++
      const idx = Atomics.add(counter, 0, 1)
      if (idx < workerData.maxCorrupts) {
        const base = idx * 4
        corrupts[base] = workerData.id
        corrupts[base + 1] = seq
        corrupts[base + 2] = badIdx
        corrupts[base + 3] = (got << 16) | (want & 0xFFFF)
      }
    }
    if (lastSeq > 0 && seq > lastSeq + 1) gaps += seq - lastSeq - 1
    lastSeq = seq
  }
  validation[offset] = count
  validation[offset + 1] = corrupted
  validation[offset + 2] = gaps
  parentPort.postMessage({ processed: count, corrupted, totalGaps: gaps, lastSequence: lastSeq })
}
`

function mkWorker(role, id = 0) {
  return new Worker(workerSrc, {
    eval: true,
    workerData: {
      rbPath: path.resolve(__dirname, 'ringbuffer.js'),
      sab,
      stopSab,
      validationSab,
      corruptDetailsSab,
      detailsCounterSab,
      frame: FRAME_SIZE,
      ring: RING_FRAMES,
      type: ELEMENT.name,
      role,
      id,
      produceIntervalMs: PRODUCE_INTERVAL_MS,
      maxCorrupts: 1000
    }
  })
}

const producer = mkWorker('prod')
const consumers = Array.from({ length: NUM_CONSUMERS }, (_, i) => mkWorker('cons', i))
let reports = { prod: null, cons: [] }, done = 0
const t0 = performance.now()
setTimeout(() => Atomics.store(stopFlag, 0, 1), WINDOW_MS)
producer.on('message', msg => { reports.prod = msg; if (++done === NUM_CONSUMERS + 1) report() })
consumers.forEach((c, i) => c.on('message', msg => { reports.cons[i] = msg; if (++done === NUM_CONSUMERS + 1) report() }))

function report() {
  const elapsed = (performance.now() - t0) / 1000
  const { totalPushed, lastSequence } = reports.prod
  const numCorrupt = Math.min(detailsCounter[0], 1000)
  console.log('\n--- Ring Buffer Validation ---')
  console.log('Duration:    ' + elapsed.toFixed(2) + 's')
  console.log('Produced:    ' + totalPushed + ' frames, last seq ' + lastSequence)
  let totProc = 0, totCorr = 0, totGaps = 0
  reports.cons.forEach((r, i) => {
    totProc += r.processed
    totCorr += r.corrupted
    totGaps += r.totalGaps
    console.log('Consumer ' + i + ': processed=' + r.processed + ', corrupted=' + r.corrupted + ', last seq=' + r.lastSequence)
  })
  const avgProc = Math.round(totProc / NUM_CONSUMERS)
  console.log('Consumed:    ' + avgProc + ' frames/consumer (' + totProc + ' total)')
  console.log('--- Integrity Check ---')
  console.log(totCorr === 0 ? 'No corrupted frames' : totCorr + ' corrupted frames detected')
  if (totCorr > 0) {
    console.log('\n--- Corruption Details (' + Math.min(numCorrupt, 50) + ' of ' + totCorr + ') ---')
    for (let i = 0; i < Math.min(numCorrupt, 50); i++) {
      const b = i * 4
      const wid = corruptDetails[b]
      const seq = corruptDetails[b + 1]
      const idx = corruptDetails[b + 2]
      const packed = corruptDetails[b + 3]
      const got = packed >>> 16
      const want = packed & 0xFFFF
      console.log('Corruption in worker ' + wid + ': seq=' + seq + ', index=' + idx + ', got=' + got + ', expected=' + want)
    }
    if (totCorr > 50) console.log('... and ' + (totCorr - 50) + ' more events')
  }
  console.log('\n--- Sequence Gaps (expected) ---')
  console.log(totGaps + ' frames skipped due to buffer overwrites')
  console.log('\n--- Performance ---')
  console.log('Throughput:  ' + Math.round(totalPushed / elapsed) + ' frames/second')
  const lossPct = totCorr > 0 ? ((totCorr / totProc) * 100).toFixed(6) : '0'
  console.log('Corruption:  ' + lossPct + '% of processed frames')
  const audioLength = totalPushed * FRAME_SIZE / SAMPLE_RATE
  console.log('Audio length: ' + audioLength.toFixed(3) + 's')
  if (audioLength > elapsed) {
    console.log('Generated faster than real time by factor ' + (audioLength / elapsed).toFixed(2))
  } else {
    console.log('Generated slower than real time by factor ' + (elapsed / audioLength).toFixed(2))
  }
}

