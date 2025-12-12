export enum ALObjectType {
    codeunit = "codeunit",
    enum = "enum",
    enumextension = "enumextension",
    page = "page",
    pageextension = "pageextension",
    permissionset = "permissionset",
    permissionsetextension = "permissionsetextension",
    query = "query",
    report = "report",
    reportextension = "reportextension",
    table = "table",
    tableextension = "tableextension",
    xmlport = "xmlport"
}

export interface Authorization {
    key: string;
    user?: {
        name: string;
        email: string;
        timestamp: number;
    }
}

export interface Range {
    from: number;
    to: number;
}

export type ObjectConsumptions = {
    [key in ALObjectType]?: number[];
} & {
    [key: string]: number[];
}

export interface LogEntry {
    eventType: string;
    timestamp: number;
    user: string;
    data: any;
}

export type AppInfo = {
    _authorization?: Authorization;
    _ranges?: Range[];
    _upgrade?: string[];
} & ObjectConsumptions;

export interface PoolAppInfo {
    appId: string;
    name: string;
}

export interface PoolInfo {
    name: string;
    apps: PoolAppInfo[];
}

export type ChangeOperation = "getNext" | "syncMerge" | "syncFull" | "authorize" | "deauthorize" | "addAssignment" | "removeAssignment";
