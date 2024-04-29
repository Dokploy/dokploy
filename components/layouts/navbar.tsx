import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Logo } from "../shared/logo";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { useRouter } from "next/router";
import { api } from "@/utils/api";

export const Navbar = () => {
	const router = useRouter();
	const { data } = api.auth.get.useQuery();
	const { data: user } = api.user.byAuthId.useQuery(
		{
			authId: data?.id || "",
		},
		{
			enabled: !!data?.id && data?.rol === "user",
		},
	);
	const { mutateAsync } = api.auth.logout.useMutation();
	return (
		<nav className="border-divider sticky inset-x-0 top-0 z-40 flex h-auto w-full items-center justify-center border-b bg-background/70 backdrop-blur-lg backdrop-saturate-150 data-[menu-open=true]:border-none data-[menu-open=true]:backdrop-blur-xl">
			<header className="relative z-40 flex h-[var(--navbar-height)] w-full max-w-8xl flex-row flex-nowrap items-center justify-between gap-4 px-4 sm:px-6">
				<div className="text-medium box-border flex flex-grow basis-0 flex-row flex-nowrap items-center justify-start whitespace-nowrap bg-transparent no-underline">
					<Link
						href="/dashboard/projects"
						className={cn("flex flex-row items-center gap-2")}
					>
						<Logo />
						<span className="text-sm font-semibold text-primary">Dokploy</span>
					</Link>
				</div>

				<ul
					className="ml-auto flex h-12 max-w-fit flex-row flex-nowrap items-center gap-0 data-[justify=end]:flex-grow data-[justify=start]:flex-grow data-[justify=end]:basis-0 data-[justify=start]:basis-0 data-[justify=start]:justify-start data-[justify=end]:justify-end data-[justify=center]:justify-center"
					data-justify="end"
				>
					<li className="text-medium mr-2 box-border hidden list-none whitespace-nowrap data-[active=true]:font-semibold data-[active=true]:text-primary lg:flex">
						{/* <Badge>PRO</Badge> */}
					</li>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Avatar className="size-10 cursor-pointer border border-border items-center">
								<AvatarImage src={data?.image || ""} alt="@shadcn" />
								<AvatarFallback>
									{data?.email
										?.split(" ")
										.map((n) => n[0])
										.join("")}
								</AvatarFallback>
							</Avatar>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-56" align="end">
							<DropdownMenuLabel className="flex flex-col">
								My Account
								<span className="text-xs font-normal text-muted-foreground">
									{data?.email}
								</span>
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem
									className="cursor-pointer"
									onClick={() => {
										router.push("/dashboard/projects");
									}}
								>
									Projects
								</DropdownMenuItem>
								<DropdownMenuItem
									className="cursor-pointer"
									onClick={() => {
										router.push("/dashboard/monitoring");
									}}
								>
									Monitoring
								</DropdownMenuItem>
								{(data?.rol === "admin" || user?.canAccessToTraefikFiles) && (
									<DropdownMenuItem
										className="cursor-pointer"
										onClick={() => {
											router.push("/dashboard/traefik");
										}}
									>
										Traefik
									</DropdownMenuItem>
								)}
								{(data?.rol === "admin" || user?.canAccessToDocker) && (
									<DropdownMenuItem
										className="cursor-pointer"
										onClick={() => {
											router.push("/dashboard/docker", undefined, {
												shallow: true,
											});
										}}
									>
										Docker
									</DropdownMenuItem>
								)}

								<DropdownMenuItem
									className="cursor-pointer"
									onClick={() => {
										router.push("/dashboard/settings/server");
									}}
								>
									Settings
								</DropdownMenuItem>
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={async () => {
									await mutateAsync().then(() => {
										router.push("/");
									});
								}}
							>
								Log out
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</ul>
			</header>
		</nav>
	);
};
