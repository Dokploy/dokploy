import { CheckIcon, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface PickerUser {
	id: string;
	name: string;
	email: string;
	/** Shown as a pill, the same way the Users table shows roles. */
	role?: string;
}

export const userName = (user: { firstName: string; lastName: string }) =>
	[user.firstName, user.lastName].filter(Boolean).join(" ");

/** An organization member (as returned by user.all) as a picker entry. */
export const toPickerUser = (member: {
	role: string;
	user: { id: string; firstName: string; lastName: string; email: string };
}): PickerUser => ({
	id: member.user.id,
	name: userName(member.user),
	email: member.user.email,
	role: member.role,
});

export const RoleBadge = ({
	role,
	className,
}: {
	role: string;
	className?: string;
}) => (
	<Badge
		variant={role === "owner" ? "default" : "secondary"}
		className={cn("shrink-0", className)}
	>
		{role}
	</Badge>
);

interface Props {
	users: PickerUser[];
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	/** Fixed choices listed above the users, e.g. "All users". */
	options?: { value: string; label: string }[];
	className?: string;
}

/** Searchable user picker: a button that opens a "search by name or email" list. */
export const UserPicker = ({
	users,
	value,
	onChange,
	placeholder,
	options = [],
	className,
}: Props) => {
	const [open, setOpen] = useState(false);
	const selectedUser = users.find((user) => user.id === value);
	const selectedOption = options.find((option) => option.value === value);

	const select = (next: string) => {
		onChange(next);
		setOpen(false);
	};

	const check = (selected: boolean) => (
		<CheckIcon
			className={cn("h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")}
		/>
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className={cn(
						"justify-between",
						!selectedUser && !selectedOption && "text-muted-foreground",
						className,
					)}
				>
					<span className="truncate">
						{selectedUser
							? selectedUser.name
								? `${selectedUser.name} (${selectedUser.email})`
								: selectedUser.email
							: (selectedOption?.label ?? placeholder)}
					</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0"
				align="start"
			>
				<Command>
					<CommandInput
						placeholder="Search by name or email..."
						className="h-9"
					/>
					<CommandList className="max-h-42">
						<CommandEmpty>No users found.</CommandEmpty>
						{options.length > 0 && (
							<CommandGroup>
								{options.map((option) => (
									<CommandItem
										key={option.value}
										value={option.label}
										onSelect={() => select(option.value)}
									>
										<span className="truncate">{option.label}</span>
										<span className="ml-auto">
											{check(option.value === value)}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
						<CommandGroup>
							{users.map((user) => (
								<CommandItem
									key={user.id}
									value={`${user.name} ${user.email}`}
									onSelect={() => select(user.id)}
								>
									<span className="flex min-w-0 items-center gap-2">
										<span className="truncate">{user.name || user.email}</span>
										{user.name && (
											<span className="truncate text-xs text-muted-foreground">
												{user.email}
											</span>
										)}
									</span>
									<span className="ml-auto flex items-center gap-2">
										{user.role && <RoleBadge role={user.role} />}
										{check(user.id === value)}
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
};
