import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    /**
     * Render in a portal (default). Set false when the popover lives inside
     * another home-grown click-outside popover (e.g. the filter bar), where a
     * portaled node would be treated as an outside click and close the parent.
     */
    withPortal?: boolean;
  }
>(({ className, align = 'start', sideOffset = 4, withPortal = true, ...props }, ref) => {
  const content = (
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-auto rounded-lg border bg-popover p-0 text-popover-foreground shadow-lg outline-none',
        // Enter animation only — no exit animation, so Radix's Presence unmounts
        // the node immediately on close instead of leaving an invisible (opacity-0)
        // node lingering in the DOM waiting for an animationend that may not fire.
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  );
  return withPortal ? <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal> : content;
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
