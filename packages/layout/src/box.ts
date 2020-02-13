import { LayoutBox } from "./api";

export const layoutBox = (
    x: number,
    y: number,
    w: number,
    h: number,
    cw: number,
    ch: number,
    gap: number
): LayoutBox => ({ x, y, w, h, cw, ch, gap });
