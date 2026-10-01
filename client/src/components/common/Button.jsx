export default function Button({
  children,
  variant = "default",
  size = "md",
  className = "",
  type = "button",
  ...props
}) {
  const classes = [
    "btn",
    variant === "primary" ? "primary" : "",
    size === "sm" ? "btn--sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
