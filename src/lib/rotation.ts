import type { Rect, Rotation } from '../store/editor';
export function rotatedSize(width: number, height: number, angle: Rotation) {
    return angle === 90 || angle === 270
        ? { width: height, height: width }
        : { width, height };
}
export function rotateRect(rect: Rect, sourceWidth: number, sourceHeight: number, angle: Rotation): Rect {
    switch (angle) {
        case 90:
            return { x: sourceHeight - rect.y - rect.height, y: rect.x, width: rect.height, height: rect.width };
        case 180:
            return { x: sourceWidth - rect.x - rect.width, y: sourceHeight - rect.y - rect.height, width: rect.width, height: rect.height };
        case 270:
            return { x: rect.y, y: sourceWidth - rect.x - rect.width, width: rect.height, height: rect.width };
        default:
            return { ...rect };
    }
}
export function unrotateRect(rect: Rect, sourceWidth: number, sourceHeight: number, angle: Rotation): Rect {
    const size = rotatedSize(sourceWidth, sourceHeight, angle);
    return rotateRect(rect, size.width, size.height, ((360 - angle) % 360) as Rotation);
}
export function drawRotatedView(ctx: CanvasRenderingContext2D, draw: (x: number, y: number, width: number, height: number) => void, view: Rect, sourceWidth: number, sourceHeight: number, rotation: Rotation, outputWidth: number, outputHeight: number) {
    const oriented = rotatedSize(sourceWidth, sourceHeight, rotation);
    ctx.save();
    ctx.clearRect(0, 0, outputWidth, outputHeight);
    ctx.beginPath();
    ctx.rect(0, 0, outputWidth, outputHeight);
    ctx.clip();
    ctx.scale(outputWidth / view.width, outputHeight / view.height);
    ctx.translate(-view.x, -view.y);
    ctx.translate(oriented.width / 2, oriented.height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    draw(-sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
    ctx.restore();
}
