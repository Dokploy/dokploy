import { validateRequest } from '@dokploy/server/lib/auth'
import { createServerSideHelpers } from '@trpc/react-query/server'
import copy from 'copy-to-clipboard'
import { CircuitBoard, HelpCircle, ServerOff } from 'lucide-react'
import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { type ReactElement, useEffect, useState } from 'react'
import { toast } from 'sonner'
import superjson from 'superjson'
import { ShowImport } from '@/components/dashboard/application/advanced/import/show-import'
import { ShowVolumes } from '@/components/dashboard/application/advanced/volumes/show-volumes'
import { ShowDeployments } from '@/components/dashboard/application/deployments/show-deployments'
import { ShowDomains } from '@/components/dashboard/application/domains/show-domains'
import { ShowEnvironment } from '@/components/dashboard/application/environment/show-enviroment'
import { ShowSchedules } from '@/components/dashboard/application/schedules/show-schedules'
import { ShowVolumeBackups } from '@/components/dashboard/application/volume-backups/show-volume-backups'
import { AddCommandCompose } from '@/components/dashboard/compose/advanced/add-command'
import { IsolatedDeploymentTab } from '@/components/dashboard/compose/advanced/add-isolation'
import { DeleteService } from '@/components/dashboard/compose/delete-service'
import { ShowGeneralCompose } from '@/components/dashboard/compose/general/show'
import { ShowDockerLogsCompose } from '@/components/dashboard/compose/logs/show'
import { ShowDockerLogsStack } from '@/components/dashboard/compose/logs/show-stack'
import { UpdateCompose } from '@/components/dashboard/compose/update-compose'
import { ShowBackups } from '@/components/dashboard/database/backups/show-backups'
import { ComposeFreeMonitoring } from '@/components/dashboard/monitoring/free/container/show-free-compose-monitoring'
import { ComposePaidMonitoring } from '@/components/dashboard/monitoring/paid/container/show-paid-compose-monitoring'
import { DashboardLayout } from '@/components/layouts/dashboard-layout'
import { BreadcrumbSidebar } from '@/components/shared/breadcrumb-sidebar'
import { StatusTooltip } from '@/components/shared/status-tooltip'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { appRouter } from '@/server/api/root'
import { api } from '@/utils/api'
import { useTranslation } from 'next-i18next'
import { cn } from '@/lib/utils'
import { getLocale, serverSideTranslations } from '@/utils/i18n'

type TabState =
  | 'projects'
  | 'settings'
  | 'advanced'
  | 'deployments'
  | 'domains'
  | 'monitoring'
  | 'volumeBackups'

const Service = (
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) => {
  const { t } = useTranslation('dashboard')
  const [_toggleMonitoring, _setToggleMonitoring] = useState(false)
  const { composeId, activeTab } = props
  const router = useRouter()
  const { projectId } = router.query
  const [tab, setTab] = useState<TabState>(activeTab)

  useEffect(() => {
    if (router.query.tab) {
      setTab(router.query.tab as TabState)
    }
  }, [router.query.tab])

  const { data } = api.compose.one.useQuery({ composeId })

  console.log('IM HEEEERE')
  console.log(data)

  const { data: auth } = api.user.get.useQuery()
  const { data: isCloud } = api.settings.isCloud.useQuery()

  return (
    <div className="pb-10">
      <BreadcrumbSidebar
        list={[
          {
            name: t('dashboard.project.projects'),
            href: '/dashboard/projects',
          },
          {
            name: data?.project?.name || '',
            href: `/dashboard/project/${projectId}`,
          },
          {
            name: data?.name || '',
            href: `/dashboard/project/${projectId}/services/compose/${composeId}`,
          },
        ]}
      />
      <Head>
        <title>
          {t('dashboard.services.compose')}: {data?.name} - {data?.project.name}{' '}
          | Dokploy
        </title>
      </Head>
      <div className="w-full">
        <Card className="h-full bg-sidebar p-2.5 rounded-xl w-full">
          <div className="rounded-xl bg-background shadow-md ">
            <div className="flex flex-col gap-4">
              <CardHeader className="flex flex-row justify-between items-center">
                <div className="flex flex-col">
                  <CardTitle className="text-xl flex flex-row gap-2">
                    <div className="relative flex flex-row gap-4">
                      <div className="absolute -right-1 -top-2">
                        <StatusTooltip status={data?.composeStatus} />
                      </div>

                      <CircuitBoard className="h-6 w-6 text-muted-foreground" />
                    </div>
                    {data?.name}
                  </CardTitle>
                  {data?.description && (
                    <CardDescription>{data?.description}</CardDescription>
                  )}

                  <span className="text-sm text-muted-foreground">
                    {data?.appName}
                  </span>
                </div>
                <div className="flex flex-col h-fit w-fit gap-2">
                  <div className="flex flex-row h-fit w-fit gap-2">
                    <Badge
                      className="cursor-pointer"
                      onClick={() => {
                        if (data?.server?.ipAddress) {
                          copy(data.server.ipAddress)
                          toast.success(t('dashboard.services.ipAddressCopied'))
                        }
                      }}
                      variant={
                        !data?.serverId
                          ? 'default'
                          : data?.server?.serverStatus === 'active'
                          ? 'default'
                          : 'destructive'
                      }
                    >
                      {data?.server?.name ||
                        t('dashboard.services.dokployServer')}
                    </Badge>
                    {data?.server?.serverStatus === 'inactive' && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Label className="break-all w-fit flex flex-row gap-1 items-center">
                              <HelpCircle className="size-4 text-muted-foreground" />
                            </Label>
                          </TooltipTrigger>
                          <TooltipContent
                            className="z-[999] w-[300px]"
                            align="start"
                            side="top"
                          >
                            <span>
                              {t('dashboard.services.serverInactiveTooltip')}
                            </span>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <div className="flex flex-row gap-2 justify-end">
                    <UpdateCompose composeId={composeId} />

                    {(auth?.role === 'owner' || auth?.canDeleteServices) && (
                      <DeleteService id={composeId} type="compose" />
                    )}
                  </div>
                </div>
              </CardHeader>
            </div>
            <CardContent className="space-y-2 py-8 border-t">
              {data?.server?.serverStatus === 'inactive' ? (
                <div className="flex h-[55vh] border-2 rounded-xl border-dashed p-4">
                  <div className="max-w-3xl mx-auto flex flex-col items-center justify-center self-center gap-3">
                    <ServerOff className="size-10 text-muted-foreground self-center" />
                    <span className="text-center text-base text-muted-foreground">
                      {t('dashboard.services.serverInactiveMessage', {
                        serverName: data.server.name,
                      })}
                    </span>
                    <span className="text-center text-base text-muted-foreground">
                      {t('dashboard.services.goToBilling')}{' '}
                      <Link
                        href="/dashboard/settings/billing"
                        className="text-primary"
                      >
                        {t('dashboard.services.billing')}
                      </Link>
                    </span>
                  </div>
                </div>
              ) : (
                <Tabs
                  value={tab}
                  defaultValue="general"
                  className="w-full"
                  onValueChange={(e) => {
                    setTab(e as TabState)
                    const newPath = `/dashboard/project/${projectId}/services/compose/${composeId}?tab=${e}`
                    router.push(newPath)
                  }}
                >
                  <div className="flex flex-row items-center justify-between w-full gap-4 overflow-x-scroll">
                    <TabsList
                      className={cn(
                        'xl:grid xl:w-fit max-md:overflow-y-scroll justify-start',
                        isCloud && data?.serverId
                          ? 'xl:grid-cols-10'
                          : data?.serverId
                          ? 'xl:grid-cols-9'
                          : 'xl:grid-cols-10'
                      )}
                    >
                      <TabsTrigger value="general">
                        {t('dashboard.services.general')}
                      </TabsTrigger>
                      <TabsTrigger value="environment">
                        {t('dashboard.services.environment')}
                      </TabsTrigger>
                      <TabsTrigger value="domains">
                        {t('dashboard.services.domains')}
                      </TabsTrigger>
                      <TabsTrigger value="deployments">
                        {t('dashboard.services.deployments')}
                      </TabsTrigger>
                      <TabsTrigger value="backups">
                        {t('dashboard.services.backups')}
                      </TabsTrigger>
                      <TabsTrigger value="schedules">
                        {t('dashboard.services.schedules')}
                      </TabsTrigger>
                      <TabsTrigger value="volumeBackups">
                        {t('dashboard.services.volumeBackups')}
                      </TabsTrigger>
                      <TabsTrigger value="logs">
                        {t('dashboard.services.logs')}
                      </TabsTrigger>
                      {((data?.serverId && isCloud) || !data?.server) && (
                        <TabsTrigger value="monitoring">
                          {t('dashboard.services.monitoring')}
                        </TabsTrigger>
                      )}
                      <TabsTrigger value="advanced">
                        {t('dashboard.services.advanced')}
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="general">
                    <div className="flex flex-col gap-4 pt-2.5">
                      <ShowGeneralCompose composeId={composeId} />
                    </div>
                  </TabsContent>
                  <TabsContent value="environment">
                    <div className="flex flex-col gap-4 pt-2.5">
                      <ShowEnvironment id={composeId} type="compose" />
                    </div>
                  </TabsContent>
                  <TabsContent value="backups">
                    <div className="flex flex-col gap-4 pt-2.5">
                      <ShowBackups id={composeId} backupType="compose" />
                    </div>
                  </TabsContent>

                  <TabsContent value="schedules">
                    <div className="flex flex-col gap-4 pt-2.5">
                      <ShowSchedules id={composeId} scheduleType="compose" />
                    </div>
                  </TabsContent>
                  <TabsContent value="volumeBackups">
                    <div className="flex flex-col gap-4 pt-2.5">
                      <ShowVolumeBackups
                        id={composeId}
                        type="compose"
                        serverId={data?.serverId || ''}
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="monitoring">
                    <div className="pt-2.5">
                      <div className="flex flex-col border rounded-lg ">
                        {data?.serverId && isCloud ? (
                          <ComposePaidMonitoring
                            serverId={data?.serverId || ''}
                            baseUrl={`${
                              data?.serverId
                                ? `http://${data?.server?.ipAddress}:${data?.server?.metricsConfig?.server?.port}`
                                : 'http://localhost:4500'
                            }`}
                            appName={data?.appName || ''}
                            token={
                              data?.server?.metricsConfig?.server?.token || ''
                            }
                            appType={data?.composeType || 'docker-compose'}
                          />
                        ) : (
                          <>
                            {/* {monitoring?.enabledFeatures &&
															isCloud &&
															data?.serverId && (
																<div className="flex flex-row border w-fit p-4 rounded-lg items-center gap-2 m-4">
																	<Label className="text-muted-foreground">
																		Change Monitoring
																	</Label>
																	<Switch
																		checked={toggleMonitoring}
																		onCheckedChange={setToggleMonitoring}
																	/>
																</div>
															)}

														{toggleMonitoring ? (
															<ComposePaidMonitoring
																appName={data?.appName || ""}
																baseUrl={`http://${monitoring?.serverIp}:${monitoring?.metricsConfig?.server?.port}`}
																token={
																	monitoring?.metricsConfig?.server?.token || ""
																}
																appType={data?.composeType || "docker-compose"}
															/>
														) : ( */}
                            {/* <div> */}
                            <ComposeFreeMonitoring
                              serverId={data?.serverId || ''}
                              appName={data?.appName || ''}
                              appType={data?.composeType || 'docker-compose'}
                            />
                            {/* </div> */}
                            {/* )} */}
                          </>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="logs">
                    <div className="flex flex-col gap-4 pt-2.5">
                      {data?.composeType === 'docker-compose' ? (
                        <ShowDockerLogsCompose
                          serverId={data?.serverId || ''}
                          appName={data?.appName || ''}
                          appType={data?.composeType || 'docker-compose'}
                        />
                      ) : (
                        <ShowDockerLogsStack
                          serverId={data?.serverId || ''}
                          appName={data?.appName || ''}
                        />
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="deployments" className="w-full pt-2.5">
                    <div className="flex flex-col gap-4 border rounded-lg">
                      <ShowDeployments
                        id={composeId}
                        type="compose"
                        serverId={data?.serverId || ''}
                        refreshToken={data?.refreshToken || ''}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="domains">
                    <div className="flex flex-col gap-4 pt-2.5">
                      <ShowDomains id={composeId} type="compose" />
                    </div>
                  </TabsContent>

                  <TabsContent value="advanced">
                    <div className="flex flex-col gap-4 pt-2.5">
                      <AddCommandCompose composeId={composeId} />
                      <ShowVolumes id={composeId} type="compose" />
                      <ShowImport composeId={composeId} />
                      <IsolatedDeploymentTab composeId={composeId} />
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default Service
Service.getLayout = (page: ReactElement) => {
  return <DashboardLayout>{page}</DashboardLayout>
}

export async function getServerSideProps(
  ctx: GetServerSidePropsContext<{
    composeId: string
    activeTab: TabState
  }>
) {
  const locale = getLocale(ctx.req.cookies)
  const { query, params, req, res } = ctx

  const activeTab = query.tab
  const { user, session } = await validateRequest(req)
  if (!user) {
    return {
      redirect: {
        permanent: true,
        destination: '/',
      },
    }
  }
  // Fetch data from external API
  const helpers = createServerSideHelpers({
    router: appRouter,
    ctx: {
      req: req as any,
      res: res as any,
      db: null as any,
      session: session as any,
      user: user as any,
    },
    transformer: superjson,
  })

  console.log('IM HEEEERE 2', { params })

  // Valid project, if not return to initial homepage....
  if (typeof params?.composeId === 'string') {
    console.log('ComposeId', params?.composeId)
    try {
      await helpers.compose.one.fetch({
        composeId: params?.composeId,
      })
      console.log('After fetch')
      await helpers.settings.isCloud.prefetch()
      console.log('After isCloud')
      return {
        props: {
          trpcState: helpers.dehydrate(),
          composeId: params?.composeId,
          activeTab: (activeTab || 'general') as TabState,
          ...(await serverSideTranslations(locale, ['common', 'dashboard'])),
        },
      }
    } catch {
      console.log('After catch 1')
      return {
        redirect: {
          permanent: false,
          destination: '/dashboard/projects',
        },
      }
    }
  }

  console.log('After catch 2')
  return {
    redirect: {
      permanent: false,
      destination: '/',
    },
  }
}
