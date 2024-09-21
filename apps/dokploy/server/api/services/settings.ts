import { readdirSync } from "node:fs";
import { join } from "node:path";
import { docker } from "@/server/constants";
import { getServiceContainer } from "@/server/utils/docker/utils";
import packageInfo from "../../../package.json";
import { execAsyncRemote } from "@/server/utils/process/execAsync";

const updateIsAvailable = async () => {
	try {
		const service = await getServiceContainer("dokploy");

		const localImage = await docker.getImage(getDokployImage()).inspect();
		return localImage.Id !== service?.ImageID;
	} catch (error) {
		return false;
	}
};

export const getDokployImage = () => {
	return `dokploy/dokploy:${process.env.RELEASE_TAG || "latest"}`;
};

export const pullLatestRelease = async () => {
	try {
		const stream = await docker.pull(getDokployImage(), {});
		await new Promise((resolve, reject) => {
			docker.modem.followProgress(stream, (err, res) =>
				err ? reject(err) : resolve(res),
			);
		});
		const newUpdateIsAvailable = await updateIsAvailable();
		return newUpdateIsAvailable;
	} catch (error) {}

	return false;
};
export const getDokployVersion = () => {
	return packageInfo.version;
};

interface TreeDataItem {
	id: string;
	name: string;
	type: "file" | "directory";
	children?: TreeDataItem[];
}

export const readDirectory = async (
	dirPath: string,
	serverId?: string,
): Promise<TreeDataItem[]> => {
	if (serverId) {
		const { stdout } = await execAsyncRemote(
			serverId,
			`
process_items() {
    local parent_dir="$1"
    local __resultvar=$2

    local items_json=""
    local first=true
    for item in "$parent_dir"/*; do
        [ -e "$item" ] || continue
        process_item "$item" item_json
        if [ "$first" = true ]; then
            first=false
            items_json="$item_json"
        else
            items_json="$items_json,$item_json"
        fi
    done

    eval $__resultvar="'[$items_json]'"
}

process_item() {
    local item_path="$1"
    local __resultvar=$2

    local item_name=$(basename "$item_path")
    local escaped_name=$(echo "$item_name" | sed 's/"/\\"/g')
    local escaped_path=$(echo "$item_path" | sed 's/"/\\"/g')

    if [ -d "$item_path" ]; then
        # Is directory
        process_items "$item_path" children_json
        local json='{"id":"'"$escaped_path"'","name":"'"$escaped_name"'","type":"directory","children":'"$children_json"'}'
    else
        # Is file
        local json='{"id":"'"$escaped_path"'","name":"'"$escaped_name"'","type":"file"}'
    fi

    eval $__resultvar="'$json'"
}

root_dir=${dirPath}

process_items "$root_dir" json_output

echo "$json_output"
			`,
		);
		const result = JSON.parse(stdout);
		return result;
	}
	const items = readdirSync(dirPath, { withFileTypes: true });

	return items.map((item) => {
		const fullPath = join(dirPath, item.name);
		if (item.isDirectory()) {
			return {
				id: fullPath,
				name: item.name,
				type: "directory",
				children: readDirectory(fullPath),
			};
		}
		return {
			id: fullPath,
			name: item.name,
			type: "file",
		};
	}) as unknown as Promise<TreeDataItem[]>;
};
