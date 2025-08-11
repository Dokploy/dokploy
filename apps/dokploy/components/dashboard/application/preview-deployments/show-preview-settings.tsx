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
import { Secrets } from '@/components/ui/secrets'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { api } from '@/utils/api'
import { zodResolver } from '@hookform/resolvers/zod'
import { Settings2 } from 'lucide-react'
import { useTranslation } from 'next-i18next'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

const schema = z
  .object({
    env: z.string(),
    buildArgs: z.string(),
    wildcardDomain: z.string(),
    port: z.number(),
    previewLimit: z.number(),
    previewHttps: z.boolean(),
    previewPath: z.string(),
    previewCertificateType: z.enum(['letsencrypt', 'none', 'custom']),
    previewCustomCertResolver: z.string().optional(),
    previewRequireCollaboratorPermissions: z.boolean(),
  })
  .superRefine((input, ctx) => {
    if (
      input.previewCertificateType === 'custom' &&
      !input.previewCustomCertResolver
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['previewCustomCertResolver'],
        message: 'Required',
      })
    }
  })

type Schema = z.infer<typeof schema>

interface Props {
  applicationId: string
}

export const ShowPreviewSettings = ({ applicationId }: Props) => {
  const { t } = useTranslation('dashboard')
  const [isOpen, setIsOpen] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const { mutateAsync: updateApplication, isLoading } =
    api.application.update.useMutation()

  const { data, refetch } = api.application.one.useQuery({ applicationId })

  const schema = z
    .object({
      env: z.string(),
      buildArgs: z.string(),
      wildcardDomain: z.string(),
      port: z.number(),
      previewLimit: z.number(),
      previewHttps: z.boolean(),
      previewPath: z.string(),
      previewCertificateType: z.enum(['letsencrypt', 'none', 'custom']),
      previewCustomCertResolver: z.string().optional(),
    })
    .superRefine((input, ctx) => {
      if (
        input.previewCertificateType === 'custom' &&
        !input.previewCustomCertResolver
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['previewCustomCertResolver'],
          message: t('dashboard.previewSettings.required'),
        })
      }
    })

  type Schema = z.infer<typeof schema>

  const form = useForm<Schema>({
    defaultValues: {
      env: '',
      wildcardDomain: '*.traefik.me',
      port: 3000,
      previewLimit: 3,
      previewHttps: false,
      previewPath: '/',
      previewCertificateType: 'none',
      previewRequireCollaboratorPermissions: true,
    },
    resolver: zodResolver(schema),
  })

  const previewHttps = form.watch('previewHttps')

  useEffect(() => {
    setIsEnabled(data?.isPreviewDeploymentsActive || false)
  }, [data?.isPreviewDeploymentsActive])

  useEffect(() => {
    if (data) {
      form.reset({
        env: data.previewEnv || '',
        buildArgs: data.previewBuildArgs || '',
        wildcardDomain: data.previewWildcard || '*.traefik.me',
        port: data.previewPort || 3000,
        previewLimit: data.previewLimit || 3,
        previewHttps: data.previewHttps || false,
        previewPath: data.previewPath || '/',
        previewCertificateType: data.previewCertificateType || 'none',
        previewCustomCertResolver: data.previewCustomCertResolver || '',
        previewRequireCollaboratorPermissions:
          data.previewRequireCollaboratorPermissions || true,
      })
    }
  }, [data])

  const onSubmit = async (formData: Schema) => {
    updateApplication({
      previewEnv: formData.env,
      previewBuildArgs: formData.buildArgs,
      previewWildcard: formData.wildcardDomain,
      previewPort: formData.port,
      applicationId,
      previewLimit: formData.previewLimit,
      previewHttps: formData.previewHttps,
      previewPath: formData.previewPath,
      previewCertificateType: formData.previewCertificateType,
      previewCustomCertResolver: formData.previewCustomCertResolver,
      previewRequireCollaboratorPermissions:
        formData.previewRequireCollaboratorPermissions,
    })
      .then(() => {
        toast.success(
          t('dashboard.previewSettings.previewDeploymentsSettingsUpdated')
        )
      })
      .catch((error) => {
        toast.error(error.message)
      })
  }
  return (
    <div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Settings2 className="size-4" />
            {t('dashboard.previewSettings.configure')}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-5xl w-full">
          <DialogHeader>
            <DialogTitle>
              {t('dashboard.previewSettings.previewDeploymentSettings')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'dashboard.previewSettings.adjustSettingsForPreviewDeployments'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                id="hook-form-delete-application"
                className="grid w-full gap-4"
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="wildcardDomain"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('dashboard.previewSettings.wildcardDomain')}
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="*.traefik.me" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="previewPath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('dashboard.previewSettings.previewPath')}
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="/" {...field} />
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
                        <FormLabel>
                          {t('dashboard.previewSettings.port')}
                        </FormLabel>
                        <FormControl>
                          <NumberInput placeholder="3000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="previewLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('dashboard.previewSettings.previewLimit')}
                        </FormLabel>
                        <FormControl>
                          <NumberInput placeholder="3000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="previewHttps"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>
                            {t('dashboard.previewSettings.https')}
                          </FormLabel>
                          <FormDescription>
                            {t(
                              'dashboard.previewSettings.automaticallyProvisionSslCertificate'
                            )}
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
                  {previewHttps && (
                    <FormField
                      control={form.control}
                      name="previewCertificateType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('dashboard.previewSettings.certificateProvider')}
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value || ''}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={t(
                                    'dashboard.previewSettings.selectCertificateProvider'
                                  )}
                                />
                              </SelectTrigger>
                            </FormControl>

                            <SelectContent>
                              <SelectItem value="none">
                                {t('dashboard.previewSettings.none')}
                              </SelectItem>
                              <SelectItem value={'letsencrypt'}>
                                {t('dashboard.previewSettings.letsEncrypt')}
                              </SelectItem>
                              <SelectItem value={'custom'}>
                                {t('dashboard.previewSettings.custom')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {form.watch('previewCertificateType') === 'custom' && (
                    <FormField
                      control={form.control}
                      name="previewCustomCertResolver"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('dashboard.previewSettings.certificateProvider')}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="my-custom-resolver"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="flex flex-row items-center justify-between rounded-lg border p-4 col-span-2">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        {t(
                          'dashboard.previewSettings.enablePreviewDeployments'
                        )}
                      </FormLabel>
                      <FormDescription>
                        {t(
                          'dashboard.previewSettings.enableOrDisablePreviewDeployments'
                        )}
                      </FormDescription>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) => {
                        updateApplication({
                          isPreviewDeploymentsActive: checked,
                          applicationId,
                        })
                          .then(() => {
                            refetch()
                            toast.success(
                              checked
                                ? t(
                                    'dashboard.previewSettings.previewDeploymentsEnabled'
                                  )
                                : t(
                                    'dashboard.previewSettings.previewDeploymentsDisabled'
                                  )
                            )
                          })
                          .catch((error) => {
                            toast.error(error.message)
                          })
                      }}
                    />
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="previewRequireCollaboratorPermissions"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm col-span-2">
                        <div className="space-y-0.5">
                          <FormLabel>
                            Require Collaborator Permissions
                          </FormLabel>
                          <FormDescription>
                            Require collaborator permissions to preview
                            deployments, valid roles are:
                            <ul>
                              <li>Admin</li>
                              <li>Maintain</li>
                              <li>Write</li>
                            </ul>
                          </FormDescription>
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
                </div>

                <FormField
                  control={form.control}
                  name="env"
                  render={() => (
                    <FormItem>
                      <FormControl>
                        <Secrets
                          name="env"
                          title={t(
                            'dashboard.previewSettings.environmentSettings'
                          )}
                          description={t(
                            'dashboard.previewSettings.addEnvironmentVariables'
                          )}
                          placeholder={[
                            'NODE_ENV=production',
                            'PORT=3000',
                          ].join('\n')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {data?.buildType === 'dockerfile' && (
                  <Secrets
                    name="buildArgs"
                    title={t('dashboard.previewSettings.buildTimeVariables')}
                    description={
                      <span>
                        {t(
                          'dashboard.previewSettings.availableOnlyAtBuildTime'
                        )}
                        &nbsp;
                        <a
                          className="text-primary"
                          href="https://docs.docker.com/build/guide/build-args/"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('dashboard.previewSettings.here')}
                        </a>
                        .
                      </span>
                    }
                    placeholder="NPM_TOKEN=xyz"
                  />
                )}
              </form>
            </Form>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setIsOpen(false)
              }}
            >
              {t('dashboard.previewSettings.cancel')}
            </Button>
            <Button
              isLoading={isLoading}
              form="hook-form-delete-application"
              type="submit"
            >
              {t('dashboard.previewSettings.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* */}
    </div>
  )
}
