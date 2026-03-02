declare module "d3-force-3d" {
  interface SimulationNode {
    id?: string | number;
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
    [key: string]: any;
  }

  interface SimulationLink {
    source: string | number | SimulationNode;
    target: string | number | SimulationNode;
    index?: number;
    [key: string]: any;
  }

  interface Force {
    (alpha: number): void;
  }

  interface ForceSimulation {
    tick(iterations?: number): ForceSimulation;
    nodes(): SimulationNode[];
    nodes(nodes: SimulationNode[]): ForceSimulation;
    alpha(): number;
    alpha(alpha: number): ForceSimulation;
    alphaMin(): number;
    alphaMin(min: number): ForceSimulation;
    alphaDecay(): number;
    alphaDecay(decay: number): ForceSimulation;
    alphaTarget(): number;
    alphaTarget(target: number): ForceSimulation;
    velocityDecay(): number;
    velocityDecay(decay: number): ForceSimulation;
    force(name: string): any;
    force(name: string, force: any): ForceSimulation;
    numDimensions(): number;
    numDimensions(dimensions: number): ForceSimulation;
    stop(): ForceSimulation;
    restart(): ForceSimulation;
    on(typenames: string, listener?: (...args: any[]) => void): ForceSimulation;
  }

  interface ForceManyBody {
    (alpha: number): void;
    strength(): number;
    strength(strength: number | ((d: any, i: number) => number)): ForceManyBody;
    distanceMin(): number;
    distanceMin(distance: number): ForceManyBody;
    distanceMax(): number;
    distanceMax(distance: number): ForceManyBody;
    theta(): number;
    theta(theta: number): ForceManyBody;
  }

  interface ForceLink {
    (alpha: number): void;
    links(): SimulationLink[];
    links(links: SimulationLink[]): ForceLink;
    id(): (node: any) => string | number;
    id(id: (node: any) => string | number): ForceLink;
    distance(): number;
    distance(distance: number | ((d: any, i: number) => number)): ForceLink;
    strength(): number;
    strength(strength: number | ((d: any, i: number) => number)): ForceLink;
    iterations(): number;
    iterations(iterations: number): ForceLink;
  }

  interface ForceCenter {
    (alpha: number): void;
    x(): number;
    x(x: number): ForceCenter;
    y(): number;
    y(y: number): ForceCenter;
    z(): number;
    z(z: number): ForceCenter;
    strength(): number;
    strength(strength: number): ForceCenter;
  }

  interface ForceCollide {
    (alpha: number): void;
    radius(): number;
    radius(radius: number | ((d: any, i: number) => number)): ForceCollide;
    strength(): number;
    strength(strength: number): ForceCollide;
    iterations(): number;
    iterations(iterations: number): ForceCollide;
  }

  export function forceSimulation(nodes?: SimulationNode[]): ForceSimulation;
  export function forceManyBody(): ForceManyBody;
  export function forceLink(links?: SimulationLink[]): ForceLink;
  export function forceCenter(x?: number, y?: number, z?: number): ForceCenter;
  export function forceCollide(radius?: number): ForceCollide;
  export function forceX(x?: number): any;
  export function forceY(y?: number): any;
  export function forceZ(z?: number): any;
  export function forceRadial(radius?: number, x?: number, y?: number, z?: number): any;
}
