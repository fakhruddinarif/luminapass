declare module "bwip-js" {
  export interface ToBufferOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    includetext?: boolean;
    textxalign?: "left" | "center" | "right";
  }

  export function toBuffer(options: ToBufferOptions): Promise<Buffer>;
}
