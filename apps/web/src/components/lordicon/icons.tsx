import { LordIcon } from "./lord-icon";

type IconProps = {
  className?: string;
  size?: number;
  animate?: boolean | string;
  animateOnHover?: boolean | string;
  animation?: string;
  target?: string;
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

