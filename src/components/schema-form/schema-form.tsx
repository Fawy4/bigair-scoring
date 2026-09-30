"use client";

import { useEffect, useState } from "react";
import { FieldLabel, HelpButton } from "@/components/help-button";
import { defaultValueFor, friendlyMessage, type FieldNode } from "@/lib/schema-form/nodes";
import { copy } from "@/lib/ui-copy";
import { getIn, moveIn, removeIn, setIn } from "@/lib/form/path";

type Path = (string | number)[];
/** Lets a screen offer a fixed list for a field (e.g. the rounds a place can be sent to). `path` is the concrete path of the field. */
/** Lets a screen supply a ready-made new list row (e.g. a valid new round) instead of the generic blank one. */
export type NewItem = (patternKey: string, root: unknown) => unknown | undefined;
export type SelectOptions = (patternKey: string, root: unknown, path: (string | number)[]) => string[] | null;

interface Ctx {
  root: unknown;
  set: (path: Path, value: unknown) => void;
  remove: (path: Path) => void;
  move: (path: Path, from: number, to: number) => void;
  errors: Record<string, string>;
  selectOptions?: SelectOptions;
  newItem?: NewItem;
}

const idOf = (path: Path) => `sf-${path.join("-")}`;
const errorOf = (ctx: Ctx, path: Path) => {
  const m = ctx.errors[path.join(".")];
  return m ? friendlyMessage(m) : undefined;
};

function Label({ node, path, text }: { node: FieldNode; path: Path; text?: string }) {
  return <FieldLabel htmlFor={idOf(path)} text={text ?? node.label} help={node.help ? { text: node.help, example: node.example } : undefined} />;
}

function Err({ ctx, path }: { ctx: Ctx; path: Path }) {
  const e = errorOf(ctx, path);
  return e ? <p className="field-error">{copy.common.problem(e)}</p> : null;
}

const isSection = (n: FieldNode) => n.kind === "object" || n.kind === "list" || n.kind === "choice" || n.kind === "nullable" || n.kind === "record";

/** The generated form. `hidden` drops top-level fields; everything else in the schema is reachable. */
export function SchemaForm({
  node,
  value,
  onChange,
  errors,
  readOnly,
  hidden = [],
  selectOptions,
  newItem,
}: {
  node: FieldNode;
  value: unknown;
  onChange: (v: unknown) => void;
  errors: Record<string, string>;
  readOnly?: boolean;
  hidden?: string[];
  selectOptions?: SelectOptions;
  newItem?: NewItem;
}) {
  if (node.kind !== "object") return null;
  const ctx: Ctx = {
    root: value,
    set: (path, v) => onChange(setIn(value, path, v)),
    remove: (path) => onChange(removeIn(value, path)),
    move: (path, from, to) => onChange(moveIn(value, path, from, to)),
    errors,
    selectOptions,
    newItem,
  };
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-4">
      {node.fields
        .filter((f) => !hidden.includes(f.key))
        .map((f) => {
          const anyError = Object.keys(errors).some((k) => k === f.key || k.startsWith(`${f.key}.`));
          return isSection(f) ? (
            <details key={f.key} className="panel" open={anyError || undefined}>
              <summary className="cursor-pointer text-lg font-extrabold">
                {f.label}
                {anyError ? <span className="field-error"> {copy.common.needsAttention}</span> : null}
              </summary>
              <div className="mt-3 flex flex-col gap-4">
                {f.help && f.kind !== "nullable" ? <HelpRow what={f.label} help={{ text: f.help, example: f.example }} /> : null}
                <FieldView node={f} path={[f.key]} ctx={ctx} bare />
              </div>
            </details>
          ) : (
            <div key={f.key} className="flex flex-col gap-1">
              <FieldView node={f} path={[f.key]} ctx={ctx} />
            </div>
          );
        })}
    </fieldset>
  );
}

function FieldView({ node, path, ctx, bare }: { node: FieldNode; path: Path; ctx: Ctx; bare?: boolean }) {
  const value = getIn(ctx.root, path);
  const set = (v: unknown) => ctx.set(path, v);

  switch (node.kind) {
    case "object":
      return (
        <div className={bare ? "flex flex-col gap-4" : "flex flex-col gap-3 rounded-lg border-2 border-[#111] p-3"}>
          {bare ? null : <FieldLabel as="span" text={node.label} help={node.help ? { text: node.help, example: node.example } : undefined} />}
          {node.fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <FieldView node={f} path={[...path, f.key]} ctx={ctx} />
            </div>
          ))}
          <Err ctx={ctx} path={path} />
        </div>
      );

    case "string": {
      const choices = ctx.selectOptions?.(node.pattern.join("."), ctx.root, path);
      if (choices) {
        return (
          <>
            <Label node={node} path={path} />
            <select id={idOf(path)} value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value)}>
              {typeof value === "string" && value !== "" && !choices.includes(value) ? <option value={value}>{copy.common.unknownOption(value)}</option> : null}
              {value === undefined || value === "" ? <option value="">{copy.common.choose}</option> : null}
              {choices.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Err ctx={ctx} path={path} />
          </>
        );
      }
      return (
        <>
          <Label node={node} path={path} />
          <input
            id={idOf(path)}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => (e.target.value === "" && !node.required ? ctx.remove(path) : set(e.target.value))}
            aria-invalid={Boolean(errorOf(ctx, path))}
          />
          <Err ctx={ctx} path={path} />
        </>
      );
    }

    case "number":
      return (
        <>
          <Label node={node} path={path} />
          <input
            id={idOf(path)}
            type="number"
            inputMode="decimal"
            step={node.integer ? 1 : "any"}
            min={node.min}
            value={typeof value === "number" && !Number.isNaN(value) ? value : ((value as string | undefined) ?? "")}
            onChange={(e) => (e.target.value === "" ? (node.required ? set("") : ctx.remove(path)) : set(Number(e.target.value)))}
            aria-invalid={Boolean(errorOf(ctx, path))}
          />
          <Err ctx={ctx} path={path} />
        </>
      );

    case "boolean":
      return (
        <>
          <span className="flex items-start gap-2">
            <label className="flex items-center gap-3">
              <input id={idOf(path)} type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} />
              {node.label}
            </label>
            {node.help ? <HelpButton what={node.label} help={{ text: node.help, example: node.example }} /> : null}
          </span>
          <Err ctx={ctx} path={path} />
        </>
      );

    case "enum": {
      const options = ctx.selectOptions?.(node.pattern.join("."), ctx.root, path);
      return (
        <>
          <Label node={node} path={path} />
          <select
            id={idOf(path)}
            value={value === undefined || value === null ? "" : String(value)}
            onChange={(e) => (e.target.value === "" && !node.required ? ctx.remove(path) : set(numericLike(node, e.target.value)))}
          >
            {!node.required || value === undefined ? <option value="">{node.required ? copy.common.choose : copy.common.notSet}</option> : null}
            {(options ? node.options.filter((o) => options.includes(o.value)) : node.options).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Err ctx={ctx} path={path} />
        </>
      );
    }

    case "fixed":
      return (
        <p className="font-semibold">
          {node.label}: <strong>{String(node.value)}</strong> {copy.common.fixedSuffix}
        </p>
      );

    case "list":
      return <ListView node={node} path={path} ctx={ctx} value={value} bare={bare} />;

    case "record": {
      const entries = value && typeof value === "object" ? Object.entries(value as Record<string, unknown>) : [];
      const keys = ctx.selectOptions?.(node.pattern.join("."), ctx.root, path);
      const free = keys ? keys.filter((k) => !entries.some(([e]) => e === k)) : [];
      return (
        <div className="flex flex-col gap-2">
          {bare ? null : <FieldLabel as="span" text={node.label} help={node.help ? { text: node.help, example: node.example } : undefined} />}
          {entries.map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-center gap-2">
              <span className="min-w-32 font-bold">{k}</span>
              <input
                aria-label={`${node.label}: ${k}`}
                type="number"
                min={1}
                step={1}
                value={typeof v === "number" ? v : ""}
                onChange={(e) => ctx.set([...path, k], e.target.value === "" ? "" : Number(e.target.value))}
                className="w-24"
              />
              <button type="button" className="btn btn-danger" onClick={() => ctx.remove([...path, k])}>
                {copy.common.remove}
              </button>
            </div>
          ))}
          {free.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {free.map((k) => (
                <button key={k} type="button" className="btn" onClick={() => ctx.set([...path, k], 2)}>
                  + {k}
                </button>
              ))}
            </div>
          ) : null}
          {keys && keys.length === 0 ? <p className="font-semibold">{copy.friendly.addCategoriesFirst}</p> : null}
          <Err ctx={ctx} path={path} />
        </div>
      );
    }

    case "choice": {
      const current = (value as Record<string, unknown> | undefined)?.[node.discriminator];
      const variant = node.variants.find((v) => v.value === current) ?? node.variants[0];
      return (
        <div className="flex flex-col gap-3">
          {bare ? null : <Label node={node} path={path} />}
          <select
            id={idOf(path)}
            aria-label={bare ? node.label : undefined}
            value={variant.value}
            onChange={(e) => {
              const next = node.variants.find((v) => v.value === e.target.value)!;
              set({ [node.discriminator]: next.value, ...(defaultValueFor(next.node) as object) });
            }}
          >
            {node.variants.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
          <div className="flex flex-col gap-3 rounded-lg border-2 border-[#111] p-3">
            {variant.node.fields.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <FieldView node={f} path={[...path, f.key]} ctx={ctx} />
              </div>
            ))}
            {variant.node.fields.length === 0 ? <p className="font-semibold">{copy.friendly.nothingMore}</p> : null}
          </div>
          <Err ctx={ctx} path={path} />
        </div>
      );
    }

    case "nullable": {
      const on = value !== null && value !== undefined;
      return (
        <div className="flex flex-col gap-3">
          <span className="flex items-start gap-2">
            <label className="flex items-center gap-3 font-bold">
              <input type="checkbox" checked={on} onChange={(e) => (e.target.checked ? set(defaultValueFor(node.inner)) : node.absent ? ctx.remove(path) : set(null))} />
              {on ? copy.friendly.use(node.label) : copy.friendly.offLabel(node.label, node.off)}
            </label>
            {node.help ? <HelpButton what={node.label} help={{ text: node.help, example: node.example }} /> : null}
          </span>
          {on ? <FieldView node={{ ...node.inner, label: node.label, help: undefined }} path={path} ctx={ctx} bare={node.inner.kind === "object"} /> : null}
          <Err ctx={ctx} path={path} />
        </div>
      );
    }

    case "orConst": {
      const isConst = value === node.constValue;
      return (
        <div className="flex flex-col gap-2">
          <span className="flex items-start gap-2">
            <label className="flex items-center gap-3 font-bold">
              <input type="checkbox" checked={isConst} onChange={(e) => set(e.target.checked ? node.constValue : defaultValueFor(node.inner))} />
              {copy.friendly.offLabel(node.label, node.off)}
            </label>
            {node.help ? <HelpButton what={node.label} help={{ text: node.help, example: node.example }} /> : null}
          </span>
          {isConst ? null : <FieldView node={{ ...node.inner, label: node.inner.kind === "list" ? node.label : copy.friendly.value, help: undefined }} path={path} ctx={ctx} />}
          <Err ctx={ctx} path={path} />
        </div>
      );
    }

    case "tuple":
      return (
        <div className="flex flex-col gap-2">
          <FieldLabel as="span" text={node.label} help={node.help ? { text: node.help, example: node.example } : undefined} />
          <div className="flex flex-wrap gap-3">
            {node.items.map((it, i) => (
              <div key={i} className="flex flex-col gap-1">
                <FieldView node={it} path={[...path, i]} ctx={ctx} />
              </div>
            ))}
          </div>
          <Err ctx={ctx} path={path} />
        </div>
      );

    case "json":
      return <p className="font-semibold">{copy.friendly.cannotEdit(node.label)}</p>;
  }
}

/** Numbers inside enums (e.g. "1" / "2" pool rounds) come back from a <select> as text. */
function numericLike(node: Extract<FieldNode, { kind: "enum" }>, raw: string): string | number {
  return node.options.every((o) => /^\d+$/.test(o.value)) ? Number(raw) : raw;
}

function ListView({ node, path, ctx, value, bare }: { node: Extract<FieldNode, { kind: "list" }>; path: Path; ctx: Ctx; value: unknown; bare?: boolean }) {
  const items = Array.isArray(value) ? value : [];
  const item = node.item;

  // Lists of plain numbers ("1, 0.75, 0.5") are typed as one comma-separated line.
  if (item.kind === "number") return <NumberListInput node={node} path={path} ctx={ctx} items={items} />;

  const optionsFor = ctx.selectOptions?.(item.pattern.join("."), ctx.root, [...path, "*"]);
  const singular = item.label;
  return (
    <div className="flex flex-col gap-3">
      {bare ? null : <FieldLabel as="span" text={node.label} help={node.help ? { text: node.help, example: node.example } : undefined} />}
      {items.length === 0 ? <p className="font-semibold">{copy.common.none}</p> : null}
      {items.map((_, i) => {
        const itemPath = [...path, i];
        const simple = item.kind === "string" || item.kind === "enum";
        return (
          <div key={i} className={simple ? "flex flex-wrap items-end gap-2" : "flex flex-col gap-3 rounded-lg border-2 border-[#111] p-3"}>
            <div className={simple ? "min-w-48 flex-1" : ""}>
              <FieldView node={{ ...item, label: `${singular} ${i + 1}`, help: undefined }} path={itemPath} ctx={ctx} bare />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" disabled={i === 0} aria-label={copy.divisions.moveUp(`${singular} ${i + 1}`)} onClick={() => ctx.move(path, i, i - 1)}>
                {copy.common.up}
              </button>
              <button type="button" className="btn" disabled={i === items.length - 1} aria-label={copy.divisions.moveDown(`${singular} ${i + 1}`)} onClick={() => ctx.move(path, i, i + 1)}>
                {copy.common.down}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={node.minItems !== undefined && items.length <= node.minItems}
                aria-label={`${copy.common.remove} ${singular} ${i + 1}`}
                onClick={() => ctx.remove(itemPath)}
              >
                {copy.common.remove}
              </button>
            </div>
          </div>
        );
      })}
      <div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            let fresh = ctx.newItem?.(node.pattern.join("."), ctx.root) ?? defaultValueFor(item);
            if (item.kind === "enum" && optionsFor) fresh = optionsFor.find((o) => !items.includes(o)) ?? optionsFor[0] ?? fresh;
            else if (item.kind === "enum") fresh = item.options.find((o) => !items.includes(o.value))?.value ?? fresh;
            ctx.set([...path, items.length], fresh);
          }}
        >
          {copy.common.addPrefix} {singular.toLowerCase()}
        </button>
      </div>
      <Err ctx={ctx} path={path} />
    </div>
  );
}

function NumberListInput({ node, path, ctx, items }: { node: Extract<FieldNode, { kind: "list" }>; path: Path; ctx: Ctx; items: unknown[] }) {
  const shown = items.join(", ");
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  // follow outside changes (a preset was switched) without fighting the typing
  useEffect(() => {
    setText((t) => (parseNumbers(t)?.join(", ") === shown ? t : shown));
  }, [shown]);
  return (
    <div className="flex flex-col gap-1">
      <Label node={node} path={path} />
      <input
        id={idOf(path)}
        value={text}
        inputMode="decimal"
        onChange={(e) => {
          setText(e.target.value);
          const nums = parseNumbers(e.target.value);
          setBad(nums === null);
          if (nums) ctx.set(path, nums);
        }}
        aria-invalid={bad}
      />
      {bad ? <p className="field-error">{copy.common.problem(copy.friendly.numbersList)}</p> : null}
      <Err ctx={ctx} path={path} />
    </div>
  );
}

function parseNumbers(text: string): number[] | null {
  const parts = text.split(/[,;\s]+/).filter(Boolean);
  const nums = parts.map(Number);
  return nums.some((n) => Number.isNaN(n)) ? null : nums;
}

function HelpRow({ what, help }: { what: string; help: { text: string; example?: string } }) {
  return (
    <div>
      <HelpButton what={what} help={help} />
    </div>
  );
}
