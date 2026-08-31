import { useEffect, useState } from 'react'

import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { toast } from 'sonner'

import { Button } from '@frontend/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@frontend/components/ui/dialog'
import { Input } from '@frontend/components/ui/input'
import { Label } from '@frontend/components/ui/label'
import {
  GetSettingsDocument,
  SaveSettingsDocument,
} from '@frontend/graphql/output/graphql'

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

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data } = useQuery(GetSettingsDocument, { skip: !open })
  const [saveSettingsMut, { loading: saving }] =
    useMutation(SaveSettingsDocument)

  const [baseUrl, baseUrlSet] = useState('')
  const [apiKey, apiKeySet] = useState('')
  const [model, modelSet] = useState('')

  useEffect(() => {
    if (open && data?.settings) {
      baseUrlSet(data.settings.baseUrl)
      apiKeySet(data.settings.apiKey)
      modelSet(data.settings.model)
    }
  }, [open, data])

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
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Point Privait at any OpenAI-compatible provider — a local server
            like ollama or LM Studio, or a cloud provider such as OpenRouter.
            Your key never leaves this device.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
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

        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
