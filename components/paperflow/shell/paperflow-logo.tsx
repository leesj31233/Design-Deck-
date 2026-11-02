/** The PAPERFLOW mark: a page with a folded corner, its lines turning into a flow, on jade. */
export function PaperflowMark({ size = 36 }: { size?: number }) {
  return <svg className="pf-mark" width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
    <defs>
      <linearGradient id="pf-mark-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2a9d72"/><stop offset="1" stopColor="#17624a"/></linearGradient>
    </defs>
    <rect width="36" height="36" rx="10" fill="url(#pf-mark-bg)"/>
    <path d="M11 8.5h10.2l5.3 5.3V26a1.5 1.5 0 0 1-1.5 1.5H11A1.5 1.5 0 0 1 9.5 26V10A1.5 1.5 0 0 1 11 8.5Z" fill="#fff"/>
    <path d="M21.2 8.5v4.3a1 1 0 0 0 1 1h4.3" fill="#cfeee0"/>
    <path d="M13 16.2h8.5M13 19.4h6" stroke="#1f7a5a" strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M13 23.2c1.6-1.5 3.1-1.5 4.6 0s3.1 1.5 4.6 0" fill="none" stroke="#2a9d72" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>;
}

export function PaperflowWordmark({ size = 36 }: { size?: number }) {
  return <span className="pf-wordmark"><PaperflowMark size={size}/><span>PAPERFLOW<small>RESEARCH READER</small></span></span>;
}
