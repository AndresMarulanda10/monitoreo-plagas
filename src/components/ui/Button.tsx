import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className = '', children, ...props }: ButtonProps) {
  return <button className={`primary-button ${className}`.trim()} {...props}>{children}</button>;
}
