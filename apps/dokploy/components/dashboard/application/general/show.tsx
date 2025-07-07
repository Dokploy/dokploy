import { ShowBuildChooseForm } from '@/components/dashboard/application/build/show'
import { ShowProviderForm } from '@/components/dashboard/application/general/generic/show'
import { DialogAction } from '@/components/shared/dialog-action'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { api } from '@/utils/api'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import {
  Ban,
  CheckCircle2,
  Hammer,
  RefreshCcw,
  Rocket,
  Terminal,
} from 'lucide-react'
import { useTranslation } from 'next-i18next'
import { useRouter } from 'next/router'
import { toast } from 'sonner'
import { DockerTerminalModal } from '../../settings/web-server/docker-terminal-modal'
interface Props {
  applicationId: string
}

export const ShowGeneralApplication = ({ applicationId }: Props) => {
  const { t } = useTranslation('dashboard')
  const router = useRouter()
  const { data, refetch } = api.application.one.useQuery(
    {
      applicationId,
    },
    { enabled: !!applicationId }
  )
  const { mutateAsync: update } = api.application.update.useMutation()
  const { mutateAsync: start, isLoading: isStarting } =
    api.application.start.useMutation()
  const { mutateAsync: stop, isLoading: isStopping } =
    api.application.stop.useMutation()

  const { mutateAsync: deploy } = api.application.deploy.useMutation()

  const { mutateAsync: reload, isLoading: isReloading } =
    api.application.reload.useMutation()

  const { mutateAsync: redeploy } = api.application.redeploy.useMutation()

  return (
    <>
      <Card className="bg-background">
        <CardHeader>
          <CardTitle className="text-xl">
            {t('dashboard.application.general.deploySettings')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-row gap-4 flex-wrap">
          <TooltipProvider delayDuration={0} disableHoverableContent={false}>
            <DialogAction
              title={t('dashboard.application.general.deployApplication')}
              description={t(
                'dashboard.application.general.deployApplicationDescription'
              )}
              type="default"
              onClick={async () => {
                await deploy({
                  applicationId: applicationId,
                })
                  .then(() => {
                    toast.success(
                      t(
                        'dashboard.application.general.applicationDeployedSuccessfully'
                      )
                    )
                    refetch()
                    router.push(
                      `/dashboard/project/${data?.projectId}/services/application/${applicationId}?tab=deployments`
                    )
                  })
                  .catch(() => {
                    toast.error(
                      t(
                        'dashboard.application.general.errorDeployingApplication'
                      )
                    )
                  })
              }}
            >
              <Button
                variant="default"
                isLoading={data?.applicationStatus === 'running'}
                className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <Rocket className="size-4 mr-1" />
                      {t('dashboard.application.general.deploy')}
                    </div>
                  </TooltipTrigger>
                  <TooltipPrimitive.Portal>
                    <TooltipContent sideOffset={5} className="z-[60]">
                      <p>{t('dashboard.application.general.deployTooltip')}</p>
                    </TooltipContent>
                  </TooltipPrimitive.Portal>
                </Tooltip>
              </Button>
            </DialogAction>
            <DialogAction
              title={t('dashboard.application.general.reloadApplication')}
              description={t(
                'dashboard.application.general.reloadApplicationDescription'
              )}
              type="default"
              onClick={async () => {
                await reload({
                  applicationId: applicationId,
                  appName: data?.appName || '',
                })
                  .then(() => {
                    toast.success(
                      t(
                        'dashboard.application.general.applicationReloadedSuccessfully'
                      )
                    )
                    refetch()
                  })
                  .catch(() => {
                    toast.error(
                      t(
                        'dashboard.application.general.errorReloadingApplication'
                      )
                    )
                  })
              }}
            >
              <Button
                variant="secondary"
                isLoading={isReloading}
                className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <RefreshCcw className="size-4 mr-1" />
                      {t('dashboard.application.general.reload')}
                    </div>
                  </TooltipTrigger>
                  <TooltipPrimitive.Portal>
                    <TooltipContent sideOffset={5} className="z-[60]">
                      <p>{t('dashboard.application.general.reloadTooltip')}</p>
                    </TooltipContent>
                  </TooltipPrimitive.Portal>
                </Tooltip>
              </Button>
            </DialogAction>
            <DialogAction
              title={t('dashboard.application.general.rebuildApplication')}
              description={t(
                'dashboard.application.general.rebuildApplicationDescription'
              )}
              type="default"
              onClick={async () => {
                await redeploy({
                  applicationId: applicationId,
                })
                  .then(() => {
                    toast.success(
                      t(
                        'dashboard.application.general.applicationRebuiltSuccessfully'
                      )
                    )
                    refetch()
                  })
                  .catch(() => {
                    toast.error(
                      t(
                        'dashboard.application.general.errorRebuildingApplication'
                      )
                    )
                  })
              }}
            >
              <Button
                variant="secondary"
                isLoading={data?.applicationStatus === 'running'}
                className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <Hammer className="size-4 mr-1" />
                      {t('dashboard.application.general.rebuild')}
                    </div>
                  </TooltipTrigger>
                  <TooltipPrimitive.Portal>
                    <TooltipContent sideOffset={5} className="z-[60]">
                      <p>{t('dashboard.application.general.rebuildTooltip')}</p>
                    </TooltipContent>
                  </TooltipPrimitive.Portal>
                </Tooltip>
              </Button>
            </DialogAction>
            {data?.applicationStatus === 'idle' ? (
              <DialogAction
                title={t('dashboard.application.general.startApplication')}
                description={t(
                  'dashboard.application.general.startApplicationDescription'
                )}
                type="default"
                onClick={async () => {
                  await start({
                    applicationId: applicationId,
                  })
                    .then(() => {
                      toast.success(
                        t(
                          'dashboard.application.general.applicationStartedSuccessfully'
                        )
                      )
                      refetch()
                    })
                    .catch(() => {
                      toast.error(
                        t(
                          'dashboard.application.general.errorStartingApplication'
                        )
                      )
                    })
                }}
              >
                <Button
                  variant="secondary"
                  isLoading={isStarting}
                  className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center">
                        <CheckCircle2 className="size-4 mr-1" />
                        {t('dashboard.application.general.start')}
                      </div>
                    </TooltipTrigger>
                    <TooltipPrimitive.Portal>
                      <TooltipContent sideOffset={5} className="z-[60]">
                        <p>{t('dashboard.application.general.startTooltip')}</p>
                      </TooltipContent>
                    </TooltipPrimitive.Portal>
                  </Tooltip>
                </Button>
              </DialogAction>
            ) : (
              <DialogAction
                title={t('dashboard.application.general.stopApplication')}
                description={t(
                  'dashboard.application.general.stopApplicationDescription'
                )}
                type="default"
                onClick={async () => {
                  await stop({
                    applicationId: applicationId,
                  })
                    .then(() => {
                      toast.success(
                        t(
                          'dashboard.application.general.applicationStoppedSuccessfully'
                        )
                      )
                      refetch()
                    })
                    .catch(() => {
                      toast.error(
                        t(
                          'dashboard.application.general.errorStoppingApplication'
                        )
                      )
                    })
                }}
              >
                <Button
                  variant="secondary"
                  isLoading={isStopping}
                  className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center">
                        <Ban className="size-4 mr-1" />
                        {t('dashboard.application.general.stop')}
                      </div>
                    </TooltipTrigger>
                    <TooltipPrimitive.Portal>
                      <TooltipContent sideOffset={5} className="z-[60]">
                        <p>{t('dashboard.application.general.stopTooltip')}</p>
                      </TooltipContent>
                    </TooltipPrimitive.Portal>
                  </Tooltip>
                </Button>
              </DialogAction>
            )}
            <DockerTerminalModal
              appName={data?.appName || ''}
              serverId={data?.serverId || ''}
            >
              <Button variant="outline">
                <Terminal />
                {t('dashboard.application.general.openTerminal')}
              </Button>
            </DockerTerminalModal>
          </TooltipProvider>
          <div className="flex flex-row items-center gap-2 rounded-md px-4 py-2 border">
            <span className="text-sm font-medium">
              {t('dashboard.application.general.autodeploy')}
            </span>
            <Switch
              aria-label="Toggle autodeploy"
              checked={data?.autoDeploy || false}
              onCheckedChange={async (enabled) => {
                await update({
                  applicationId,
                  autoDeploy: enabled,
                })
                  .then(async () => {
                    toast.success(
                      t('dashboard.application.general.autoDeployUpdated')
                    )
                    await refetch()
                  })
                  .catch(() => {
                    toast.error(
                      t('dashboard.application.general.errorUpdatingAutoDeploy')
                    )
                  })
              }}
              className="flex flex-row gap-2 items-center data-[state=checked]:bg-primary"
            />
          </div>

          <div className="flex flex-row items-center gap-2 rounded-md px-4 py-2 border">
            <span className="text-sm font-medium">
              {t('dashboard.application.general.cleanCache')}
            </span>
            <Switch
              aria-label="Toggle clean cache"
              checked={data?.cleanCache || false}
              onCheckedChange={async (enabled) => {
                await update({
                  applicationId,
                  cleanCache: enabled,
                })
                  .then(async () => {
                    toast.success(
                      t('dashboard.application.general.cleanCacheUpdated')
                    )
                    await refetch()
                  })
                  .catch(() => {
                    toast.error(
                      t('dashboard.application.general.errorUpdatingCleanCache')
                    )
                  })
              }}
              className="flex flex-row gap-2 items-center data-[state=checked]:bg-primary"
            />
          </div>
        </CardContent>
      </Card>
      <ShowProviderForm applicationId={applicationId} />
      <ShowBuildChooseForm applicationId={applicationId} />
    </>
  )
}
