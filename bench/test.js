'use strict';
const { Worker } = require('worker_threads');
const { performance } = require('perf_hooks');
const path = require('path');
const { sharedbuffer, ringbuffer } = require('./../lib/index');

// Configuration
const ELEMENT = Int32Array;
const FRAME_SIZE = 320;
const RING_FRAMES = 1024;
const WINDOW_MS = 5000;
const NUM_CONSUMERS = 1;

// Shared buffers
const sab = sharedbuffer(FRAME_SIZE, RING_FRAMES, ELEMENT);
const rb = ringbuffer(sab, FRAME_SIZE, RING_FRAMES, ELEMENT);
const stopSab = new SharedArrayBuffer(4);
const stopFlag = new Uint32Array(stopSab);
const validationSab = new SharedArrayBuffer((4 * 3) * NUM_CONSUMERS);
const validationData = new Int32Array(validationSab);

// Additional buffer to collect corruption details
const MAX_CORRUPTIONS = 1000; // Store up to 1000 corruption events
const corruptDetailsSab = new SharedArrayBuffer(16 * MAX_CORRUPTIONS); // 16 bytes per corruption (4 uint32s)
const corruptDetails = new Uint32Array(corruptDetailsSab);
// Counter for number of corruptions stored in the details buffer
const detailsCounterSab = new SharedArrayBuffer(4);
const detailsCounter = new Uint32Array(detailsCounterSab);

// Worker source (inlined)
const workerSrc = `
  const { parentPort, workerData } = require('worker_threads');
  const { ringbuffer } = require(workerData.rbPath);
  const RB = ringbuffer(
    workerData.sab,
    workerData.frame,
    workerData.ring,
    global[workerData.type]
  );
  const stop = new Uint32Array(workerData.stopSab);
  const validation = new Int32Array(workerData.validationSab);
  const corruptDetails = new Uint32Array(workerData.corruptDetailsSab);
  const detailsCounter = new Uint32Array(workerData.detailsCounterSab);
  const offset = workerData.id * 3;

  if (workerData.role === 'prod') {
    // Producer: fill frames with sequence-based pattern
    const frame = new global[workerData.type](workerData.frame);
    let seqNum = 1;
    while (!Atomics.load(stop, 0)) {
      frame[0] = seqNum;
      for (let i = 1; i < workerData.frame; i++) {
        frame[i] = (seqNum + i) % 1000000;
      }
      RB.push(frame);
      seqNum++;
    }
    parentPort.postMessage({
      totalPushed: seqNum - 1,
      lastSequence: seqNum - 1
    });
  } else {
    // Consumer: pop frames and validate
    let count = 0;
    let lastSeq = 0;
    let corruptedCount = 0;
    let totalGaps = 0;

    // Main pop loop
    while (!Atomics.load(stop, 0)) {
      const frame = RB.pop();
      if (frame !== undefined) {
        count++;
        const seq = frame[0];

        // Integrity check: find first mismatch
        let bad = false;
        let badIndex = -1, gotVal, wantVal;
        for (let i = 1; i < workerData.frame; i++) {
          const expected = (seq + i) % 1000000;
          const actual   = frame[i];
          if (actual !== expected) {
            bad = true;
            badIndex = i;
            gotVal = actual;
            wantVal = expected;
            break;
          }
        }
        if (bad) {
          corruptedCount++;
          
          // Store corruption details in shared buffer
          const detailIndex = Atomics.add(detailsCounter, 0, 1);
          if (detailIndex < ${MAX_CORRUPTIONS}) {
            const baseIndex = detailIndex * 4;
            corruptDetails[baseIndex] = workerData.id;  // Worker ID
            corruptDetails[baseIndex + 1] = seq;        // Sequence number
            corruptDetails[baseIndex + 2] = badIndex;   // Index in frame
            corruptDetails[baseIndex + 3] = (gotVal << 16) | (wantVal & 0xFFFF);  // Compact got/expected
          }
        }

        // Count any sequence gaps
        if (lastSeq > 0 && seq > lastSeq + 1) {
          totalGaps += (seq - lastSeq - 1);
        }
        lastSeq = seq;
      } else {
        // Back off briefly if empty
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
      }
    }

    // Drain any remaining frames
    let frame;
    while ((frame = RB.pop()) !== undefined) {
      count++;
      const seq = frame[0];
      let bad = false;
      let badIndex = -1, gotVal, wantVal;
      for (let i = 1; i < workerData.frame; i++) {
        const expected = (seq + i) % 1000000;
        const actual   = frame[i];
        if (actual !== expected) {
          bad = true;
          badIndex = i;
          gotVal = actual;
          wantVal = expected;
          break;
        }
      }
      if (bad) {
        corruptedCount++;
        
        // Store corruption details in shared buffer
        const detailIndex = Atomics.add(detailsCounter, 0, 1);
        if (detailIndex < ${MAX_CORRUPTIONS}) {
          const baseIndex = detailIndex * 4;
          corruptDetails[baseIndex] = workerData.id;    // Worker ID
          corruptDetails[baseIndex + 1] = seq;          // Sequence number
          corruptDetails[baseIndex + 2] = badIndex;     // Index in frame
          corruptDetails[baseIndex + 3] = (gotVal << 16) | (wantVal & 0xFFFF);  // Compact got/expected
        }
      }
      if (lastSeq > 0 && seq > lastSeq + 1) {
        totalGaps += (seq - lastSeq - 1);
      }
      lastSeq = seq;
    }

    // Store results: [processed, corrupted, gaps]
    validation[offset]   = count;
    validation[offset+1] = corruptedCount;
    validation[offset+2] = totalGaps;

    parentPort.postMessage({
      processed: count,
      corrupted: corruptedCount,
      totalGaps,
      lastSequence: lastSeq
    });
  }
`;

// Helper to spawn a worker
function mkWorker(role, id = 0) {
  return new Worker(workerSrc, {
    eval: true,
    workerData: {
      rbPath: path.resolve(__dirname, './lib/index.js'),
      sab,
      stopSab,
      validationSab,
      corruptDetailsSab,
      detailsCounterSab,
      frame: FRAME_SIZE,
      ring: RING_FRAMES,
      type: ELEMENT.name,
      role,
      id
    }
  });
}

// Launch producer and consumers
const producer = mkWorker('prod');
const consumers = Array.from({ length: NUM_CONSUMERS }, (_, i) => mkWorker('cons', i));

let reports = { prod: null, cons: [] };
let done = 0;
const t0 = performance.now();

// Stop test after WINDOW_MS
setTimeout(() => Atomics.store(stopFlag, 0, 1), WINDOW_MS);

// Collect messages
producer.on('message', msg => {
  reports.prod = msg;
  if (++done === NUM_CONSUMERS + 1) report();
});
consumers.forEach((c, i) => c.on('message', msg => {
  reports.cons[i] = msg;
  if (++done === NUM_CONSUMERS + 1) report();
}));

// Final report
function report() {
  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  const { totalPushed, lastSequence } = reports.prod;
  const numCorruptions = Math.min(detailsCounter[0], MAX_CORRUPTIONS);

  console.log(`\n--- Ring Buffer Validation ---`);
  console.log(`Duration:    ${elapsed}s`);
  console.log(`Produced:    ${totalPushed} frames, last seq ${lastSequence}`);

  // Process each consumer's report
  let totalProcessed = 0;
  let totalCorrupted = 0;
  let totalGaps = 0;

  reports.cons.forEach((report, i) => {
    const { processed, corrupted, totalGaps: gaps, lastSequence: lastSeq } = report;
    totalProcessed += processed;
    totalCorrupted += corrupted;
    totalGaps += gaps;

    console.log(`Consumer ${i}: processed=${processed}, corrupted=${corrupted}, last seq=${lastSeq}`);
  });

  const avgProcessed = Math.round(totalProcessed / NUM_CONSUMERS);

  console.log(`Consumed:    ${avgProcessed} frames/consumer (${totalProcessed} total)`);
  console.log(`--- Integrity Check ---`);

  if (totalCorrupted === 0) {
    console.log('No corrupted frames');
  } else {
    console.log(`${totalCorrupted} corrupted frames detected`);

    // Print detailed corruption report (limited to avoid excessive output)
    console.log(`\n--- Corruption Details (${Math.min(numCorruptions, 50)} of ${totalCorrupted}) ---`);

    const maxToShow = Math.min(numCorruptions, 50);
    for (let i = 0; i < maxToShow; i++) {
      const baseIndex = i * 4;
      const workerId = corruptDetails[baseIndex];
      const seq = corruptDetails[baseIndex + 1];
      const badIndex = corruptDetails[baseIndex + 2];
      const packedVals = corruptDetails[baseIndex + 3];
      const gotVal = packedVals >>> 16;
      const wantVal = packedVals & 0xFFFF;

      console.log(`Corruption in worker ${workerId}: seq=${seq}, index=${badIndex}, got=${gotVal}, expected=${wantVal}`);
    }

    if (totalCorrupted > maxToShow) {
      console.log(`... and ${totalCorrupted - maxToShow} more corruption events`);
    }
  }

  console.log(`\n--- Sequence Gaps (expected) ---`);
  console.log(`${totalGaps} frames skipped due to buffer overwrites`);

  // Additional performance metrics
  const throughput = Math.round(totalPushed / (elapsed / 1000));
  console.log(`\n--- Performance ---`);
  console.log(`Throughput:  ${throughput} frames/second`);

  const lossPercent = totalCorrupted > 0 ?
    ((totalCorrupted / totalProcessed) * 100).toFixed(6) : 0;
  console.log(`Corruption:  ${lossPercent}% of processed frames`);
}
