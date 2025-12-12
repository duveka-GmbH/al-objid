import { findAvailablePerRange } from "../../src/utils/findAvailablePerRange";
import { findFirstAvailableId } from "../../src/utils/findFirstAvailableId";
import { Range } from "../../src/types";

jest.mock("../../src/utils/findFirstAvailableId");

describe("findAvailablePerRange", () => {
    const mockFindFirstAvailableId = findFirstAvailableId as jest.MockedFunction<typeof findFirstAvailableId>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("basic functionality", () => {
        it("should return empty array when no ranges provided", () => {
            const result = findAvailablePerRange([], [1, 2, 3]);

            expect(result).toEqual([]);
            expect(mockFindFirstAvailableId).not.toHaveBeenCalled();
        });

        it("should call findFirstAvailableId for each range", () => {
            const ranges: Range[] = [
                { from: 1, to: 10 },
                { from: 20, to: 30 },
            ];
            const ids = [1, 2, 3];

            mockFindFirstAvailableId.mockReturnValueOnce(4).mockReturnValueOnce(20);

            findAvailablePerRange(ranges, ids);

            expect(mockFindFirstAvailableId).toHaveBeenCalledTimes(2);
            expect(mockFindFirstAvailableId).toHaveBeenNthCalledWith(1, [{ from: 1, to: 10 }], ids);
            expect(mockFindFirstAvailableId).toHaveBeenNthCalledWith(2, [{ from: 20, to: 30 }], ids);
        });

        it("should return available IDs for each range", () => {
            const ranges: Range[] = [
                { from: 1, to: 10 },
                { from: 20, to: 30 },
            ];
            const ids = [1, 2, 3, 20, 21];

            mockFindFirstAvailableId.mockReturnValueOnce(4).mockReturnValueOnce(22);

            const result = findAvailablePerRange(ranges, ids);

            expect(result).toEqual([4, 22]);
        });
    });

    describe("result filtering", () => {
        it("should include result when it equals range.from", () => {
            const ranges: Range[] = [{ from: 5, to: 10 }];
            const ids: number[] = [];

            mockFindFirstAvailableId.mockReturnValue(5);

            const result = findAvailablePerRange(ranges, ids);

            expect(result).toEqual([5]);
        });

        it("should include result when it equals range.to", () => {
            const ranges: Range[] = [{ from: 5, to: 10 }];
            const ids = [5, 6, 7, 8, 9];

            mockFindFirstAvailableId.mockReturnValue(10);

            const result = findAvailablePerRange(ranges, ids);

            expect(result).toEqual([10]);
        });

        it("should include result when it is within range boundaries", () => {
            const ranges: Range[] = [{ from: 1, to: 100 }];
            const ids = [1, 2, 3, 4, 5];

            mockFindFirstAvailableId.mockReturnValue(6);

            const result = findAvailablePerRange(ranges, ids);

            expect(result).toEqual([6]);
        });

        it("should exclude result when it is below range.from", () => {
            const ranges: Range[] = [{ from: 10, to: 20 }];
            const ids: number[] = [];

            mockFindFirstAvailableId.mockReturnValue(5);

            const result = findAvailablePerRange(ranges, ids);

            expect(result).toEqual([]);
        });

        it("should exclude result when it is above range.to", () => {
            const ranges: Range[] = [{ from: 10, to: 20 }];
            const ids: number[] = [];

            mockFindFirstAvailableId.mockReturnValue(25);

            const result = findAvailablePerRange(ranges, ids);

            expect(result).toEqual([]);
        });

        it("should exclude result when findFirstAvailableId returns 0 (no available)", () => {
            const ranges: Range[] = [{ from: 1, to: 3 }];
            const ids = [1, 2, 3];

            mockFindFirstAvailableId.mockReturnValue(0);

            const result = findAvailablePerRange(ranges, ids);

            expect(result).toEqual([]);
        });
    });

    describe("multiple ranges handling", () => {
        it("should process multiple ranges and filter results independently", () => {
            const ranges: Range[] = [
                { from: 1, to: 5 },
                { from: 10, to: 15 },
                { from: 20, to: 25 },
            ];
            const ids = [1, 2, 10, 11, 20, 21, 22];

            mockFindFirstAvailableId
                .mockReturnValueOnce(3)
                .mockReturnValueOnce(12)
                .mockReturnValueOnce(23);

            const result = findAvailablePerRange(ranges, ids);

            expect(result).toEqual([3, 12, 23]);
        });

        it("should return partial results when some ranges are exhausted", () => {
            const ranges: Range[] = [
                { from: 1, to: 3 },
                { from: 10, to: 15 },
            ];
            const ids = [1, 2, 3, 10];

            mockFindFirstAvailableId.mockReturnValueOnce(0).mockReturnValueOnce(11);

            const result = findAvailablePerRange(ranges, ids);

            expect(result).toEqual([11]);
        });

        it("should return empty array when all ranges are exhausted", () => {
            const ranges: Range[] = [
                { from: 1, to: 2 },
                { from: 5, to: 6 },
            ];
            const ids = [1, 2, 5, 6];

            mockFindFirstAvailableId.mockReturnValueOnce(0).mockReturnValueOnce(0);

            const result = findAvailablePerRange(ranges, ids);

            expect(result).toEqual([]);
        });
    });

    describe("edge cases", () => {
        it("should handle single-element ranges", () => {
            const ranges: Range[] = [{ from: 5, to: 5 }];
            const ids: number[] = [];

            mockFindFirstAvailableId.mockReturnValue(5);

            const result = findAvailablePerRange(ranges, ids);

            expect(result).toEqual([5]);
        });

        it("should handle empty ids array", () => {
            const ranges: Range[] = [{ from: 1, to: 10 }];
            const ids: number[] = [];

            mockFindFirstAvailableId.mockReturnValue(1);

            const result = findAvailablePerRange(ranges, ids);

            expect(result).toEqual([1]);
            expect(mockFindFirstAvailableId).toHaveBeenCalledWith([{ from: 1, to: 10 }], []);
        });

        it("should pass correct single-range array to findFirstAvailableId", () => {
            const ranges: Range[] = [
                { from: 100, to: 200 },
                { from: 300, to: 400 },
            ];
            const ids = [150, 350];

            mockFindFirstAvailableId.mockReturnValueOnce(100).mockReturnValueOnce(300);

            findAvailablePerRange(ranges, ids);

            expect(mockFindFirstAvailableId).toHaveBeenNthCalledWith(1, [{ from: 100, to: 200 }], ids);
            expect(mockFindFirstAvailableId).toHaveBeenNthCalledWith(2, [{ from: 300, to: 400 }], ids);
        });
    });
});
