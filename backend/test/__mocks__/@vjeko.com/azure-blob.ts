export const Blob = jest.fn().mockImplementation(() => ({
    read: jest.fn(),
    exists: jest.fn(),
    optimisticUpdate: jest.fn(),
}));
