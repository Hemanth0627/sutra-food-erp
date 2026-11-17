export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Please sign in") => new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have permission to do this") => new AppError(403, "FORBIDDEN", message);
export const notFound = (what = "Record") => new AppError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (message: string, details?: unknown) => new AppError(409, "CONFLICT", message, details);

export interface StockShortage {
  itemId: string;
  itemName: string;
  unit: string;
  required: string;
  available: string;
  shortage: string;
}

export class InsufficientStockError extends AppError {
  constructor(public readonly shortages: StockShortage[]) {
    super(
      422,
      "INSUFFICIENT_STOCK",
      "Insufficient stock: " +
        shortages.map((s) => `${s.itemName} needs ${s.required} ${s.unit}, available ${s.available} (short ${s.shortage})`).join("; "),
      { shortages },
    );
  }
}
