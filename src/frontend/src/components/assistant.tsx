import { ApolloChatRuntimeProvider } from '@frontend/providers/apollo-chat-runtime'
import { ThreadProvider } from '@frontend/providers/thread'

import { Thread } from './assistant-ui/thread'
import { ThreadList } from './assistant-ui/thread-list'

export const Assistant = () => {
  return (
    <ThreadProvider>
      <ApolloChatRuntimeProvider>
        <div className="grid h-full grid-cols-[200px_1fr]">
          <ThreadList />
          <div style={{ height: '75vh' }}>
            <Thread />
          </div>
        </div>
      </ApolloChatRuntimeProvider>
    </ThreadProvider>
  )
}
