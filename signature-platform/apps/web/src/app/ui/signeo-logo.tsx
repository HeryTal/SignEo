type LogoProps = { className?: string };

export function SigneoMark({ className = "" }: LogoProps) {
  return <span className={`brand-mark signeo-mark ${className}`} aria-hidden="true">
    <svg viewBox="0 0 32 32" focusable="false">
      <path d="M10 5.5h9.4L24 10v15.5A2.5 2.5 0 0 1 21.5 28h-11A2.5 2.5 0 0 1 8 25.5v-17A3 3 0 0 1 10 5.5Z" />
      <path d="M19 5.5V10h5" />
      <path className="signeo-stroke" d="M12 20.2c1.4-3.6 3.4-4.5 4.8-2.2 1 1.6 1.8 2.1 3.2.2" />
      <circle cx="24.5" cy="22.5" r="2.2" />
    </svg>
  </span>;
}

export function SigneoLogo({ className = "" }: LogoProps) {
  return <span className={`signeo-logo ${className}`}><SigneoMark /><span className="signeo-wordmark">Signeo<span>.it</span></span></span>;
}
