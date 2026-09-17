/** Logo do Organizador: neurônio em traço de circuito, branco sobre fundo escuro (mesmo desenho do favicon). */
export function NeuronLogo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Organizador">
      <rect width="64" height="64" rx="14" fill="#0a0a0c" />
      <g fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="32" cy="32" r="7" />
        <path d="M27 27 L21 21 V14" />
        <path d="M37 27 L43 21 H49" />
        <path d="M25 32 H15" />
        <path d="M27 37 L21 43" />
        <path d="M37 37 L45 45 V50" />
      </g>
      <g fill="#fff">
        <circle cx="32" cy="32" r="2.6" />
        <circle cx="21" cy="12" r="2.6" />
        <circle cx="51" cy="21" r="2.6" />
        <circle cx="13" cy="32" r="2.6" />
        <circle cx="19.5" cy="44.5" r="2.6" />
        <circle cx="45" cy="52" r="2.6" />
      </g>
    </svg>
  );
}
