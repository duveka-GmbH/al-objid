import { ALToken } from "./types";

export interface CheckResponse {
    tokens: ALToken[];
    valid: boolean;
    semiColon: boolean;
}

