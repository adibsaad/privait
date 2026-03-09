import { getLlama, LlamaEmbedding, LlamaModel } from 'node-llama-cpp'

import { LLAMA_MODEL_LOCATION } from '@server/config/env'

let modelPromise: Promise<LlamaModel> | null = null
const modelPath = `${LLAMA_MODEL_LOCATION}/nomic-embed-text-v1.5.Q8_0.gguf`

async function loadEmbeddingModel() {
  modelPromise ??= getLlama().then(llama =>
    llama.loadModel({
      modelPath,
    }),
  )

  return modelPromise
}

export async function generateEmbedding(document: string) {
  const embeddingModel = await loadEmbeddingModel()
  const context = await embeddingModel.createEmbeddingContext()
  const embedding = await context.getEmbeddingFor(document)
  return embedding
}

export function findSimilarDocuments(
  embedding: LlamaEmbedding,
  documentEmbeddings: Map<string, LlamaEmbedding>,
) {
  const similarities = new Map<string, number>()
  for (const [otherDocument, otherDocumentEmbedding] of documentEmbeddings)
    similarities.set(
      otherDocument,
      embedding.calculateCosineSimilarity(otherDocumentEmbedding),
    )

  return Array.from(similarities.keys()).sort(
    (a, b) => similarities.get(b)! - similarities.get(a)!,
  )
}
