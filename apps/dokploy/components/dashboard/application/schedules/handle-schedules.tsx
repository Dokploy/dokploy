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
import { type TFunction, useTranslation } from 'next-i18next'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import type { CacheType } from '../domains/handle-domain'

export const commonCronExpressions = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at midnight', value: '0 0 * * *' },
  { label: 'Every Sunday at midnight', value: '0 0 * * 0' },
  { label: 'Every month on the 1st at midnight', value: '0 0 1 * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every weekday at midnight', value: '0 0 * * 1-5' },
]

const formSchema = (t: TFunction) =>
  z
    .object({
      name: z.string().min(1, t('dashboard.schedule.nameRequired')),
      cronExpression: z
        .string()
        .min(1, t('dashboard.schedule.cronExpressionRequired')),
      shellType: z.enum(['bash', 'sh']).default('bash'),
      command: z.string(),
      enabled: z.boolean().default(true),
      serviceName: z.string(),
      scheduleType: z.enum([
        'application',
        'compose',
        'server',
        'dokploy-server',
      ]),
      script: z.string(),
    })
    .superRefine((data, ctx) => {
      if (data.scheduleType === 'compose' && !data.serviceName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('dashboard.schedule.serviceNameRequired'),
          path: ['serviceName'],
        })
      }

      if (
        (data.scheduleType === 'dokploy-server' ||
          data.scheduleType === 'server') &&
        !data.script
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('dashboard.schedule.scriptRequired'),
          path: ['script'],
        })
      }

      if (
        (data.scheduleType === 'application' ||
          data.scheduleType === 'compose') &&
        !data.command
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('dashboard.schedule.commandRequired'),
          path: ['command'],
        })
      }
    })

type FormSchema = z.infer<ReturnType<typeof formSchema>>
interface Props {
  id?: string
  scheduleId?: string
  scheduleType?: 'application' | 'compose' | 'server' | 'dokploy-server'
}

export const HandleSchedules = ({ id, scheduleId, scheduleType }: Props) => {
  const [isOpen, setIsOpen] = useState(false)
  const [cacheType, setCacheType] = useState<CacheType>('cache')
  const { t } = useTranslation('dashboard')

  const utils = api.useUtils()
  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema(t)),
    defaultValues: {
      name: '',
      cronExpression: '',
      shellType: 'bash',
      command: '',
      enabled: true,
      serviceName: '',
      scheduleType: scheduleType || 'application',
      script: '',
    },
  })

  const scheduleTypeForm = form.watch('scheduleType')

  const { data: schedule } = api.schedule.one.useQuery(
    { scheduleId: scheduleId || '' },
    { enabled: !!scheduleId }
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
      enabled: !!id && scheduleType === 'compose',
    }
  )

  useEffect(() => {
    if (scheduleId && schedule) {
      form.reset({
        name: schedule.name,
        cronExpression: schedule.cronExpression,
        shellType: schedule.shellType,
        command: schedule.command,
        enabled: schedule.enabled,
        serviceName: schedule.serviceName || '',
        scheduleType: schedule.scheduleType,
        script: schedule.script || '',
      })
    }
  }, [form, schedule, scheduleId])

  const { mutateAsync, isLoading } = scheduleId
    ? api.schedule.update.useMutation()
    : api.schedule.create.useMutation()

  const onSubmit = async (values: FormSchema) => {
    if (!id && !scheduleId) return

    await mutateAsync({
      ...values,
      scheduleId: scheduleId || '',
      ...(scheduleType === 'application' && {
        applicationId: id || '',
      }),
      ...(scheduleType === 'compose' && {
        composeId: id || '',
      }),
      ...(scheduleType === 'server' && {
        serverId: id || '',
      }),
      ...(scheduleType === 'dokploy-server' && {
        userId: id || '',
      }),
    })
      .then(() => {
        toast.success(
          t(
            `dashboard.schedule.${
              scheduleId
                ? 'scheduleUpdatedSuccessfully'
                : 'scheduleCreatedSuccessfully'
            }`
          )
        )
        utils.schedule.list.invalidate({
          id,
          scheduleType,
        })
        setIsOpen(false)
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : t('dashboard.schedule.errorCreatingSchedule')
        )
      })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {scheduleId ? (
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
            {t('dashboard.schedule.addSchedule')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className={cn(
          scheduleTypeForm === 'dokploy-server' || scheduleTypeForm === 'server'
            ? 'sm:max-w-2xl'
            : 'sm:max-w-lg'
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {t(
              `dashboard.schedule.${
                scheduleId ? 'editSchedule' : 'createSchedule'
              }`
            )}
          </DialogTitle>
          <DialogDescription>
            {scheduleId ? 'Manage' : 'Create'} a schedule to run a task at a
            specific time or interval.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {scheduleTypeForm === 'compose' && (
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
                        {t('dashboard.schedule.serviceName')}
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
                                  'dashboard.schedule.selectServiceName'
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
                              {t('dashboard.schedule.empty')}
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
                              <p>{t('dashboard.schedule.fetchTooltip')}</p>
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
                              <p>{t('dashboard.schedule.cacheTooltip')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    {t('dashboard.schedule.taskName')}
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Daily Database Backup" {...field} />
                  </FormControl>
                  <FormDescription>
                    {t('dashboard.schedule.taskNameDescription')}
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
                    {t('dashboard.schedule.schedule')}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('dashboard.schedule.cronExpressionFormat')}</p>
                          <p>{t('dashboard.schedule.cronExpressionExample')}</p>
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
                              'dashboard.schedule.selectPredefinedSchedule'
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
                            'dashboard.schedule.customCronExpression'
                          )}
                          {...field}
                        />
                      </FormControl>
                    </div>
                  </div>
                  <FormDescription>
                    {t('dashboard.schedule.customCronExpressionDescription')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(scheduleTypeForm === 'application' ||
              scheduleTypeForm === 'compose') && (
              <>
                <FormField
                  control={form.control}
                  name="shellType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        {t('dashboard.schedule.shellType')}
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t(
                                'dashboard.schedule.selectShellType'
                              )}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="bash">Bash</SelectItem>
                          <SelectItem value="sh">Sh</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {t('dashboard.schedule.shellTypeDescription')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="command"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        {t('dashboard.schedule.command')}
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="npm run backup" {...field} />
                      </FormControl>
                      <FormDescription>
                        {t('dashboard.schedule.commandDescription')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {(scheduleTypeForm === 'dokploy-server' ||
              scheduleTypeForm === 'server') && (
              <FormField
                control={form.control}
                name="script"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('dashboard.schedule.script')}</FormLabel>
                    <FormControl>
                      <FormControl>
                        <CodeEditor
                          language="shell"
                          placeholder={`# This is a comment
echo "Hello, world!"
`}
                          className="h-96 font-mono"
                          {...field}
                        />
                      </FormControl>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
                    {t('dashboard.schedule.enabled')}
                  </FormLabel>
                </FormItem>
              )}
            />

            <Button type="submit" isLoading={isLoading} className="w-full">
              {t(
                `dashboard.schedule.${
                  scheduleId ? 'updateSchedule' : 'createSchedule'
                }`
              )}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
