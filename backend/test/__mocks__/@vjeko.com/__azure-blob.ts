console.log("[MOCK-VJEKO] @vjeko.com/azure-blob mock is being loaded!");
export const Blob = jest.fn().mockImplementation(() => ({
    read: jest.fn(),
    exists: jest.fn(),
    optimisticUpdate: jest.fn(),
}));
