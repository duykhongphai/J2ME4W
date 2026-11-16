export interface MidpKey { code: number; name: string }

export const MIDP_KEYS: MidpKey[] = [
  { code: -1, name: 'Up' },
  { code: -2, name: 'Down' },
  { code: -3, name: 'Left' },
  { code: -4, name: 'Right' },
  { code: -5, name: 'Fire / OK' },
  { code: -6, name: 'Left soft key' },
  { code: -7, name: 'Right soft key' },
  { code: -8, name: 'Clear' },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => ({ code: 48 + d, name: `Key ${d}` })),
  { code: 42, name: 'Key *' },
  { code: 35, name: 'Key #' },
];

export const DEFAULT_BINDINGS: Record<number, string[]> = {
  [-1]: ['k:ArrowUp', 'p:12', 'a:1-'],
  [-2]: ['k:ArrowDown', 'p:13', 'a:1+'],
  [-3]: ['k:ArrowLeft', 'p:14', 'a:0-'],
  [-4]: ['k:ArrowRight', 'p:15', 'a:0+'],
  [-5]: ['k:Enter', 'k:Space', 'k:NumpadEnter', 'p:0'],
  [-6]: ['k:KeyQ', 'k:F1', 'p:4', 'p:8'],
  [-7]: ['k:KeyW', 'k:F2', 'p:5', 'p:9', 'p:1'],
  [-8]: ['k:Backspace', 'k:Delete'],
  42: ['k:KeyE', 'k:NumpadMultiply', 'p:2'],
  35: ['k:KeyR', 'k:NumpadDivide', 'p:3'],
};
for (let d = 0; d <= 9; d++) DEFAULT_BINDINGS[48 + d] = [`k:Digit${d}`, `k:Numpad${d}`];

export function bindingsFor(custom: Record<string, string[]>, code: number): string[] {
  return custom[String(code)] ?? DEFAULT_BINDINGS[code] ?? [];
}

export function buildBindingMap(custom: Record<string, string[]>): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of MIDP_KEYS) for (const b of bindingsFor(custom, k.code)) m.set(b, k.code);
  return m;
}

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3',
  'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];

export function bindingLabel(b: string): string {
  const [kind, v] = [b.slice(0, 1), b.slice(2)];
  if (kind === 'p') return `Pad ${PAD_NAMES[Number(v)] ?? v}`;
  if (kind === 'a') {
    const axis = Number(v.slice(0, -1)), dir = v.slice(-1);
    const names: Record<string, string> = { '0-': 'Stick left', '0+': 'Stick right', '1-': 'Stick up', '1+': 'Stick down',
      '2-': 'R-stick left', '2+': 'R-stick right', '3-': 'R-stick up', '3+': 'R-stick down' };
    return names[`${axis}${dir}`] ?? `Axis ${axis}${dir}`;
  }
  if (v.startsWith('Key')) return v.slice(3);
  if (v.startsWith('Digit')) return v.slice(5);
  if (v.startsWith('Numpad')) return 'Num ' + v.slice(6).replace('Multiply', '*').replace('Divide', '/').replace('Enter', 'Enter');
  if (v.startsWith('Arrow')) return `${v.slice(5)} arrow`;
  return v.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function readGamepads(): Set<string> {
  const out = new Set<string>();
  const pads = navigator.getGamepads?.() ?? [];
  for (const p of pads) {
    if (!p || !p.connected) continue;
    p.buttons.forEach((btn, i) => { if (btn.pressed || btn.value > 0.5) out.add(`p:${i}`); });
    p.axes.forEach((v, i) => {
      if (v < -0.5) out.add(`a:${i}-`);
      else if (v > 0.5) out.add(`a:${i}+`);
    });
  }
  return out;
}
