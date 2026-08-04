import type { ReactNode } from 'react';

export interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'danger';
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  'aria-label'?: string;
}

export function Button({
  children,
  variant = 'primary',
  onClick,
  type = 'button',
  disabled = false,
  ...rest
}: ButtonProps) {
  const className = `gf-button gf-button--${variant}`;
  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
