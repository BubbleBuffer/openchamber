declare module "luxon" {
  export class DateTime {
    static local(): DateTime;
    static fromISO(text: string, opts?: { zone?: string }): DateTime;
    static fromMillis(ms: number, opts?: { zone?: string }): DateTime;
    static fromFormat(text: string, fmt: string, opts?: { zone?: string }): DateTime;
    get isValid(): boolean;
    get zoneName(): string;
    get weekday(): number;
    set(values: Record<string, number>): DateTime;
    plus(values: Record<string, number>): DateTime;
    toFormat(fmt: string): string;
    toMillis(): number;
    toISO(): string | null;
    toObject(): Record<string, number>;
    static now(): DateTime;
  }

  export class IANAZone {
    static isValidZone(zone: string): boolean;
    static create(zone: string): IANAZone;
  }
}
