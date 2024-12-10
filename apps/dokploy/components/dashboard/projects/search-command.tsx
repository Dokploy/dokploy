"use client"

import React from "react";
import {Command, CommandEmpty, CommandList, CommandGroup, CommandInput, CommandItem,CommandDialog, CommandSeparator} from "@/components/ui/command";
import { useRouter } from 'next/router'
import {extractServices, type Services} from "@/pages/dashboard/project/[projectId]";
import type {findProjectById} from "@dokploy/server/services/project";
import {BookIcon, CircuitBoard, GlobeIcon} from "lucide-react";
import {
    MariadbIcon,
    MongodbIcon,
    MysqlIcon,
    PostgresqlIcon,
    RedisIcon,
} from "@/components/icons/data-tools-icons";

// export type Services = {
//     name: string;
//     type:
//         | "mariadb"
//         | "application"
//         | "postgres"
//         | "mysql"
//         | "mongo"
//         | "redis"
//         | "compose";
//     description?: string | null;
//     id: string;
//     createdAt: string;
//     status?: "idle" | "running" | "done" | "error";
// };

type Project = Awaited<ReturnType<typeof findProjectById>>;

interface Props {
    data: Project[];
}

export const SearchCommand = ({data}: Props) => {
    const router = useRouter()
    const [open, setOpen] = React.useState(false)

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }

        document.addEventListener("keydown", down)
        return () => document.removeEventListener("keydown", down)
    }, [])

    console.log("DEBUG: data: ", data);

    return (
        <div>
            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput placeholder={"Search projects"}/>
                <CommandList>
                    <CommandEmpty>No projects added yet. Click on Create project.</CommandEmpty>
                    <CommandGroup heading={"Projects"}>
                        <CommandList>
                            {data?.map((project) => (
                                <CommandItem onSelect={() => router.push(project.projectId)}>
                                    <BookIcon className="size-4 text-muted-foreground mr-2" />
                                    {project.name}
                                </CommandItem>
                            ))}
                        </CommandList>
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading={"Services"}>
                        <CommandList>
                            {data?.map((project) => {
                                const applications: Services[] = extractServices(project);
                                return (
                                    applications.map((application) => (
                                        <CommandItem
                                            onSelect={() => router.push(`/dashboard/project/${project.projectId}/services/${application.type}/${application.id}`)}>
                                            {application.type === "postgres" && (
                                                <PostgresqlIcon className="h-6 w-6 mr-2" />
                                            )}
                                            {application.type === "redis" && (
                                                <RedisIcon className="h-6 w-6 mr-2" />
                                            )}
                                            {application.type === "mariadb" && (
                                                <MariadbIcon className="h-6 w-6 mr-2" />
                                            )}
                                            {application.type === "mongo" && (
                                                <MongodbIcon className="h-6 w-6 mr-2" />
                                            )}
                                            {application.type === "mysql" && (
                                                <MysqlIcon className="h-6 w-6 mr-2" />
                                            )}
                                            {application.type === "application" && (
                                                <GlobeIcon className="h-6 w-6 mr-2" />
                                            )}
                                            {application.type === "compose" && (
                                                <CircuitBoard className="h-6 w-6 mr-2" />
                                            )}
                                            {application.name}
                                        </CommandItem>
                                    ))
                                );
                            })}
                        </CommandList>
                    </CommandGroup>
                </CommandList>
            </CommandDialog>
        </div>
    )
}