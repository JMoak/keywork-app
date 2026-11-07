export interface Spring {
  readonly value: number;
  readonly velocity: number;
  readonly target: number;
  readonly halfLife: number;
}

export function spring(value: number, halfLife: number, target = value): Spring {
  return { value, velocity: 0, target, halfLife };
}

export function retarget(current: Spring, target: number): Spring {
  return current.target === target ? current : { ...current, target };
}

export function nudge(current: Spring, velocity: number): Spring {
  return { ...current, velocity: current.velocity + velocity };
}

export function stepSpring(current: Spring, dt: number): Spring {
  if (dt <= 0) return current;
  const damping = (4 * Math.LN2) / current.halfLife / 2;
  const offset = current.value - current.target;
  const momentum = current.velocity + offset * damping;
  const decay = Math.exp(-damping * dt);
  return {
    ...current,
    value: decay * (offset + momentum * dt) + current.target,
    velocity: decay * (current.velocity - momentum * damping * dt),
  };
}

export function settled(current: Spring, epsilon = 1e-3): boolean {
  return Math.abs(current.value - current.target) < epsilon && Math.abs(current.velocity) < epsilon;
}

export function snapped(current: Spring): Spring {
  return { ...current, value: current.target, velocity: 0 };
}
