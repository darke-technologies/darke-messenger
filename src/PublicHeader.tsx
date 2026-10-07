type Props = {
  onHome: () => void;
  onPricing: () => void;
  onLogin: () => void;
  onSignup: () => void;
};

export function PublicHeader({ onHome, onPricing, onLogin, onSignup }: Props) {
  return (
    <header className="landing-bar">
      <button type="button" className="landing-logo-btn" onClick={onHome} aria-label="DARKE home">
        <img className="landing-logo" src="/darke.png" alt="DARKE" draggable={false} />
      </button>
      <nav className="landing-nav" aria-label="Landing">
        <button type="button" className="landing-ghost" onClick={onPricing}>
          PRICING
        </button>
        <button type="button" className="landing-ghost" onClick={onLogin}>
          LOGIN
        </button>
        <button type="button" className="term-btn term-btn-emerald" onClick={onSignup}>
          START
        </button>
      </nav>
    </header>
  );
}
