import { Package, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AlertBlock } from '@/components/shared/alert-block'
import { DialogAction } from '@/components/shared/dialog-action'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { api } from '@/utils/api'
import { useTranslation } from 'next-i18next'
import type { ServiceType } from '../show-resources'
import { AddVolumes } from './add-volumes'
import { UpdateVolume } from './update-volume'

interface Props {
  id: string
  type: ServiceType | 'compose'
}

export const ShowVolumes = ({ id, type }: Props) => {
  const { t } = useTranslation('dashboard')
  const queryMap = {
    postgres: () =>
      api.postgres.one.useQuery({ postgresId: id }, { enabled: !!id }),
    redis: () => api.redis.one.useQuery({ redisId: id }, { enabled: !!id }),
    mysql: () => api.mysql.one.useQuery({ mysqlId: id }, { enabled: !!id }),
    mariadb: () =>
      api.mariadb.one.useQuery({ mariadbId: id }, { enabled: !!id }),
    application: () =>
      api.application.one.useQuery({ applicationId: id }, { enabled: !!id }),
    mongo: () => api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id }),
    compose: () =>
      api.compose.one.useQuery({ composeId: id }, { enabled: !!id }),
  }
  const { data, refetch } = queryMap[type]
    ? queryMap[type]()
    : api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id })
  const { mutateAsync: deleteVolume, isLoading: isRemoving } =
    api.mounts.remove.useMutation()
  return (
    <Card className="bg-background">
      <CardHeader className="flex flex-row justify-between flex-wrap gap-4">
        <div>
          <CardTitle className="text-xl">
            {t('dashboard.volumes.volumes')}
          </CardTitle>
          <CardDescription>
            {t('dashboard.volumes.description')}
          </CardDescription>
        </div>

        {data && data?.mounts.length > 0 && (
          <AddVolumes serviceId={id} refetch={refetch} serviceType={type}>
            {t('dashboard.volumes.addVolume')}
          </AddVolumes>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data?.mounts.length === 0 ? (
          <div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
            <Package className="size-8 text-muted-foreground" />
            <span className="text-base text-muted-foreground">
              {t('dashboard.volumes.noVolumesConfigured')}
            </span>
            <AddVolumes serviceId={id} refetch={refetch} serviceType={type}>
              {t('dashboard.volumes.addVolume')}
            </AddVolumes>
          </div>
        ) : (
          <div className="flex flex-col pt-2 gap-4">
            <AlertBlock type="warning">
              {t('dashboard.volumes.redeployReminder')}
            </AlertBlock>
            <div className="flex flex-col gap-6">
              {data?.mounts.map((mount) => (
                <div key={mount.mountId}>
                  <div
                    key={mount.mountId}
                    className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-10 border rounded-lg p-4"
                  >
                    {/* <Package className="size-8 self-center text-muted-foreground" /> */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 flex-col gap-4 sm:gap-8">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">
                          {t('dashboard.volumes.mountType')}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {mount.type.toUpperCase()}
                        </span>
                      </div>
                      {mount.type === 'volume' && (
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">
                            {t('dashboard.volumes.volumeName')}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {mount.volumeName}
                          </span>
                        </div>
                      )}

                      {mount.type === 'file' && (
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">
                            {t('dashboard.volumes.content')}
                          </span>
                          <span className="text-sm text-muted-foreground line-clamp-[10] whitespace-break-spaces">
                            {mount.content}
                          </span>
                        </div>
                      )}
                      {mount.type === 'bind' && (
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">
                            {t('dashboard.volumes.hostPath')}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {mount.hostPath}
                          </span>
                        </div>
                      )}
                      {mount.type === 'file' && (
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">
                            {t('dashboard.volumes.filePath')}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {mount.filePath}
                          </span>
                        </div>
                      )}

                      <div className="flex flex-col gap-1">
                        <span className="font-medium">Mount Path</span>
                        <span className="text-sm text-muted-foreground">
                          {mount.mountPath}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-row gap-1">
                      <UpdateVolume
                        mountId={mount.mountId}
                        type={mount.type}
                        refetch={refetch}
                        serviceType={type}
                      />
                      <DialogAction
                        title={t('dashboard.volumes.deleteVolume')}
                        description={t(
                          'dashboard.volumes.deleteVolumeConfirmation'
                        )}
                        type="destructive"
                        onClick={async () => {
                          await deleteVolume({
                            mountId: mount.mountId,
                          })
                            .then(() => {
                              refetch()
                              toast.success(
                                t('dashboard.volumes.volumeDeletedSuccessfully')
                              )
                            })
                            .catch(() => {
                              toast.error(
                                t('dashboard.volumes.errorDeletingVolume')
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
