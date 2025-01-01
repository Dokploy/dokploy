import type { Container, ProcessedContainer } from "./types.js";

export function processContainerData(container: Container): ProcessedContainer {
    // Process CPU
    const cpu = Number.parseFloat(container.CPUPerc.replace("%", ""));

    // Process Memory
    const memPerc = Number.parseFloat(container.MemPerc.replace("%", ""));
    const [used, total] = container.MemUsage.split(" / ");
    const usedValue = Number.parseFloat(used);
    const totalValue = Number.parseFloat(total);
    const memUnit = used.replace(/[\d.]/g, "");

    // Process Network I/O
    const [input, output] = container.NetIO.split(" / ");
    const networkInput = Number.parseFloat(input);
    const networkOutput = Number.parseFloat(output);
    const inputUnit = input.replace(/[\d.]/g, "");
    const outputUnit = output.replace(/[\d.]/g, "");

    // Process Block I/O
    const [read, write] = container.BlockIO.split(" / ");
    const blockRead = Number.parseFloat(read);
    const blockWrite = Number.parseFloat(write);
    const readUnit = read.replace(/[\d.]/g, "");
    const writeUnit = write.replace(/[\d.]/g, "");

    return {
        timestamp: new Date().toISOString(),
        CPU: cpu,
        Memory: {
            percentage: memPerc,
            used: usedValue,
            total: totalValue,
            unit: memUnit,
        },
        Network: {
            input: networkInput,
            output: networkOutput,
            inputUnit,
            outputUnit,
        },
        BlockIO: {
            read: blockRead,
            write: blockWrite,
            readUnit,
            writeUnit,
        },
        Container: container.Container,
        ID: container.ID,
        Name: container.Name,
    };
}
