import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const SEARCHABLE_FROM = 10;
const VISIBLE_ROWS = 7;
const LIST_MAX_HEIGHT = `calc(${VISIBLE_ROWS} * 2.25rem + ${VISIBLE_ROWS + 1}px)`;

interface Props {
	organizations: { id: string; name: string }[];
}

export const OrganizationsDialog = ({ organizations }: Props) => {
	const [search, setSearch] = useState("");

	if (organizations.length === 0) {
		return null;
	}

	const query = search.trim().toLowerCase();
	const filtered = query
		? organizations.filter((org) => org.name.toLowerCase().includes(query))
		: organizations;

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) setSearch("");
			}}
		>
			<DialogTrigger asChild>
				<button
					type="button"
					className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
				>
					View all organizations
				</button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Organizations to transfer</DialogTitle>
					<DialogDescription>
						{organizations.length === 1
							? "1 organization"
							: `${organizations.length} organizations`}
					</DialogDescription>
				</DialogHeader>
				{organizations.length > SEARCHABLE_FROM && (
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search organizations"
					/>
				)}
				<ul
					className="divide-y overflow-y-auto rounded-md border"
					style={{ maxHeight: LIST_MAX_HEIGHT }}
				>
					{filtered.map((org) => (
						<li
							key={org.id}
							title={org.name}
							className="h-9 truncate px-3 text-sm leading-9"
						>
							{org.name}
						</li>
					))}
					{filtered.length === 0 && (
						<li className="h-9 truncate px-3 text-sm leading-9 text-muted-foreground">
							No organizations match "{search.trim()}"
						</li>
					)}
				</ul>
			</DialogContent>
		</Dialog>
	);
};
