import { LLAMA_MODEL_LOCATION } from '@server/config/env'
import { getLlama, LlamaEmbedding, LlamaModel } from 'node-llama-cpp'

let modelPromise: Promise<LlamaModel> | null = null
const modelPath = `${LLAMA_MODEL_LOCATION}/bge-small-en-v1.5-f32.gguf`

async function loadBge() {
  if (!modelPromise) {
    modelPromise = getLlama().then(llama =>
      llama.loadModel({
        modelPath,
      }),
    )
  }

  return modelPromise
}

export async function generateEmbedding(document: string) {
  let bgeModel = await loadBge()
  const context = await bgeModel.createEmbeddingContext()
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
