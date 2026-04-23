import type { PathNode } from '../types';

export function getBezierPoint(
    t: number,
    p0: { x: number, y: number },
    p1: { x: number, y: number },
    p2: { x: number, y: number },
    p3: { x: number, y: number }
) {
    const cX = 3 * (p1.x - p0.x);
    const bX = 3 * (p2.x - p1.x) - cX;
    const aX = p3.x - p0.x - cX - bX;
    const cY = 3 * (p1.y - p0.y);
    const bY = 3 * (p2.y - p1.y) - cY;
    const aY = p3.y - p0.y - cY - bY;

    const x = aX * Math.pow(t, 3) + bX * Math.pow(t, 2) + cX * t + p0.x;
    const y = aY * Math.pow(t, 3) + bY * Math.pow(t, 2) + cY * t + p0.y;
    return { x, y };
}

export function getClosestPointOnPath(
    nodes: PathNode[],
    closed: boolean,
    x: number,
    y: number
): { segmentIndex: number, t: number, dist: number } | null {
    if (nodes.length < 2) return null;

    let minDist = Infinity;
    let bestMatch = null;
    
    const segmentsCount = closed ? nodes.length : nodes.length - 1;

    for (let i = 0; i < segmentsCount; i++) {
        const prev = nodes[i];
        const curr = nodes[(i + 1) % nodes.length];

        const p0 = { x: prev.x, y: prev.y };
        const p1 = { x: prev.cp2x ?? prev.x, y: prev.cp2y ?? prev.y };
        const p2 = { x: curr.cp1x ?? curr.x, y: curr.cp1y ?? curr.y };
        const p3 = { x: curr.x, y: curr.y };

        const STEPS = 40;
        for (let j = 0; j <= STEPS; j++) {
            const t = j / STEPS;
            const pt = getBezierPoint(t, p0, p1, p2, p3);
            const dist = Math.hypot(pt.x - x, pt.y - y);
            if (dist < minDist) {
                minDist = dist;
                bestMatch = { segmentIndex: i, t, dist };
            }
        }
    }
    return bestMatch;
}

/**
 * Splits a bezier segment using De Casteljau's algorithm and returns 
 * the modified nodes and the newly generated node.
 */
export function splitBezierSegment(
    prev: PathNode,
    curr: PathNode,
    t: number
): { prev: PathNode, newNode: Omit<PathNode, "id">, curr: PathNode } {
    const p0 = { x: prev.x, y: prev.y };
    const p1 = { x: prev.cp2x ?? prev.x, y: prev.cp2y ?? prev.y };
    const p2 = { x: curr.cp1x ?? curr.x, y: curr.cp1y ?? curr.y };
    const p3 = { x: curr.x, y: curr.y };

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const q0 = { x: lerp(p0.x, p1.x, t), y: lerp(p0.y, p1.y, t) };
    const q1 = { x: lerp(p1.x, p2.x, t), y: lerp(p1.y, p2.y, t) };
    const q2 = { x: lerp(p2.x, p3.x, t), y: lerp(p2.y, p3.y, t) };

    const r0 = { x: lerp(q0.x, q1.x, t), y: lerp(q0.y, q1.y, t) };
    const r1 = { x: lerp(q1.x, q2.x, t), y: lerp(q1.y, q2.y, t) };

    const b = { x: lerp(r0.x, r1.x, t), y: lerp(r0.y, r1.y, t) };

    const newPrev = { ...prev, cp2x: q0.x, cp2y: q0.y };
    
    let newNodeType: "smooth" | "corner" | "asymmetric" = "smooth";
    if (prev.cp2x === undefined && curr.cp1x === undefined) {
         newNodeType = "corner";
    }
    
    const newNode: Omit<PathNode, "id"> = {
        x: b.x,
        y: b.y,
        cp1x: r0.x,
        cp1y: r0.y,
        cp2x: r1.x,
        cp2y: r1.y,
        type: newNodeType
    };

    const newCurr = { ...curr, cp1x: q2.x, cp1y: q2.y };
    
    if (newNodeType === "corner") {
         (newPrev as Partial<PathNode>).cp2x = undefined; (newPrev as Partial<PathNode>).cp2y = undefined;
         (newNode as Partial<PathNode>).cp1x = undefined; (newNode as Partial<PathNode>).cp1y = undefined;
         (newNode as Partial<PathNode>).cp2x = undefined; (newNode as Partial<PathNode>).cp2y = undefined;
         (newCurr as Partial<PathNode>).cp1x = undefined; (newCurr as Partial<PathNode>).cp1y = undefined;
    }

    return { prev: newPrev, newNode, curr: newCurr };
}
