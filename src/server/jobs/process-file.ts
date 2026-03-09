import { eq } from 'drizzle-orm'
import { extractText, getDocumentProxy } from 'unpdf'

import { exhaust } from '@server/common'
import { db } from '@server/drizzle/db'
import { fileUpload, fileUploadChunk } from '@server/drizzle/schema'
import { streamChunks } from '@server/llm/chunker'
import { generateEmbedding } from '@server/llm/embed'
import { s3Service } from '@server/services/s3'

const streamToBuffer = (stream: any): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })

const getPdfText = async (fileBuffer: Buffer) => {
  const pdf = await getDocumentProxy(new Uint8Array(fileBuffer))
  const { totalPages, text } = await extractText(pdf, { mergePages: true })
  return { totalPages, text }
}

export async function processUploadedFile(fileUploadId: number) {
  const fileRecord = await db
    .select()
    .from(fileUpload)
    .where(eq(fileUpload.id, fileUploadId))
    .limit(1)

  if (!fileRecord.length) {
    throw new Error('File not found')
  }

  const file = fileRecord[0]

  // get the file first
  const fileData = await s3Service.getFile(file.s3Key)
  if (!fileData?.Body) {
    throw new Error('File not found')
  }

  const fileBuffer = await streamToBuffer(fileData.Body)
  let text = ''

  if (file.type === 'PDF') {
    const { text: pdfText } = await getPdfText(fileBuffer)
    text = pdfText
  } else if (file.type === 'TEXT') {
    text = fileBuffer.toString('utf-8')
  } else {
    exhaust(file.type)
  }

  let chunkIndex = 0
  for await (const chunk of streamChunks(text)) {
    const embedding = await generateEmbedding(chunk.text)
    await db.insert(fileUploadChunk).values({
      fileUploadId,
      content: chunk.text,
      embedding: embedding.vector as number[],
    })

    chunkIndex++
  }

  console.log(`Processed ${chunkIndex} chunks`)

  // update the status
  await db
    .update(fileUpload)
    .set({
      status: 'PROCESSED',
      processedAt: new Date(),
    })
    .where(eq(fileUpload.id, fileUploadId))
}
