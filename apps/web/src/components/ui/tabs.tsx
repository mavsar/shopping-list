import { cva, cx } from "class-variance-authority";
import {
  Tabs as AnimateTabs,
  TabsList as AnimateTabsList,
  TabsTrigger as AnimateTabsTrigger
} from "../animate-ui/components/radix/tabs";

type SharedTabsItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

const sharedTabsClassName = cva("w-full min-w-0");
const sharedTabsScrollClassName = cva("min-w-0 overflow-x-auto overscroll-x-contain");
const sharedTabsListClassName = cva("inline-flex w-max flex-nowrap items-center");
const sharedTabsTriggerClassName = cva("h-8 rounded-md px-2.5 py-1 text-[11px] font-semibold");

type SharedTabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  items: SharedTabsItem[];
  className?: string;
  listClassName?: string;
  triggerClassName?: string;
};

export function SharedTabs({
  value,
  onValueChange,
  items,
  className,
  listClassName,
  triggerClassName
}: SharedTabsProps) {
  return (
    <AnimateTabs value={value} onValueChange={onValueChange} className={cx(sharedTabsClassName(), className)}>
      <div className={sharedTabsScrollClassName()}>
        <AnimateTabsList className={cx(sharedTabsListClassName(), listClassName)}>
          {items.map((item) => (
            <AnimateTabsTrigger
              key={item.value}
              value={item.value}
              disabled={item.disabled}
              className={cx(sharedTabsTriggerClassName(), triggerClassName)}
            >
              {item.label}
            </AnimateTabsTrigger>
          ))}
        </AnimateTabsList>
      </div>
    </AnimateTabs>
  );
}
