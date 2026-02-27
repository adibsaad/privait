import { LLAMA_MODEL_LOCATION } from '@server/config/env'
import {
  ChatHistoryItem,
  GeneralChatWrapper,
  getLlama,
  LlamaChatSession,
  LlamaModel,
  resolveChatWrapper,
} from 'node-llama-cpp'

let convIdToSession: Record<number, LlamaChatSession> = {}

const modelPath = `${LLAMA_MODEL_LOCATION}/SmolLM2-360M-Instruct.Q4_K_M.gguf`
let modelPromise: Promise<LlamaModel> | null = null
async function loadSmollm() {
  if (!modelPromise) {
    modelPromise = getLlama().then(llama =>
      llama.loadModel({
        modelPath,
      }),
    )
  }

  return modelPromise
}

async function genSession() {
  const model = await loadSmollm()
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
