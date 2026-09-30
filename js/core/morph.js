/**
 * SVG path morphing for paths authored with the same command structure
 * (same commands, same number of values). Interpolating the numbers gives a
 * smooth shape change without any library. Arc flags must match between the
 * two paths, and flags must be written with separators ("0 1", not "01").
 */

const TOKEN = /[MLHVCSQTAZ]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi;

/** Parses a path into `{ type, values }` commands. */
export function parsePath(d) {
  const tokens = String(d).match(TOKEN) ?? [];
  const commands = [];
  let current = null;
  for (const token of tokens) {
    if (/^[a-z]$/i.test(token)) {
      current = { type: token, values: [] };
      commands.push(current);
    } else {
      if (!current) throw new SyntaxError('A path must start with a command');
      current.values.push(Number(token));
    }
  }
  return commands;
}

/** Serialises commands back into a compact path string. */
export function serializePath(commands, digits = 2) {
  return commands
    .map((command) => command.type + command.values.map((v) => Number(v.toFixed(digits))).join(' '))
    .join(' ');
}

function assertCompatible(a, b) {
  if (a.length !== b.length) throw new Error(`Paths differ in length (${a.length} vs ${b.length} commands)`);
  a.forEach((command, i) => {
    const other = b[i];
    if (command.type !== other.type || command.values.length !== other.values.length) {
      throw new Error(`Command ${i} differs (${command.type}${command.values.length} vs ${other.type}${other.values.length})`);
    }
    // Arc parameters come in groups of seven: rx ry rotation large-arc sweep x y.
    // The two flags are booleans; they cannot be blended, so they must match.
    if (command.type === 'A' || command.type === 'a') {
      for (let j = 0; j + 6 < command.values.length; j += 7) {
        if (command.values[j + 3] !== other.values[j + 3] || command.values[j + 4] !== other.values[j + 4]) {
          throw new Error(`Command ${i} has arc flags that differ; arcs can only morph with identical flags`);
        }
      }
    }
  });
}

/** Returns `t => path` that blends from path `a` (t = 0) to path `b` (t = 1). */
export function createMorph(a, b, digits = 2) {
  const from = parsePath(a);
  const to = parsePath(b);
  assertCompatible(from, to);
  return (t) =>
    serializePath(
      from.map((command, i) => ({
        type: command.type,
        values: command.values.map((v, j) => v + (to[i].values[j] - v) * t),
      })),
      digits,
    );
}

/** One-shot interpolation between two compatible paths. */
export function interpolatePath(a, b, t, digits = 2) {
  return createMorph(a, b, digits)(t);
}
