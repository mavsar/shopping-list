import {
  TabsContent as TabsContentPrimitive,
  TabsContents as TabsContentsPrimitive,
  TabsHighlightItem as TabsHighlightItemPrimitive,
  TabsHighlight as TabsHighlightPrimitive,
  TabsList as TabsListPrimitive,
  Tabs as TabsPrimitive,
  TabsTrigger as TabsTriggerPrimitive,
  type TabsContentProps as TabsContentPrimitiveProps,
  type TabsContentsProps as TabsContentsPrimitiveProps,
  type TabsListProps as TabsListPrimitiveProps,
  type TabsProps as TabsPrimitiveProps,
  type TabsTriggerProps as TabsTriggerPrimitiveProps,
} from '@/components/animate-ui/primitives/radix/tabs';
import { cn } from '@/lib/utils';

type TabsProps = TabsPrimitiveProps;

function Tabs({ className, ...props }: TabsProps) {
  return <TabsPrimitive className={cn('flex flex-col gap-2', className)} {...props} />;
}

type TabsListProps = TabsListPrimitiveProps;

function TabsList({ className, ...props }: TabsListProps) {
  return (
    <TabsHighlightPrimitive className="absolute inset-0 z-0 rounded-md border border-cyan-300/25 bg-[linear-gradient(120deg,rgba(34,211,238,0.16),rgba(59,130,246,0.2),rgba(139,92,246,0.22),rgba(236,72,153,0.18))] shadow-[0_8px_20px_rgba(59,130,246,0.18)]">
      <TabsListPrimitive
        className={cn('inline-flex w-fit items-center justify-center text-slate-300', className)}
        {...props}
      />
    </TabsHighlightPrimitive>
  );
}

type TabsTriggerProps = TabsTriggerPrimitiveProps;

function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return (
    <TabsHighlightItemPrimitive value={props.value} className="shrink-0">
      <TabsTriggerPrimitive
        className={cn(
          "inline-flex cursor-pointer h-[calc(100%-1px)] w-auto shrink-0 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium whitespace-nowrap text-slate-300 transition-colors duration-300 ease-in-out data-[state=active]:text-white focus-visible:outline-1 focus-visible:outline-cyan-300/45 focus-visible:ring-[3px] focus-visible:ring-cyan-300/35 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        {...props}
      />
    </TabsHighlightItemPrimitive>
  );
}

type TabsContentsProps = TabsContentsPrimitiveProps;

function TabsContents(props: TabsContentsProps) {
  return <TabsContentsPrimitive {...props} />;
}

type TabsContentProps = TabsContentPrimitiveProps;

function TabsContent({ className, ...props }: TabsContentProps) {
  return <TabsContentPrimitive className={cn('flex-1 outline-none', className)} {...props} />;
}

export {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
  type TabsContentProps,
  type TabsContentsProps,
  type TabsListProps,
  type TabsProps,
  type TabsTriggerProps,
};
