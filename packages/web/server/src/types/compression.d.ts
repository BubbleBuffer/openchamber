declare module "compression" {
  import type { Request, Response, NextFunction } from "express";

  interface CompressionOptions {
    filter?: (req: Request, res: Response) => boolean;
    threshold?: number | string;
    level?: number;
    memLevel?: number;
    strategy?: number;
    windowBits?: number;
  }

  function compression(options?: CompressionOptions): (
    req: Request,
    res: Response,
    next: NextFunction
  ) => void;

  namespace compression {
    function filter(req: Request, res: Response): boolean;
  }

  export = compression;
}