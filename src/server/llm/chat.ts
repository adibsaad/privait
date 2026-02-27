import {
  ChatHistoryItem,
  GeneralChatWrapper,
  getLlama,
  LlamaChatSession,
  LlamaModel,
  resolveChatWrapper,
} from 'node-llama-cpp'

let convIdToSession: Record<number, LlamaChatSession> = {}

let smollm: LlamaModel | null = null
async function loadModel() {
  if (smollm) {
    return smollm
  }

  const modelPath =
    '/Users/adibsaad/.node-llama-cpp/models/SmolLM2-360M-Instruct.Q4_K_M.gguf'
  const llama = await getLlama()
  smollm = await llama.loadModel({
    modelPath,
  })

  return smollm
}

async function genSession() {
  const model = await loadModel()
  const context = await model.createContext()

  const chatWrapper =
    resolveChatWrapper({
      type: 'auto',
      bosString: model.tokens.bosString,
      filename: model.filename,
      fileInfo: model.fileInfo,
      tokenizer: model.tokenizer,
    }) ?? new GeneralChatWrapper()

  return new LlamaChatSession({
    contextSequence: context.getSequence(),
    chatWrapper,
  })
}

// todo: this isn't designed for a multi-server setup.
// in the future, use pubsub to clear sessions across all instances
export async function clearSession(convId: number) {
  delete convIdToSession[convId]
}

export async function llamaPrompt(
  conversationId: number,
  msg: string,
  chatHistory: ChatHistoryItem[],
  onTextChunk: (chunk: string) => void,
  onComplete?: () => void,
) {
  let session = convIdToSession[conversationId]
  if (!session) {
    session = convIdToSession[conversationId] = await genSession()
  }

  session.setChatHistory(chatHistory)
  await session.prompt(msg, {
    onTextChunk,
    repeatPenalty: {
      penalty: 1.15,
      lastTokens: 64,
    },
  })

  if (onComplete) {
    await onComplete()
  }
}
