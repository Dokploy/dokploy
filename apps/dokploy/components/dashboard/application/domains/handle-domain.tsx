import { zodResolver } from '@hookform/resolvers/zod'
import { DatabaseZap, Dices, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import z from 'zod'
import { AlertBlock } from '@/components/shared/alert-block'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input, NumberInput } from '@/components/ui/input'
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
import { api } from '@/utils/api'
import { type TFunction, useTranslation } from 'next-i18next'

export type CacheType = 'fetch' | 'cache'

const createDomainSchema = (t: TFunction) =>
  z
    .object({
      host: z.string().min(1, { message: t('dashboard.domain.hostRequired') }),
      path: z.string().min(1).optional(),
      internalPath: z.string().optional(),
      stripPath: z.boolean().optional(),
      port: z
        .number()
        .min(1, { message: t('dashboard.domain.portMinError') })
        .max(65535, { message: t('dashboard.domain.portMaxError') })
        .optional(),
      https: z.boolean().optional(),
      certificateType: z.enum(['letsencrypt', 'none', 'custom']).optional(),
      customCertResolver: z.string().optional(),
      serviceName: z.string().optional(),
      domainType: z.enum(['application', 'compose', 'preview']).optional(),
    })
    .superRefine((input, ctx) => {
      if (input.https && !input.certificateType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['certificateType'],
          message: t('dashboard.domain.certificateProviderRequired'),
        })
      }

      if (input.certificateType === 'custom' && !input.customCertResolver) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customCertResolver'],
          message: t('dashboard.domain.customCertificateResolverRequired'),
        })
      }

      if (input.domainType === 'compose' && !input.serviceName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['serviceName'],
          message: t('dashboard.domain.serviceNameRequired'),
        })
      }

      // Validate stripPath requires a valid path
      if (input.stripPath && (!input.path || input.path === '/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stripPath'],
          message: t('dashboard.domain.stripPathRequired'),
        })
      }

      // Validate internalPath starts with /
      if (
        input.internalPath &&
        input.internalPath !== '/' &&
        !input.internalPath.startsWith('/')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['internalPath'],
          message: t('dashboard.domain.internalPathRequired'),
        })
      }
    })

type Domain = z.infer<ReturnType<typeof createDomainSchema>>

interface Props {
  id: string
  type: 'application' | 'compose'
  domainId?: string
  children: React.ReactNode
}

export const AddDomain = ({ id, type, domainId = '', children }: Props) => {
  const { t } = useTranslation('dashboard')
  const [isOpen, setIsOpen] = useState(false)
  const [cacheType, setCacheType] = useState<CacheType>('cache')
  const [isManualInput, setIsManualInput] = useState(false)

  const utils = api.useUtils()
  const { data, refetch } = api.domain.one.useQuery(
    {
      domainId,
    },
    {
      enabled: !!domainId,
    }
  )

  const { data: application } =
    type === 'application'
      ? api.application.one.useQuery(
          {
            applicationId: id,
          },
          {
            enabled: !!id,
          }
        )
      : api.compose.one.useQuery(
          {
            composeId: id,
          },
          {
            enabled: !!id,
          }
        )

  const { mutateAsync, isError, error, isLoading } = domainId
    ? api.domain.update.useMutation()
    : api.domain.create.useMutation()

  const { mutateAsync: generateDomain, isLoading: isLoadingGenerate } =
    api.domain.generateDomain.useMutation()

  const { data: canGenerateTraefikMeDomains } =
    api.domain.canGenerateTraefikMeDomains.useQuery({
      serverId: application?.serverId || '',
    })

  const {
    data: services,
    isFetching: isLoadingServices,
    error: errorServices,
    refetch: refetchServices,
  } = api.compose.loadServices.useQuery(
    {
      composeId: id,
      type: cacheType,
    },
    {
      retry: false,
      refetchOnWindowFocus: false,
      enabled: type === 'compose' && !!id,
    }
  )

  const form = useForm<Domain>({
    resolver: zodResolver(createDomainSchema(t)),
    defaultValues: {
      host: '',
      path: undefined,
      internalPath: undefined,
      stripPath: false,
      port: undefined,
      https: false,
      certificateType: undefined,
      customCertResolver: undefined,
      serviceName: undefined,
      domainType: type,
    },
    mode: 'onChange',
  })

  const certificateType = form.watch('certificateType')
  const https = form.watch('https')
  const domainType = form.watch('domainType')

  useEffect(() => {
    if (data) {
      form.reset({
        ...data,
        /* Convert null to undefined */
        path: data?.path || undefined,
        internalPath: data?.internalPath || undefined,
        stripPath: data?.stripPath || false,
        port: data?.port || undefined,
        certificateType: data?.certificateType || undefined,
        customCertResolver: data?.customCertResolver || undefined,
        serviceName: data?.serviceName || undefined,
        domainType: data?.domainType || type,
      })
    }

    if (!domainId) {
      form.reset({
        host: '',
        path: undefined,
        internalPath: undefined,
        stripPath: false,
        port: undefined,
        https: false,
        certificateType: undefined,
        customCertResolver: undefined,
        domainType: type,
      })
    }
  }, [form, data, isLoading, domainId])

  // Separate effect for handling custom cert resolver validation
  useEffect(() => {
    if (certificateType === 'custom') {
      form.trigger('customCertResolver')
    }
  }, [certificateType, form])

  const dictionary = {
    success: domainId
      ? t('dashboard.domain.domainUpdated')
      : t('dashboard.domain.domainCreated'),
    error: domainId
      ? t('dashboard.domain.errorUpdatingDomain')
      : t('dashboard.domain.errorCreatingDomain'),
    submit: domainId
      ? t('dashboard.domain.update')
      : t('dashboard.domain.create'),
    dialogDescription: domainId
      ? t('dashboard.domain.editDomainDescription')
      : t('dashboard.domain.addDomainDescription'),
  }

  const onSubmit = async (data: Domain) => {
    await mutateAsync({
      domainId,
      ...(data.domainType === 'application' && {
        applicationId: id,
      }),
      ...(data.domainType === 'compose' && {
        composeId: id,
      }),
      ...data,
    })
      .then(async () => {
        toast.success(dictionary.success)

        if (data.domainType === 'application') {
          await utils.domain.byApplicationId.invalidate({
            applicationId: id,
          })
          await utils.application.readTraefikConfig.invalidate({
            applicationId: id,
          })
        } else if (data.domainType === 'compose') {
          await utils.domain.byComposeId.invalidate({
            composeId: id,
          })
        }

        if (domainId) {
          refetch()
        }
        setIsOpen(false)
      })
      .catch((e) => {
        console.log(e)
        toast.error(dictionary.error)
      })
  }
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger className="" asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('dashboard.domain.domains')}</DialogTitle>
          <DialogDescription>{dictionary.dialogDescription}</DialogDescription>
        </DialogHeader>
        {isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

        <Form {...form}>
          <form
            id="hook-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid w-full gap-8 "
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex flex-row items-end w-full gap-4">
                  {domainType === 'compose' && (
                    <div className="flex flex-col gap-2 w-full">
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
                              {t('dashboard.domain.serviceName')}
                            </FormLabel>
                            <div className="flex gap-2">
                              {isManualInput ? (
                                <FormControl>
                                  <Input
                                    placeholder={t(
                                      'dashboard.domain.serviceNamePlaceholder'
                                    )}
                                    {...field}
                                    className="w-full"
                                  />
                                </FormControl>
                              ) : (
                                <Select
                                  onValueChange={field.onChange}
                                  defaultValue={field.value || ''}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select a service name" />
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
                                      Empty
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                              {!isManualInput && (
                                <>
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
                                          Fetch: Will clone the repository and
                                          load the services
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
                                          Cache: If you previously deployed this
                                          compose, it will read the services
                                          from the last deployment/fetch from
                                          the repository
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </>
                              )}
                              <TooltipProvider delayDuration={0}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="secondary"
                                      type="button"
                                      onClick={() => {
                                        setIsManualInput(!isManualInput)
                                        if (!isManualInput) {
                                          field.onChange('')
                                        }
                                      }}
                                    >
                                      {isManualInput ? (
                                        <RefreshCw className="size-4 text-muted-foreground" />
                                      ) : (
                                        <span className="text-xs text-muted-foreground">
                                          Manual
                                        </span>
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="left"
                                    sideOffset={5}
                                    className="max-w-[10rem]"
                                  >
                                    <p>
                                      {isManualInput
                                        ? 'Switch to service selection'
                                        : 'Enter service name manually'}
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
                  )}
                </div>
                <FormField
                  control={form.control}
                  name="host"
                  render={({ field }) => (
                    <FormItem>
                      {!canGenerateTraefikMeDomains &&
                        field.value.includes('traefik.me') && (
                          <AlertBlock type="warning">
                            {t('dashboard.domain.traefikMeWarning')}
                            <Link
                              href="/dashboard/settings/server"
                              className="text-primary"
                            >
                              {application?.serverId
                                ? t('dashboard.domain.traefikMeWarningLink1')
                                : t('dashboard.domain.traefikMeWarningLink2')}
                            </Link>{' '}
                            {t('dashboard.domain.traefikMeWarningLink3')}
                          </AlertBlock>
                        )}
                      <FormLabel>{t('dashboard.domain.host')}</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            placeholder={t('dashboard.domain.hostPlaceholder')}
                            {...field}
                          />
                        </FormControl>
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="secondary"
                                type="button"
                                isLoading={isLoadingGenerate}
                                onClick={() => {
                                  generateDomain({
                                    appName: application?.appName || '',
                                    serverId: application?.serverId || '',
                                  })
                                    .then((domain) => {
                                      field.onChange(domain)
                                    })
                                    .catch((err) => {
                                      toast.error(err.message)
                                    })
                                }}
                              >
                                <Dices className="size-4 text-muted-foreground" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="left"
                              sideOffset={5}
                              className="max-w-[10rem]"
                            >
                              <p>{t('dashboard.domain.generateTraefikMe')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="path"
                  render={({ field }) => {
                    return (
                      <FormItem>
                        <FormLabel>{t('dashboard.domain.path')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('dashboard.domain.pathPlaceholder')}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )
                  }}
                />

                <FormField
                  control={form.control}
                  name="internalPath"
                  render={({ field }) => {
                    return (
                      <FormItem>
                        <FormLabel>
                          {t('dashboard.domain.internalPath')}
                        </FormLabel>
                        <FormDescription>
                          {t('dashboard.domain.internalPathDescription')}
                        </FormDescription>
                        <FormControl>
                          <Input
                            placeholder={t(
                              'dashboard.domain.internalPathPlaceholder'
                            )}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )
                  }}
                />

                <FormField
                  control={form.control}
                  name="stripPath"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>{t('dashboard.domain.stripPath')}</FormLabel>
                        <FormDescription>
                          {t('dashboard.domain.stripPathDescription')}
                        </FormDescription>
                        <FormMessage />
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="port"
                  render={({ field }) => {
                    return (
                      <FormItem>
                        <FormLabel>
                          {t('dashboard.domain.containerPort')}
                        </FormLabel>
                        <FormDescription>
                          {t('dashboard.domain.portDescription')}
                        </FormDescription>
                        <FormControl>
                          <NumberInput
                            placeholder={t(
                              'dashboard.domain.containerPortPlaceholder'
                            )}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )
                  }}
                />

                <FormField
                  control={form.control}
                  name="https"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>{t('dashboard.domain.https')}</FormLabel>
                        <FormDescription>
                          {t('dashboard.domain.httpsDescription')}
                        </FormDescription>
                        <FormMessage />
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {https && (
                  <>
                    <FormField
                      control={form.control}
                      name="certificateType"
                      render={({ field }) => {
                        return (
                          <FormItem>
                            <FormLabel>
                              {t('dashboard.domain.certificateProvider')}
                            </FormLabel>
                            <Select
                              onValueChange={(value) => {
                                field.onChange(value)
                                if (value !== 'custom') {
                                  form.setValue('customCertResolver', undefined)
                                }
                              }}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={t(
                                      'dashboard.domain.certificateProviderPlaceholder'
                                    )}
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value={'none'}>
                                  {t('dashboard.domain.none')}
                                </SelectItem>
                                <SelectItem value={'letsencrypt'}>
                                  {t('dashboard.domain.letsEncrypt')}
                                </SelectItem>
                                <SelectItem value={'custom'}>
                                  {t('dashboard.domain.custom')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )
                      }}
                    />

                    {certificateType === 'custom' && (
                      <FormField
                        control={form.control}
                        name="customCertResolver"
                        render={({ field }) => {
                          return (
                            <FormItem>
                              <FormLabel>
                                {t(
                                  'dashboard.domain.customCertificateResolver'
                                )}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  className="w-full"
                                  placeholder={t(
                                    'dashboard.domain.customCertificateResolverPlaceholder'
                                  )}
                                  {...field}
                                  value={field.value || ''}
                                  onChange={(e) => {
                                    field.onChange(e)
                                    form.trigger('customCertResolver')
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </form>

          <DialogFooter>
            <Button isLoading={isLoading} form="hook-form" type="submit">
              {dictionary.submit}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
