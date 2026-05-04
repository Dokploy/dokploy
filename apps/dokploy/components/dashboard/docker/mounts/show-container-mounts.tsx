import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "@/utils/api";

interface Props {
	containerId: string;
	serverId?: string;
}

interface Mount {
	Type: string;
	Source: string;
	Destination: string;
	Mode: string;
	RW: boolean;
	Propagation: string;
	Name?: string;
	Driver?: string;
}

export const ShowContainerMounts = ({ containerId, serverId }: Props) => {
	const { data } = api.docker.getConfig.useQuery(
		{
			containerId,
			serverId,
		},
		{
			enabled: !!containerId,
		},
	);

	const mounts: Mount[] = data?.Mounts ?? [];

	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					View Mounts
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="w-full md:w-[70vw] min-w-[70vw]">
				<DialogHeader>
					<DialogTitle>Container Mounts</DialogTitle>
					<DialogDescription>
						Volume and bind mounts for this container
					</DialogDescription>
				</DialogHeader>
				<div className="overflow-auto max-h-[70vh]">
					{mounts.length === 0 ? (
						<div className="text-center text-muted-foreground py-8">
							No mounts found for this container.
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Type</TableHead>
									<TableHead>Source</TableHead>
									<TableHead>Destination</TableHead>
									<TableHead>Mode</TableHead>
									<TableHead>Read/Write</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{mounts.map((mount, index) => (
									<TableRow key={index}>
										<TableCell>
											<Badge variant="outline">{mount.Type}</Badge>
										</TableCell>
										<TableCell className="font-mono text-xs max-w-[250px] truncate">
											{mount.Name || mount.Source}
										</TableCell>
										<TableCell className="font-mono text-xs max-w-[250px] truncate">
											{mount.Destination}
										</TableCell>
										<TableCell className="text-xs">
											{mount.Mode || "-"}
										</TableCell>
										<TableCell>
											<Badge variant={mount.RW ? "default" : "secondary"}>
												{mount.RW ? "RW" : "RO"}
											</Badge>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};
