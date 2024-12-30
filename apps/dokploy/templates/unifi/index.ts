import type { Schema, Template } from "../utils";

export function generate(schema: Schema): Template {
	const mounts: Template["mounts"] = [
		{
			filePath: "init-mongo.sh",
			content: `
			#!/bin/bash
			mongo <<EOF
			use unifi
			db.createUser({
			user: "unifi",
			pwd: "unifi_password",
			roles: [
				{ db: "unifi", role: "dbOwner" },
				{ db: "unifi_stat", role: "dbOwner" }
			]
			})
			EOF
`,
		},
	];

	return {
		mounts,
	};
}
