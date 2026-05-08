import { BubbleBackground } from '@/components/animate-ui/components/backgrounds/bubble';

type BubbleBackgroundDemoProps = {
  interactive: boolean;
};

export const BubbleBackgroundDemo = ({
  interactive,
}: BubbleBackgroundDemoProps) => {
  return (
    <BubbleBackground
      interactive={interactive}
      className="absolute inset-0 flex items-center justify-center rounded-xl"
    />
  );
};
