import type { ReactNode } from "react";
import { formatBytes } from "@/components/dashboard/database/backups/restore-backup";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

interface DestinationSelectProps {
	value: string;
	onChange: (destinationId: string) => void;
	label?: string;
	description?: ReactNode;
}

export const DestinationSelect = ({
	value,
	onChange,
	label = "Destination",
	description,
}: DestinationSelectProps) => {
	const { data: destinations } = api.destination.all.useQuery();
	return (
		<div className="grid gap-1">
			<Label className="text-xs">{label}</Label>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger>
					<SelectValue placeholder="Select a destination" />
				</SelectTrigger>
				<SelectContent>
					{destinations?.map((destination) => (
						<SelectItem
							key={destination.destinationId}
							value={destination.destinationId}
						>
							{destination.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{destinations?.length === 0 ? (
				<p className="text-xs text-muted-foreground">
					No destinations configured. Add one under Settings → S3 Destinations
					first.
				</p>
			) : (
				description && (
					<p className="text-xs text-muted-foreground">{description}</p>
				)
			)}
		</div>
	);
};

interface BundleListStateProps {
	query: {
		isLoading: boolean;
		isError: boolean;
		error?: { message: string } | null;
		data?: unknown[];
	};
}

export const BundleListState = ({ query }: BundleListStateProps) => {
	if (query.isLoading) {
		return <p className="text-xs text-muted-foreground">Listing bundles...</p>;
	}
	if (query.isError) {
		return <p className="text-xs text-destructive">{query.error?.message}</p>;
	}
	if (query.data?.length === 0) {
		return (
			<p className="text-xs text-muted-foreground">
				No export bundles in this destination yet.
			</p>
		);
	}
	return null;
};

export const BundleMeta = ({
	size,
	modTime,
}: {
	size: number;
	modTime: string;
}) => (
	<span className="shrink-0 text-xs text-muted-foreground">
		{formatBytes(size)} · {new Date(modTime).toLocaleString()}
	</span>
);
