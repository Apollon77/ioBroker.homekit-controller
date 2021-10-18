// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            discoverIp: boolean;
            discoverBle: boolean;
            dataPollingIntervalIp: number;
            dataPollingIntervalBle: number;
            bleInterface: string;
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
