/** Logo do Organizador: neurônio branco sobre fundo escuro (o mesmo desenho do favicon). */
export function NeuronLogo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Organizador">
      <defs>
        <radialGradient id="neuron-bg" cx="30%" cy="25%" r="90%">
          <stop offset="0" stopColor="#26262c" />
          <stop offset="1" stopColor="#08080a" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#neuron-bg)" />
      <g className="neuron-lines" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        <path strokeWidth="3.2" d="M26.5 22 C25.5 17 23 13.5 19 9.5" />
        <path strokeWidth="2.4" d="M22.6 14 L26 8.5" />
        <path strokeWidth="3.2" d="M21.5 28 C16.5 27 12.5 25 8.5 21" />
        <path strokeWidth="2.4" d="M13 24.8 L9.5 29.5" />
        <path strokeWidth="3.2" d="M33.5 23 C36.5 18.5 40 15.5 45 13.5" />
        <path strokeWidth="2.4" d="M39.6 16 L40.5 9.5" />
        <path strokeWidth="3.2" d="M23.5 34 C20 38.5 16.5 41.5 11.5 43.5" />
        <path strokeWidth="2.4" d="M17.4 40 L18.5 46.5" />
        <path strokeWidth="2.6" d="M34 34 L48 48" />
        <path strokeWidth="5" d="M37.2 37.2 L39.6 39.6 M42.4 42.4 L44.8 44.8" />
        <path strokeWidth="2.4" d="M48 48 L56 49 M48 48 L50 56 M48 48 L54.5 54.5" />
      </g>
      <g className="neuron-synapses" fill="#fff">
        <circle cx="56" cy="49" r="2" />
        <circle cx="50" cy="56" r="2" />
        <circle cx="54.5" cy="54.5" r="2" />
      </g>
      <circle className="neuron-soma" cx="28.5" cy="28.5" r="8" fill="#fff" />
      <circle cx="28.5" cy="28.5" r="2.8" fill="#0b0b0e" />
    </svg>
  );
}
