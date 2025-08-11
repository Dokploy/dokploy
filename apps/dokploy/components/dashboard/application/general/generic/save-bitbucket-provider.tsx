import { BitbucketIcon } from '@/components/icons/data-tools-icons'
import { AlertBlock } from '@/components/shared/alert-block'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { CheckIcon, ChevronsUpDown, X } from 'lucide-react'
import { useTranslation } from 'next-i18next'
import Link from 'next/link'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

interface Props {
  applicationId: string
}

export const SaveBitbucketProvider = ({ applicationId }: Props) => {
  const { t } = useTranslation('dashboard')
  const { data: bitbucketProviders } =
    api.bitbucket.bitbucketProviders.useQuery()
  const { data, refetch } = api.application.one.useQuery({ applicationId })

  const { mutateAsync, isLoading: isSavingBitbucketProvider } =
    api.application.saveBitbucketProvider.useMutation()

  const BitbucketProviderSchema = z.object({
    buildPath: z
      .string()
      .min(1, t('dashboard.bitbucketProvider.pathRequired'))
      .default('/'),
    repository: z
      .object({
        repo: z.string().min(1, t('dashboard.bitbucketProvider.repoRequired')),
        owner: z
          .string()
          .min(1, t('dashboard.bitbucketProvider.ownerRequired')),
      })
      .required(),
    branch: z.string().min(1, t('dashboard.bitbucketProvider.branchRequired')),
    bitbucketId: z
      .string()
      .min(1, t('dashboard.bitbucketProvider.bitbucketProviderRequired')),
    watchPaths: z.array(z.string()).optional(),
    enableSubmodules: z.boolean().optional(),
  })

  type BitbucketProvider = z.infer<typeof BitbucketProviderSchema>

  const form = useForm<BitbucketProvider>({
    defaultValues: {
      buildPath: '/',
      repository: {
        owner: '',
        repo: '',
      },
      bitbucketId: '',
      branch: '',
      watchPaths: [],
      enableSubmodules: false,
    },
    resolver: zodResolver(BitbucketProviderSchema),
  })

  const repository = form.watch('repository')
  const bitbucketId = form.watch('bitbucketId')

  const {
    data: repositories,
    isLoading: isLoadingRepositories,
    error,
  } = api.bitbucket.getBitbucketRepositories.useQuery(
    {
      bitbucketId,
    },
    {
      enabled: !!bitbucketId,
    }
  )

  const {
    data: branches,
    fetchStatus,
    status,
  } = api.bitbucket.getBitbucketBranches.useQuery(
    {
      owner: repository?.owner,
      repo: repository?.repo,
      bitbucketId,
    },
    {
      enabled: !!repository?.owner && !!repository?.repo && !!bitbucketId,
    }
  )

  useEffect(() => {
    if (data) {
      form.reset({
        branch: data.bitbucketBranch || '',
        repository: {
          repo: data.bitbucketRepository || '',
          owner: data.bitbucketOwner || '',
        },
        buildPath: data.bitbucketBuildPath || '/',
        bitbucketId: data.bitbucketId || '',
        watchPaths: data.watchPaths || [],
        enableSubmodules: data.enableSubmodules || false,
      })
    }
  }, [form.reset, data?.applicationId, form])

  const onSubmit = async (data: BitbucketProvider) => {
    await mutateAsync({
      bitbucketBranch: data.branch,
      bitbucketRepository: data.repository.repo,
      bitbucketOwner: data.repository.owner,
      bitbucketBuildPath: data.buildPath,
      bitbucketId: data.bitbucketId,
      applicationId,
      watchPaths: data.watchPaths || [],
      enableSubmodules: data.enableSubmodules || false,
    })
      .then(async () => {
        toast.success(t('dashboard.bitbucketProvider.serviceProviderSaved'))
        await refetch()
      })
      .catch(() => {
        toast.error(
          t('dashboard.bitbucketProvider.errorSavingBitbucketProvider')
        )
      })
  }

  return (
    <div>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid w-full gap-4 py-3"
        >
          {error && (
            <AlertBlock type="error">
              {t('dashboard.bitbucketProvider.repositories')}: {error.message}
            </AlertBlock>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="bitbucketId"
              render={({ field }) => (
                <FormItem className="md:col-span-2 flex flex-col">
                  <FormLabel>
                    {t('dashboard.bitbucketProvider.bitbucketAccount')}
                  </FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value)
                      form.setValue('repository', {
                        owner: '',
                        repo: '',
                      })
                      form.setValue('branch', '')
                    }}
                    defaultValue={field.value}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t(
                            'dashboard.bitbucketProvider.selectBitbucketAccount'
                          )}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {bitbucketProviders?.map((bitbucketProvider) => (
                        <SelectItem
                          key={bitbucketProvider.bitbucketId}
                          value={bitbucketProvider.bitbucketId}
                        >
                          {bitbucketProvider.gitProvider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="repository"
              render={({ field }) => (
                <FormItem className="md:col-span-2 flex flex-col">
                  <div className="flex items-center justify-between">
                    <FormLabel>
                      {t('dashboard.bitbucketProvider.repository')}
                    </FormLabel>
                    {field.value.owner && field.value.repo && (
                      <Link
                        href={`https://bitbucket.org/${field.value.owner}/${field.value.repo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
                      >
                        <BitbucketIcon className="h-4 w-4" />
                        <span>
                          {t('dashboard.bitbucketProvider.viewRepository')}
                        </span>
                      </Link>
                    )}
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-between !bg-input',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {isLoadingRepositories
                            ? t(
                                'dashboard.bitbucketProvider.loadingRepositories'
                              )
                            : field.value.owner
                            ? repositories?.find(
                                (repo) => repo.name === field.value.repo
                              )?.name
                            : t('dashboard.bitbucketProvider.selectRepository')}

                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder={t(
                            'dashboard.bitbucketProvider.searchRepository'
                          )}
                          className="h-9"
                        />
                        {isLoadingRepositories && (
                          <span className="py-6 text-center text-sm">
                            {t(
                              'dashboard.bitbucketProvider.loadingRepositories'
                            )}
                          </span>
                        )}
                        <CommandEmpty>
                          {t('dashboard.bitbucketProvider.noRepositoriesFound')}
                        </CommandEmpty>
                        <ScrollArea className="h-96">
                          <CommandGroup>
                            {repositories?.map((repo) => (
                              <CommandItem
                                value={repo.name}
                                key={repo.url}
                                onSelect={() => {
                                  form.setValue('repository', {
                                    owner: repo.owner.username as string,
                                    repo: repo.name,
                                  })
                                  form.setValue('branch', '')
                                }}
                              >
                                <span className="flex items-center gap-2">
                                  <span>{repo.name}</span>
                                  <span className="text-muted-foreground text-xs">
                                    {repo.owner.username}
                                  </span>
                                </span>
                                <CheckIcon
                                  className={cn(
                                    'ml-auto h-4 w-4',
                                    repo.name === field.value.repo
                                      ? 'opacity-100'
                                      : 'opacity-0'
                                  )}
                                />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </ScrollArea>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {form.formState.errors.repository && (
                    <p className={cn('text-sm font-medium text-destructive')}>
                      {t('dashboard.bitbucketProvider.repositoryRequired')}
                    </p>
                  )}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="branch"
              render={({ field }) => (
                <FormItem className="block w-full">
                  <FormLabel>
                    {t('dashboard.bitbucketProvider.branch')}
                  </FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            ' w-full justify-between !bg-input',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {status === 'loading' && fetchStatus === 'fetching'
                            ? t('dashboard.bitbucketProvider.loading')
                            : field.value
                            ? branches?.find(
                                (branch) => branch.name === field.value
                              )?.name
                            : t('dashboard.bitbucketProvider.selectBranch')}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder={t(
                            'dashboard.bitbucketProvider.searchBranch'
                          )}
                          className="h-9"
                        />
                        {status === 'loading' && fetchStatus === 'fetching' && (
                          <span className="py-6 text-center text-sm text-muted-foreground">
                            {t('dashboard.bitbucketProvider.loadingBranches')}
                          </span>
                        )}
                        {!repository?.owner && (
                          <span className="py-6 text-center text-sm text-muted-foreground">
                            {t('dashboard.bitbucketProvider.selectRepository')}
                          </span>
                        )}
                        <ScrollArea className="h-96">
                          <CommandEmpty>
                            {t('dashboard.bitbucketProvider.noBranchFound')}
                          </CommandEmpty>

                          <CommandGroup>
                            {branches?.map((branch) => (
                              <CommandItem
                                value={branch.name}
                                key={branch.commit.sha}
                                onSelect={() => {
                                  form.setValue('branch', branch.name)
                                }}
                              >
                                {branch.name}
                                <CheckIcon
                                  className={cn(
                                    'ml-auto h-4 w-4',
                                    branch.name === field.value
                                      ? 'opacity-100'
                                      : 'opacity-0'
                                  )}
                                />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </ScrollArea>
                      </Command>
                    </PopoverContent>

                    <FormMessage />
                  </Popover>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="buildPath"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('dashboard.bitbucketProvider.buildPath')}
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
              name="watchPaths"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <div className="flex items-center gap-2">
                    <FormLabel>
                      {t('dashboard.bitbucketProvider.watchPaths')}
                    </FormLabel>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <div className="size-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                            ?
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {t('dashboard.bitbucketProvider.watchPathsTooltip')}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {field.value?.map((path, index) => (
                      <Badge key={index} variant="secondary">
                        {path}
                        <X
                          className="ml-1 size-3 cursor-pointer"
                          onClick={() => {
                            const newPaths = [...(field.value || [])]
                            newPaths.splice(index, 1)
                            form.setValue('watchPaths', newPaths)
                          }}
                        />
                      </Badge>
                    ))}
                  </div>
                  <FormControl>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t(
                          'dashboard.gitProvider.watchPathsPlaceholder'
                        )}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const input = e.currentTarget
                            const value = input.value.trim()
                            if (value) {
                              const newPaths = [...(field.value || []), value]
                              form.setValue('watchPaths', newPaths)
                              input.value = ''
                            }
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          const input = document.querySelector(
                            `input[placeholder*="${t(
                              'dashboard.gitProvider.watchPathsPlaceholder'
                            )}"]`
                          ) as HTMLInputElement
                          const value = input.value.trim()
                          if (value) {
                            const newPaths = [...(field.value || []), value]
                            form.setValue('watchPaths', newPaths)
                            input.value = ''
                          }
                        }}
                      >
                        {t('dashboard.bitbucketProvider.add')}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="enableSubmodules"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">
                    {t('dashboard.bitbucketProvider.enableSubmodules')}
                  </FormLabel>
                </FormItem>
              )}
            />
          </div>
          <div className="flex w-full justify-end">
            <Button
              isLoading={isSavingBitbucketProvider}
              type="submit"
              className="w-fit"
            >
              {t('dashboard.bitbucketProvider.save')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
