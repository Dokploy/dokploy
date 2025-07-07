import { zodResolver } from '@hookform/resolvers/zod'
import { PlusIcon } from 'lucide-react'
import Link from 'next/link'
import { TFunction, useTranslation } from 'next-i18next'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
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
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
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
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/utils/api'

const Schema = (t: TFunction) =>
  z.object({
    name: z.string().min(1, {
      message: t('settings.handleServers.nameRequired'),
    }),
    description: z.string().optional(),
    ipAddress: z.string().min(1, {
      message: t('settings.handleServers.ipAddressRequired'),
    }),
    port: z.number().optional(),
    username: z.string().optional(),
    sshKeyId: z.string().min(1, {
      message: t('settings.handleServers.sshKeyRequired'),
    }),
  })

type Schema = ReturnType<typeof Schema>['_type']

interface Props {
  serverId?: string
}

export const HandleServers = ({ serverId }: Props) => {
  const { t } = useTranslation('settings')

  const utils = api.useUtils()
  const [isOpen, setIsOpen] = useState(false)
  const { data: canCreateMoreServers, refetch } =
    api.stripe.canCreateMoreServers.useQuery()

  const { data, refetch: refetchServer } = api.server.one.useQuery(
    {
      serverId: serverId || '',
    },
    {
      enabled: !!serverId,
    }
  )

  const { data: sshKeys } = api.sshKey.all.useQuery()
  const { mutateAsync, error, isLoading, isError } = serverId
    ? api.server.update.useMutation()
    : api.server.create.useMutation()
  const form = useForm<Schema>({
    defaultValues: {
      description: '',
      name: '',
      ipAddress: '',
      port: 22,
      username: 'root',
      sshKeyId: '',
    },
    resolver: zodResolver(Schema(t)),
  })

  useEffect(() => {
    form.reset({
      description: data?.description || '',
      name: data?.name || '',
      ipAddress: data?.ipAddress || '',
      port: data?.port || 22,
      username: data?.username || 'root',
      sshKeyId: data?.sshKeyId || '',
    })
  }, [form, form.reset, form.formState.isSubmitSuccessful, data])

  useEffect(() => {
    refetch()
  }, [isOpen])

  const onSubmit = async (data: Schema) => {
    await mutateAsync({
      name: data.name,
      description: data.description || '',
      ipAddress: data.ipAddress || '',
      port: data.port || 22,
      username: data.username || 'root',
      sshKeyId: data.sshKeyId || '',
      serverId: serverId || '',
    })
      .then(async (_data) => {
        await utils.server.all.invalidate()
        refetchServer()
        toast.success(
          serverId
            ? t('settings.handleServers.serverUpdated')
            : t('settings.handleServers.serverCreated')
        )
        setIsOpen(false)
      })
      .catch(() => {
        toast.error(
          serverId
            ? t('settings.handleServers.errorUpdatingServer')
            : t('settings.handleServers.errorCreatingServer')
        )
      })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {serverId ? (
          <DropdownMenuItem
            className="w-full cursor-pointer "
            onSelect={(e) => e.preventDefault()}
          >
            {t('settings.handleServers.editServer')}
          </DropdownMenuItem>
        ) : (
          <Button className="cursor-pointer space-x-3">
            <PlusIcon className="h-4 w-4" />
            {t('settings.handleServers.createServer')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl ">
        <DialogHeader>
          <DialogTitle>
            {serverId
              ? t('settings.handleServers.edit')
              : t('settings.handleServers.create')}{' '}
            Server
          </DialogTitle>
          <DialogDescription>
            {serverId
              ? t('settings.handleServers.editServerDescription')
              : t('settings.handleServers.createServerDescription')}
          </DialogDescription>
        </DialogHeader>
        <div>
          <p className="text-primary text-sm font-medium">
            {t('settings.handleServers.vpsRequired')}
          </p>
          <ul className="list-inside list-disc pl-4 text-sm text-muted-foreground mt-4">
            <li>
              <a
                href="https://www.hostinger.com/vps-hosting?REFERRALCODE=1SIUMAURICI97"
                className="text-link underline"
              >
                {t('settings.handleServers.hostinger')}
              </a>
            </li>
            <li>
              <a
                href=" https://app.americancloud.com/register?ref=dokploy"
                className="text-link underline"
              >
                {t('settings.handleServers.americanCloud')}
              </a>
            </li>
            <li>
              <a
                href="https://m.do.co/c/db24efd43f35"
                className="text-link underline"
              >
                {t('settings.handleServers.digitalOcean')}
              </a>
            </li>
            <li>
              <a
                href="https://hetzner.cloud/?ref=vou4fhxJ1W2D"
                className="text-link underline"
              >
                {t('settings.handleServers.hetzner')}
              </a>
            </li>
            <li>
              <a
                href="https://www.vultr.com/?ref=9679828"
                className="text-link underline"
              >
                {t('settings.handleServers.vultr')}
              </a>
            </li>
            <li>
              <a
                href="https://www.linode.com/es/pricing/#compute-shared"
                className="text-link underline"
              >
                {t('settings.handleServers.linode')}
              </a>
            </li>
          </ul>
          <AlertBlock className="mt-4 px-4">
            {t('settings.handleServers.providerRecommendation')}
          </AlertBlock>
        </div>
        {!canCreateMoreServers && (
          <AlertBlock type="warning" className="mt-4">
            {t('settings.handleServers.cannotCreateMoreServers')}{' '}
            <Link href="/dashboard/settings/billing" className="text-primary">
              {t('settings.handleServers.pleaseUpgradePlan')}
            </Link>
          </AlertBlock>
        )}
        {isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
        <Form {...form}>
          <form
            id="hook-form-add-server"
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid w-full gap-4"
          >
            <div className="flex flex-col gap-4 ">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.handleServers.name')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t(
                          'settings.handleServers.namePlaceholder'
                        )}
                        {...field}
                      />
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('settings.handleServers.description')}
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t(
                        'settings.handleServers.descriptionPlaceholder'
                      )}
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sshKeyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('settings.handleServers.selectSshKey')}
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t(
                          'settings.handleServers.selectSshKeyPlaceholder'
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {sshKeys?.map((sshKey) => (
                          <SelectItem
                            key={sshKey.sshKeyId}
                            value={sshKey.sshKeyId}
                          >
                            {sshKey.name}
                          </SelectItem>
                        ))}
                        <SelectLabel>
                          {t('settings.handleServers.registries', {
                            count: sshKeys?.length,
                          })}
                        </SelectLabel>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="ipAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.terminal.ipAddress')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t(
                          'settings.handleServers.ipAddressPlaceholder'
                        )}
                        {...field}
                      />
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.terminal.port')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t(
                          'settings.handleServers.portPlaceholder'
                        )}
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value
                          if (value === '') {
                            field.onChange(0)
                          } else {
                            const number = Number.parseInt(value, 10)
                            if (!Number.isNaN(number)) {
                              field.onChange(number)
                            }
                          }
                        }}
                      />
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.terminal.username')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(
                        'settings.handleServers.usernamePlaceholder'
                      )}
                      {...field}
                    />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />
          </form>

          <DialogFooter>
            <Button
              isLoading={isLoading}
              disabled={!canCreateMoreServers && !serverId}
              form="hook-form-add-server"
              type="submit"
            >
              {serverId
                ? t('settings.handleServers.update')
                : t('settings.handleServers.create')}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
