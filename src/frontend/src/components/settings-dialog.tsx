import { useEffect, useState } from 'react'

import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { ArchiveIcon, KeyRound, Undo2Icon } from 'lucide-react'
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
  GetSettingsDocument,
  SaveSettingsDocument,
} from '@frontend/graphql/output/graphql'
import { cn } from '@frontend/lib/utils'

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
`)

type Section = 'provider' | 'archived'

const SECTIONS: { id: Section; label: string; icon: typeof KeyRound }[] = [
  { id: 'provider', label: 'Provider', icon: KeyRound },
  { id: 'archived', label: 'Archived chats', icon: ArchiveIcon },
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
          ) : (
            <ArchivedChatsSection />
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
