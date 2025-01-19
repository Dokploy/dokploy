import React from "react";
import { DockerMonitoring } from "../docker/show";

export const ShowMonitoring = () => {
	return (
		<div className="w-full">
			<DockerMonitoring appName="dokploy" />
		</div>
	);
};
