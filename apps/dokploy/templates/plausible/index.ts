import {
	type Schema,
	type Template,
	generateBase64,
	generateHash,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const randomDomain = generateRandomDomain(schema);
	const secretBase = generateBase64(64);
	const toptKeyBase = generateBase64(32);

	const envs = [
		`PLAUSIBLE_HOST=${randomDomain}`,
		"PLAUSIBLE_PORT=8000",
		`BASE_URL=http://${randomDomain}`,
		`SECRET_KEY_BASE=${secretBase}`,
		`TOTP_VAULT_KEY=${toptKeyBase}`,
		`HASH=${mainServiceHash}`,
	];

	const mounts: Template["mounts"] = [
		{
			mountPath: "./clickhouse/clickhouse-config.xml",
			content: `
            <clickhouse>
            <logger>
                <level>warning</level>
                <console>true</console>
            </logger>
        
            <!-- Stop all the unnecessary logging -->
            <query_thread_log remove="remove"/>
            <query_log remove="remove"/>
            <text_log remove="remove"/>
            <trace_log remove="remove"/>
            <metric_log remove="remove"/>
            <asynchronous_metric_log remove="remove"/>
            <session_log remove="remove"/>
            <part_log remove="remove"/>
        </clickhouse>
            
            `,
		},
		{
			mountPath: "./clickhouse/clickhouse-user-config.xml",
			content: `
            <clickhouse>
                <profiles>
                    <default>
                        <log_queries>0</log_queries>
                        <log_query_threads>0</log_query_threads>
                    </default>
                </profiles>
            </clickhouse>
            `,
		},
	];

	return {
		envs,
		mounts,
	};
}
