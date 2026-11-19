import { useState, type FormEvent, type ReactNode } from "react";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LifeBuoy,
  LoaderCircle,
  LogOut,
  Mail,
  Palette,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { requestOwnPasswordReset, updateOwnName } from "@/lib/portal.functions";
import { validateNewPassword } from "@/lib/learning-domain";
import type { PortalPreferences } from "@/lib/preferences";

export type SettingsAccount = {
  fullName: string;
  email: string;
  studentId: string;
  role: "student" | "admin";
  termsAcceptedAt: string | null;
  passwordChangedAt: string | null;
  passwordResetRequestedAt: string | null;
};

type Feedback = { kind: "success" | "error"; text: string } | null;

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatDate(value: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Date(time).toLocaleDateString(undefined, { dateStyle: "long" })
    : null;
}

export function SettingsCard({
  id,
  icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-card" aria-labelledby={id}>
      <header>
        <span className="settings-card-icon">{icon}</span>
        <div>
          <h2 id={id}>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="settings-card-body">{children}</div>
    </section>
  );
}

function FeedbackNote({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p
      className={`settings-note ${feedback.kind}`}
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      {feedback.kind === "success" && <Check aria-hidden="true" />}
      {feedback.text}
    </p>
  );
}

function ProfileSection({
  account,
  onAccountChanged,
}: {
  account: SettingsAccount;
  onAccountChanged: () => Promise<void>;
}) {
  const editable = account.role === "admin";
  const [name, setName] = useState(account.fullName);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const unchanged = name.trim() === account.fullName;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unchanged) return;
    setBusy(true);
    setFeedback(null);
    try {
      await updateOwnName({ data: { fullName: name } });
      await onAccountChanged();
      setFeedback({ kind: "success", text: "Your name has been updated." });
    } catch (error) {
      setFeedback({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard
      id="settings-profile"
      icon={<UserRound aria-hidden="true" />}
      title="Profile"
      description={
        editable
          ? "How you appear to other administrators."
          : "Your account details. Contact IV Consulting if anything here needs to change."
      }
    >
      <div className="settings-identity">
        <span className="student-avatar">
          {account.fullName.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div>
          <strong>{account.fullName}</strong>
          <span>
            {account.role === "admin" ? "Administrator" : `Student · ${account.studentId}`}
          </span>
        </div>
      </div>
      <dl className="settings-facts">
        <div>
          <dt>Email (used to sign in)</dt>
          <dd>{account.email || "—"}</dd>
        </div>
        {account.role === "student" && (
          <div>
            <dt>Student ID</dt>
            <dd>{account.studentId}</dd>
          </div>
        )}
        <div>
          <dt>Copyright notice accepted</dt>
          <dd>{formatDate(account.termsAcceptedAt) ?? "Not yet"}</dd>
        </div>
      </dl>
      {editable && (
        <form className="settings-form" onSubmit={(event) => void save(event)}>
          <label htmlFor="settings-name">Display name</label>
          <input
            id="settings-name"
            className="portal-input"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            required
          />
          <FeedbackNote feedback={feedback} />
          <div className="settings-actions">
            <button
              className="brand-button"
              type="submit"
              disabled={busy || unchanged || !name.trim()}
            >
              {busy && <LoaderCircle className="spin" aria-hidden="true" />} Save name
            </button>
          </div>
        </form>
      )}
    </SettingsCard>
  );
}

function AdminPasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const problem = next ? validateNewPassword(next) : null;
  const ready = current && next && !problem && next === confirmation && next !== current;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setFeedback(null);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (verifyError) throw new Error("Your current password is incorrect.");
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      setCurrent("");
      setNext("");
      setConfirmation("");
      setFeedback({ kind: "success", text: "Your password has been changed." });
    } catch (error) {
      setFeedback({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  const type = visible ? "text" : "password";
  return (
    <form className="settings-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="settings-current-password">Current password</label>
      <input
        id="settings-current-password"
        className="portal-input"
        type={type}
        autoComplete="current-password"
        autoCapitalize="none"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        required
      />
      <label htmlFor="settings-new-password">New password</label>
      <div className="password-field">
        <input
          id="settings-new-password"
          className="portal-input"
          type={type}
          autoComplete="new-password"
          autoCapitalize="none"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          aria-describedby="settings-password-hint"
          required
        />
        <button
          className="password-toggle"
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? "Hide passwords" : "Show passwords"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      <p className={`form-hint${problem ? " warn" : ""}`} id="settings-password-hint">
        {problem ?? "Use at least 10 characters with a letter and a number."}
      </p>
      <label htmlFor="settings-confirm-password">Confirm new password</label>
      <input
        id="settings-confirm-password"
        className="portal-input"
        type={type}
        autoComplete="new-password"
        autoCapitalize="none"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        required
      />
      {confirmation && next !== confirmation && (
        <p className="form-hint warn">The two passwords don’t match yet.</p>
      )}
      <FeedbackNote feedback={feedback} />
      <div className="settings-actions">
        <button className="brand-button" type="submit" disabled={busy || !ready}>
          {busy && <LoaderCircle className="spin" aria-hidden="true" />} Change password
        </button>
      </div>
    </form>
  );
}

function StudentPasswordRequest({
  account,
  onAccountChanged,
}: {
  account: SettingsAccount;
  onAccountChanged: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const requestedOn = formatDate(account.passwordResetRequestedAt);
  const changedOn = formatDate(account.passwordChangedAt);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await requestOwnPasswordReset({ data: { note } });
      await onAccountChanged();
      setAsking(false);
      setNote("");
    } catch (error) {
      setFeedback({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-password">
      <p className="settings-status">
        <KeyRound aria-hidden="true" />
        {changedOn
          ? `You created your own password on ${changedOn}.`
          : "You have created your own password."}
      </p>
      {requestedOn ? (
        <p className="settings-note pending" role="status">
          Reset requested on {requestedOn}. An administrator will give you a new temporary password;
          you’ll then choose a new one when you next sign in.
        </p>
      ) : asking ? (
        <form className="settings-form" onSubmit={(event) => void send(event)}>
          <label htmlFor="settings-reset-note">
            Message for the administrator <span>(optional)</span>
          </label>
          <textarea
            id="settings-reset-note"
            className="portal-input form-textarea"
            maxLength={300}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="For example: I think someone else knows my password."
          />
          <FeedbackNote feedback={feedback} />
          <div className="settings-actions">
            <button
              className="outline-button"
              type="button"
              onClick={() => setAsking(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="brand-button" type="submit" disabled={busy}>
              {busy && <LoaderCircle className="spin" aria-hidden="true" />} Send request
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="form-hint">
            For your security, passwords can only be changed once an administrator approves a reset.
          </p>
          <div className="settings-actions">
            <button className="outline-button" type="button" onClick={() => setAsking(true)}>
              <KeyRound aria-hidden="true" /> Ask for a password reset
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SecuritySection({
  account,
  onAccountChanged,
  onSignOutEverywhere,
}: {
  account: SettingsAccount;
  onAccountChanged: () => Promise<void>;
  onSignOutEverywhere: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function signOutEverywhere() {
    if (!window.confirm("Sign out of every device, including this one?")) return;
    setBusy(true);
    setFeedback(null);
    try {
      await onSignOutEverywhere();
    } catch (error) {
      setFeedback({ kind: "error", text: errorText(error) });
      setBusy(false);
    }
  }

  return (
    <SettingsCard
      id="settings-security"
      icon={<ShieldCheck aria-hidden="true" />}
      title="Password & security"
      description="Keep your account and the course materials safe."
    >
      {account.role === "admin" ? (
        <AdminPasswordForm email={account.email} />
      ) : (
        <StudentPasswordRequest account={account} onAccountChanged={onAccountChanged} />
      )}
      <div className="settings-divider" />
      <div className="settings-row">
        <div>
          <strong>Sign out everywhere</strong>
          <span>Ends your session on every phone, tablet and computer, including this one.</span>
        </div>
        <button
          className="outline-button"
          type="button"
          onClick={() => void signOutEverywhere()}
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle className="spin" aria-hidden="true" />
          ) : (
            <LogOut aria-hidden="true" />
          )}{" "}
          Sign out everywhere
        </button>
      </div>
      <FeedbackNote feedback={feedback} />
    </SettingsCard>
  );
}

function Switch({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="settings-row">
      <div>
        <strong id={`${id}-label`}>{label}</strong>
        <span id={`${id}-description`}>{description}</span>
      </div>
      <button
        id={id}
        className="switch"
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function PreferencesSection({
  preferences,
  onChange,
}: {
  preferences: PortalPreferences;
  onChange: (next: PortalPreferences) => void;
}) {
  return (
    <SettingsCard
      id="settings-display"
      icon={<Palette aria-hidden="true" />}
      title="Display & accessibility"
      description="Saved to your account, so they follow you to other devices."
    >
      <Switch
        id="pref-reduce-motion"
        label="Reduce animations"
        description="Turns off sliding, fading and counting effects."
        checked={preferences.reduceMotion}
        onChange={(reduceMotion) => onChange({ ...preferences, reduceMotion })}
      />
      <div className="settings-divider" />
      <Switch
        id="pref-large-text"
        label="Larger text"
        description="Makes text across the portal about 12% bigger."
        checked={preferences.largeText}
        onChange={(largeText) => onChange({ ...preferences, largeText })}
      />
    </SettingsCard>
  );
}

function SupportSection() {
  return (
    <SettingsCard
      id="settings-support"
      icon={<LifeBuoy aria-hidden="true" />}
      title="Help & support"
      description="Need a hand with your account or the course?"
    >
      <div className="settings-links">
        <a className="outline-button" href="mailto:inyapavhusiku@gmail.com">
          <Mail aria-hidden="true" /> inyapavhusiku@gmail.com
        </a>
        <a className="outline-button" href="tel:+27100017324">
          <Phone aria-hidden="true" /> +27 (0)10 001 7324
        </a>
      </div>
    </SettingsCard>
  );
}

export function SettingsPanel({
  account,
  preferences,
  onPreferencesChange,
  onAccountChanged,
  onSignOutEverywhere,
  children,
}: {
  account: SettingsAccount;
  preferences: PortalPreferences;
  onPreferencesChange: (next: PortalPreferences) => void;
  onAccountChanged: () => Promise<void>;
  onSignOutEverywhere: () => Promise<void>;
  children?: ReactNode;
}) {
  return (
    <div className="settings-panel">
      <ProfileSection
        key={account.fullName}
        account={account}
        onAccountChanged={onAccountChanged}
      />
      <SecuritySection
        account={account}
        onAccountChanged={onAccountChanged}
        onSignOutEverywhere={onSignOutEverywhere}
      />
      <PreferencesSection preferences={preferences} onChange={onPreferencesChange} />
      {children}
      <SupportSection />
    </div>
  );
}
