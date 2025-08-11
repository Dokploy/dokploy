import { DialogAction } from '@/components/shared/dialog-action'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ToggleVisibilityInput } from '@/components/shared/toggle-visibility-input'
import { Input } from '@/components/ui/input'
import { api } from '@/utils/api'
import { LockKeyhole, Trash2 } from 'lucide-react'
import { useTranslation } from 'next-i18next'
import { toast } from 'sonner'
import { HandleSecurity } from './handle-security'

interface Props {
  applicationId: string
}

export const ShowSecurity = ({ applicationId }: Props) => {
  const { t } = useTranslation('dashboard')
  const { data, refetch } = api.application.one.useQuery(
    {
      applicationId,
    },
    { enabled: !!applicationId }
  )

  const { mutateAsync: deleteSecurity, isLoading: isRemoving } =
    api.security.delete.useMutation()

  const utils = api.useUtils()
  return (
    <Card className="bg-background">
      <CardHeader className="flex flex-row justify-between flex-wrap gap-4">
        <div>
          <CardTitle className="text-xl">
            {t('dashboard.security.security')}
          </CardTitle>
          <CardDescription>
            {t('dashboard.security.description')}
          </CardDescription>
        </div>

        {data && data?.security.length > 0 && (
          <HandleSecurity applicationId={applicationId}>
            {t('dashboard.security.addSecurity')}
          </HandleSecurity>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data?.security.length === 0 ? (
          <div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
            <LockKeyhole className="size-8 text-muted-foreground" />
            <span className="text-base text-muted-foreground">
              {t('dashboard.security.noSecurityConfigured')}
            </span>
            <HandleSecurity applicationId={applicationId}>
              {t('dashboard.security.addSecurity')}
            </HandleSecurity>
          </div>
        ) : (
          <div className="flex flex-col pt-2">
            <div className="flex flex-col gap-6 ">
              {data?.security.map((security) => (
                <div key={security.securityId}>
                  <div className="flex w-full flex-col md:flex-row justify-between md:items-center gap-4 md:gap-10 border rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 flex-col gap-4 md:gap-8">
                      <div className="flex flex-col gap-2">
                        <Label>{t('dashboard.security.username')}</Label>
                        <Input disabled value={security.username} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>{t('dashboard.security.password')}</Label>
                        <ToggleVisibilityInput
                          value={security.password}
                          disabled
                        />
                      </div>
                    </div>
                    <div className="flex flex-row gap-2">
                      <HandleSecurity
                        securityId={security.securityId}
                        applicationId={applicationId}
                      />
                      <DialogAction
                        title={t('dashboard.security.deleteSecurity')}
                        description={t(
                          'dashboard.security.deleteSecurityConfirmation'
                        )}
                        type="destructive"
                        onClick={async () => {
                          await deleteSecurity({
                            securityId: security.securityId,
                          })
                            .then(() => {
                              refetch()
                              utils.application.readTraefikConfig.invalidate({
                                applicationId,
                              })
                              toast.success(
                                t(
                                  'dashboard.security.securityDeletedSuccessfully'
                                )
                              )
                            })
                            .catch(() => {
                              toast.error(
                                t('dashboard.security.errorDeletingSecurity')
                              )
                            })
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="group hover:bg-red-500/10"
                          isLoading={isRemoving}
                        >
                          <Trash2 className="size-4 text-primary group-hover:text-red-500" />
                        </Button>
                      </DialogAction>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
