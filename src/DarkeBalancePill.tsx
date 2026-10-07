import { useEffect, useState } from "react";
import {
  getDisplayedTankBalance,
  loadDisplayedTankBalance,
  subscribeDisplayedTankBalance,
  tankMoney,
} from "./tank";

type Props = {
  amount: number | null;
  className?: string;
};

export function useDisplayedTankBalance() {
  const [amount, setAmount] = useState(getDisplayedTankBalance);

  useEffect(() => subscribeDisplayedTankBalance(setAmount), []);

  useEffect(() => {
    void loadDisplayedTankBalance().catch(() => null);
  }, []);

  return amount;
}

export function DarkeBalancePill({ amount, className }: Props) {
  return (
    <span
      className={`darke-balance-pill${className ? ` ${className}` : ""}`}
      aria-live="polite"
      aria-label={amount == null ? "Darke Balance" : `Darke Balance ${tankMoney(amount)}`}
    >
      <span className="darke-balance-pill-value" style={{ fontWeight: 400 }}>
        {amount == null ? "—" : tankMoney(amount)}
      </span>
      <span className="darke-balance-pill-label">DARKE</span>
    </span>
  );
}
