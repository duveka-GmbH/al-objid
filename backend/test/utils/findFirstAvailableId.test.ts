import { findFirstAvailableId } from "../../src/utils/findFirstAvailableId";
import { Range } from "../../src/types";

describe("findFirstAvailableId", () => {
    describe("empty ids array", () => {
        it("should return first number from first range when ids array is empty", () => {
            const ranges: Range[] = [{ from: 1, to: 10 }];
            const ids: number[] = [];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(1);
        });

        it("should return from value of first range regardless of range values", () => {
            const ranges: Range[] = [{ from: 100, to: 200 }];
            const ids: number[] = [];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(100);
        });

        it("should return from value when multiple ranges exist", () => {
            const ranges: Range[] = [
                { from: 50, to: 60 },
                { from: 100, to: 200 },
            ];
            const ids: number[] = [];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(50);
        });
    });

    describe("single range scenarios", () => {
        it("should return first available when first id is consumed", () => {
            const ranges: Range[] = [{ from: 1, to: 10 }];
            const ids = [1];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(2);
        });

        it("should return first number when consumed ids start after range start", () => {
            const ranges: Range[] = [{ from: 1, to: 10 }];
            const ids = [5, 6, 7];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(1);
        });

        it("should find gap in consecutive consumed ids", () => {
            const ranges: Range[] = [{ from: 1, to: 10 }];
            const ids = [1, 2, 3, 5, 6];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(4);
        });

        it("should return next after last consumed when all before are consumed", () => {
            const ranges: Range[] = [{ from: 1, to: 10 }];
            const ids = [1, 2, 3, 4, 5];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(6);
        });

        it("should return 0 when entire range is consumed", () => {
            const ranges: Range[] = [{ from: 1, to: 3 }];
            const ids = [1, 2, 3];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(0);
        });

        it("should return from when ids are all outside range (higher)", () => {
            const ranges: Range[] = [{ from: 1, to: 10 }];
            const ids = [100, 200, 300];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(1);
        });
    });

    describe("multiple ranges scenarios", () => {
        it("should continue to second range when first is exhausted", () => {
            const ranges: Range[] = [
                { from: 1, to: 3 },
                { from: 10, to: 20 },
            ];
            const ids = [1, 2, 3];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(10);
        });

        it("should find available in second range when first is exhausted", () => {
            const ranges: Range[] = [
                { from: 1, to: 3 },
                { from: 10, to: 20 },
            ];
            const ids = [1, 2, 3, 10, 11];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(12);
        });

        it("should return 0 when all ranges are exhausted", () => {
            const ranges: Range[] = [
                { from: 1, to: 2 },
                { from: 5, to: 6 },
            ];
            const ids = [1, 2, 5, 6];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(0);
        });

        it("should skip ids between ranges", () => {
            const ranges: Range[] = [
                { from: 1, to: 5 },
                { from: 100, to: 105 },
            ];
            const ids = [1, 2, 3, 50, 60, 70];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(4);
        });

        it("should find available in first range despite ids existing for second range", () => {
            const ranges: Range[] = [
                { from: 1, to: 10 },
                { from: 20, to: 30 },
            ];
            const ids = [1, 2, 20, 21, 22];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(3);
        });
    });

    describe("edge cases with ids array", () => {
        it("should handle ids array shorter than iterations needed", () => {
            const ranges: Range[] = [{ from: 1, to: 100 }];
            const ids = [1, 2];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(3);
        });

        it("should handle when running out of ids mid-range", () => {
            const ranges: Range[] = [{ from: 1, to: 10 }];
            const ids = [1, 2, 3];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(4);
        });

        it("should handle sparse ids array", () => {
            const ranges: Range[] = [{ from: 1, to: 100 }];
            const ids = [1, 10, 20, 30];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(2);
        });

        it("should handle single element range that is consumed", () => {
            const ranges: Range[] = [{ from: 5, to: 5 }];
            const ids = [5];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(0);
        });

        it("should handle single element range that is available", () => {
            const ranges: Range[] = [{ from: 5, to: 5 }];
            const ids = [4, 6];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(5);
        });
    });

    describe("performance-oriented scenarios", () => {
        it("should efficiently skip consumed ids below current range position", () => {
            const ranges: Range[] = [{ from: 100, to: 200 }];
            const ids = [1, 2, 3, 4, 5, 100, 101];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(102);
        });

        it("should handle ids that exactly match range boundaries", () => {
            const ranges: Range[] = [{ from: 10, to: 15 }];
            const ids = [10, 15];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(11);
        });

        it("should handle consecutive consumed ids at range start", () => {
            const ranges: Range[] = [{ from: 1, to: 10 }];
            const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(10);
        });
    });

    describe("algorithm correctness", () => {
        it("should correctly increment through ids while they are below j", () => {
            const ranges: Range[] = [{ from: 5, to: 10 }];
            const ids = [1, 2, 3, 4, 5];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(6);
        });

        it("should detect gap when id at position i is greater than j", () => {
            const ranges: Range[] = [{ from: 1, to: 10 }];
            const ids = [2, 3, 4];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(1);
        });

        it("should continue iteration when id equals j", () => {
            const ranges: Range[] = [{ from: 1, to: 5 }];
            const ids = [1, 2, 3];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(4);
        });

        it("should return j when all ids have been processed", () => {
            const ranges: Range[] = [{ from: 1, to: 10 }];
            const ids = [1, 2];

            const result = findFirstAvailableId(ranges, ids);

            expect(result).toBe(3);
        });
    });
});
