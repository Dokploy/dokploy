import { Loader2, Puzzle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertBlock } from '@/components/shared/alert-block'
import { CodeEditor } from '@/components/shared/code-editor'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { api } from '@/utils/api'
import { useTranslation } from 'next-i18next'

interface Props {
  composeId: string
}

export const ShowConvertedCompose = ({ composeId }: Props) => {
  const { t } = useTranslation('dashboard')
  const [isOpen, setIsOpen] = useState(false)
  const {
    data: compose,
    error,
    isError,
    refetch,
  } = api.compose.getConvertedCompose.useQuery(
    { composeId },
    {
      retry: false,
    }
  )

  const { mutateAsync, isLoading } = api.compose.fetchSourceType.useMutation()

  useEffect(() => {
    if (isOpen) {
      mutateAsync({ composeId })
        .then(() => {
          refetch()
        })
        .catch(() => {})
    }
  }, [isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="max-lg:w-full" variant="outline">
          <Puzzle className="h-4 w-4" />
          {t('dashboard.compose.previewCompose')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-6xl max-h-[50rem]">
        <DialogHeader>
          <DialogTitle>{t('dashboard.compose.convertedCompose')}</DialogTitle>
          <DialogDescription>
            {t('dashboard.compose.convertedComposeDescription')}
          </DialogDescription>
        </DialogHeader>
        {isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

        <AlertBlock type="info" className="mb-4">
          {t('dashboard.compose.convertedComposeInfo')}
        </AlertBlock>
        {isLoading ? (
          <div className="flex flex-row items-center justify-center min-h-[25rem] border p-4 rounded-md">
            <Loader2 className="h-8 w-8 text-muted-foreground mb-2 animate-spin" />
          </div>
        ) : compose?.length === 5 ? (
          <div className="border p-4 rounded-md flex flex-col items-center justify-center min-h-[25rem]">
            <Puzzle className="h-8 w-8 text-muted-foreground mb-2" />
            <span className="text-muted-foreground">
              {t('dashboard.compose.noConvertedComposeDataAvailable')}
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-row gap-2 justify-end my-4">
              <Button
                variant="secondary"
                isLoading={isLoading}
                onClick={() => {
                  mutateAsync({ composeId })
                    .then(() => {
                      refetch()
                      toast.success(t('dashboard.compose.fetchedSourceType'))
                    })
                    .catch((err) => {
                      toast.error(
                        t('dashboard.compose.errorFetchingSourceType'),
                        {
                          description: err.message,
                        }
                      )
                    })
                }}
              >
                {t('dashboard.compose.refresh')}{' '}
                <RefreshCw className="ml-2 h-4 w-4" />
              </Button>
            </div>

            <pre>
              <CodeEditor
                value={compose || ''}
                language="yaml"
                readOnly
                height="50rem"
              />
            </pre>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
