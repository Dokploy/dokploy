import { SaveDockerProvider } from '@/components/dashboard/application/general/generic/save-docker-provider'
import { SaveGitProvider } from '@/components/dashboard/application/general/generic/save-git-provider'
import { SaveGiteaProvider } from '@/components/dashboard/application/general/generic/save-gitea-provider'
import { SaveGithubProvider } from '@/components/dashboard/application/general/generic/save-github-provider'
import {
  BitbucketIcon,
  DockerIcon,
  GitIcon,
  GiteaIcon,
  GithubIcon,
  GitlabIcon,
} from '@/components/icons/data-tools-icons'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/utils/api'
import { GitBranch, Loader2, UploadCloud } from 'lucide-react'
import { useTranslation } from 'next-i18next'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { SaveBitbucketProvider } from './save-bitbucket-provider'
import { SaveDragNDrop } from './save-drag-n-drop'
import { SaveGitlabProvider } from './save-gitlab-provider'
import { UnauthorizedGitProvider } from './unauthorized-git-provider'

type TabState =
  | 'github'
  | 'docker'
  | 'git'
  | 'drop'
  | 'gitlab'
  | 'bitbucket'
  | 'gitea'

interface Props {
  applicationId: string
}

export const ShowProviderForm = ({ applicationId }: Props) => {
  const { t } = useTranslation('dashboard')
  const { data: githubProviders, isLoading: isLoadingGithub } =
    api.github.githubProviders.useQuery()
  const { data: gitlabProviders, isLoading: isLoadingGitlab } =
    api.gitlab.gitlabProviders.useQuery()
  const { data: bitbucketProviders, isLoading: isLoadingBitbucket } =
    api.bitbucket.bitbucketProviders.useQuery()
  const { data: giteaProviders, isLoading: isLoadingGitea } =
    api.gitea.giteaProviders.useQuery()

  const { data: application, refetch } = api.application.one.useQuery({
    applicationId,
  })
  const { mutateAsync: disconnectGitProvider } =
    api.application.disconnectGitProvider.useMutation()

  const [tab, setSab] = useState<TabState>(application?.sourceType || 'github')

  const isLoading =
    isLoadingGithub || isLoadingGitlab || isLoadingBitbucket || isLoadingGitea

  const handleDisconnect = async () => {
    try {
      await disconnectGitProvider({ applicationId })
      toast.success(t('dashboard.provider.repositoryDisconnectedSuccessfully'))
      await refetch()
    } catch (error) {
      toast.error(
        `${t('dashboard.provider.failedToDisconnectRepository')}: ${
          error instanceof Error
            ? error.message
            : t('dashboard.provider.unknownError')
        }`
      )
    }
  }

  if (isLoading) {
    return (
      <Card className="group relative w-full bg-transparent">
        <CardHeader>
          <CardTitle className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <span className="flex flex-col space-y-0.5">
                {t('dashboard.provider.provider')}
              </span>
              <p className="flex items-center text-sm font-normal text-muted-foreground">
                {t('dashboard.provider.selectSourceOfCode')}
              </p>
            </div>
            <div className="hidden space-y-1 text-sm font-normal md:block">
              <GitBranch className="size-6 text-muted-foreground" />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[25vh] items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>{t('dashboard.provider.loadingProviders')}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Check if user doesn't have access to the current git provider
  if (
    application &&
    !application.hasGitProviderAccess &&
    application.sourceType !== 'docker' &&
    application.sourceType !== 'drop'
  ) {
    return (
      <Card className="group relative w-full bg-transparent">
        <CardHeader>
          <CardTitle className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <span className="flex flex-col space-y-0.5">
                {t('dashboard.provider.provider')}
              </span>
              <p className="flex items-center text-sm font-normal text-muted-foreground">
                {t('dashboard.provider.repositoryConnectionUnauthorized')}
              </p>
            </div>
            <div className="hidden space-y-1 text-sm font-normal md:block">
              <GitBranch className="size-6 text-muted-foreground" />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <UnauthorizedGitProvider
            service={application}
            onDisconnect={handleDisconnect}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="group relative w-full bg-transparent">
      <CardHeader>
        <CardTitle className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <span className="flex flex-col space-y-0.5">
              {t('dashboard.provider.provider')}
            </span>
            <p className="flex items-center text-sm font-normal text-muted-foreground">
              {t('dashboard.provider.selectSourceOfCode')}
            </p>
          </div>
          <div className="hidden space-y-1 text-sm font-normal md:block">
            <GitBranch className="size-6 text-muted-foreground" />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs
          value={tab}
          className="w-full"
          onValueChange={(e) => {
            setSab(e as TabState)
          }}
        >
          <div className="flex flex-row items-center justify-between w-full overflow-auto">
            <TabsList className="flex gap-4 justify-start bg-transparent">
              <TabsTrigger
                value="github"
                className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
              >
                <GithubIcon className="size-4 text-current fill-current" />
                {t('dashboard.provider.github')}
              </TabsTrigger>
              <TabsTrigger
                value="gitlab"
                className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
              >
                <GitlabIcon className="size-4 text-current fill-current" />
                {t('dashboard.provider.gitlab')}
              </TabsTrigger>
              <TabsTrigger
                value="bitbucket"
                className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
              >
                <BitbucketIcon className="size-4 text-current fill-current" />
                {t('dashboard.provider.bitbucket')}
              </TabsTrigger>
              <TabsTrigger
                value="gitea"
                className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
              >
                <GiteaIcon className="size-4 text-current fill-current" />
                {t('dashboard.provider.gitea')}
              </TabsTrigger>
              <TabsTrigger
                value="docker"
                className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
              >
                <DockerIcon className="size-5 text-current" />
                {t('dashboard.provider.docker')}
              </TabsTrigger>
              <TabsTrigger
                value="git"
                className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
              >
                <GitIcon />
                {t('dashboard.provider.git')}
              </TabsTrigger>
              <TabsTrigger
                value="drop"
                className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
              >
                <UploadCloud className="size-4 text-current" />
                {t('dashboard.provider.drop')}
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="github" className="mt-6">
            {githubProviders && githubProviders?.length > 0 ? (
              <SaveGithubProvider applicationId={applicationId} />
            ) : (
              <div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
                <GithubIcon className="size-8 text-muted-foreground" />
                <span className="text-base text-muted-foreground">
                  {t('dashboard.provider.githubConfigurationMessage')}{' '}
                  <Link
                    href="/dashboard/settings/git-providers"
                    className="text-foreground"
                  >
                    {t('dashboard.provider.settings')}
                  </Link>{' '}
                  {t('dashboard.provider.toConfigure')}
                </span>
              </div>
            )}
          </TabsContent>
          <TabsContent value="gitlab" className="mt-6">
            <SaveGitlabProvider applicationId={applicationId} />
            {gitlabProviders && gitlabProviders?.length > 0 ? (
              <SaveGitlabProvider applicationId={applicationId} />
            ) : (
              <div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
                <GitlabIcon className="size-8 text-muted-foreground" />
                <span className="text-base text-muted-foreground">
                  {t('dashboard.provider.gitlabConfigurationMessage')}{' '}
                  <Link
                    href="/dashboard/settings/git-providers"
                    className="text-foreground"
                  >
                    {t('dashboard.provider.settings')}
                  </Link>{' '}
                  {t('dashboard.provider.toConfigure')}
                </span>
              </div>
            )}
          </TabsContent>
          <TabsContent value="bitbucket" className="mt-6">
            <SaveBitbucketProvider applicationId={applicationId} />
            {bitbucketProviders && bitbucketProviders?.length > 0 ? (
              <SaveBitbucketProvider applicationId={applicationId} />
            ) : (
              <div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
                <BitbucketIcon className="size-8 text-muted-foreground" />
                <span className="text-base text-muted-foreground">
                  {t('dashboard.provider.bitbucketConfigurationMessage')}{' '}
                  <Link
                    href="/dashboard/settings/git-providers"
                    className="text-foreground"
                  >
                    {t('dashboard.provider.settings')}
                  </Link>{' '}
                  {t('dashboard.provider.toConfigure')}
                </span>
              </div>
            )}
          </TabsContent>
          <TabsContent value="gitea" className="mt-6">
            <SaveGiteaProvider applicationId={applicationId} />
            {giteaProviders && giteaProviders?.length > 0 ? (
              <SaveGiteaProvider applicationId={applicationId} />
            ) : (
              <div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
                <GiteaIcon className="size-8 text-muted-foreground" />
                <span className="text-base text-muted-foreground">
                  {t('dashboard.provider.giteaConfigurationMessage')}{' '}
                  <Link
                    href="/dashboard/settings/git-providers"
                    className="text-foreground"
                  >
                    {t('dashboard.provider.settings')}
                  </Link>{' '}
                  {t('dashboard.provider.toConfigure')}
                </span>
              </div>
            )}
          </TabsContent>
          <TabsContent value="docker" className="mt-6">
            <SaveDockerProvider applicationId={applicationId} />
          </TabsContent>
          <TabsContent value="git" className="mt-6">
            <SaveGitProvider applicationId={applicationId} />
          </TabsContent>
          <TabsContent value="drop" className="mt-6">
            <SaveDragNDrop applicationId={applicationId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
