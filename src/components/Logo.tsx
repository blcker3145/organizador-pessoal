/** Logo do Organizador: neurônio branco de formas orgânicas sobre fundo escuro (mesmo desenho do favicon). */
export function NeuronLogo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Organizador">
      <rect width="64" height="64" rx="14" fill="#0a0a0c" />
      <g fill="#fff" transform="translate(32.8 32.4) scale(0.9)">
        <circle cx="0" cy="0" r="6" />
        <path transform="rotate(-150)" d="M0 -7.55 C5.4 -5.55 7 -2.05 13 -2.05 L23.95 -2.05 A2.05 2.05 0 0 1 23.95 2.05 L13 2.05 C7 2.05 5.4 5.55 0 7.55 Z" />
        <path transform="rotate(-90)" d="M0 -6.15 C5.4 -4.15 7 -2.05 10.2 -2.05 L15.95 -2.05 A2.05 2.05 0 0 1 15.95 2.05 L10.2 2.05 C7 2.05 5.4 4.15 0 6.15 Z" />
        <path transform="rotate(-60)" d="M0 -6.95 C5.4 -4.95 7 -2.05 11.8 -2.05 L18.95 -2.05 A2.05 2.05 0 0 1 18.95 2.05 L11.8 2.05 C7 2.05 5.4 4.95 0 6.95 Z" />
        <path transform="rotate(0)" d="M0 -6.35 C5.4 -4.35 7 -2.05 10.6 -2.05 L18.45 -2.05 A2.05 2.05 0 0 1 18.45 2.05 L10.6 2.05 C7 2.05 5.4 4.35 0 6.35 Z" />
        <path transform="rotate(30)" d="M0 -7.25 C5.4 -5.25 7 -2.05 12.4 -2.05 L15.45 -2.05 A2.05 2.05 0 0 1 15.45 2.05 L12.4 2.05 C7 2.05 5.4 5.25 0 7.25 Z" />
        <path transform="rotate(90)" d="M0 -6.15 C5.4 -4.15 7 -2.05 10.2 -2.05 L16.45 -2.05 A2.05 2.05 0 0 1 16.45 2.05 L10.2 2.05 C7 2.05 5.4 4.15 0 6.15 Z" />
        <path transform="rotate(120)" d="M0 -7.55 C5.4 -5.55 7 -2.05 13 -2.05 L22.95 -2.05 A2.05 2.05 0 0 1 22.95 2.05 L13 2.05 C7 2.05 5.4 5.55 0 7.55 Z" />
        <path transform="rotate(180)" d="M0 -6.25 C5.4 -4.25 7 -2.05 10.4 -2.05 L14.45 -2.05 A2.05 2.05 0 0 1 14.45 2.05 L10.4 2.05 C7 2.05 5.4 4.25 0 6.25 Z" />
      </g>
    </svg>
  );
}
