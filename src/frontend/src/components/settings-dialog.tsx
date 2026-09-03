import { useEffect, useState } from 'react'

import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import {
  ArchiveIcon,
  BrainIcon,
  InfoIcon,
  KeyRound,
  PlusIcon,
  TrashIcon,
  Undo2Icon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@frontend/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@frontend/components/ui/dialog'
import { Input } from '@frontend/components/ui/input'
import { Label } from '@frontend/components/ui/label'
import {
  AllConversationsDocument,
  ArchiveConversationDocument,
  CreateMemoryDocument,
  DeleteMemoryDocument,
  GetSettingsDocument,
  MemoriesDocument,
  SaveSettingsDocument,
  UpdateMemoryDocument,
} from '@frontend/graphql/output/graphql'
import { thirdPartyLicenses } from '@frontend/lib/tauri'
import { cn } from '@frontend/lib/utils'

import frontendPackageJson from '../../package.json'

gql(/* GraphQL */ `
  query GetSettings {
    settings {
      baseUrl
      apiKey
      model
    }
  }

  mutation SaveSettings($input: SettingsInput!) {
    saveSettings(input: $input) {
      __typename

      ... on MutationSaveSettingsSuccess {
        data {
          baseUrl
          apiKey
          model
        }
      }

      ... on Error {
        message
      }
    }
  }

  query Memories {
    memories {
      id
      content
      source
      conversationId
      updatedAt
    }
  }

  mutation CreateMemory($content: String!) {
    createMemory(content: $content) {
      __typename
      ... on MutationCreateMemorySuccess {
        data {
          id
          content
        }
      }
      ... on Error {
        message
      }
    }
  }

  mutation UpdateMemory($input: MemoryUpdateInput!) {
    updateMemory(input: $input) {
      __typename
      ... on Error {
        message
      }
    }
  }

  mutation DeleteMemory($memoryId: Int!) {
    deleteMemory(memoryId: $memoryId) {
      __typename
      ... on Error {
        message
      }
    }
  }
`)

type Section = 'provider' | 'memories' | 'archived' | 'about'

const SECTIONS: { id: Section; label: string; icon: typeof KeyRound }[] = [
  { id: 'provider', label: 'Provider', icon: KeyRound },
  { id: 'memories', label: 'Memories', icon: BrainIcon },
  { id: 'archived', label: 'Archived chats', icon: ArchiveIcon },
  { id: 'about', label: 'About', icon: InfoIcon },
]

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [section, setSection] = useState<Section>('provider')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[26rem] w-[40rem] max-w-[85vw] gap-0 overflow-hidden p-0">
        <nav className="bg-muted/40 w-48 shrink-0 border-r p-2">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                section === id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {section === 'provider' ? (
            <ProviderSection />
          ) : section === 'memories' ? (
            <MemoriesSection />
          ) : section === 'archived' ? (
            <ArchivedChatsSection />
          ) : (
            <AboutSection />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProviderSection() {
  const { data } = useQuery(GetSettingsDocument)
  const [saveSettingsMut, { loading: saving }] =
    useMutation(SaveSettingsDocument)

  const [baseUrl, baseUrlSet] = useState('')
  const [apiKey, apiKeySet] = useState('')
  const [model, modelSet] = useState('')

  useEffect(() => {
    if (data?.settings) {
      baseUrlSet(data.settings.baseUrl)
      apiKeySet(data.settings.apiKey)
      modelSet(data.settings.model)
    }
  }, [data])

  const save = async () => {
    const result = await saveSettingsMut({
      variables: {
        input: { baseUrl, apiKey, model },
      },
    })

    if (result.data?.saveSettings.__typename === 'Error') {
      toast.error(result.data.saveSettings.message)
      return
    }

    toast.success('Settings saved')
  }

  return (
    <div>
      <DialogHeader className="p-6 pb-4">
        <DialogTitle>Provider</DialogTitle>
        <DialogDescription>
          Point Privait at any OpenAI-compatible provider — a local server like
          ollama or LM Studio, or a cloud provider such as OpenRouter. Your key
          never leaves this device.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 px-6">
        <div className="grid gap-2">
          <Label htmlFor="settings-base-url">Base URL</Label>
          <Input
            id="settings-base-url"
            placeholder="http://localhost:11434/v1"
            value={baseUrl}
            onChange={e => baseUrlSet(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="settings-api-key">API key</Label>
          <Input
            id="settings-api-key"
            type="password"
            placeholder="Leave empty for local servers"
            value={apiKey}
            onChange={e => apiKeySet(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="settings-model">Model</Label>
          <Input
            id="settings-model"
            placeholder="e.g. smollm2:360m"
            value={model}
            onChange={e => modelSet(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end p-6">
        <Button onClick={save} disabled={saving}>
          Save
        </Button>
      </div>
    </div>
  )
}

/**
 * Everything stored about you, visible and deletable — no hidden profiling.
 * Distilled memories carry the chat that produced them.
 */
function MemoriesSection() {
  const { data, loading } = useQuery(MemoriesDocument)
  const [createMemory] = useMutation(CreateMemoryDocument, {
    refetchQueries: [MemoriesDocument],
  })
  const [updateMemory] = useMutation(UpdateMemoryDocument, {
    refetchQueries: [MemoriesDocument],
  })
  const [deleteMemory] = useMutation(DeleteMemoryDocument, {
    refetchQueries: [MemoriesDocument],
  })
  const [draft, draftSet] = useState('')
  const [editingId, editingIdSet] = useState<string | null>(null)
  const [editingText, editingTextSet] = useState('')

  const memories = data?.memories ?? []

  const add = async () => {
    const content = draft.trim()
    if (!content) {
      return
    }
    draftSet('')
    const result = await createMemory({ variables: { content } })
    if (result.data?.createMemory.__typename === 'Error') {
      toast.error(result.data.createMemory.message)
    }
  }

  const saveEdit = async () => {
    const memoryId = editingId
    const content = editingText.trim()
    if (!memoryId || !content) {
      editingIdSet(null)
      return
    }
    editingIdSet(null)
    await updateMemory({
      variables: { input: { id: Number(memoryId), content } },
    })
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div>
        <h3 className="text-sm font-semibold">Memories</h3>
        <p className="text-muted-foreground text-xs">
          What the AI remembers across chats. Every memory is visible here —
          edit or delete anything, anytime.
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={e => draftSet(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              void add()
            }
          }}
          placeholder="Add a memory, e.g. I plan my week on Sundays"
        />
        <Button onClick={() => void add()} aria-label="Add memory">
          <PlusIcon className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t pt-3">
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : memories.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No memories yet. They appear as you chat (distilled memories show
            the chat they came from) or when you add them here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {memories.map(memory => (
              <li key={memory.id} className="rounded-md border p-2 text-sm">
                {editingId === memory.id ? (
                  <div className="flex gap-2">
                    <Input
                      value={editingText}
                      onChange={e => editingTextSet(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          void saveEdit()
                        }
                      }}
                      autoFocus
                    />
                    <Button onClick={() => void saveEdit()}>Save</Button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words">{memory.content}</p>
                      <p className="text-muted-foreground text-xs">
                        {memory.source === 'DISTILLED' ? 'distilled' : 'manual'}
                        {memory.conversationId != null
                          ? ` · from chat #${memory.conversationId}`
                          : ''}
                        {memory.updatedAt
                          ? ` · ${new Date(memory.updatedAt).toLocaleDateString()}`
                          : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Edit memory"
                      onClick={() => {
                        editingIdSet(memory.id)
                        editingTextSet(memory.content)
                      }}
                    >
                      <Undo2Icon className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-red-500"
                      aria-label="Delete memory"
                      onClick={() =>
                        void deleteMemory({
                          variables: { memoryId: Number(memory.id) },
                        })
                      }
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ArchivedChatsSection() {
  // Shares the normalized cache with the main thread list, so unarchives
  // here update the sidebar instantly.
  const { data, refetch } = useQuery(AllConversationsDocument)
  const [archiveMut, { loading: mutating }] = useMutation(
    ArchiveConversationDocument,
  )

  const archived = (data?.conversations ?? []).filter(c => c.archived)

  const unarchive = async (conversationId: number) => {
    const result = await archiveMut({
      variables: { conversationId, archived: false },
    })

    if (result.data?.archiveConversation.__typename === 'Error') {
      toast.error(result.data.archiveConversation.message)
      return
    }

    await refetch()
    toast.success('Chat unarchived')
  }

  return (
    <div className="flex max-h-[24rem] flex-col">
      <DialogHeader className="p-6 pb-4">
        <DialogTitle>Archived chats</DialogTitle>
        <DialogDescription>
          Archived chats are hidden from the sidebar. Unarchive them to bring
          them back.
        </DialogDescription>
      </DialogHeader>

      {archived.length === 0 ? (
        <p className="text-muted-foreground px-6 pb-6 text-sm">
          No archived chats.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-3">
          {archived.map(chat => (
            <li
              key={chat.id}
              className="hover:bg-accent/50 group flex items-center gap-2 rounded-md px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {chat.title}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-xs"
                disabled={mutating}
                onClick={() => unarchive(Number(chat.id))}
              >
                <Undo2Icon className="size-3.5" />
                Unarchive
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="h-2" />
    </div>
  )
}

function AboutSection() {
  const [licensesHtml, licensesHtmlSet] = useState<string | null>(null)
  const [showLicenses, showLicensesSet] = useState(false)
  const [licensesError, licensesErrorSet] = useState<string | null>(null)

  const loadLicenses = async () => {
    showLicensesSet(true)
    if (licensesHtml || licensesError) return
    try {
      const html = await thirdPartyLicenses()
      if (html) licensesHtmlSet(html)
      else licensesErrorSet('Not available outside the desktop app.')
    } catch {
      licensesErrorSet('Could not load license notices.')
    }
  }

  return (
    <div className="flex max-h-[24rem] flex-col">
      <DialogHeader className="p-6 pb-4">
        <DialogTitle>About</DialogTitle>
        <DialogDescription>
          Privait {frontendPackageJson.version} — a private, local-first AI
          workspace. All data stays on this device; the only network traffic is
          to the chat provider you configure.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6">
        <p className="text-sm">
          Licensed under the{' '}
          <a
            href="https://www.gnu.org/licenses/agpl-3.0.html"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            GNU Affero General Public License v3.0
          </a>
          . The project repository ships the full license text.
        </p>

        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={loadLicenses}
        >
          {showLicenses ? 'Hide' : 'View'} third-party licenses
        </Button>

        {showLicenses && (
          <div className="mt-3">
            {licensesError ? (
              <p className="text-muted-foreground text-sm">{licensesError}</p>
            ) : licensesHtml ? (
              <iframe
                title="Third-party licenses"
                srcDoc={licensesHtml}
                sandbox=""
                className="h-64 w-full rounded-md border bg-white"
              />
            ) : (
              <p className="text-muted-foreground text-sm">Loading…</p>
            )}
          </div>
        )}
      </div>
      <div className="h-2" />
    </div>
  )
}
