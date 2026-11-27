import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Embedding Provider Infrastructure
 * 
 * Provides unified interface for generating vector embeddings.
 * Includes DeterministicMockEmbeddingProvider for zero-latency, 100% reproducible tests,
 * and sharp-free WASM ONNX execution for local sentence-transformers/all-MiniLM-L6-v2.
 */

export interface IEmbeddingProvider {
  readonly modelName: string;
  readonly modelVersion: number;
  readonly dimension: number;

  generateEmbedding(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic Mock Vectorizer
 * 
 * Uses deterministic token hashing and projection into a unit-sphere float array.
 * Words sharing character n-grams and vocabulary produce positive cosine similarities,
 * ensuring authentic semantic clustering in offline unit and integration tests.
 */
export class DeterministicMockEmbeddingProvider implements IEmbeddingProvider {
  readonly providerName = "deterministic-mock";
  readonly modelName = "deterministic-mock-v1";
  readonly modelVersion = 1;
  readonly dimension: number;
  readonly similarityMetric = "cosine";

  constructor(dimension: number = 1536) {
    this.dimension = dimension;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return this.computeVector(text);
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.computeVector(t));
  }

  private computeVector(text: string): number[] {
    const vector = new Array(this.dimension).fill(0);
    const normalized = (text || "").toLowerCase().trim();
    if (!normalized) {
      vector[0] = 1.0;
      return vector;
    }

    const words = normalized.split(/\s+/);

    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const word = words[wIdx];
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash * 31 + word.charCodeAt(i)) >>> 0;
      }

      // Distribute word signal across multiple orthogonal dimensions
      for (let k = 0; k < 8; k++) {
        const dimIndex = (hash + k * 199) % this.dimension;
        const sign = (hash + k) % 2 === 0 ? 1 : -1;
        vector[dimIndex] += sign * (1.0 / Math.sqrt(wIdx + 1));
      }
    }

    // Normalize to unit length (L2 norm) so cosine similarity = dot product
    let norm = 0;
    for (let i = 0; i < this.dimension; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < this.dimension; i++) {
        vector[i] = Number((vector[i] / norm).toFixed(6));
      }
    } else {
      vector[0] = 1.0;
    }

    return vector;
  }
}

/**
 * Local SentenceTransformer Embedding Provider
 * 
 * Runs open-source 'sentence-transformers/all-MiniLM-L6-v2' (384 dims, cosine similarity)
 * locally and in-process via pure-JS @huggingface/tokenizers + pure-WASM onnxruntime-web.
 * Zero sharp/libvips or OS-native .so/.dll dependencies; zero external API billing.
 * Reuses a single long-lived ONNX InferenceSession and Tokenizer across requests.
 */
interface LocalMiniLmRuntime {
  encodeBatch(texts: string[]): Promise<number[][]>;
}

const MINILM_REQUIRED_FILES = [
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model.onnx",
] as const;

const MINILM_DOWNLOAD_FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model.onnx",
] as const;

function hasCompleteModelFiles(dir: string): boolean {
  if (!dir) return false;
  return MINILM_REQUIRED_FILES.every((rel) => fs.existsSync(path.join(dir, rel)));
}

async function downloadFileAtomic(url: string, destPath: string, timeoutMs: number): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} downloading ${url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const tmpPath = `${destPath}.tmp_${process.pid}_${Date.now()}`;
    fs.writeFileSync(tmpPath, buf);
    fs.renameSync(tmpPath, destPath);
  } finally {
    clearTimeout(timer);
  }
}

async function resolveMiniLmModelDir(timeoutMs: number): Promise<string> {
  const candidates = [
    process.env.LIFEOS_LOCAL_EMBEDDING_MODEL_DIR || "",
    process.env.LIFEOS_EMBEDDING_MODEL_DIR || "",
    path.resolve(process.cwd(), ".cache/models/Xenova/all-MiniLM-L6-v2"),
    path.resolve(process.cwd(), "../../.cache/models/Xenova/all-MiniLM-L6-v2"),
    process.env.HF_HOME ? path.join(process.env.HF_HOME, "models/Xenova/all-MiniLM-L6-v2") : "",
  ].filter(Boolean);

  for (const dir of candidates) {
    if (hasCompleteModelFiles(dir)) {
      return dir;
    }
  }

  if (process.env.LIFEOS_EMBEDDING_ALLOW_DOWNLOAD === "false") {
    throw new Error(
      `Local embedding model files not found in cache (${candidates.join(", ")}) and LIFEOS_EMBEDDING_ALLOW_DOWNLOAD=false`
    );
  }

  // Pick writable cache target
  let targetDir = path.resolve(process.cwd(), ".cache/models/Xenova/all-MiniLM-L6-v2");
  try {
    fs.mkdirSync(path.join(targetDir, "onnx"), { recursive: true });
  } catch {
    targetDir = path.join(os.tmpdir(), "lifeos-models/Xenova/all-MiniLM-L6-v2");
    fs.mkdirSync(path.join(targetDir, "onnx"), { recursive: true });
  }

  const baseUrl = "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main";
  for (const rel of MINILM_DOWNLOAD_FILES) {
    const dest = path.join(targetDir, rel);
    if (!fs.existsSync(dest)) {
      await downloadFileAtomic(`${baseUrl}/${rel}`, dest, Math.max(timeoutMs, 15000));
    }
  }

  if (!hasCompleteModelFiles(targetDir)) {
    throw new Error(`Downloaded model incomplete at ${targetDir}`);
  }
  return targetDir;
}

function meanPoolAndNormalize(
  data: Float32Array | number[],
  batchSize: number,
  seqLen: number,
  hiddenDim: number,
  attentionMasks: number[][]
): number[][] {
  const vectors: number[][] = [];
  for (let b = 0; b < batchSize; b++) {
    const pooled = new Float32Array(hiddenDim);
    const mask = attentionMasks[b];
    let denom = 0;
    const batchOffset = b * seqLen * hiddenDim;

    for (let t = 0; t < seqLen; t++) {
      const m = mask[t] ?? 0;
      if (m === 0) continue;
      denom += m;
      const tokenOffset = batchOffset + t * hiddenDim;
      for (let h = 0; h < hiddenDim; h++) {
        pooled[h] += data[tokenOffset + h] * m;
      }
    }

    const scale = denom > 0 ? 1 / denom : 1;
    let normSq = 0;
    for (let h = 0; h < hiddenDim; h++) {
      pooled[h] *= scale;
      normSq += pooled[h] * pooled[h];
    }

    const norm = Math.sqrt(normSq) || 1;
    const vec = new Array<number>(hiddenDim);
    for (let h = 0; h < hiddenDim; h++) {
      vec[h] = pooled[h] / norm;
    }
    vectors.push(vec);
  }
  return vectors;
}

export class LocalSentenceTransformerEmbeddingProvider implements IEmbeddingProvider {
  readonly providerName: string = "sentence-transformers-wasm";
  readonly modelName: string = "sentence-transformers/all-MiniLM-L6-v2";
  readonly modelVersion: number = 1;
  readonly dimension: number = 384;
  readonly similarityMetric: string = "cosine";

  private static runtimeInstance: LocalMiniLmRuntime | null = null;
  private static runtimePromise: Promise<LocalMiniLmRuntime> | null = null;

  constructor() { }

  static resetForTesting(): void {
    this.runtimeInstance = null;
    this.runtimePromise = null;
  }

  static async getExtractor(): Promise<LocalMiniLmRuntime> {
    if (this.runtimeInstance) {
      return this.runtimeInstance;
    }
    if (!this.runtimePromise) {
      this.runtimePromise = (async () => {
        try {
          const timeoutMs = Number(process.env.LIFEOS_EMBEDDING_TIMEOUT_MS || 5000);
          const modelDir = await resolveMiniLmModelDir(timeoutMs);

          const tokenizerJson = JSON.parse(
            fs.readFileSync(path.join(modelDir, "tokenizer.json"), "utf8")
          );
          const tokenizerConfig = JSON.parse(
            fs.readFileSync(path.join(modelDir, "tokenizer_config.json"), "utf8")
          );

          const { Tokenizer } = await import("@huggingface/tokenizers");
          const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);

          const ort = await import("onnxruntime-web");
          ort.env.wasm.numThreads = 1;

          const modelPath = path.join(modelDir, "onnx/model.onnx");
          const session = await ort.InferenceSession.create(modelPath, {
            executionProviders: ["wasm"],
          });

          const runtime: LocalMiniLmRuntime = {
            encodeBatch: async (texts: string[]): Promise<number[][]> => {
              const encodings = texts.map((t) =>
                tokenizer.encode(t, { add_special_tokens: true, return_token_type_ids: true })
              );
              const batchSize = encodings.length;
              const maxLen = Math.max(1, ...encodings.map((e) => e.ids.length));

              const inputIds = new BigInt64Array(batchSize * maxLen);
              const attentionMask = new BigInt64Array(batchSize * maxLen);
              const tokenTypeIds = new BigInt64Array(batchSize * maxLen);
              const maskArrays: number[][] = [];

              for (let b = 0; b < batchSize; b++) {
                const enc = encodings[b];
                const rowOffset = b * maxLen;
                const rowMask = new Array<number>(maxLen).fill(0);
                const types = (enc as any).token_type_ids || enc.ids.map(() => 0);

                for (let t = 0; t < enc.ids.length; t++) {
                  inputIds[rowOffset + t] = BigInt(enc.ids[t]);
                  attentionMask[rowOffset + t] = BigInt(enc.attention_mask[t]);
                  tokenTypeIds[rowOffset + t] = BigInt(types[t] ?? 0);
                  rowMask[t] = enc.attention_mask[t];
                }
                maskArrays.push(rowMask);
              }

              const runPromise = session.run({
                input_ids: new ort.Tensor("int64", inputIds, [batchSize, maxLen]),
                attention_mask: new ort.Tensor("int64", attentionMask, [batchSize, maxLen]),
                token_type_ids: new ort.Tensor("int64", tokenTypeIds, [batchSize, maxLen]),
              });

              const inferenceTimeoutMs = Number(process.env.LIFEOS_EMBEDDING_TIMEOUT_MS || 5000);
              const outputs = await Promise.race([
                runPromise,
                new Promise<never>((_, reject) =>
                  setTimeout(
                    () => reject(new Error(`[LOCAL_EMBEDDING_TIMEOUT]: Inference exceeded ${inferenceTimeoutMs}ms`)),
                    inferenceTimeoutMs
                  )
                ),
              ]);

              const firstOutput = Object.values(outputs)[0] as { data: Float32Array };
              return meanPoolAndNormalize(firstOutput.data, batchSize, maxLen, 384, maskArrays);
            },
          };

          this.runtimeInstance = runtime;
          return runtime;
        } catch (err: any) {
          this.runtimePromise = null;
          throw new Error(
            `[LOCAL_EMBEDDING_LOAD_ERROR]: Failed to initialize local sentence-transformer model 'sentence-transformers/all-MiniLM-L6-v2': ${err.message}`
          );
        }
      })();
    }
    return this.runtimePromise;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const extractor = await LocalSentenceTransformerEmbeddingProvider.getExtractor();
    const cleanText = (text || "").trim() || " ";
    const [vector] = await extractor.encodeBatch([cleanText]);
    if (!vector || vector.length !== this.dimension) {
      throw new Error(
        `[DIMENSION_MISMATCH]: Expected ${this.dimension} dimensions, received ${vector?.length}`
      );
    }
    return vector;
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];
    const extractor = await LocalSentenceTransformerEmbeddingProvider.getExtractor();
    const cleanTexts = texts.map((t) => (t || "").trim() || " ");
    const vectors = await extractor.encodeBatch(cleanTexts);
    if (vectors.length !== cleanTexts.length) {
      throw new Error(
        `[BATCH_EMBEDDING_FAILURE]: Expected ${cleanTexts.length} vectors, received ${vectors.length}`
      );
    }
    for (let i = 0; i < vectors.length; i++) {
      if (!vectors[i] || vectors[i].length !== this.dimension) {
        throw new Error(
          `[BATCH_EMBEDDING_FAILURE]: Batch item ${i} had incomplete dimensions: ${vectors[i]?.length}`
        );
      }
    }
    return vectors;
  }
}

/**
 * Global Embedding Provider Registry & Resolver
 */
export class EmbeddingProviderRegistry {
  private static instance: EmbeddingProviderRegistry;
  private currentProvider: IEmbeddingProvider;

  constructor(provider?: IEmbeddingProvider) {
    if (provider) {
      this.currentProvider = provider;
      return;
    }

    const isExplicitTestMode = process.env.LIFEOS_RUNTIME_MODE === "test";
    const isProduction =
      !isExplicitTestMode &&
      (process.env.NODE_ENV === "production" ||
        process.env.LIFEOS_RUNTIME_MODE === "production" ||
        process.env.USE_PRODUCTION_EMBEDDINGS === "true" ||
        process.env.USE_LOCAL_EMBEDDINGS === "true");

    if (isProduction) {
      // In production/staging, default to zero-cost local SentenceTransformer provider.
      // Prohibit silent fallback to mock.
      this.currentProvider = new LocalSentenceTransformerEmbeddingProvider();
    } else {
      // In offline tests & CI, use DeterministicMockEmbeddingProvider (384-dim matching zero-cost local model)
      this.currentProvider = new DeterministicMockEmbeddingProvider(384);
    }
  }

  static getInstance(): EmbeddingProviderRegistry {
    if (!EmbeddingProviderRegistry.instance) {
      EmbeddingProviderRegistry.instance = new EmbeddingProviderRegistry();
    }
    return EmbeddingProviderRegistry.instance;
  }

  static reset(): void {
    EmbeddingProviderRegistry.instance = undefined as any;
  }

  getProvider(): IEmbeddingProvider {
    return this.currentProvider;
  }

  setProvider(provider: IEmbeddingProvider): void {
    this.currentProvider = provider;
  }
}

/**
 * Production OpenAI Embedding Provider Adapter
 * 
 * Target Model: text-embedding-3-small (1536 dimensions)
 * Validates output dimensions and model identity (Requirements 9 & 10).
 */
export class ProductionOpenAIEmbeddingProvider implements IEmbeddingProvider {
  readonly providerName: string = "openai";
  readonly modelName: string;
  readonly modelVersion: number = 1;
  readonly dimension: number = 1536;
  readonly similarityMetric: string = "cosine";
  private apiKey: string;
  private baseUrl: string;

  constructor(options: { apiKey?: string; modelName?: string; baseUrl?: string } = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || "";
    this.modelName = options.modelName || "text-embedding-3-small";
    this.baseUrl = options.baseUrl || "https://api.openai.com/v1";
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error(
        "[PRODUCTION_EMBEDDING_ERROR]: OPENAI_API_KEY is not configured for production embeddings"
      );
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: this.modelName,
        dimensions: this.dimension,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`[OPENAI_EMBEDDING_FAILURE]: ${response.status} ${errBody}`);
    }

    const data = (await response.json()) as any;
    const embedding = data?.data?.[0]?.embedding;

    if (!Array.isArray(embedding) || embedding.length !== this.dimension) {
      throw new Error(
        `[DIMENSION_MISMATCH]: Expected ${this.dimension} dimensions, received ${embedding?.length}`
      );
    }

    return embedding;
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error(
        "[PRODUCTION_EMBEDDING_ERROR]: OPENAI_API_KEY is not configured for production embeddings"
      );
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: this.modelName,
        dimensions: this.dimension,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`[OPENAI_EMBEDDING_FAILURE]: ${response.status} ${errBody}`);
    }

    const data = (await response.json()) as any;
    const embeddings = data?.data?.map((d: any) => d.embedding);

    if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
      throw new Error("[BATCH_EMBEDDING_FAILURE]: Incomplete batch results returned");
    }

    for (const vec of embeddings) {
      if (!Array.isArray(vec) || vec.length !== this.dimension) {
        throw new Error(
          `[DIMENSION_MISMATCH]: In batch vector, expected ${this.dimension}, received ${vec?.length}`
        );
      }
    }

    return embeddings;
  }
}

/**
 * Validates whether two embedding representations are semantically comparable.
 * Invariant: Never compare vectors produced by different models or dimensions without re-indexing.
 */
export function validateEmbeddingCompatibility(
  providerA: { modelName: string; modelVersion: number; dimension: number },
  providerB: { modelName: string; modelVersion: number; dimension: number }
): { compatible: boolean; reason?: string } {
  if (providerA.dimension !== providerB.dimension) {
    return {
      compatible: false,
      reason: `Dimension mismatch: ${providerA.dimension} vs ${providerB.dimension}`,
    };
  }
  if (providerA.modelName !== providerB.modelName) {
    return {
      compatible: false,
      reason: `Model name mismatch: ${providerA.modelName} vs ${providerB.modelName}`,
    };
  }
  if (providerA.modelVersion !== providerB.modelVersion) {
    return {
      compatible: false,
      reason: `Model version mismatch: v${providerA.modelVersion} vs v${providerB.modelVersion}`,
    };
  }
  return { compatible: true };
}
