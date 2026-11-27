import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type InputHTMLAttributes,
} from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Copy,
  FileText,
  GraduationCap,
  LoaderCircle,
  Lock,
  Phone,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  beginStudentRegistration,
  completeStudentRegistration,
  type StudentRegistrationInput,
} from "@/lib/portal.functions";
import { isValidSouthAfricanId } from "@/lib/learning-domain";

type StepId = "personal" | "education" | "documents" | "payment";
type DocumentKey = "identity" | "education" | "payment";
type Files = Record<DocumentKey, File | null>;

const STEPS: { id: StepId; title: string; summary: string }[] = [
  { id: "personal", title: "About you", summary: "Personal details" },
  { id: "education", title: "Study & work", summary: "Education and employment" },
  { id: "documents", title: "Documents", summary: "Three uploads" },
  { id: "payment", title: "Plan & sign", summary: "Payment and declaration" },
];

const DOCUMENTS: { key: DocumentKey; label: string; hint: string }[] = [
  {
    key: "identity",
    label: "Certified ID or passport",
    hint: "A certified copy of your ID (front and back) or the photo page of your passport.",
  },
  {
    key: "education",
    label: "Matric certificate or affidavit",
    hint: "Your Grade 12 certificate, or a signed affidavit if you don’t have it yet.",
  },
  {
    key: "payment",
    label: "Proof of payment",
    hint: "A receipt, transfer confirmation or payment slip.",
  },
];

const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
  "Outside South Africa",
];

const GENDERS = ["Male", "Female"];
const ETHNICITIES = ["African", "Coloured", "Indian", "White"];
const GRADE12_OPTIONS = [
  { value: "yes", label: "Yes, I passed Grade 12" },
  { value: "no", label: "No" },
];

const LANGUAGES = [
  "English",
  "Afrikaans",
  "isiZulu",
  "isiXhosa",
  "Sesotho",
  "Setswana",
  "Sepedi",
  "Xitsonga",
  "siSwati",
  "Tshivenda",
  "isiNdebele",
  "Other",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function describeProblem(
  element: HTMLInputElement | HTMLSelectElement,
  formatMessage: string | undefined,
) {
  const { validity } = element;
  if (validity.valid) return "";
  if (validity.valueMissing) return "This is required.";
  if (validity.typeMismatch) return "Enter a valid email address.";
  if (validity.customError) return element.validationMessage;
  return formatMessage ?? "Please check what you’ve entered.";
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function stepIsComplete(form: HTMLFormElement, id: StepId, files: Files) {
  if (id === "documents") return Boolean(files.identity && files.education && files.payment);
  const section = form.querySelector<HTMLElement>(`[data-step="${id}"]`);
  if (!section) return false;
  return Array.from(
    section.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"),
  ).every((control) => control.disabled || !control.willValidate || control.checkValidity());
}

type FieldProps = {
  label: string;
  name: string;
  hint?: string;
  formatMessage?: string;
  optional?: boolean;
  wide?: boolean;
  validate?: (value: string) => string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "id">;

function Field({
  label,
  name,
  hint,
  formatMessage,
  optional = false,
  wide = false,
  validate,
  onBlur,
  onInput,
  ...inputProps
}: FieldProps) {
  const [message, setMessage] = useState("");
  const id = `reg-${name}`;

  function check(element: HTMLInputElement) {
    if (validate) element.setCustomValidity(validate(element.value));
    setMessage(describeProblem(element, formatMessage));
  }

  return (
    <div className={`reg-field${wide ? " wide" : ""}${message ? " invalid" : ""}`}>
      <label htmlFor={id}>
        {label}
        {optional && <em> (optional)</em>}
      </label>
      <input
        id={id}
        name={name}
        required={!optional}
        aria-invalid={Boolean(message)}
        aria-describedby={message ? `${id}-error` : hint ? `${id}-hint` : undefined}
        onBlur={(event) => {
          check(event.currentTarget);
          onBlur?.(event);
        }}
        onInput={(event) => {
          if (validate) event.currentTarget.setCustomValidity(validate(event.currentTarget.value));
          if (message) check(event.currentTarget);
          onInput?.(event);
        }}
        onInvalid={(event) => check(event.currentTarget)}
        {...inputProps}
      />
      {message ? (
        <small className="reg-error" id={`${id}-error`} role="alert">
          {message}
        </small>
      ) : hint ? (
        <small id={`${id}-hint`}>{hint}</small>
      ) : null}
    </div>
  );
}

const SelectField = memo(function SelectField({
  label,
  name,
  options,
  value,
  onChange,
  customError = "",
  wide = false,
  placeholder = "Choose an option",
}: {
  label: string;
  name: string;
  options: string[] | { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  customError?: string;
  wide?: boolean;
  placeholder?: string;
}) {
  // Errors only appear after a submit attempt (onInvalid) and clear as soon as a value is picked.
  // There is deliberately no onBlur validation: opening a native dropdown blurs the select, and
  // re-rendering a controlled <select> while its popup is open discards the user's selection.
  const [submitError, setSubmitError] = useState("");
  const ref = useRef<HTMLSelectElement>(null);
  const id = `reg-${name}`;
  const message = customError || submitError;

  // Keeps form.checkValidity() failing while a custom rule (e.g. Grade 12 = No) is broken.
  useEffect(() => {
    ref.current?.setCustomValidity(customError);
  }, [customError]);

  return (
    <div className={`reg-field${wide ? " wide" : ""}${message ? " invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <select
        ref={ref}
        id={id}
        name={name}
        required
        value={value}
        aria-invalid={Boolean(message)}
        aria-describedby={message ? `${id}-error` : undefined}
        onChange={(event) => {
          setSubmitError("");
          onChange(event.target.value);
        }}
        onInvalid={(event) =>
          setSubmitError(event.currentTarget.validity.valueMissing ? "This is required." : "")
        }
      >
        <option value="">{placeholder}</option>
        {options.map((option) => {
          const item = typeof option === "string" ? { value: option, label: option } : option;
          return (
            <option value={item.value} key={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
      {message && (
        <small className="reg-error" id={`${id}-error`} role="alert">
          {message}
        </small>
      )}
    </div>
  );
});

function ChoiceGroup<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
  wide = false,
}: {
  legend: string;
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  wide?: boolean;
}) {
  return (
    <fieldset className={`reg-choice${wide ? " wide" : ""}`}>
      <legend>{legend}</legend>
      <div>
        {options.map((option) => (
          <label key={option.value} className={value === option.value ? "selected" : ""}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function UploadCard({
  id,
  label,
  hint,
  file,
  problem,
  onSelect,
}: {
  id: string;
  label: string;
  hint: string;
  file: File | null;
  problem: string;
  onSelect: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function accept(next: File | undefined) {
    if (next) onSelect(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files[0]);
  }

  return (
    <div
      className={`reg-upload${file ? " has-file" : ""}${dragging ? " dragging" : ""}${problem ? " invalid" : ""}`}
      id={id}
      tabIndex={-1}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <span className="reg-upload-visual">
        {preview ? (
          <img src={preview} alt="" />
        ) : file ? (
          <FileText aria-hidden="true" />
        ) : (
          <Upload aria-hidden="true" />
        )}
      </span>
      <div className="reg-upload-copy">
        <strong>{label}</strong>
        {file ? (
          <span className="reg-upload-file">
            <Check aria-hidden="true" /> {file.name} · {formatSize(file.size)}
          </span>
        ) : (
          <span>{hint}</span>
        )}
        {problem ? (
          <small className="reg-error" role="alert">
            {problem}
          </small>
        ) : (
          !file && <small>PDF, JPG or PNG · up to 10 MB</small>
        )}
      </div>
      <div className="reg-upload-actions">
        <button className="outline-button" type="button" onClick={() => inputRef.current?.click()}>
          {file ? (
            <>
              <RefreshCw aria-hidden="true" /> Replace
            </>
          ) : (
            <>
              <Upload aria-hidden="true" /> Choose file
            </>
          )}
        </button>
        {file && (
          <button
            className="reg-remove"
            type="button"
            aria-label={`Remove ${label}`}
            onClick={() => onSelect(null)}
          >
            <Trash2 aria-hidden="true" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        className="reg-file-input"
        type="file"
        tabIndex={-1}
        aria-label={label}
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        onChange={(event) => accept(event.target.files?.[0])}
      />
    </div>
  );
}

function SuccessScreen({ reference, email }: { reference: string; email: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`REG-${reference}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="reg-success" role="status" aria-labelledby="reg-success-title">
      <span className="reg-success-icon">
        <Check aria-hidden="true" />
      </span>
      <p className="eyebrow">APPLICATION SUBMITTED</p>
      <h1 id="reg-success-title">Thank you — we’ve got your application</h1>
      <p className="reg-success-lead">
        Your documents are private and will only be reviewed by an IV Consulting administrator.
        {email ? (
          <>
            {" "}
            We’ll contact you on <strong>{email}</strong>.
          </>
        ) : null}
      </p>
      {reference && (
        <div className="reg-reference">
          <div>
            <span>Your reference</span>
            <strong>REG-{reference}</strong>
          </div>
          <button className="outline-button" type="button" onClick={() => void copy()}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <ol className="reg-next-steps">
        <li>
          <b>1</b>
          <div>
            <strong>We review your application</strong>
            <span>An administrator checks your details and documents.</span>
          </div>
        </li>
        <li>
          <b>2</b>
          <div>
            <strong>You receive your login details</strong>
            <span>Your student ID, sign-in link and a temporary password.</span>
          </div>
        </li>
        <li>
          <b>3</b>
          <div>
            <strong>You sign in and choose your own password</strong>
            <span>You’ll be asked to do this the first time you sign in.</span>
          </div>
        </li>
      </ol>
      <p className="reg-success-note">Keep your reference handy in case you need to contact us.</p>
      <a className="brand-button" href="/">
        Return to sign in <ArrowRight aria-hidden="true" />
      </a>
    </section>
  );
}

export function RegistrationExperience() {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ reference: string; email: string } | null>(null);
  const [identityType, setIdentityType] = useState<"south-african" | "passport">("south-african");
  const [gender, setGender] = useState("");
  const [ethnicity, setEthnicity] = useState("");
  const [province, setProvince] = useState("");
  const [homeLanguage, setHomeLanguage] = useState("English");
  const [passedGrade12, setPassedGrade12] = useState("");
  const [employed, setEmployed] = useState<"no" | "yes">("no");
  const [plan, setPlan] = useState<"once_off" | "monthly">("once_off");
  const [files, setFiles] = useState<Files>({ identity: null, education: null, payment: null });
  const [fileProblems, setFileProblems] = useState<Record<DocumentKey, string>>({
    identity: "",
    education: "",
    payment: "",
  });
  const [complete, setComplete] = useState<Record<StepId, boolean>>({
    personal: false,
    education: false,
    documents: false,
    payment: false,
  });
  const [current, setCurrent] = useState<StepId>("personal");

  const refreshSteps = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    setComplete({
      personal: stepIsComplete(form, "personal", files),
      education: stepIsComplete(form, "education", files),
      documents: stepIsComplete(form, "documents", files),
      payment: stepIsComplete(form, "payment", files),
    });
  }, [files]);

  useEffect(() => {
    refreshSteps();
  }, [
    refreshSteps,
    identityType,
    gender,
    ethnicity,
    province,
    homeLanguage,
    passedGrade12,
    employed,
    plan,
  ]);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-step]"));
    if (!sections.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setCurrent(visible.target.getAttribute("data-step") as StepId);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [done]);

  // Warn before leaving with a half-finished form (nothing is stored on this device).
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      const form = formRef.current;
      if (!form || submitted.current || !form.dataset["dirty"]) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  function chooseFile(key: DocumentKey, file: File | null) {
    if (file) {
      const extensionOk = /\.(pdf|jpe?g|png)$/i.test(file.name);
      if (!ACCEPTED_TYPES.includes(file.type) || !extensionOk) {
        setFileProblems((current) => ({
          ...current,
          [key]: "Please choose a PDF, JPG or PNG file.",
        }));
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setFileProblems((current) => ({
          ...current,
          [key]: `That file is ${formatSize(file.size)}. The limit is 10 MB.`,
        }));
        return;
      }
    }
    setFileProblems((current) => ({ ...current, [key]: "" }));
    setFiles((current) => ({ ...current, [key]: file }));
    if (formRef.current) formRef.current.dataset["dirty"] = "true";
  }

  function goToStep(id: StepId) {
    document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function focusFirstProblem(form: HTMLFormElement) {
    const invalidControl = form.querySelector<HTMLElement>("input:invalid, select:invalid");
    const missingDocument = DOCUMENTS.find((item) => !files[item.key]);
    const controlTop = invalidControl?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
    const documentCard = missingDocument
      ? document.getElementById(`upload-${missingDocument.key}`)
      : null;
    const documentTop = documentCard?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
    const target = controlTop <= documentTop ? invalidControl : documentCard;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => target.focus({ preventScroll: true }), 350);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    const missingDocuments = DOCUMENTS.filter((item) => !files[item.key]);
    if (missingDocuments.length) {
      setFileProblems((current) => {
        const next = { ...current };
        for (const item of missingDocuments) next[item.key] = "Please add this document.";
        return next;
      });
    }
    // checkValidity fires `invalid` on every failing field, which shows each field's message.
    const formValid = form.checkValidity();
    if (!formValid || missingDocuments.length) {
      const count =
        form.querySelectorAll("input:invalid, select:invalid").length + missingDocuments.length;
      setError(
        `A few things need your attention (${count}). We’ve highlighted them below — fix them and submit again.`,
      );
      focusFirstProblem(form);
      return;
    }

    setBusy(true);
    setProgress(8);
    setStatusText("Checking your details…");
    try {
      const data = new FormData(form);
      const text = (key: string) => String(data.get(key) ?? "").trim();
      const documentInput = (file: File) => ({ name: file.name, type: file.type, size: file.size });
      const identity = files.identity as File;
      const education = files.education as File;
      const payment = files.payment as File;
      const input: StudentRegistrationInput = {
        fullNames: text("fullNames"),
        surname: text("surname"),
        cellPhone: text("cellPhone"),
        southAfricanIdNumber: identityType === "south-african" ? text("southAfricanIdNumber") : "",
        passportNumber: identityType === "passport" ? text("passportNumber") : "",
        passportCountry: identityType === "passport" ? text("passportCountry") : "",
        gender,
        ethnicity,
        homeLanguage: homeLanguage === "Other" ? text("otherLanguage") : homeLanguage,
        fullHomeAddress: text("fullHomeAddress"),
        province,
        postalCode: text("postalCode"),
        email: text("email"),
        passedGrade12: passedGrade12 === "yes",
        qualificationName: text("qualificationName"),
        employedAtRealEstateCompany: employed === "yes",
        realEstateCompany: employed === "yes" ? text("realEstateCompany") : "",
        paymentPlan: plan,
        declarationAccepted: data.get("declarationAccepted") === "on",
        signatureName: text("signatureName"),
        signatureDate: text("signatureDate"),
        documents: {
          identity: documentInput(identity),
          education: documentInput(education),
          payment: documentInput(payment),
        },
        website: text("website"),
      };
      const started = await beginStudentRegistration({ data: input });
      if (started.ignored) {
        submitted.current = true;
        setDone({ reference: "", email: input.email });
        return;
      }
      setProgress(20);
      const uploads: [File, (typeof started.uploads)[keyof typeof started.uploads]][] = [
        [identity, started.uploads.identity],
        [education, started.uploads.education],
        [payment, started.uploads.payment],
      ];
      for (const [index, [file, upload]] of uploads.entries()) {
        setStatusText(`Uploading document ${index + 1} of 3…`);
        const { error: uploadError } = await supabase.storage
          .from("student-registration-documents")
          .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
        if (uploadError) {
          throw new Error(
            `${file.name} could not be uploaded securely. Please check your connection and submit again.`,
          );
        }
        setProgress(20 + Math.round(((index + 1) / 3) * 70));
      }
      setStatusText("Finishing up…");
      await completeStudentRegistration({
        data: { registrationId: started.registrationId, submissionToken: started.submissionToken },
      });
      submitted.current = true;
      setProgress(100);
      setDone({ reference: started.registrationId.slice(0, 8).toUpperCase(), email: input.email });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(messageFrom(caught));
      setProgress(0);
    } finally {
      setBusy(false);
      setStatusText("");
    }
  }

  if (done) return <SuccessScreen reference={done.reference} email={done.email} />;

  const completedCount = STEPS.filter((step) => complete[step.id]).length;
  const grade12Problem =
    passedGrade12 === "no"
      ? "You need to have passed Grade 12 to register. Contact us if you have an equivalent qualification."
      : "";

  return (
    <>
      <header className="reg-hero">
        <div>
          <p className="eyebrow">QCTO NQF4 · NEW QCTO SYSTEM</p>
          <h1>Student registration</h1>
          <p>
            Complete four short sections and upload three documents. Our administration team will
            review your application and send your login details.
          </p>
          <div className="reg-hero-meta">
            <span>
              <Clock3 aria-hidden="true" /> About 10–15 minutes
            </span>
            <span>
              <ShieldCheck aria-hidden="true" /> Private and secure
            </span>
          </div>
        </div>
        <span className="reg-hero-mark" aria-hidden="true">
          <GraduationCap />
        </span>
      </header>

      <div className="reg-layout">
        <div className="reg-main">
          <nav className="reg-stepper" aria-label="Registration progress">
            <ol>
              {STEPS.map((step, index) => (
                <li key={step.id}>
                  <button
                    type="button"
                    className={`${complete[step.id] ? "done" : ""}${current === step.id ? " current" : ""}`}
                    aria-current={current === step.id ? "step" : undefined}
                    onClick={() => goToStep(step.id)}
                  >
                    <b>{complete[step.id] ? <Check aria-hidden="true" /> : index + 1}</b>
                    <span>{step.title}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div
              className="reg-meter"
              role="progressbar"
              aria-label="Sections completed"
              aria-valuemin={0}
              aria-valuemax={STEPS.length}
              aria-valuenow={completedCount}
            >
              <span style={{ width: `${(completedCount / STEPS.length) * 100}%` }} />
            </div>
          </nav>

          <form
            ref={formRef}
            className="reg-form"
            noValidate
            onSubmit={(event) => void submit(event)}
            onInput={(event) => {
              event.currentTarget.dataset["dirty"] = "true";
              refreshSteps();
            }}
          >
            <section className="reg-section" id="step-personal" data-step="personal">
              <header>
                <b>1</b>
                <div>
                  <h2>Tell us about yourself</h2>
                  <p>Enter your details exactly as they appear on your ID.</p>
                </div>
              </header>
              <div className="reg-fields">
                <Field
                  label="Full first names"
                  name="fullNames"
                  hint="As they appear on your ID"
                  autoComplete="given-name"
                />
                <Field label="Surname" name="surname" autoComplete="family-name" />
                <Field
                  label="Cell phone number"
                  name="cellPhone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  pattern="[0-9 +()\-]{9,16}"
                  hint="For example 082 123 4567"
                  formatMessage="Enter a valid phone number, for example 082 123 4567."
                />
                <Field
                  label="Email address"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  hint="We’ll use this to contact you"
                />
                <ChoiceGroup
                  legend="Identification type"
                  name="identityType"
                  value={identityType}
                  onChange={setIdentityType}
                  wide
                  options={[
                    { value: "south-african", label: "South African ID" },
                    { value: "passport", label: "Passport" },
                  ]}
                />
                {identityType === "south-african" ? (
                  <Field
                    label="South African ID number"
                    name="southAfricanIdNumber"
                    inputMode="numeric"
                    maxLength={13}
                    autoComplete="off"
                    hint="13 digits, no spaces"
                    validate={(value) =>
                      value && !isValidSouthAfricanId(value)
                        ? "That ID number doesn’t look right. Please check each digit."
                        : ""
                    }
                    wide
                  />
                ) : (
                  <>
                    <Field label="Passport number" name="passportNumber" autoComplete="off" />
                    <Field label="Country of issue" name="passportCountry" />
                  </>
                )}
                <SelectField
                  label="Gender"
                  name="gender"
                  options={GENDERS}
                  value={gender}
                  onChange={setGender}
                />
                <SelectField
                  label="Ethnicity"
                  name="ethnicity"
                  options={ETHNICITIES}
                  value={ethnicity}
                  onChange={setEthnicity}
                />
                <SelectField
                  label="Home language"
                  name="homeLanguage"
                  options={LANGUAGES}
                  value={homeLanguage}
                  onChange={setHomeLanguage}
                  wide={homeLanguage !== "Other"}
                />
                {homeLanguage === "Other" && <Field label="Which language?" name="otherLanguage" />}
                <Field
                  label="Full home address"
                  name="fullHomeAddress"
                  autoComplete="street-address"
                  hint="Street, suburb and town or city"
                  wide
                />
                <SelectField
                  label="Province"
                  name="province"
                  options={PROVINCES}
                  value={province}
                  onChange={setProvince}
                />
                <Field
                  label="Postal code"
                  name="postalCode"
                  autoComplete="postal-code"
                  inputMode="numeric"
                  maxLength={10}
                />
              </div>
            </section>

            <section className="reg-section" id="step-education" data-step="education">
              <header>
                <b>2</b>
                <div>
                  <h2>Your study and work details</h2>
                  <p>A few quick questions about your education and employment.</p>
                </div>
              </header>
              <div className="reg-fields">
                <SelectField
                  label="Did you pass Grade 12?"
                  name="passedGrade12"
                  options={GRADE12_OPTIONS}
                  value={passedGrade12}
                  onChange={setPassedGrade12}
                  customError={grade12Problem}
                />
                <Field
                  label="Highest qualification"
                  name="qualificationName"
                  hint="For example National Senior Certificate"
                  placeholder="Name of your qualification"
                />
                <ChoiceGroup
                  legend="Are you currently employed at a real estate company?"
                  name="employment"
                  value={employed}
                  onChange={setEmployed}
                  wide
                  options={[
                    { value: "no", label: "No" },
                    { value: "yes", label: "Yes" },
                  ]}
                />
                {employed === "yes" && (
                  <Field label="Which company do you work for?" name="realEstateCompany" wide />
                )}
              </div>
            </section>

            <section className="reg-section" id="step-documents" data-step="documents">
              <header>
                <b>3</b>
                <div>
                  <h2>Upload your documents</h2>
                  <p>Clear photos or scans are fine. Each file can be up to 10 MB.</p>
                </div>
              </header>
              <div className="reg-uploads">
                {DOCUMENTS.map((item) => (
                  <UploadCard
                    key={item.key}
                    id={`upload-${item.key}`}
                    label={item.label}
                    hint={item.hint}
                    file={files[item.key]}
                    problem={fileProblems[item.key]}
                    onSelect={(file) => chooseFile(item.key, file)}
                  />
                ))}
              </div>
              <p className="reg-privacy">
                <Lock aria-hidden="true" /> Please don’t send official documents on WhatsApp. Files
                uploaded here are stored privately.
              </p>
            </section>

            <section className="reg-section" id="step-payment" data-step="payment">
              <header>
                <b>4</b>
                <div>
                  <h2>Choose how you’d like to pay</h2>
                  <p>Then read the declaration and sign to finish.</p>
                </div>
              </header>
              <fieldset className="reg-plans">
                <legend className="sr-only">Payment plan</legend>
                {(
                  [
                    {
                      value: "once_off",
                      price: "R6,000",
                      detail: "once-off",
                      note: "One full payment",
                    },
                    {
                      value: "monthly",
                      price: "R1,200",
                      detail: "× 6 months",
                      note: "Total: R7,200",
                    },
                  ] as const
                ).map((option) => (
                  <label key={option.value} className={plan === option.value ? "selected" : ""}>
                    <input
                      type="radio"
                      name="paymentPlan"
                      value={option.value}
                      checked={plan === option.value}
                      onChange={() => setPlan(option.value)}
                    />
                    <span className="reg-plan-check">
                      <Check aria-hidden="true" />
                    </span>
                    <span>
                      <strong>
                        {option.price} <em>{option.detail}</em>
                      </strong>
                      <small>{option.note}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <DeclarationBox />
              <div className="reg-fields">
                <Field
                  label="Electronic signature"
                  name="signatureName"
                  hint="Type your full name to sign this application"
                  autoComplete="name"
                />
                <Field
                  label="Date"
                  name="signatureDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </div>
            </section>

            <label className="registration-honeypot" aria-hidden="true">
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>

            <div className="reg-submit">
              {error && (
                <p className="reg-submit-error" role="alert">
                  {error}
                </p>
              )}
              <div className="reg-submit-row">
                <div className="reg-submit-status">
                  <strong>
                    {busy ? statusText : `${completedCount} of ${STEPS.length} sections complete`}
                  </strong>
                  <span>
                    {busy
                      ? "Please keep this page open."
                      : "Your documents are sent securely and only seen by IV Consulting administrators."}
                  </span>
                  {busy && (
                    <span className="reg-upload-meter" aria-hidden="true">
                      <i style={{ width: `${progress}%` }} />
                    </span>
                  )}
                </div>
                <button className="brand-button" type="submit" disabled={busy}>
                  {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
                  {busy ? "Submitting…" : "Submit application"}
                  {!busy ? <ArrowRight aria-hidden="true" /> : null}
                </button>
              </div>
            </div>
          </form>
        </div>

        <aside className="reg-aside" aria-label="Before you begin">
          <section>
            <p className="eyebrow">BEFORE YOU BEGIN</p>
            <h2>Have these ready</h2>
            <ul className="reg-checklist">
              {DOCUMENTS.map((item) => (
                <li key={item.key} className={files[item.key] ? "done" : ""}>
                  <span>
                    {files[item.key] ? (
                      <Check aria-hidden="true" />
                    ) : (
                      <FileText aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{files[item.key] ? "Added" : "PDF, JPG or PNG"}</small>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="reg-help">
            <Phone aria-hidden="true" />
            <div>
              <strong>Need a hand?</strong>
              <span>Call +27 (0)10 001 7324 or email inyapavhusiku@gmail.com.</span>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function DeclarationBox() {
  const [invalid, setInvalid] = useState(false);
  return (
    <div className={`reg-declaration${invalid ? " invalid" : ""}`}>
      <p>
        I understand that my registration will only be finalised once my completed form, my identity
        and matric documents, and my proof of payment have been received and reviewed.
      </p>
      <label>
        <input
          type="checkbox"
          name="declarationAccepted"
          required
          aria-invalid={invalid}
          onInvalid={() => setInvalid(true)}
          onChange={(event) => setInvalid(!event.currentTarget.checked)}
        />
        <span>I have completed this form honestly and accept the declaration above.</span>
      </label>
      {invalid && (
        <small className="reg-error" role="alert">
          Please tick the box to confirm.
        </small>
      )}
    </div>
  );
}

export { SuccessScreen as __SS };