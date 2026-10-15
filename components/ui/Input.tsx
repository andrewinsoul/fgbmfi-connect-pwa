import { useState, type InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Adds a Show/Hide control when the input type is password. */
  showPasswordToggle?: boolean;
};

export default function Input({
  type = "text",
  showPasswordToggle = false,
  className = "",
  ...props
}: InputProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const canTogglePassword = type === "password" && showPasswordToggle;

  const input = (
    <input
      {...props}
      type={canTogglePassword && passwordVisible ? "text" : type}
      className={[className, canTogglePassword ? "password-input" : ""]
        .filter(Boolean)
        .join(" ")}
    />
  );

  if (!canTogglePassword) return input;

  return (
    <span className="password-input-wrapper">
      {input}
      <button
        type="button"
        className="password-input-toggle"
        aria-label={passwordVisible ? "Hide password" : "Show password"}
        aria-pressed={passwordVisible}
        onClick={() => setPasswordVisible((visible) => !visible)}
      >
        {passwordVisible ? "Hide" : "Show"}
      </button>
    </span>
  );
}
