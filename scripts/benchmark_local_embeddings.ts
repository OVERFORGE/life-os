import { LocalSentenceTransformerEmbeddingProvider } from "../packages/execution-kernel/src/memory/EmbeddingProvider";
import { cosineSimilarity } from "../packages/execution-kernel/src/memory/MemoryRepository";

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return Number(sorted[idx].toFixed(2));
}

async function benchmark() {
  console.log("==================================================================");
  console.log("LifeOS Local Sentence-Transformer Inference Performance Benchmark");
  console.log("Model: sentence-transformers/all-MiniLM-L6-v2 (384 dimensions)");
  console.log("==================================================================");

  const memBefore = process.memoryUsage();
  console.log(`Initial Heap Used: ${(memBefore.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Initial RSS: ${(memBefore.rss / 1024 / 1024).toFixed(2)} MB`);

  // 1. Cold model load
  const tCold = Date.now();
  const provider = new LocalSentenceTransformerEmbeddingProvider();
  await LocalSentenceTransformerEmbeddingProvider.getExtractor();
  const coldLoadMs = Date.now() - tCold;
  console.log(`\n1. Cold Model Load Time: ${coldLoadMs} ms`);

  // 2. First embedding latency
  const tFirst = Date.now();
  const vFirst = await provider.generateEmbedding("User prefers deep work blocks in early morning.");
  const firstEmbedMs = Date.now() - tFirst;
  console.log(`2. First Embedding Latency: ${firstEmbedMs} ms (Dimensions: ${vFirst.length})`);

  // 3. Warm single embedding latencies (50 iterations)
  const singleLatencies: number[] = [];
  const sampleSentences = [
    "User has a high priority meeting with team tomorrow at 10 AM",
    "Completed a 45 minute full body strength workout session",
    "Prefers no notifications after 9:30 PM to maintain sleep hygiene",
    "Targeting 2500ml water intake every day",
    "Review annual budget and capital expenditure projections",
  ];

  for (let i = 0; i < 50; i++) {
    const text = sampleSentences[i % sampleSentences.length];
    const tStart = performance.now();
    await provider.generateEmbedding(text);
    const elapsed = performance.now() - tStart;
    singleLatencies.push(elapsed);
  }

  console.log("\n3. Warm Single Embedding Latency (50 queries):");
  console.log(`   P50: ${percentile(singleLatencies, 50)} ms`);
  console.log(`   P95: ${percentile(singleLatencies, 95)} ms`);
  console.log(`   P99: ${percentile(singleLatencies, 99)} ms`);

  // 4. Batch Embedding Latencies (Batches of 10, 50, 100)
  console.log("\n4. Warm Batch Embedding Throughput:");
  const batch10 = Array.from({ length: 10 }, (_, i) => `Memory item ${i}: Routine task scheduled for tomorrow morning.`);
  const tBatch10 = performance.now();
  await provider.generateBatchEmbeddings(batch10);
  const batch10Ms = performance.now() - tBatch10;
  console.log(`   Batch of 10 memories: ${batch10Ms.toFixed(2)} ms (${(batch10Ms / 10).toFixed(2)} ms/item)`);

  const batch50 = Array.from({ length: 50 }, (_, i) => `Memory item ${i}: Health telemetry logged heart rate and sleep efficiency.`);
  const tBatch50 = performance.now();
  await provider.generateBatchEmbeddings(batch50);
  const batch50Ms = performance.now() - tBatch50;
  console.log(`   Batch of 50 memories: ${batch50Ms.toFixed(2)} ms (${(batch50Ms / 50).toFixed(2)} ms/item)`);

  const batch100 = Array.from({ length: 100 }, (_, i) => `Memory item ${i}: User goal reflection on personal wellness and productivity.`);
  const tBatch100 = performance.now();
  await provider.generateBatchEmbeddings(batch100);
  const batch100Ms = performance.now() - tBatch100;
  console.log(`   Batch of 100 memories: ${batch100Ms.toFixed(2)} ms (${(batch100Ms / 100).toFixed(2)} ms/item)`);

  // 5. Query Embedding & Memory Retrieval Latency
  const queryLatencies: number[] = [];
  for (let i = 0; i < 20; i++) {
    const tQuery = performance.now();
    const qVec = await provider.generateEmbedding("morning routine and workout preference");
    // Simulate candidate cosine matching against 100 stored vectors
    for (let k = 0; k < 100; k++) {
      cosineSimilarity(qVec, vFirst);
    }
    queryLatencies.push(performance.now() - tQuery);
  }

  console.log("\n5. Retrieval Query Embedding + 100-Candidate Ranking Latency (20 runs):");
  console.log(`   P50: ${percentile(queryLatencies, 50)} ms`);
  console.log(`   P95: ${percentile(queryLatencies, 95)} ms`);
  console.log(`   P99: ${percentile(queryLatencies, 99)} ms`);

  // 6. Memory Footprint
  const memAfter = process.memoryUsage();
  console.log("\n6. Memory Footprint After Benchmark:");
  console.log(`   Heap Used: ${(memAfter.heapUsed / 1024 / 1024).toFixed(2)} MB (+${((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   RSS: ${(memAfter.rss / 1024 / 1024).toFixed(2)} MB (+${((memAfter.rss - memBefore.rss) / 1024 / 1024).toFixed(2)} MB)`);
  console.log("==================================================================");
}

benchmark().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
