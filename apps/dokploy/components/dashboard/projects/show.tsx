import { DateTooltip } from "@/components/shared/date-tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";
import {
  AlertTriangle,
  BookIcon,
  ExternalLink,
  ExternalLinkIcon,
  FolderInput,
  MoreHorizontalIcon,
  TrashIcon,
} from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { toast } from "sonner";
import { ProjectEnviroment } from "./project-enviroment";
import { UpdateProject } from "./update";

export const ShowProjects = () => {
  const utils = api.useUtils();
  const { data } = api.project.all.useQuery();
  const { data: auth } = api.auth.get.useQuery();
  const { data: user } = api.user.byAuthId.useQuery(
    {
      authId: auth?.id || "",
    },
    {
      enabled: !!auth?.id && auth?.rol === "user",
    }
  );
  const { mutateAsync } = api.project.remove.useMutation();

  return (
    <>
      {data?.length === 0 && (
        <div className="mt-6 flex h-[50vh] w-full flex-col items-center justify-center space-y-4">
          <FolderInput className="size-10 md:size-28 text-muted-foreground" />
          <span className="text-center font-medium text-muted-foreground">
            No projects added yet. Click on Create project.
          </span>
        </div>
      )}
      <div className="mt-6  w-full  grid sm:grid-cols-2 lg:grid-cols-3 flex-wrap gap-5 pb-10">
        {data?.map((project) => {
          const emptyServices =
            project?.mariadb.length === 0 &&
            project?.mongo.length === 0 &&
            project?.mysql.length === 0 &&
            project?.postgres.length === 0 &&
            project?.redis.length === 0 &&
            project?.applications.length === 0 &&
            project?.compose.length === 0;

          const totalServices =
            project?.mariadb.length +
            project?.mongo.length +
            project?.mysql.length +
            project?.postgres.length +
            project?.redis.length +
            project?.applications.length +
            project?.compose.length;

          const flattedDomains = [
            ...project.applications.flatMap((a) => a.domains),
            ...project.compose.flatMap((a) => a.domains),
          ];

          const renderDomainsDropdown = (
            item: typeof project.compose | typeof project.applications
          ) =>
            item[0] ? (
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {"applicationId" in item[0] ? "Applications" : "Compose"}
                </DropdownMenuLabel>
                {item.map((a) => (
                  <Fragment
                    key={"applicationId" in a ? a.applicationId : a.composeId}
                  >
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="font-normal capitalize text-xs ">
                        {a.name}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {a.domains.map((domain) => (
                        <DropdownMenuItem key={domain.domainId} asChild>
                          <Link
                            className="space-x-4 text-xs cursor-pointer justify-between"
                            target="_blank"
                            href={`${domain.https ? "https" : "http"}://${
                              domain.host
                            }${domain.path}`}
                          >
                            <span>{domain.host}</span>
                            <ExternalLink className="size-4 shrink-0" />
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </Fragment>
                ))}
              </DropdownMenuGroup>
            ) : null;

          return (
            <div key={project.projectId} className="w-full lg:max-w-md">
              <Link href={`/dashboard/project/${project.projectId}`}>
                <Card className="group relative w-full  bg-transparent transition-colors hover:bg-card">
                  {flattedDomains.length > 1 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          className="absolute -right-3 -top-3 size-9 translate-y-1 rounded-full p-0 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
                          size="sm"
                          variant="default"
                        >
                          <ExternalLinkIcon className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        className="w-[200px] space-y-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {renderDomainsDropdown(project.applications)}
                        {renderDomainsDropdown(project.compose)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : flattedDomains[0] ? (
                    <Button
                      className="absolute -right-3 -top-3 size-9 translate-y-1 rounded-full p-0 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
                      size="sm"
                      variant="default"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        href={`${
                          flattedDomains[0].https ? "https" : "http"
                        }://${flattedDomains[0].host}${flattedDomains[0].path}`}
                        target="_blank"
                      >
                        <ExternalLinkIcon className="size-3.5" />
                      </Link>
                    </Button>
                  ) : null}

                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <BookIcon className="size-4 text-muted-foreground" />
                          <span className="text-base font-medium leading-none">
                            {project.name}
                          </span>
                        </div>

                        <span className="text-sm font-medium text-muted-foreground">
                          {project.description}
                        </span>
                      </span>
                      <div className="flex self-start space-x-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="px-2"
                            >
                              <MoreHorizontalIcon className="size-5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-[200px] space-y-2">
                            <DropdownMenuLabel className="font-normal">
                              Actions
                            </DropdownMenuLabel>
                            <div onClick={(e) => e.stopPropagation()}>
                              <ProjectEnviroment
                                projectId={project.projectId}
                              />
                            </div>
                            <div onClick={(e) => e.stopPropagation()}>
                              <UpdateProject projectId={project.projectId} />
                            </div>

                            <div onClick={(e) => e.stopPropagation()}>
                              {(auth?.rol === "admin" ||
                                user?.canDeleteProjects) && (
                                <AlertDialog>
                                  <AlertDialogTrigger className="w-full">
                                    <DropdownMenuItem
                                      className="w-full cursor-pointer  space-x-3"
                                      onSelect={(e) => e.preventDefault()}
                                    >
                                      <TrashIcon className="size-4" />
                                      <span>Delete</span>
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        Are you sure to delete this project?
                                      </AlertDialogTitle>
                                      {!emptyServices ? (
                                        <div className="flex flex-row gap-4 rounded-lg bg-yellow-50 p-2 dark:bg-yellow-950">
                                          <AlertTriangle className="text-yellow-600 dark:text-yellow-400" />
                                          <span className="text-sm text-yellow-600 dark:text-yellow-400">
                                            You have active services, please
                                            delete them first
                                          </span>
                                        </div>
                                      ) : (
                                        <AlertDialogDescription>
                                          This action cannot be undone
                                        </AlertDialogDescription>
                                      )}
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>
                                        Cancel
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        disabled={!emptyServices}
                                        onClick={async () => {
                                          await mutateAsync({
                                            projectId: project.projectId,
                                          })
                                            .then(() => {
                                              toast.success(
                                                "Project delete succesfully"
                                              );
                                            })
                                            .catch(() => {
                                              toast.error(
                                                "Error to delete this project"
                                              );
                                            })
                                            .finally(() => {
                                              utils.project.all.invalidate();
                                            });
                                        }}
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardFooter className="pt-4">
                    <div className="space-y-1 text-sm flex flex-row justify-between max-sm:flex-wrap w-full gap-2 sm:gap-4">
                      <DateTooltip date={project.createdAt}>
                        Created
                      </DateTooltip>
                      <span>
                        {totalServices}{" "}
                        {totalServices === 1 ? "service" : "services"}
                      </span>
                    </div>
                  </CardFooter>
                </Card>
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
};
