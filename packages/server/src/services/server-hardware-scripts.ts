const NVIDIA_INVENTORY_QUERY =
	"nvidia-smi --query-gpu=index,uuid,name,memory.total,memory.free,driver_version --format=csv,noheader,nounits";
const NVIDIA_COMPUTE_CAP_QUERY =
	"nvidia-smi --query-gpu=index,compute_cap --format=csv,noheader,nounits";

// Each invocation emits one independent result and receives its own executor deadline.
const engine = `
engineOutput=$(docker info --format '{"arch":{{json .Architecture}}}' 2>/dev/null)
engineExit=$?
engineB64=$(printf '%s' "$engineOutput" | base64 2>/dev/null | tr -d '\\n')
printf '{"engineExit":%s,"engineBase64":"%s"}\\n' "$engineExit" "$engineB64"
`;

const gpu = `
gpuCsv=$(${NVIDIA_INVENTORY_QUERY} 2>/dev/null)
gpuExit=$?
gpuB64=$(printf '%s' "$gpuCsv" | base64 2>/dev/null | tr -d '\\n')
printf '{"gpuExit":%s,"gpuBase64":"%s"}\\n' "$gpuExit" "$gpuB64"
`;

const cap = `
capCsv=$(${NVIDIA_COMPUTE_CAP_QUERY} 2>/dev/null)
capExit=$?
capB64=$(printf '%s' "$capCsv" | base64 2>/dev/null | tr -d '\\n')
printf '{"capExit":%s,"capBase64":"%s"}\\n' "$capExit" "$capB64"
`;

const arch = `
arch=$(uname -m 2>/dev/null)
printf '{"arch":"%s"}\\n' "$arch"
`;

export const buildHardwareScripts = (remote: boolean): readonly string[] =>
	remote ? [arch, gpu, cap] : [engine, gpu, cap];
