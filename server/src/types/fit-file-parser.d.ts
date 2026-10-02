declare module "fit-file-parser" {
  interface FitParserOptions {
    force?: boolean;
    speedUnit?: string;
    lengthUnit?: string;
    temperatureUnit?: string;
    elapsedRecordField?: boolean;
    mode?: string;
    [key: string]: unknown;
  }

  export default class FitParser {
    constructor(options?: FitParserOptions);
    parse(
      content: Buffer | ArrayBuffer | string,
      callback: (err: Error | null, data: Record<string, any>) => void
    ): void;
  }
}
