const NVIDIA_INVENTORY_QUERY =
	"nvidia-smi --query-gpu=index,uuid,name,memory.total,memory.free,driver_version --format=csv,noheader,nounits";
const NVIDIA_COMPUTE_CAP_QUERY =
	"nvidia-smi --query-gpu=index,compute_cap --format=csv,noheader,nounits";

// Each invocation emits one independent result and receives its own executor deadline.
const engine = `
engineOutput=$(docker info --format '{"ncpu":{{json .NCPU}},"memTotal":{{json .MemTotal}},"arch":{{json .Architecture}}}' 2>/dev/null)
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

const memory = `
memTotalKb=$(awk '/^MemTotal:/{print $2}' /proc/meminfo 2>/dev/null)
memAvailKb=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo 2>/dev/null)
printf '{"memTotalKb":"%s","memAvailKb":"%s"}\\n' "$memTotalKb" "$memAvailKb"
`;

const cpu = `
cpuCount=$(nproc 2>/dev/null)
if [ -z "$cpuCount" ]; then
	cpuCount=$(grep -c '^processor' /proc/cpuinfo 2>/dev/null)
fi
printf '{"cpuCount":"%s"}\\n' "$cpuCount"
`;

const arch = `
arch=$(uname -m 2>/dev/null)
printf '{"arch":"%s"}\\n' "$arch"
`;

const disk = `
diskOutput=$(df -Pk / 2>/dev/null)
diskExit=$?
diskTotalK=$(printf '%s\\n' "$diskOutput" | awk 'NR==2{print $2}')
diskAvailK=$(printf '%s\\n' "$diskOutput" | awk 'NR==2{print $4}')
printf '{"diskExit":%s,"diskTotalK":"%s","diskAvailK":"%s"}\\n' "$diskExit" "$diskTotalK" "$diskAvailK"
`;

export const buildHardwareScripts = (remote: boolean): readonly string[] =>
	remote ? [memory, cpu, arch, disk, gpu, cap] : [engine, gpu, cap];
