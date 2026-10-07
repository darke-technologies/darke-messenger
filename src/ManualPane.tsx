import { useMemo, useState } from "react";
import { IconChevronDown } from "./icons";

type FaqItem = {
  id: string;
  section: string;
  q: string;
  a: string;
};

const FAQ: FaqItem[] = [
  {
    id: "what-id",
    section: "Cryptographic Identity & Auth",
    q: "What is a DARKE ID?",
    a: "Your DARKE ID is a unique 16-character cryptographic identifier. It replaces traditional email/username logins, eliminating account enumeration vectors and serving as the salt for local key generation.",
  },
  {
    id: "id-and-pass",
    section: "Cryptographic Identity & Auth",
    q: "Why do I need both a DARKE ID and a Password?",
    a: "DARKE ID identifies your account on the network. Your Password is a secret known strictly to you that unwraps your local AES-256 keys via Argon2id. Neither DARKE nor Supabase ever stores your password.",
  },
  {
    id: "lost-creds",
    section: "Cryptographic Identity & Auth",
    q: "What happens if I lose my DARKE ID or Password?",
    a: "Because DARKE is strictly zero-knowledge, there are no email reset links or admin backdoor recoveries. If you lose your credentials, your local encryption keys cannot be unwrapped. Always keep a secure backup.",
  },
  {
    id: "access-keys",
    section: "Teams & Access Keys",
    q: "How do Team and Channel Access Keys work?",
    a: "Admins generate temporary cryptographic keys (DARKE-WKS-... / DARKE-CHN-...) with strict seat limits and time-to-live expiration. Once redeemed or revoked, the key is permanently invalidated.",
  },
  {
    id: "id-visibility",
    section: "Teams & Access Keys",
    q: "Can other users see my DARKE ID in public rooms or chats?",
    a: "No. Teammates and external users only see your public @username, Display Name, and chosen avatar. Your DARKE ID is kept strictly local to your authentication terminal.",
  },
  {
    id: "vault-file",
    section: "Vault Security & Backups",
    q: "What is a .darke vault backup?",
    a: "A .darke file is an encrypted, offline container containing your local keyrings, settings, and cached message histories. It allows air-gapped recovery and instant migration across workstations.",
  },
  {
    id: "physical",
    section: "Vault Security & Backups",
    q: "Is my local vault safe if my laptop is physical compromised?",
    a: "Yes. All local data is encrypted at rest using AES-256-GCM. Without your secret Password, the vault file remains unreadable binary data.",
  },
];

export function ManualPane({ onHome }: { onHome?: () => void }) {
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<string[]>([]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return FAQ;
    return FAQ.filter(
      (row) =>
        row.q.toLowerCase().includes(needle) ||
        row.a.toLowerCase().includes(needle) ||
        row.section.toLowerCase().includes(needle),
    );
  }, [needle]);

  const sections = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, FaqItem[]>();
    for (const row of filtered) {
      if (!map.has(row.section)) {
        map.set(row.section, []);
        order.push(row.section);
      }
      map.get(row.section)!.push(row);
    }
    return order.map((title) => ({ title, items: map.get(title)! }));
  }, [filtered]);

  function toggle(id: string) {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id],
    );
  }

  return (
    <section className="page settings-page manual-page">
      <header className="page-head">
        <h2>DARKE OPERATOR MANUAL</h2>
        <p className="manual-sub">
          Zero-knowledge architecture, key safety, and workspace protocols.
        </p>
        {onHome ? (
          <button type="button" className="text-link manual-home" onClick={onHome}>
            ← BACK TO HOME
          </button>
        ) : null}
      </header>

      <label className="manual-search">
        <span className="sr-only">Search the manual</span>
        <input
          className="manual-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search FAQ…"
          aria-label="Search FAQ"
          spellCheck={false}
        />
      </label>

      {sections.length === 0 ? (
        <p className="muted">No matching entries.</p>
      ) : (
        sections.map((group) => (
          <section key={group.title} className="manual-section">
            <h3 className="manual-section-title">{group.title}</h3>
            {group.items.map((item) => {
              const open = needle ? true : openIds.includes(item.id);
              return (
                <article
                  key={item.id}
                  className={`manual-acc${open ? " is-open" : ""}`}
                >
                  <button
                    type="button"
                    className="manual-acc-toggle"
                    aria-expanded={open}
                    onClick={() => toggle(item.id)}
                  >
                    <span>Q: {item.q}</span>
                    <IconChevronDown />
                  </button>
                  {open ? <p className="manual-acc-body">{item.a}</p> : null}
                </article>
              );
            })}
          </section>
        ))
      )}
    </section>
  );
}
