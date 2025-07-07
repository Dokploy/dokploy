import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { StreamLanguage } from '@codemirror/language'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { EditorView } from '@codemirror/view'
import { githubDark, githubLight } from '@uiw/codemirror-theme-github'
import CodeMirror, { type ReactCodeMirrorProps } from '@uiw/react-codemirror'
import { useTranslation } from 'next-i18next'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

// Helper to generate completion options with translation
type TFunction = (key: string) => string
const getDockerComposeServices = (t: TFunction) =>
  [
    {
      label: 'services',
      type: 'keyword',
      info: t('common.codeEditor.info.services'),
    },
    {
      label: 'version',
      type: 'keyword',
      info: t('common.codeEditor.info.version'),
    },
    {
      label: 'volumes',
      type: 'keyword',
      info: t('common.codeEditor.info.volumes'),
    },
    {
      label: 'networks',
      type: 'keyword',
      info: t('common.codeEditor.info.networks'),
    },
    {
      label: 'configs',
      type: 'keyword',
      info: t('common.codeEditor.info.configs'),
    },
    {
      label: 'secrets',
      type: 'keyword',
      info: t('common.codeEditor.info.secrets'),
    },
  ].map((opt) => ({
    ...opt,
    apply: (
      view: EditorView,
      completion: Completion,
      from: number,
      to: number
    ) => {
      const insert = `${completion.label}:`
      view.dispatch({
        changes: {
          from,
          to,
          insert,
        },
        selection: { anchor: from + insert.length },
      })
    },
  }))

const getDockerComposeServiceOptions = (t: TFunction) =>
  [
    {
      label: 'image',
      type: 'keyword',
      info: t('common.codeEditor.info.image'),
    },
    {
      label: 'build',
      type: 'keyword',
      info: t('common.codeEditor.info.build'),
    },
    {
      label: 'command',
      type: 'keyword',
      info: t('common.codeEditor.info.command'),
    },
    {
      label: 'container_name',
      type: 'keyword',
      info: t('common.codeEditor.info.container_name'),
    },
    {
      label: 'depends_on',
      type: 'keyword',
      info: t('common.codeEditor.info.depends_on'),
    },
    {
      label: 'environment',
      type: 'keyword',
      info: t('common.codeEditor.info.environment'),
    },
    {
      label: 'env_file',
      type: 'keyword',
      info: t('common.codeEditor.info.env_file'),
    },
    {
      label: 'expose',
      type: 'keyword',
      info: t('common.codeEditor.info.expose'),
    },
    {
      label: 'ports',
      type: 'keyword',
      info: t('common.codeEditor.info.ports'),
    },
    {
      label: 'volumes',
      type: 'keyword',
      info: t('common.codeEditor.info.volumesService'),
    },
    {
      label: 'restart',
      type: 'keyword',
      info: t('common.codeEditor.info.restart'),
    },
    {
      label: 'networks',
      type: 'keyword',
      info: t('common.codeEditor.info.networksService'),
    },
  ].map((opt) => ({
    ...opt,
    apply: (
      view: EditorView,
      completion: Completion,
      from: number,
      to: number
    ) => {
      const insert = `${completion.label}: `
      view.dispatch({
        changes: {
          from,
          to,
          insert,
        },
        selection: { anchor: from + insert.length },
      })
    },
  }))

function dockerComposeComplete(
  context: CompletionContext
): CompletionResult | null {
  const word = context.matchBefore(/\w*/)
  if (!word || (!word.text && !context.explicit)) return null

  // Check if we're at the root level
  const line = context.state.doc.lineAt(context.pos)
  const indentation = /^\s*/.exec(line.text)?.[0].length || 0

  // If we're at the root level
  if (indentation === 0) {
    return {
      from: word.from,
      options: getDockerComposeServices(t),
      validFor: /^\w*$/,
    }
  }

  // If we're inside a service definition
  if (indentation === 4) {
    return {
      from: word.from,
      options: getDockerComposeServiceOptions(t),
      validFor: /^\w*$/,
    }
  }

  return null
}

interface Props extends ReactCodeMirrorProps {
  wrapperClassName?: string
  disabled?: boolean
  language?: 'yaml' | 'json' | 'properties' | 'shell'
  lineWrapping?: boolean
  lineNumbers?: boolean
}

export const CodeEditor = ({
  className,
  wrapperClassName,
  language = 'yaml',
  lineNumbers = true,
  ...props
}: Props) => {
  const { resolvedTheme } = useTheme()
  const { t } = useTranslation('common')
  return (
    <div className={cn('overflow-auto', wrapperClassName)}>
      <CodeMirror
        basicSetup={{
          lineNumbers,
          foldGutter: true,
          highlightSelectionMatches: true,
          highlightActiveLine: !props.disabled,
          allowMultipleSelections: true,
        }}
        theme={resolvedTheme === 'dark' ? githubDark : githubLight}
        extensions={[
          language === 'yaml'
            ? yaml()
            : language === 'json'
            ? json()
            : language === 'shell'
            ? StreamLanguage.define(shell)
            : StreamLanguage.define(properties),
          props.lineWrapping ? EditorView.lineWrapping : [],
          language === 'yaml'
            ? autocompletion({
                override: [dockerComposeComplete],
              })
            : [],
        ]}
        {...props}
        editable={!props.disabled}
        className={cn(
          'w-full h-full text-sm leading-relaxed relative',
          `cm-theme-${resolvedTheme}`,
          className
        )}
      >
        {props.disabled && (
          <div className="absolute top-0 rounded-md left-0 w-full flex items-center justify-center z-[10] [background:var(--overlay)] h-full" />
        )}
      </CodeMirror>
    </div>
  )
}
