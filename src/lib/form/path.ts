/** Small helpers for forms that edit one nested object (organiser wizard). Pure, immutable, tested. */
export type Path = ReadonlyArray<string | number>;

export function getIn(obj: unknown, path: Path): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

/** Returns a copy of `obj` with `value` at `path`; missing containers are created (numbers → arrays). */
export function setIn<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const base: Record<string | number, unknown> | unknown[] = Array.isArray(obj)
    ? [...obj]
    : obj && typeof obj === "object"
      ? { ...(obj as Record<string, unknown>) }
      : typeof head === "number"
        ? []
        : {};
  (base as Record<string | number, unknown>)[head] = setIn((base as Record<string | number, unknown>)[head], rest, value);
  return base as T;
}

/** Copy without the key (or array element) at `path`. */
export function removeIn<T>(obj: T, path: Path): T {
  if (path.length === 0) return obj;
  const parent = getIn(obj, path.slice(0, -1));
  const last = path[path.length - 1];
  if (Array.isArray(parent) && typeof last === "number") {
    return setIn(obj, path.slice(0, -1), parent.filter((_, i) => i !== last));
  }
  if (parent && typeof parent === "object") {
    const { [last]: _gone, ...rest } = parent as Record<string | number, unknown>;
    void _gone;
    return setIn(obj, path.slice(0, -1), rest);
  }
  return obj;
}

/** Moves array element `from` to `to` inside the array at `path`. */
export function moveIn<T>(obj: T, path: Path, from: number, to: number): T {
  const arr = getIn(obj, path);
  if (!Array.isArray(arr) || from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return obj;
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return setIn(obj, path, copy);
}

export const pathKey = (path: Path): string => path.join(".");

/** Zod issues → { "settings.readyCallMin": "message" }; the first message per field wins. */
export function issuesToMap(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = pathKey(i.path.map((p) => (typeof p === "symbol" ? String(p) : p)));
    out[key] ??= i.message;
  }
  return out;
}
