import { LockStars } from "./LockStars";
import { PublicAuthHost, usePublicAuth, type AuthCreated } from "./PublicAuthHost";

type Props = {
  onHome: () => void;
  onPricing: () => void;
  onLoggedIn: (slug: string) => void;
  onAccountCreated: (result: AuthCreated) => void;
  onOpenLogin?: () => void;
};

const TIERS = [
  {
    id: "free",
    name: "FREE",
    price: "$0",
    recommended: false,
    seats: "TEAMS UP TO 2",
    subtext: "Owner + 1 Team Member",
    cta: "GET STARTED",
  },
  {
    id: "pro",
    name: "PRO",
    price: "$100",
    recommended: true,
    seats: "TEAMS UP TO 5",
    subtext: "($20 / per team member)",
    cta: "SELECT PRO",
  },
  {
    id: "business",
    name: "BUSINESS",
    price: "$300",
    recommended: false,
    seats: "TEAMS UP TO 25",
    subtext: "($12 / per team member)",
    cta: "SELECT BUSINESS",
  },
  {
    id: "enterprise",
    name: "ENTERPRISE",
    price: "$1,000",
    recommended: false,
    seats: "TEAMS UP TO 100",
    subtext: "($10 / per team member)",
    cta: "SELECT ENTERPRISE",
  },
] as const;

export function PricingPage({
  onHome,
  onPricing,
  onLoggedIn,
  onAccountCreated,
  onOpenLogin,
}: Props) {
  return (
    <div className="pricing">
      <LockStars />
      <div className="pricing-inner">
        <PublicAuthHost
          onHome={onHome}
          onPricing={onPricing}
          onOpenLogin={onOpenLogin}
          onLoggedIn={onLoggedIn}
          onAccountCreated={onAccountCreated}
        >
          <PricingPlans onHome={onHome} />
        </PublicAuthHost>
      </div>
    </div>
  );
}

function PricingPlans({ onHome }: { onHome: () => void }) {
  const { openSignup } = usePublicAuth();
  return (
    <main className="pricing-main">
      <p className="landing-badge">[ TRANSPARENT FLAT-RATE PRICING ]</p>
      <h1 className="pricing-title">SIMPLE, PREDICTABLE COST</h1>
      <p className="pricing-sub">
        Pay purely for the team capacity your operation needs.
      </p>

      <section className="pricing-grid" aria-label="Plans">
        {TIERS.map((tier) => (
          <article
            key={tier.id}
            className={`pricing-card${tier.recommended ? " is-rec" : ""}`}
          >
            <h2>
              {tier.name}
              {tier.recommended ? (
                <span className="pricing-rec">[ RECOMMENDED ]</span>
              ) : null}
            </h2>
            <p className="pricing-price">
              <span>{tier.price}</span>
              <small>/ month</small>
            </p>
            <p className="pricing-seats">{tier.seats}</p>
            <p className="pricing-seat-note">{tier.subtext}</p>
            <button
              type="button"
              className={`term-btn ${tier.recommended ? "term-btn-primary" : "term-btn-ghost"}`}
              onClick={openSignup}
            >
              {tier.cta}
            </button>
          </article>
        ))}
      </section>
      <button type="button" className="text-link pricing-home" onClick={onHome}>
        ← BACK TO HOME
      </button>
    </main>
  );
}
