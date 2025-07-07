import { zodResolver } from '@hookform/resolvers/zod'
import { Server } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { AlertBlock } from '@/components/shared/alert-block'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/utils/api'
import { AddSwarmSettings } from './modify-swarm-settings'
import { useTranslation } from 'next-i18next'

interface Props {
  id: string
  type: 'postgres' | 'mariadb' | 'mongo' | 'mysql' | 'redis' | 'application'
}

const AddRedirectchema = z.object({
  replicas: z.number().min(1, 'Replicas must be at least 1'),
  registryId: z.string().optional(),
})

type AddCommand = z.infer<typeof AddRedirectchema>

export const ShowClusterSettings = ({ id, type }: Props) => {
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
  }
  const { data, refetch } = queryMap[type]
    ? queryMap[type]()
    : api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id })
  const { data: registries } = api.registry.all.useQuery()

  const mutationMap = {
    postgres: () => api.postgres.update.useMutation(),
    redis: () => api.redis.update.useMutation(),
    mysql: () => api.mysql.update.useMutation(),
    mariadb: () => api.mariadb.update.useMutation(),
    application: () => api.application.update.useMutation(),
    mongo: () => api.mongo.update.useMutation(),
  }

  const { mutateAsync, isLoading } = mutationMap[type]
    ? mutationMap[type]()
    : api.mongo.update.useMutation()

  const form = useForm<AddCommand>({
    defaultValues: {
      ...(type === 'application' && data && 'registryId' in data
        ? {
            registryId: data?.registryId || '',
          }
        : {}),
      replicas: data?.replicas || 1,
    },
    resolver: zodResolver(AddRedirectchema),
  })

  useEffect(() => {
    if (data?.command) {
      form.reset({
        ...(type === 'application' && data && 'registryId' in data
          ? {
              registryId: data?.registryId || '',
            }
          : {}),
        replicas: data?.replicas || 1,
      })
    }
  }, [form, form.reset, form.formState.isSubmitSuccessful, data?.command])

  const onSubmit = async (data: AddCommand) => {
    await mutateAsync({
      applicationId: id || '',
      postgresId: id || '',
      redisId: id || '',
      mysqlId: id || '',
      mariadbId: id || '',
      mongoId: id || '',
      ...(type === 'application'
        ? {
            registryId:
              data?.registryId === 'none' || !data?.registryId
                ? null
                : data?.registryId,
          }
        : {}),
      replicas: data?.replicas,
    })
      .then(async () => {
        toast.success(t('dashboard.cluster.commandUpdated'))
        await refetch()
      })
      .catch(() => {
        toast.error(t('dashboard.cluster.errorUpdatingCommand'))
      })
  }

  return (
    <Card className="bg-background">
      <CardHeader className="flex flex-row justify-between">
        <div>
          <CardTitle className="text-xl">
            {t('dashboard.cluster.clusterSettings')}
          </CardTitle>
          <CardDescription>
            {t('dashboard.cluster.description')}
          </CardDescription>
        </div>
        <AddSwarmSettings id={id} type={type} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AlertBlock type="info">
          {t('dashboard.cluster.redeployReminder')}
        </AlertBlock>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid w-full gap-4"
          >
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="replicas"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('dashboard.cluster.replicas')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('dashboard.cluster.replicasPlaceholder')}
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value
                          field.onChange(value === '' ? 0 : Number(value))
                        }}
                        type="number"
                        value={field.value || ''}
                      />
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {type === 'application' && (
              <>
                {registries && registries?.length === 0 ? (
                  <div className="pt-10">
                    <div className="flex flex-col items-center gap-3">
                      <Server className="size-8 text-muted-foreground" />
                      {t('dashboard.cluster.noRegistriesWarning')}{' '}
                      <Link
                        href="/dashboard/settings/cluster"
                        className="text-foreground"
                      >
                        {t('dashboard.cluster.settings')}
                      </Link>{' '}
                      {t('dashboard.cluster.toConfigure')}
                    </div>
                  </div>
                ) : (
                  <>
                    <FormField
                      control={form.control}
                      name="registryId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('dashboard.cluster.selectRegistry')}
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={t(
                                  'dashboard.cluster.selectRegistryPlaceholder'
                                )}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {registries?.map((registry) => (
                                  <SelectItem
                                    key={registry.registryId}
                                    value={registry.registryId}
                                  >
                                    {registry.registryName}
                                  </SelectItem>
                                ))}
                                <SelectItem value={'none'}>
                                  {t('dashboard.cluster.none')}
                                </SelectItem>
                                <SelectLabel>
                                  {t('dashboard.cluster.registries', {
                                    count: registries?.length || 0,
                                  })}
                                </SelectLabel>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </>
            )}

            <div className="flex justify-end">
              <Button isLoading={isLoading} type="submit" className="w-fit">
                {t('dashboard.cluster.save')}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
