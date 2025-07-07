import { AlertBlock } from '@/components/shared/alert-block'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { api } from '@/utils/api'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  DatabaseZap,
  Info,
  PenBoxIcon,
  PlusCircle,
  RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'next-i18next'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import type { CacheType } from '../domains/handle-domain'
import { commonCronExpressions } from '../schedules/handle-schedules'

interface Props {
  id?: string
  volumeBackupId?: string
  volumeBackupType?:
    | 'application'
    | 'compose'
    | 'postgres'
    | 'mariadb'
    | 'mongo'
    | 'mysql'
    | 'redis'
}

export const HandleVolumeBackups = ({
  id,
  volumeBackupId,
  volumeBackupType,
}: Props) => {
  const { t } = useTranslation('dashboard')
  const [isOpen, setIsOpen] = useState(false)
  const [cacheType, setCacheType] = useState<CacheType>('cache')

  const utils = api.useUtils()

  const formSchema = z
    .object({
      name: z.string().min(1, t('dashboard.volumeBackup.nameRequired')),
      cronExpression: z
        .string()
        .min(1, t('dashboard.volumeBackup.cronExpressionRequired')),
      volumeName: z
        .string()
        .min(1, t('dashboard.volumeBackup.volumeNameRequired')),
      prefix: z.string(),
      keepLatestCount: z.coerce.number().optional(),
      turnOff: z.boolean().default(false),
      enabled: z.boolean().default(true),
      serviceType: z.enum([
        'application',
        'compose',
        'postgres',
        'mariadb',
        'mongo',
        'mysql',
        'redis',
      ]),
      serviceName: z.string(),
      destinationId: z
        .string()
        .min(1, t('dashboard.volumeBackup.destinationRequired')),
    })
    .superRefine((data, ctx) => {
      if (data.serviceType === 'compose' && !data.serviceName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('dashboard.volumeBackup.serviceNameRequired'),
          path: ['serviceName'],
        })
      }

      if (data.serviceType === 'compose' && !data.serviceName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('dashboard.volumeBackup.serviceNameRequired'),
          path: ['serviceName'],
        })
      }
    })

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      cronExpression: '',
      volumeName: '',
      prefix: '',
      // keepLatestCount: undefined,
      turnOff: false,
      enabled: true,
      serviceName: '',
      serviceType: volumeBackupType,
    },
  })

  const serviceTypeForm = volumeBackupType
  const { data: destinations } = api.destination.all.useQuery()
  const { data: volumeBackup } = api.volumeBackups.one.useQuery(
    { volumeBackupId: volumeBackupId || '' },
    { enabled: !!volumeBackupId }
  )

  const { data: mounts } = api.mounts.allNamedByApplicationId.useQuery(
    { applicationId: id || '' },
    { enabled: !!id && volumeBackupType === 'application' }
  )

  const {
    data: services,
    isFetching: isLoadingServices,
    error: errorServices,
    refetch: refetchServices,
  } = api.compose.loadServices.useQuery(
    {
      composeId: id || '',
      type: cacheType,
    },
    {
      retry: false,
      refetchOnWindowFocus: false,
      enabled: !!id && volumeBackupType === 'compose',
    }
  )

  const serviceName = form.watch('serviceName')

  const { data: mountsByService } = api.compose.loadMountsByService.useQuery(
    {
      composeId: id || '',
      serviceName,
    },
    {
      enabled: !!id && volumeBackupType === 'compose' && !!serviceName,
    }
  )

  useEffect(() => {
    if (volumeBackupId && volumeBackup) {
      form.reset({
        name: volumeBackup.name,
        cronExpression: volumeBackup.cronExpression,
        volumeName: volumeBackup.volumeName || '',
        prefix: volumeBackup.prefix,
        // keepLatestCount: volumeBackup.keepLatestCount || undefined,
        turnOff: volumeBackup.turnOff,
        enabled: volumeBackup.enabled || false,
        serviceName: volumeBackup.serviceName || '',
        destinationId: volumeBackup.destinationId,
        serviceType: volumeBackup.serviceType,
      })
    }
  }, [form, volumeBackup, volumeBackupId])

  const { mutateAsync, isLoading } = volumeBackupId
    ? api.volumeBackups.update.useMutation()
    : api.volumeBackups.create.useMutation()

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!id && !volumeBackupId) return

    await mutateAsync({
      ...values,
      destinationId: values.destinationId,
      volumeBackupId: volumeBackupId || '',
      serviceType: volumeBackupType,
      ...(volumeBackupType === 'application' && {
        applicationId: id || '',
      }),
      ...(volumeBackupType === 'compose' && {
        composeId: id || '',
      }),
      ...(volumeBackupType === 'postgres' && {
        serverId: id || '',
      }),
      ...(volumeBackupType === 'postgres' && {
        postgresId: id || '',
      }),
      ...(volumeBackupType === 'mariadb' && {
        mariadbId: id || '',
      }),
      ...(volumeBackupType === 'mongo' && {
        mongoId: id || '',
      }),
      ...(volumeBackupType === 'mysql' && {
        mysqlId: id || '',
      }),
      ...(volumeBackupType === 'redis' && {
        redisId: id || '',
      }),
    })
      .then(() => {
        toast.success(
          t(
            `dashboard.volumeBackup.${
              volumeBackupId ? 'updated' : 'created'
            }Success`
          )
        )
        utils.volumeBackups.list.invalidate({
          id,
          volumeBackupType,
        })
        setIsOpen(false)
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : t('dashboard.volumeBackup.unknownError')
        )
      })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {volumeBackupId ? (
          <Button
            variant="ghost"
            size="icon"
            className="group hover:bg-blue-500/10"
          >
            <PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
          </Button>
        ) : (
          <Button>
            <PlusCircle className="w-4 h-4 mr-2" />
            {t('dashboard.volumeBackup.addVolumeBackup')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className={cn(
          'max-h-screen overflow-y-auto',
          volumeBackupType === 'compose' || volumeBackupType === 'application'
            ? 'max-h-[95vh] sm:max-w-2xl'
            : ' sm:max-w-lg'
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {volumeBackupId
              ? t('dashboard.volumeBackup.editVolumeBackup')
              : t('dashboard.volumeBackup.createVolumeBackup')}
          </DialogTitle>
          <DialogDescription>
            {t('dashboard.volumeBackup.createVolumeBackupDescription')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    {t('dashboard.volumeBackup.taskName')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(
                        'dashboard.volumeBackup.dailyDatabaseBackupPlaceholder'
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('dashboard.volumeBackup.descriptiveName')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cronExpression"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    {t('dashboard.volumeBackup.schedule')}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {t('dashboard.volumeBackup.cronExpressionFormat')}
                          </p>
                          <p>
                            {t('dashboard.volumeBackup.cronExpressionExample')}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </FormLabel>
                  <div className="flex flex-col gap-2">
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value)
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t(
                              'dashboard.volumeBackup.selectPredefinedSchedule'
                            )}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {commonCronExpressions.map((expr) => (
                          <SelectItem key={expr.value} value={expr.value}>
                            {expr.label} ({expr.value})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="relative">
                      <FormControl>
                        <Input
                          placeholder={t(
                            'dashboard.volumeBackup.customCronExpressionPlaceholder'
                          )}
                          {...field}
                        />
                      </FormControl>
                    </div>
                  </div>
                  <FormDescription>
                    {t(
                      'dashboard.volumeBackup.choosePredefinedScheduleOrCustom'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="destinationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('dashboard.volumeBackup.destination')}
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t(
                            'dashboard.volumeBackup.selectDestination'
                          )}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {destinations?.map((destination) => (
                        <SelectItem
                          key={destination.destinationId}
                          value={destination.destinationId}
                        >
                          {destination.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t('dashboard.volumeBackup.chooseBackupDestination')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {serviceTypeForm === 'compose' && (
              <>
                <div className="flex flex-col w-full gap-4">
                  {errorServices && (
                    <AlertBlock
                      type="warning"
                      className="[overflow-wrap:anywhere]"
                    >
                      {errorServices?.message}
                    </AlertBlock>
                  )}
                  <FormField
                    control={form.control}
                    name="serviceName"
                    render={({ field }) => (
                      <FormItem className="w-full">
                        <FormLabel>
                          {t('dashboard.volumeBackup.serviceName')}
                        </FormLabel>
                        <div className="flex gap-2">
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value || ''}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={t(
                                    'dashboard.volumeBackup.selectServiceName'
                                  )}
                                />
                              </SelectTrigger>
                            </FormControl>

                            <SelectContent>
                              {services?.map((service, index) => (
                                <SelectItem
                                  value={service}
                                  key={`${service}-${index}`}
                                >
                                  {service}
                                </SelectItem>
                              ))}
                              <SelectItem value="none" disabled>
                                {t('dashboard.volumeBackup.empty')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="secondary"
                                  type="button"
                                  isLoading={isLoadingServices}
                                  onClick={() => {
                                    if (cacheType === 'fetch') {
                                      refetchServices()
                                    } else {
                                      setCacheType('fetch')
                                    }
                                  }}
                                >
                                  <RefreshCw className="size-4 text-muted-foreground" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="left"
                                sideOffset={5}
                                className="max-w-[10rem]"
                              >
                                <p>
                                  {t('dashboard.volumeBackup.fetchDescription')}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="secondary"
                                  type="button"
                                  isLoading={isLoadingServices}
                                  onClick={() => {
                                    if (cacheType === 'cache') {
                                      refetchServices()
                                    } else {
                                      setCacheType('cache')
                                    }
                                  }}
                                >
                                  <DatabaseZap className="size-4 text-muted-foreground" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="left"
                                sideOffset={5}
                                className="max-w-[10rem]"
                              >
                                <p>
                                  {t('dashboard.volumeBackup.cacheDescription')}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>

                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {mountsByService && mountsByService.length > 0 && (
                  <FormField
                    control={form.control}
                    name="volumeName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('dashboard.volumeBackup.volumes')}
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value || ''}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={t(
                                  'dashboard.volumeBackup.selectVolumeName'
                                )}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {mountsByService?.map((volume) => (
                              <SelectItem
                                key={volume.Name}
                                value={volume.Name || ''}
                              >
                                {volume.Name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {t('dashboard.volumeBackup.chooseVolumeToBackup')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </>
            )}
            {serviceTypeForm === 'application' && (
              <FormField
                control={form.control}
                name="volumeName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('dashboard.volumeBackup.volumes')}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value || ''}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t(
                              'dashboard.volumeBackup.selectVolumeName'
                            )}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {mounts?.map((mount) => (
                          <SelectItem key={mount.Name} value={mount.Name || ''}>
                            {mount.Name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t('dashboard.volumeBackup.chooseVolumeToBackup')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="volumeName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('dashboard.volumeBackup.volumeName')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(
                        'dashboard.volumeBackup.myVolumeNamePlaceholder'
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('dashboard.volumeBackup.dockerVolumeName')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="prefix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('dashboard.volumeBackup.backupPrefix')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(
                        'dashboard.volumeBackup.backupPrefixPlaceholder'
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('dashboard.volumeBackup.backupPrefixDescription')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* <FormField
							control={form.control}
							name="keepLatestCount"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("dashboard.volumeBackup.keepLatestCount")}
									</FormLabel>
									<FormControl>
										<Input
											type="number"
											placeholder={t(
												"dashboard.volumeBackup.keepLatestCountPlaceholder",
											)}
											{...field}
											onChange={(e) =>
												field.onChange(Number(e.target.value) || undefined)
											}
										/>
									</FormControl>
									<FormDescription>
										{t("dashboard.volumeBackup.keepLatestCountDescription")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/> */}

            <FormField
              control={form.control}
              name="turnOff"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    {t('dashboard.volumeBackup.turnOffContainerDuringBackup')}
                  </FormLabel>
                  <FormDescription className="text-amber-600 dark:text-amber-400">
                    ⚠️{' '}
                    {t(
                      'dashboard.volumeBackup.turnOffContainerDuringBackupDescription'
                    )}
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    {t('dashboard.volumeBackup.enabled')}
                  </FormLabel>
                </FormItem>
              )}
            />

            <Button type="submit" isLoading={isLoading} className="w-full">
              {volumeBackupId
                ? t('dashboard.volumeBackup.updateVolumeBackup')
                : t('dashboard.volumeBackup.createVolumeBackup')}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
