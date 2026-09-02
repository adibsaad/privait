// Objective M4 parity gate: structurally diff the async-graphql SDL snapshot
// against the original Pothos schema (checked in at
// src-tauri/schema-parity/old-schema.graphql, pulled from git history — the
// live src/server generated file was overwritten by codegen).
//
// Diffs outside the expected set (auth removals, documented M2/M3 additions,
// deliberate nullability tightening) exit nonzero.
//
// Scalar directives (@specifiedBy on Upload) are ignored — kind:name only.
// Usage: node scripts/schema-parity.mjs
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Resolve `graphql` through the frontend workspace package (pnpm layout).
const require = createRequire(join(here, '..', 'src/frontend', 'package.json'))
const { buildSchema, isObjectType, isInputObjectType, isEnumType, isUnionType, isScalarType } =
  require('graphql')

const oldSdl = readFileSync(join(here, '..', 'src-tauri/schema-parity/old-schema.graphql'), 'utf8')
const newSdl = readFileSync(join(here, '..', 'src-tauri/schema.snapshot.graphql'), 'utf8')

const typeMap = (sdl) => {
  const schema = buildSchema(sdl)
  const map = new Map()
  for (const [name, type] of Object.entries(schema.getTypeMap())) {
    if (name.startsWith('__')) continue
    map.set(name, signatureOf(name, type))
  }
  return map
}

const sortedEntries = (obj) =>
  Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))

function signatureOf(name, type) {
  if (isObjectType(type)) {
    const fields = {}
    for (const [f, field] of sortedEntries(type.getFields())) {
      const args = [...field.args]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((arg) => `${arg.name}: ${arg.type.toString()}`)
        .join(', ')
      fields[f] = args ? `(${args}): ${field.type.toString()}` : field.type.toString()
    }
    return { kind: 'type', fields }
  }
  if (isInputObjectType(type)) {
    const fields = {}
    for (const [f, field] of sortedEntries(type.getFields())) {
      fields[f] = field.type.toString()
    }
    return { kind: 'input', fields }
  }
  if (isEnumType(type)) {
    return { kind: 'enum', values: type.getValues().map((v) => v.name).sort().join(' | ') }
  }
  if (isUnionType(type)) {
    return { kind: 'union', members: type.getTypes().map((t) => t.name).sort().join(' | ') }
  }
  if (isScalarType(type)) return { kind: 'scalar' }
  return { kind: 'other' }
}

const diffSchemas = (oldMap, newMap) => {
  const lines = []
  const sortedNames = (m) => [...m.keys()].sort((a, b) => a.localeCompare(b))
  for (const name of sortedNames(oldMap)) if (!newMap.has(name)) lines.push(`type removed: ${name}`)
  for (const name of sortedNames(newMap)) if (!oldMap.has(name)) lines.push(`type added: ${name}`)
  for (const name of sortedNames(oldMap)) {
    const oldT = oldMap.get(name)
    const newT = newMap.get(name)
    if (!newT || JSON.stringify(oldT) === JSON.stringify(newT)) continue
    if (oldT.kind !== newT.kind || oldT.fields === undefined || newT.fields === undefined) {
      lines.push(`${name}: redefined (${oldT.kind} -> ${newT.kind})`)
      continue
    }
    for (const [f] of sortedEntries(oldT.fields)) if (!(f in newT.fields)) lines.push(`${name}: - ${f}: ${oldT.fields[f]}`)
    for (const [f] of sortedEntries(newT.fields)) if (!(f in oldT.fields)) lines.push(`${name}: + ${f}: ${newT.fields[f]}`)
    for (const [f] of sortedEntries(oldT.fields)) {
      if (f in newT.fields && oldT.fields[f] !== newT.fields[f]) {
        lines.push(`${name}: ~ ${f}: ${newT.fields[f]} (was ${oldT.fields[f]})`)
      }
    }
    if (oldT.members !== newT.members || oldT.values !== newT.values) {
      lines.push(`${name}: redefined (${oldT.members ?? oldT.values} -> ${newT.members ?? newT.values})`)
    }
  }
  return lines.sort()
}

// The full expected parity delta, reviewed against the M4 gate in
// docs/architecture.md:
// "diffs clean against old schema.graphql (minus auth)" plus the documented
// M2/M3 additions (rename/archive persistence, settings, Message.files,
// health, subscription fileIds) and the nullability tightening on
// list queries / currentUser / the subscription result.
const EXPECTED_DIFF = [
  // Auth machinery dropped
  'type removed: AuthSuccessResponse',
  'type removed: DateTime',
  'type removed: MutationCompleteMagicLinkResult',
  'type removed: MutationCompleteMagicLinkSuccess',
  'type removed: MutationMagicLinkResult',
  'type removed: MutationMagicLinkSuccess',
  'Mutation: + archiveConversation: (archived: Boolean!, conversationId: Int!): MutationArchiveConversationResult!',
  'Mutation: + renameConversation: (conversationId: Int!, title: String!): MutationRenameConversationResult!',
  'Mutation: + saveSettings: (input: SettingsInput!): MutationSaveSettingsResult!',
  'Mutation: - completeMagicLink: (token: String!): MutationCompleteMagicLinkResult!',
  'Mutation: - magicLink: (email: String!): MutationMagicLinkResult!',
  // Documented M2/M3 additions
  'Conversation: + archived: Boolean!',
  'Message: + files: [FileUpload!]!',
  'Query: + health: String!',
  'Query: + settings: Settings!',
  'Subscription: ~ conversation: (conversationId: Int, fileIds: [Int!], message: String!): SubscriptionConversationResult! (was (conversationId: Int, message: String!): SubscriptionConversationResult)',
  'type added: MutationArchiveConversationResult',
  'type added: MutationArchiveConversationSuccess',
  'type added: MutationRenameConversationResult',
  'type added: MutationRenameConversationSuccess',
  'type added: MutationSaveSettingsResult',
  'type added: MutationSaveSettingsSuccess',
  'type added: Settings',
  'type added: SettingsInput',
  // Deliberate non-null tightening
  'FileUpload: ~ createdAt: String! (was DateTime!)',
  'Query: ~ conversations: [Conversation!]! (was [Conversation!])',
  'Query: ~ currentUser: user! (was user)',
  'Query: ~ files: [FileUpload!]! (was [FileUpload!])',
]

const actual = diffSchemas(typeMap(oldSdl), typeMap(newSdl))
const expected = [...EXPECTED_DIFF].sort()
const unexpected = actual.filter((l) => !expected.includes(l))
const missing = expected.filter((l) => !actual.includes(l))

if (unexpected.length || missing.length) {
  console.log('Schema parity FAILED')
  for (const l of unexpected) console.log(`  unexpected: ${l}`)
  for (const l of missing) console.log(`  expected but absent: ${l}`)
  process.exit(1)
}
console.log(`Schema parity OK: ${actual.length} known, reviewed deviations; no unexpected diffs.`)