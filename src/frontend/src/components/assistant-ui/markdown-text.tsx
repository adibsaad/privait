'use client'

import { type FC, memo, useState } from 'react'

import {
  type CodeHeaderProps,
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from '@assistant-ui/react-markdown'
import { CheckIcon, CopyIcon } from 'lucide-react'
import remarkGfm from 'remark-gfm'

import { TooltipIconButton } from '@frontend/components/assistant-ui/tooltip-icon-button'
import { cn } from '@frontend/lib/utils'

import '@assistant-ui/react-markdown/styles/dot.css'

const MarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md"
      components={defaultComponents}
    />
  )
}

export const MarkdownText = memo(MarkdownTextImpl)

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard()
  const onCopy = () => {
    if (!code || isCopied) return
    copyToClipboard(code)
  }

  return (
    <div className="aui-code-header-root mt-2.5 flex items-center justify-between rounded-t-lg border border-b-0 border-neutral-200 border-neutral-200/50 bg-neutral-100/50 px-3 py-1.5 text-xs dark:border-neutral-800 dark:border-neutral-800/50 dark:bg-neutral-800/50">
      <span className="aui-code-header-language font-medium lowercase text-neutral-500 dark:text-neutral-400">
        {language}
      </span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && <CopyIcon />}
        {isCopied && <CheckIcon />}
      </TooltipIconButton>
    </div>
  )
}

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false)

  const copyToClipboard = (value: string) => {
    if (!value) return

    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), copiedDuration)
    })
  }

  return { isCopied, copyToClipboard }
}

const defaultComponents = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        'aui-md-h1 mb-2 scroll-m-20 text-base font-semibold first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        'aui-md-h2 mb-1.5 mt-3 scroll-m-20 text-sm font-semibold first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        'aui-md-h3 mb-1 mt-2.5 scroll-m-20 text-sm font-semibold first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        'aui-md-h4 mb-1 mt-2 scroll-m-20 text-sm font-medium first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn(
        'aui-md-h5 mb-1 mt-2 text-sm font-medium first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(
        'aui-md-h6 mb-1 mt-2 text-sm font-medium first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn(
        'aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        'aui-md-a text-neutral-900 underline underline-offset-2 hover:text-neutral-900/80 dark:text-neutral-50 dark:hover:text-neutral-50/80',
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        'aui-md-blockquote my-2.5 border-l-2 border-neutral-500/30 pl-3 italic text-neutral-500 dark:border-neutral-400/30 dark:text-neutral-400',
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        'aui-md-ul my-2 ml-4 list-disc marker:text-neutral-500 dark:marker:text-neutral-400 [&>li]:mt-1',
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        'aui-md-ol my-2 ml-4 list-decimal marker:text-neutral-500 dark:marker:text-neutral-400 [&>li]:mt-1',
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr
      className={cn(
        'aui-md-hr my-2 border-neutral-500/20 dark:border-neutral-400/20',
        className,
      )}
      {...props}
    />
  ),
  table: ({ className, ...props }) => (
    <table
      className={cn(
        'aui-md-table my-2 w-full border-separate border-spacing-0 overflow-y-auto',
        className,
      )}
      {...props}
    />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        'aui-md-th [[align=center]]:text-center [[align=right]]:text-right bg-neutral-100 px-2 py-1 text-left font-medium first:rounded-tl-lg last:rounded-tr-lg dark:bg-neutral-800',
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        'aui-md-td [[align=center]]:text-center [[align=right]]:text-right border-b border-l border-neutral-500/20 px-2 py-1 text-left last:border-r dark:border-neutral-400/20',
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(
        'aui-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg',
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn('aui-md-li leading-normal', className)} {...props} />
  ),
  sup: ({ className, ...props }) => (
    <sup
      className={cn('aui-md-sup [&>a]:text-xs [&>a]:no-underline', className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        'aui-md-pre overflow-x-auto rounded-b-lg rounded-t-none border border-t-0 border-neutral-200 border-neutral-200/50 bg-neutral-100/30 p-3 text-xs leading-relaxed dark:border-neutral-800 dark:border-neutral-800/50 dark:bg-neutral-800/30',
        className,
      )}
      {...props}
    />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock()
    return (
      <code
        className={cn(
          !isCodeBlock &&
            'aui-md-inline-code rounded-md border border-neutral-200 border-neutral-200/50 bg-neutral-100/50 px-1.5 py-0.5 font-mono text-[0.85em] dark:border-neutral-800 dark:border-neutral-800/50 dark:bg-neutral-800/50',
          className,
        )}
        {...props}
      />
    )
  },
  CodeHeader,
})
