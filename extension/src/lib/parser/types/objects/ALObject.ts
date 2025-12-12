import { ALUniqueEntity } from "../syntax/ALUniqueEntity";

export interface ALObject extends ALUniqueEntity {
    path: string;
    type: string;
    idRange: [number, number];
    fields?: ALUniqueEntity[];
    values?: ALUniqueEntity[];
    properties?: {
        [key: string]: string;
    };
    extends?: string;
    hasError?: boolean;
    error?: string;
}

