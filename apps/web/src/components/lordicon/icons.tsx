import { LordIcon, type LordIconTrigger } from "./lord-icon";

type IconProps = {
  className?: string;
  size?: number;
  animate?: boolean | string;
  animateOnHover?: boolean | string;
  animation?: string;
  target?: string;
  /** Lordicon tint, e.g. "primary:#fff,secondary:#fff". Defaults to ink. */
  colors?: string;
  trigger?: LordIconTrigger;
};

export function Plus(props: IconProps) {
  return <LordIcon src="/lordicon/plus.json" {...props} />;
}

export function Minus(props: IconProps) {
  return <LordIcon src="/lordicon/minus.json" {...props} />;
}

export function Search(props: IconProps) {
  return <LordIcon src="/lordicon/magnifier.json" {...props} />;
}

export function SettingsCog(props: IconProps) {
  return <LordIcon src="/lordicon/settings.json" {...props} />;
}

export const SlidersVertical = SettingsCog;

export function ArrowLeft(props: IconProps) {
  return <LordIcon src="/lordicon/arrow-left.json" {...props} />;
}

export function Trash2(props: IconProps) {
  return <LordIcon src="/lordicon/trash.json" {...props} />;
}

export function LogOut(props: IconProps) {
  return <LordIcon src="/lordicon/logout.json" {...props} />;
}

export function Login(props: IconProps) {
  return <LordIcon src="/lordicon/login.json" {...props} />;
}

export function CheckCheck(props: IconProps) {
  return <LordIcon src="/lordicon/check.json" {...props} />;
}

export function X(props: IconProps) {
  return <LordIcon src="/lordicon/x.json" {...props} />;
}

export function Edit(props: IconProps) {
  return <LordIcon src="/lordicon/edit.json" {...props} />;
}

export function GridList(props: IconProps) {
  return <LordIcon src="/lordicon/grid-list.json" {...props} />;
}

export function BookRecipes(props: IconProps) {
  return <LordIcon src="/lordicon/items.json" {...props} />;
}

export function ShoppingBasket(props: IconProps) {
  return <LordIcon src="/lordicon/basket.json" {...props} />;
}

export function ReadyToEat(props: IconProps) {
  return <LordIcon src="/lordicon/ready-to-eat.json" {...props} />;
}

export function ThumbDown(props: IconProps) {
  return <LordIcon src="/lordicon/thumb-down.json" {...props} />;
}

export function Sad(props: IconProps) {
  return <LordIcon src="/lordicon/sad.json" {...props} />;
}


export function ChevronDown(props: IconProps) {
  return <LordIcon src="/lordicon/chevron-down.json" {...props} />;
}

export function ChevronRight(props: IconProps) {
  return <LordIcon src="/lordicon/chevron-right.json" {...props} />;
}

export function ArrowRight(props: IconProps) {
  return <LordIcon src="/lordicon/arrow-right.json" {...props} />;
}

export function Refresh(props: IconProps) {
  return <LordIcon src="/lordicon/refresh.json" {...props} />;
}

export function Camera(props: IconProps) {
  return <LordIcon src="/lordicon/camera.json" {...props} />;
}

export function Copy(props: IconProps) {
  return <LordIcon src="/lordicon/copy.json" {...props} />;
}

export function ThumbUp(props: IconProps) {
  return <LordIcon src="/lordicon/thumb-up.json" {...props} />;
}
