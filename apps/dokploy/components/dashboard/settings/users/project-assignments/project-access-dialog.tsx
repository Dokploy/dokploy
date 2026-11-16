import { Users } from "lucide-react";
import { useState } from "react";
import { RoleBadge, userName } from "@/components/shared/user-picker";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { matchesSearch, pluralize } from "@/lib/utils";
import { api } from "@/utils/api";

interface Props {
	projectId: string;
	projectName: string;
}

/** Owners and admins reach every project; everyone else only what their permissions list. */
export const ProjectAccessDialog = ({ projectId, projectName }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");
	const { data: members, isPending } = api.user.all.useQuery(undefined, {
		enabled: isOpen,
	});

	const withAccess = (members ?? []).filter(
		(member) =>
			member.role === "owner" ||
			member.role === "admin" ||
			member.accessedProjects.includes(projectId),
	);
	const visible = withAccess.filter((member) =>
		matchesSearch(search, userName(member.user), member.user.email),
	);

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				if (!open) setSearch("");
			}}
		>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-8 shrink-0"
					title="View access"
					aria-label="View access"
				>
					<Users className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="truncate">
						Access to {projectName}
					</DialogTitle>
					<DialogDescription>
						{isPending
							? "Loading..."
							: `${pluralize(withAccess.length, "user")}. Owners and admins can access every project.`}
					</DialogDescription>
				</DialogHeader>
				{!isPending && (
					<>
						{withAccess.length > 10 && (
							<Input
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search by name or email"
							/>
						)}
						<ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
							{visible.map((member) => {
								const name = userName(member.user);
								return (
									<li
										key={member.id}
										className="flex h-9 items-center gap-2 px-3 text-sm"
									>
										<span className="truncate">
											{name || member.user.email}
										</span>
										{name && (
											<span className="truncate text-xs text-muted-foreground">
												{member.user.email}
											</span>
										)}
										<RoleBadge role={member.role} className="ml-auto" />
									</li>
								);
							})}
							{visible.length === 0 && (
								<li className="h-9 truncate px-3 text-sm leading-9 text-muted-foreground">
									{search.trim()
										? `Nothing matches "${search.trim()}"`
										: "No users"}
								</li>
							)}
						</ul>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
};
