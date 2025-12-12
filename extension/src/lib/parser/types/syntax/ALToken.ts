import { ALTokenType } from "../enums/ALTokenType";

export interface ALToken {
    type: ALTokenType;
    value: string;
    startsAt: {
        line: number;
        character: number;
    };
}

