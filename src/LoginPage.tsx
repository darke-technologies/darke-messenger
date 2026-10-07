import { LockStars } from "./LockStars";
import { DarkeLoginModal } from "./DarkeLoginModal";
import { PublicHeader } from "./PublicHeader";

type Props = {
  onHome: () => void;
  onPricing: () => void;
  onSignup: () => void;
  onLoggedIn: (slug: string) => void;
};

export function LoginPage({ onHome, onPricing, onSignup, onLoggedIn }: Props) {
  return (
    <div className="login-star-page">
      <LockStars />
      <div className="login-star-inner">
        <PublicHeader
          onHome={onHome}
          onPricing={onPricing}
          onLogin={() => undefined}
          onSignup={onSignup}
        />
        <div className="login-star-stage">
          <DarkeLoginModal open inline onLoggedIn={onLoggedIn} />
        </div>
      </div>
    </div>
  );
}
