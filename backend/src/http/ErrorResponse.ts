export class ErrorResponse extends Error {
    private _statusCode: number;

    public constructor(message: string, statusCode: number = 500) {
        super(message);
        this._statusCode = statusCode;
    }

    public get statusCode(): number {
        return this._statusCode;
    }
}
