import * as React from "react";

type UnknownProps = Record<string, unknown>;

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (value: T) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(value);
      else (ref as React.MutableRefObject<T | null>).current = value;
    }
  };
}

function mergeProps<TChild extends UnknownProps, TSlot extends UnknownProps>(
  childProps: TChild,
  slotProps: TSlot,
): TChild & TSlot {
  const merged: UnknownProps = { ...slotProps };
  for (const key in childProps) {
    const slotValue = slotProps[key as keyof TSlot];
    const childValue = childProps[key];
    if (/^on[A-Z]/.test(key) && typeof slotValue === "function" && typeof childValue === "function") {
      merged[key] = (...args: unknown[]) => {
        (childValue as (...a: unknown[]) => unknown)(...args);
        (slotValue as (...a: unknown[]) => unknown)(...args);
      };
    } else if (key === "className" && typeof slotValue === "string" && typeof childValue === "string") {
      merged[key] = `${childValue} ${slotValue}`;
    } else if (key === "style" && typeof slotValue === "object" && typeof childValue === "object") {
      merged[key] = { ...(childValue as object), ...(slotValue as object) };
    } else {
      merged[key] = childValue;
    }
  }
  return merged as TChild & TSlot;
}

export interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

export const Slot = React.forwardRef<HTMLElement, SlotProps>(function Slot(
  { children, ...slotProps },
  ref,
) {
  if (!React.isValidElement(children)) return null;
  const child = children as React.ReactElement<UnknownProps & { ref?: React.Ref<unknown> }>;
  const merged = mergeProps(child.props, slotProps as UnknownProps);
  return React.cloneElement(child, {
    ...merged,
    ref: mergeRefs(ref as React.Ref<unknown>, (child as unknown as { ref?: React.Ref<unknown> }).ref),
  });
});
