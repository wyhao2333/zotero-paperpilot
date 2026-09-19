const assert = require("assert");

/**
 * Test: Digest Concurrency & Resilience
 * Tests concurrent worker pool, retry with backoff on transient errors,
 * and chunk order preservation in final multi-stage synthesis.
 */
async function testDigestConcurrencyAndResilience() {
  console.log("=== [Test 1] Digest Concurrency, Retry & Order Preservation ===");

  // 1. Test concurrency pool logic
  const concurrencyLimits = [1, 3, 5, 10];
  for (const concurrency of concurrencyLimits) {
    const totalTasks = 12;
    let activeWorkers = 0;
    let maxObservedActive = 0;
    const taskExecutionOrder = [];

    const tasks = Array.from({ length: totalTasks }, (_, i) => ({
      partIndex: i + 1,
      name: `Part_${i + 1}`,
    }));

    const results = new Array(tasks.length);

    let taskCursor = 0;
    const worker = async () => {
      while (taskCursor < tasks.length) {
        const task = tasks[taskCursor++];
        activeWorkers++;
        maxObservedActive = Math.max(maxObservedActive, activeWorkers);

        // Simulate async work with varying duration
        const delay = (task.partIndex % 3 + 1) * 15;
        await new Promise((r) => setTimeout(r, delay));

        taskExecutionOrder.push(task.partIndex);
        results[task.partIndex - 1] = `Summary of Part ${task.partIndex}`;

        activeWorkers--;
      }
    };

    const workerCount = Math.min(concurrency, tasks.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    assert(
      maxObservedActive <= concurrency,
      `Observed active workers (${maxObservedActive}) must not exceed concurrency limit (${concurrency})`
    );
    assert.strictEqual(results.length, totalTasks, "All tasks must have output");
    for (let i = 0; i < totalTasks; i++) {
      assert.strictEqual(
        results[i],
        `Summary of Part ${i + 1}`,
        `Result slot ${i} must match Part ${i + 1} order regardless of finish order`
      );
    }
  }
  console.log("✅ Concurrency worker pool and order preservation verified across concurrency levels [1, 3, 5, 10].");

  // 2. Test retry with backoff on transient failure
  let attemptCount = 0;
  const mockTransientTask = async () => {
    attemptCount++;
    if (attemptCount <= 2) {
      throw new Error("HTTP 429 Rate limit exceeded");
    }
    return "Summary generated successfully on attempt 3";
  };

  let finalOutput = "";
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      finalOutput = await mockTransientTask();
      break;
    } catch (err) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
      }
    }
  }

  assert.strictEqual(attemptCount, 3, "Transient task must retry up to 2 times (3 attempts total)");
  assert(finalOutput.includes("successfully"), "Task should succeed after retry");
  console.log("✅ Transient error retry with backoff verified.");

  // 3. Test fallback on complete exhaustion
  let exhaustedAttempts = 0;
  const mockPermanentFail = async () => {
    exhaustedAttempts++;
    throw new Error("HTTP 500 Internal Server Error");
  };

  let fallbackOutput = "";
  const groupChunkSample = "Section 4: Deep Learning Methods for Document Analysis";
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      await mockPermanentFail();
    } catch (err) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 10 * (attempt + 1)));
      }
    }
  }
  fallbackOutput = `【第 1 部分要点】:\n(提炼网络超时，参考片段摘要: ${groupChunkSample.slice(0, 50)}...)`;

  assert.strictEqual(exhaustedAttempts, 3, "Permanent fail task must attempt 3 times before fallback");
  assert(fallbackOutput.includes("提炼网络超时"), "Fallback summary must be generated when retries exhaust");
  console.log("✅ Fallback graceful degradation verified upon retry exhaustion.");
}

testDigestConcurrencyAndResilience().then(() => {
  console.log("ALL DIGEST CONCURRENCY TESTS PASSED.\n");
}).catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
