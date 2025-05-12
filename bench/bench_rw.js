'use strict'
const { Worker } = require('worker_threads')
const { performance } = require('perf_hooks')
const path = require('path')
const { sharedbuffer, ringbuffer } = require('./../lib/index')

const ELEMENT = Int16Array
const FRAME_SIZE = 320
const RING_FRAMES = 8192
const WINDOW_MS = 5000
const NUM_CONSUMERS = 1

const rbPath = path.join(__dirname, '../lib/index.js')
const sab = sharedbuffer(FRAME_SIZE, RING_FRAMES, ELEMENT)
ringbuffer(sab, FRAME_SIZE, RING_FRAMES, ELEMENT)

const stopSab = new SharedArrayBuffer(4)
const stopFlag = new Uint32Array(stopSab)

const workerSrc = role => `
  const { parentPort, workerData } = require('worker_threads')
  const { ringbuffer } = require(workerData.rbPath)
  const RB = ringbuffer(
    workerData.sab,
    workerData.frame,
    workerData.ring,
    global[workerData.type]
  )
  const stop = new Uint32Array(workerData.stopSab)
  const frame = new global[workerData.type](workerData.frame)
  let count = 0
  if (workerData.role === 'prod') {
    while (!Atomics.load(stop, 0)) {
      RB.push(frame)
      count++
    }
    parentPort.postMessage({ pushes: count })
  } else {
    while (!Atomics.load(stop, 0)) {
      if (RB.pop()) count++
    }
    parentPort.postMessage({ pops: count })
  }
`

function mkWorker(role) {
  return new Worker(workerSrc(role), {
    eval: true,
    workerData: {
      rbPath,
      sab,
      stopSab,
      frame: FRAME_SIZE,
      ring: RING_FRAMES,
      type: ELEMENT.name,
      role
    }
  })
}

const producer = mkWorker('prod')
const consumers = Array.from({ length: NUM_CONSUMERS }, () => mkWorker('cons'))

const results = { prod: null, cons: Array(NUM_CONSUMERS).fill(null) }
let doneCount = 0
const expectedDone = NUM_CONSUMERS + 1
const t0 = performance.now()

setTimeout(() => Atomics.store(stopFlag, 0, 1), WINDOW_MS)

function done(role, idx, msg) {
  if (role === 'prod') results.prod = msg
  else results.cons[idx] = msg
  doneCount++
  if (doneCount === expectedDone) finish()
}

producer.on('message', m => done('prod', 0, m))
consumers.forEach((w, i) => w.on('message', m => done('cons', i, m)))

function finish() {
  const sec = (performance.now() - t0) / 1000
  const writes = results.prod.pushes
  const reads = results.cons.reduce((s, r) => s + r.pops, 0)
  const drops = writes - reads
  const pushes_s = writes / sec
  const pops_s = reads / sec
  const drops_s = drops / sec
  const readPct = (reads / writes * 100).toFixed(1)
  const dropPct = (drops / writes * 100).toFixed(1)
  const nf = x => Intl.NumberFormat('en-US').format(Math.round(x))

  console.log('\nelapsed  |  writes (ops/s)  reads (ops/s)  drops (ops/s)  read%   drop%')
  console.log(
    sec.toFixed(2) + 's | ' +
    nf(pushes_s).padStart(16) + '  ' +
    nf(pops_s).padStart(14) + '  ' +
    nf(drops_s).padStart(14) + '  ' +
    readPct.padStart(5) + '  ' +
    dropPct.padStart(6)
  )
}

