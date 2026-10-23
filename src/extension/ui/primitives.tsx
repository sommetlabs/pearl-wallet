import { Input } from "./components/input";
import { Button } from "./components/button";
import {
  cloneElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ArrowClockwiseIcon,
  ArrowDownLeftIcon,
  ArrowSquareOutIcon,
  ArrowUpRightIcon,
  ArrowsOutSimpleIcon,
  CaretLeftIcon,
  CheckIcon,
  ClockCounterClockwiseIcon,
  CopyIcon,
  GearSixIcon,
  GlobeHemisphereWestIcon,
  InfoIcon,
  LockSimpleIcon,
  WalletIcon,
  WarningCircleIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@phosphor-icons/react";
import darkLogo from "./assets/logotype-dark.svg?url";
import lightLogo from "./assets/logotype-light.svg?url";

export function Brand() {
  return (
    <div className="brand">
      <img
        className="logo-dark"
        src={darkLogo}
        alt="Abyss"
        width="96"
        height="20"
      />
      <img
        className="logo-light"
        src={lightLogo}
        alt="Abyss"
        width="96"
        height="20"
      />
      <span className="brand-product">Wallet</span>
    </div>
  );
}
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete = "current-password",
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: "new-password" | "current-password";
  autoFocus?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
          required
          maxLength={1024}
        />
        <Button
          type="button"
          className="icon"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
          variant="ghost"
          size="icon"
        >
          <Icon name={visible ? "eyeOff" : "eye"} />
        </Button>
      </div>
      {capsLock && <small role="status">Caps Lock is on</small>}
    </div>
  );
}

export function Field({
  label,
  children,
  help,
}: {
  label: string;
  children: ReactNode;
  help?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(
        children as ReactElement<{ id: string; "aria-describedby"?: string }>,
        { id, "aria-describedby": help ? `${id}-help` : undefined },
      )}
      {help && <small id={`${id}-help`}>{help}</small>}
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={error ? "notice error" : "notice"}
      role={error ? "alert" : "status"}
    >
      <Icon name={error ? "warning" : "info"} />
      <p>{children}</p>
    </div>
  );
}
export function Copy({
  value,
  label = "Copy address",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      className="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      variant="outline"
    >
      <Icon name={copied ? "check" : "copy"} />
      {copied ? "Copied" : label}
    </Button>
  );
}
const icons = {
  lock: LockSimpleIcon,
  expand: ArrowsOutSimpleIcon,
  refresh: ArrowClockwiseIcon,
  back: CaretLeftIcon,
  wallet: WalletIcon,
  activity: ClockCounterClockwiseIcon,
  settings: GearSixIcon,
  send: ArrowUpRightIcon,
  receive: ArrowDownLeftIcon,
  copy: CopyIcon,
  check: CheckIcon,
  network: GlobeHemisphereWestIcon,
  external: ArrowSquareOutIcon,
  info: InfoIcon,
  warning: WarningCircleIcon,
  eye: EyeIcon,
  eyeOff: EyeSlashIcon,
};
export function Icon({ name }: { name: keyof typeof icons }) {
  const Component = icons[name];
  return <Component size={18} weight="regular" aria-hidden="true" />;
}
