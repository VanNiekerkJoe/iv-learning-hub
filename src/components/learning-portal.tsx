import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Folder,
  FolderOpen,
  FileAudio,
  FileText,
  Film,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";

import {
  acceptCopyrightNotice,
  beginStudentRegistration,
  changePortalContentState,
  completeStudentRegistration,
  deletePortalModule,
  getLearningDashboard,
  getLearningModule,
  getTemporaryContentAccess,
  invitePortalStudent,
  listAdminPortalData,
  listStudentRegistrations,
  permanentlyDeletePortalContent,
  saveLearningProgress,
  savePortalFolder,
  savePortalModule,
  savePortalContent,
  deletePortalFolder,
  setupStarterModules,
  updateStudentPortalAccess,
  reviewStudentRegistration,
  type StudentRegistrationInput,
} from "@/lib/portal.functions";
import {
  detectLearningKind,
  isRecentlyDeleted,
  STARTER_MODULES,
  titleFromFilename,
} from "@/lib/learning-domain";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Dashboard = Awaited<ReturnType<typeof getLearningDashboard>>;
type AdminData = Awaited<ReturnType<typeof listAdminPortalData>>;
type RegistrationData = Awaited<
  ReturnType<typeof listStudentRegistrations>
>["registrations"][number];
type Profile = Dashboard["profile"];
type Module = Dashboard["modules"][number];
type ContentItem = NonNullable<Dashboard["content"]>[number];
type LearningProgress = Dashboard["progress"][number];
type LearningFolder = Awaited<ReturnType<typeof getLearningModule>>["folders"][number];
type AdminProfile = AdminData["profiles"][number];
type AdminModule = AdminData["modules"][number];
type AdminFolder = AdminData["folders"][number];
type AdminItem = AdminData["items"][number];
type ContentKind = Tables<"content_items">["type"];
type ModuleDraft = { id?: string; title: string; description: string };
type ContentDraft = {
  id?: string;
  moduleId: string;
  folderId?: string | null;
  type: ContentKind;
  title: string;
  description: string;
  storagePath: string;
  publish: boolean;
};
type AuthSession = NonNullable<
  Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]
>;

const PREVIEW_MODULE_ID = "preview-module-1";
const PREVIEW_MODULES: Module[] = Array.from({ length: 7 }, (_, index) => ({
  id: index === 0 ? "preview-induction" : `preview-module-${index}`,
  title: index === 0 ? "Induction" : `Module ${index}`,
  description:
    index === 0
      ? "Start here to learn about the course and how to get started."
      : "Sample course area shown in local preview mode.",
  position: index,
}));

const PREVIEW_CONTENT: ContentItem[] = [
  {
    id: "preview-textbook",
    module_id: PREVIEW_MODULE_ID,
    folder_id: null,
    type: "pdf",
    storage_path: "preview/sample-textbook.pdf",
    title: "Sample textbook",
    description: "Preview-only placeholder. Real materials require an authenticated account.",
    position: 1,
  },
  {
    id: "preview-video",
    module_id: PREVIEW_MODULE_ID,
    folder_id: null,
    type: "video",
    storage_path: "preview/sample-lesson.mp4",
    title: "Sample lesson video",
    description: "Preview-only placeholder.",
    position: 2,
  },
  {
    id: "preview-podcast",
    module_id: PREVIEW_MODULE_ID,
    folder_id: null,
    type: "audio",
    storage_path: "preview/sample-podcast.mp3",
    title: "Sample podcast",
    description: "Preview-only placeholder.",
    position: 3,
  },
];

const PREVIEW_ADMIN_DATA: AdminData = {
  profiles: [],
  modules: PREVIEW_MODULES,
  folders: [],
  items: [
    ...PREVIEW_CONTENT.map((item) => ({
      ...item,
      folder_id: null,
      storage_path: `preview/${item.id}`,
      is_hidden: false,
      deleted_at: null,
      created_at: "2026-11-01T10:00:00.000Z",
    })),
    {
      id: "preview-expired-item",
      module_id: PREVIEW_MODULE_ID,
      folder_id: null,
      type: "pdf",
      title: "Expired sample item",
      description: "Example of an item past its recovery window.",
      storage_path: "preview/expired-item",
      position: 4,
      is_hidden: true,
      deleted_at: "2026-10-01T10:00:00.000Z",
      created_at: "2026-09-01T10:00:00.000Z",
    },
  ],
  logs: [],
};

const PREVIEW_STORAGE_KEY = "iv-learning-hub.preview-admin.v1";
const LEGACY_PREVIEW_STUDENT_ID = "local-preview-student";

type PreviewState = {
  data: AdminData;
  assignments: Record<string, string[]>;
};

function loadPreviewState(): PreviewState | null {
  if (typeof window === "undefined") return null;

  try {
    const storedState = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
    if (!storedState) return null;
    const parsedState = JSON.parse(storedState) as Partial<PreviewState>;
    if (
      !parsedState.data ||
      !Array.isArray(parsedState.data.profiles) ||
      !Array.isArray(parsedState.data.modules) ||
      !Array.isArray(parsedState.data.items) ||
      !Array.isArray(parsedState.data.logs) ||
      !parsedState.assignments ||
      typeof parsedState.assignments !== "object"
    ) {
      return null;
    }
    const assignments = Object.fromEntries(
      Object.entries(parsedState.assignments).filter(
        ([studentId]) => studentId !== LEGACY_PREVIEW_STUDENT_ID,
      ),
    );
    return {
      data: {
        ...parsedState.data,
        profiles: parsedState.data.profiles.filter(
          (profile) => profile.id !== LEGACY_PREVIEW_STUDENT_ID,
        ),
        logs: parsedState.data.logs.filter((log) => log.student_id !== LEGACY_PREVIEW_STUDENT_ID),
      },
      assignments,
    };
  } catch (error) {
    console.warn("The saved local preview data could not be loaded.", error);
    return null;
  }
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function kindLabel(kind: ContentKind, filePath = "") {
  if (kind === "video") return "Video";
  if (kind === "audio") return "Podcast";
  const extension = filePath.split(".").at(-1)?.toLowerCase();
  if (extension === "pptx") return "Presentation";
  if (extension === "docx" || extension === "doc") return "Document";
  if (extension === "xlsx" || extension === "xls") return "Spreadsheet";
  if (extension === "jpg" || extension === "jpeg" || extension === "png") return "Image";
  return "Textbook";
}

function kindIcon(kind: ContentKind) {
  if (kind === "pdf") return <FileText aria-hidden="true" />;
  if (kind === "video") return <Film aria-hidden="true" />;
  return <FileAudio aria-hidden="true" />;
}

export function LearningPortal() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [moduleContent, setModuleContent] = useState<ContentItem[]>([]);
  const [moduleFolders, setModuleFolders] = useState<LearningFolder[]>([]);
  const [moduleProgress, setModuleProgress] = useState<LearningProgress[]>([]);
  const [moduleError, setModuleError] = useState("");
  const [moduleSearch, setModuleSearch] = useState("");
  const [moduleKind, setModuleKind] = useState<"all" | ContentKind>("all");
  const [viewer, setViewer] = useState<{
    item: ContentItem;
    url: string;
  } | null>(null);
  const [openingContent, setOpeningContent] = useState<string | null>(null);
  const [savingTerms, setSavingTerms] = useState(false);
  const [pageNotice, setPageNotice] = useState("");
  const userId = session?.user.id;

  useEffect(() => {
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setDashboard(null);
        setDashboardError("");
        setSelectedModule(null);
        setViewer(null);
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setDashboardError(error.message);
      setSession(data.session);
      setAuthReady(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setLoadingDashboard(false);
      setDashboard(null);
      return;
    }

    let active = true;
    setLoadingDashboard(true);
    setDashboardError("");
    void getLearningDashboard()
      .then((result) => {
        if (active) setDashboard(result);
      })
      .catch((error: unknown) => {
        if (active) setDashboardError(messageFrom(error));
      })
      .finally(() => {
        if (active) setLoadingDashboard(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const profile = dashboard?.profile;
  const modules = dashboard?.modules ?? [];
  const folders = dashboard?.folders ?? [];
  const content = dashboard?.content ?? [];
  const progress = dashboard?.progress ?? [];
  const profileNeedsTerms = Boolean(profile && !profile.terms_accepted_at);

  async function loadDashboard() {
    setLoadingDashboard(true);
    setDashboardError("");
    try {
      setDashboard(await getLearningDashboard());
    } catch (error) {
      setDashboardError(messageFrom(error));
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function openModule(module: Module) {
    setSelectedModule(module);
    setModuleContent(content.filter((item) => item.module_id === module.id));
    setModuleFolders(folders.filter((folder) => folder.module_id === module.id));
    setModuleProgress(
      progress.filter((item) =>
        content.some((entry) => entry.id === item.content_id && entry.module_id === module.id),
      ),
    );
    setModuleSearch("");
    setModuleKind("all");
    setModuleError("");
  }

  async function openItem(item: ContentItem) {
    setOpeningContent(item.id);
    setPageNotice("");
    try {
      const access = await getTemporaryContentAccess({ data: { contentId: item.id } });
      setViewer({ item, url: access.url });
      void saveLearningProgress({
        data: { contentId: item.id, status: "in_progress", positionSeconds: 0 },
      }).catch((error: unknown) => setPageNotice(messageFrom(error)));
    } catch (error) {
      setPageNotice(messageFrom(error));
    } finally {
      setOpeningContent(null);
    }
  }

  async function acceptTerms() {
    setSavingTerms(true);
    setPageNotice("");
    try {
      await acceptCopyrightNotice();
      await loadDashboard();
    } catch (error) {
      setPageNotice(messageFrom(error));
    } finally {
      setSavingTerms(false);
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setPageNotice(error.message);
    } else {
      setSession(null);
    }
  }

  if (!authReady) {
    return <LoadingScreen label="Preparing your learning portal" />;
  }

  if (!session) {
    return <LoginScreen notice={pageNotice} setNotice={setPageNotice} onSignedIn={setSession} />;
  }

  if (loadingDashboard && !dashboard) {
    return <LoadingScreen label="Loading your courses" />;
  }

  if (dashboardError && !dashboard) {
    return (
      <PortalFrame profile={null} onSignOut={signOut}>
        <section className="portal-message-card" role="alert">
          <div className="message-icon">
            <CircleHelp aria-hidden="true" />
          </div>
          <h1>We couldn't load your learning portal</h1>
          <p>{dashboardError}</p>
          <button className="brand-button" type="button" onClick={() => void loadDashboard()}>
            Try again <ArrowRight aria-hidden="true" />
          </button>
        </section>
      </PortalFrame>
    );
  }

  if (!profile) return <LoadingScreen label="Loading your account" />;

  return (
    <PortalFrame profile={profile} onSignOut={signOut}>
      {profileNeedsTerms ? (
        <section className="terms-card" aria-labelledby="terms-title">
          <div className="message-icon">
            <ShieldCheck aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">A quick reminder</p>
            <h1 id="terms-title">Protect your learning materials</h1>
            <p>
              Course materials are copyrighted. Sharing or reselling them is prohibited and may
              result in removal of your account.
            </p>
            <button
              className="brand-button"
              type="button"
              disabled={savingTerms}
              onClick={() => void acceptTerms()}
            >
              {savingTerms ? (
                <LoaderCircle className="spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              I understand and agree
            </button>
            {pageNotice && (
              <p className="inline-error" role="alert">
                {pageNotice}
              </p>
            )}
          </div>
        </section>
      ) : profile.role === "admin" ? (
        <AdminWorkspace profile={profile} />
      ) : selectedModule ? (
        <ModuleWorkspace
          module={selectedModule}
          content={moduleContent}
          folders={moduleFolders}
          progress={moduleProgress}
          search={moduleSearch}
          setSearch={setModuleSearch}
          kind={moduleKind}
          setKind={setModuleKind}
          error={moduleError}
          openingContent={openingContent}
          onBack={() => setSelectedModule(null)}
          onOpenItem={(item) => void openItem(item)}
        />
      ) : (
        <StudentDashboard
          profile={profile}
          modules={modules}
          content={content}
          progress={progress}
          onOpenModule={(module) => void openModule(module)}
          onExplore={() => {
            const first = modules[0];
            if (first) void openModule(first);
          }}
        />
      )}
      {pageNotice && !profileNeedsTerms && (
        <p className="portal-toast" role="status">
          {pageNotice}
          <button type="button" aria-label="Dismiss message" onClick={() => setPageNotice("")}>
            <X aria-hidden="true" />
          </button>
        </p>
      )}
      {viewer && (
        <ContentViewer
          key={viewer.item.id}
          item={viewer.item}
          url={viewer.url}
          profile={profile}
          progress={progress}
          onClose={() => setViewer(null)}
          onNotice={setPageNotice}
        />
      )}
    </PortalFrame>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="portal-loading">
      <img src="/assets/iv-consulting-logo.png" alt="IV Consulting" />
      <LoaderCircle className="spin" aria-hidden="true" />
      <p>{label}</p>
    </main>
  );
}

function PortalFrame({
  profile,
  onSignOut,
  children,
}: {
  profile: Profile | null;
  onSignOut: () => void;
  children: ReactNode;
}) {
  return (
    <div className="portal-shell">
      <div className="utility-bar">
        <div className="portal-container utility-inner">
          <span>Inyapa Vhusiku Consulting</span>
          <div className="utility-contact">
            <a href="tel:+27100017324">Tel: +27 (0)10 001 7324</a>
            <a href="mailto:inyapavhusiku@gmail.com">inyapavhusiku@gmail.com</a>
            <a
              href="https://www.linkedin.com/company/inyapa-vhusiku-consulting/"
              target="_blank"
              rel="noreferrer"
              aria-label="IV Consulting on LinkedIn"
            >
              in
            </a>
          </div>
        </div>
      </div>
      <header className="portal-header">
        <div className="portal-container header-inner">
          <a className="brand-lockup" href="/" aria-label="IV Consulting learning portal home">
            <img src="/assets/iv-consulting-logo.png" alt="IV Consulting" />
            <span>LEARNING PORTAL</span>
          </a>
          <div className="header-account">
            {profile && (
              <>
                <span className="account-name">{profile.full_name}</span>
                <button
                  className="icon-button"
                  type="button"
                  onClick={onSignOut}
                  aria-label="Sign out"
                >
                  <LogOut aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="portal-main">
        {profile?.id.startsWith("local-preview-") && (
          <div className="preview-banner" role="status">
            Interactive demo · sample data saved in this browser · real accounts and files require
            sign-in
          </div>
        )}
        {children}
      </main>
      <footer className="portal-footer">
        <div className="portal-container footer-inner">
          <span>Copyright 2026 – Inyapa Vhusiku Consulting</span>
          <div>
            <a href="mailto:inyapavhusiku@gmail.com">inyapavhusiku@gmail.com</a>
            <a href="tel:+27100017324">+27 (0)10 001 7324</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LoginScreen({
  notice,
  setNotice,
  onSignedIn,
}: {
  notice: string;
  setNotice: (notice: string) => void;
  onSignedIn?: (session: AuthSession) => void;
}) {
  const [mode, setMode] = useState<"sign-in" | "recovery">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      if (mode === "recovery") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/`,
        });
        if (error) throw error;
        setNotice("If an account exists for that email, a password reset link is on its way.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (!data.session) throw new Error("Unable to start a session. Please try again.");
        onSignedIn?.(data.session);
      }
    } catch (error) {
      setNotice(messageFrom(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalFrame profile={null} onSignOut={() => undefined}>
      <section className="login-hero">
        <div className="hero-stripe" aria-hidden="true" />
        <div className="portal-container login-hero-inner">
          <div>
            <p className="eyebrow">Learn. Grow. Achieve.</p>
            <h1>
              Your next step
              <br />
              starts <span>here.</span>
            </h1>
            <p>Welcome to your IV Consulting learning portal. Sign in to continue your training.</p>
          </div>
          <div className="login-card">
            <div className="login-card-heading">
              <span className="login-icon">
                <GraduationCap aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">
                  {mode === "sign-in" ? "Student & administrator access" : "Account assistance"}
                </p>
                <h2>{mode === "sign-in" ? "Welcome back" : "Reset your password"}</h2>
              </div>
            </div>
            <form onSubmit={(event) => void submit(event)}>
              <label htmlFor="login-email">Email address</label>
              <div className="input-with-icon">
                <Mail aria-hidden="true" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  placeholder="you@example.com"
                />
              </div>
              {mode === "sign-in" && (
                <>
                  <label htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    className="portal-input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    placeholder="Enter your password"
                  />
                </>
              )}
              {notice && (
                <p className="inline-error" role="status">
                  {notice}
                </p>
              )}
              <button className="brand-button login-submit" type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
                {mode === "sign-in" ? "Sign in securely" : "Send reset link"}
                {!busy && <ArrowRight aria-hidden="true" />}
              </button>
            </form>
            <button
              className="text-button recovery-link"
              type="button"
              onClick={() => {
                setNotice("");
                setMode(mode === "sign-in" ? "recovery" : "sign-in");
              }}
            >
              {mode === "sign-in" ? "Forgot your password?" : "Back to sign in"}
            </button>
            <p className="privacy-note">
              <ShieldCheck aria-hidden="true" /> Your course access is private and protected.
            </p>
            <a className="registration-link" href="/register">
              New student? Complete your registration <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
      <div className="portal-container login-help">
        <div>
          <BookOpen aria-hidden="true" />
          <div>
            <strong>Learn at your pace</strong>
            <span>Course materials in one secure place.</span>
          </div>
        </div>
        <div>
          <Users aria-hidden="true" />
          <div>
            <strong>Need access?</strong>
            <span>Contact your IV Consulting administrator.</span>
          </div>
        </div>
        <a href="mailto:inyapavhusiku@gmail.com">
          Get help <ArrowRight aria-hidden="true" />
        </a>
      </div>
    </PortalFrame>
  );
}

export function StudentRegistrationPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [identityType, setIdentityType] = useState<"south-african" | "passport">("south-african");
  const [homeLanguage, setHomeLanguage] = useState("English");
  const [employed, setEmployed] = useState(false);
  const [files, setFiles] = useState<{
    identity: File | null;
    education: File | null;
    payment: File | null;
  }>({ identity: null, education: null, payment: null });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!files.identity || !files.education || !files.payment) {
        throw new Error("Upload your ID or passport, matric document, and proof of payment.");
      }
      const form = new FormData(event.currentTarget);
      const documentInput = (file: File) => ({
        name: file.name,
        type: file.type,
        size: file.size,
      });
      const input: StudentRegistrationInput = {
        fullNames: String(form.get("fullNames") ?? ""),
        surname: String(form.get("surname") ?? ""),
        cellPhone: String(form.get("cellPhone") ?? ""),
        southAfricanIdNumber:
          identityType === "south-african" ? String(form.get("southAfricanIdNumber") ?? "") : "",
        passportNumber: identityType === "passport" ? String(form.get("passportNumber") ?? "") : "",
        passportCountry:
          identityType === "passport" ? String(form.get("passportCountry") ?? "") : "",
        gender: String(form.get("gender") ?? ""),
        ethnicity: String(form.get("ethnicity") ?? ""),
        homeLanguage:
          homeLanguage === "Other" ? String(form.get("otherLanguage") ?? "") : homeLanguage,
        fullHomeAddress: String(form.get("fullHomeAddress") ?? ""),
        province: String(form.get("province") ?? ""),
        postalCode: String(form.get("postalCode") ?? ""),
        email: String(form.get("email") ?? ""),
        passedGrade12: form.get("passedGrade12") === "yes",
        qualificationName: String(form.get("qualificationName") ?? ""),
        employedAtRealEstateCompany: employed,
        realEstateCompany: employed ? String(form.get("realEstateCompany") ?? "") : "",
        paymentPlan: form.get("paymentPlan") === "monthly" ? "monthly" : "once_off",
        declarationAccepted: form.get("declarationAccepted") === "on",
        signatureName: String(form.get("signatureName") ?? ""),
        signatureDate: String(form.get("signatureDate") ?? ""),
        documents: {
          identity: documentInput(files.identity),
          education: documentInput(files.education),
          payment: documentInput(files.payment),
        },
        website: String(form.get("website") ?? ""),
      };
      const started = await beginStudentRegistration({ data: input });
      if (started.ignored) {
        setReference("Registration received");
        return;
      }
      const uploads: [File, (typeof started.uploads)[keyof typeof started.uploads]][] = [
        [files.identity, started.uploads.identity],
        [files.education, started.uploads.education],
        [files.payment, started.uploads.payment],
      ];
      for (const [file, upload] of uploads) {
        const { error: uploadError } = await supabase.storage
          .from("student-registration-documents")
          .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
        if (uploadError) {
          throw new Error(
            `${file.name} could not be uploaded securely. Please try submitting again.`,
          );
        }
      }
      await completeStudentRegistration({
        data: {
          registrationId: started.registrationId,
          submissionToken: started.submissionToken,
        },
      });
      setReference(started.registrationId.slice(0, 8).toUpperCase());
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalFrame profile={null} onSignOut={() => undefined}>
      <section className="registration-page portal-container">
        <a className="back-link registration-back" href="/">
          <ArrowLeft aria-hidden="true" /> Back to student sign in
        </a>
        {reference ? (
          <section className="registration-success" role="status">
            <span className="message-icon">
              <Check aria-hidden="true" />
            </span>
            <p className="eyebrow">REGISTRATION SUBMITTED</p>
            <h1>Thank you. Your application is with our admin team.</h1>
            <p>
              Your reference is <strong>REG-{reference}</strong>. Keep this reference for any
              questions. Your documents are private and will only be reviewed by an IV Consulting
              administrator.
            </p>
            <p>
              Once approved, your student account details and sign-in link will be provided to you.
            </p>
            <a className="brand-button" href="/">
              Return to sign in <ArrowRight aria-hidden="true" />
            </a>
          </section>
        ) : (
          <>
            <div className="registration-title-band">
              <div>
                <p className="eyebrow">QCTO NQF4 · ONLINE APPLICATION</p>
                <h1>Registration for NQF4 – New QCTO System</h1>
                <p>
                  One simple application. Four short steps. Your information and documents are
                  securely reviewed by our administration team.
                </p>
                <div className="registration-hero-meta">
                  <span>
                    <Clock3 aria-hidden="true" /> About 10–15 minutes
                  </span>
                  <span>
                    <ShieldCheck aria-hidden="true" /> Private & secure
                  </span>
                </div>
              </div>
              <span className="registration-title-mark">
                <GraduationCap aria-hidden="true" />
              </span>
            </div>

            <aside className="registration-requirements" aria-label="Required documents">
              <div className="registration-requirements-heading">
                <span>
                  <FileText aria-hidden="true" />
                </span>
                <div>
                  <p className="eyebrow">BEFORE YOU BEGIN</p>
                  <h2>Prepare these three documents</h2>
                </div>
              </div>
              <div className="registration-requirement-list">
                <span>
                  <b>1</b> Certified ID or passport
                </span>
                <span>
                  <b>2</b> Matric certificate or affidavit
                </span>
                <span>
                  <b>3</b> Proof of payment
                </span>
              </div>
              <p className="registration-file-rule">
                PDF, JPG or PNG · maximum 10 MB each. Please do not send official documents on
                WhatsApp.
              </p>
            </aside>

            <form className="registration-form" onSubmit={(event) => void submit(event)}>
              <section className="registration-form-section">
                <div className="registration-section-number">01</div>
                <div className="registration-section-title">
                  <p className="eyebrow">PERSONAL DETAILS</p>
                  <h2>Tell us about yourself</h2>
                </div>
                <div className="registration-fields">
                  <RegistrationField
                    label="Full names on ID"
                    name="fullNames"
                    autoComplete="given-name"
                  />
                  <RegistrationField label="Surname" name="surname" autoComplete="family-name" />
                  <RegistrationField
                    label="Cell phone number"
                    name="cellPhone"
                    type="tel"
                    autoComplete="tel"
                  />
                  <fieldset className="registration-choice identity-choice">
                    <legend>Choose your identification type</legend>
                    <label className={identityType === "south-african" ? "selected" : ""}>
                      <input
                        type="radio"
                        name="identityType"
                        value="south-african"
                        checked={identityType === "south-african"}
                        onChange={() => setIdentityType("south-african")}
                      />
                      South African ID
                    </label>
                    <label className={identityType === "passport" ? "selected" : ""}>
                      <input
                        type="radio"
                        name="identityType"
                        value="passport"
                        checked={identityType === "passport"}
                        onChange={() => setIdentityType("passport")}
                      />
                      Passport
                    </label>
                  </fieldset>
                  {identityType === "south-african" ? (
                    <RegistrationField
                      label="South African ID number"
                      name="southAfricanIdNumber"
                      inputMode="numeric"
                      maxLength={13}
                    />
                  ) : (
                    <>
                      <RegistrationField label="Passport number" name="passportNumber" />
                      <RegistrationField label="Country of issue" name="passportCountry" />
                    </>
                  )}
                  <RegistrationSelect label="Gender" name="gender" options={["Male", "Female"]} />
                  <RegistrationSelect
                    label="Ethnicity"
                    name="ethnicity"
                    options={["Indian", "Coloured", "African", "White"]}
                  />
                  <RegistrationSelect
                    label="Home language"
                    name="homeLanguageChoice"
                    value={homeLanguage}
                    onChange={setHomeLanguage}
                    options={["English", "Other"]}
                  />
                  {homeLanguage === "Other" ? (
                    <RegistrationField
                      label="Please specify your home language"
                      name="otherLanguage"
                    />
                  ) : null}
                  <RegistrationField
                    label="Full home address"
                    name="fullHomeAddress"
                    autoComplete="street-address"
                    wide
                  />
                  <RegistrationField
                    label="Province"
                    name="province"
                    autoComplete="address-level1"
                  />
                  <RegistrationField
                    label="Postal code"
                    name="postalCode"
                    autoComplete="postal-code"
                  />
                  <RegistrationField
                    label="Email address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    wide
                  />
                </div>
              </section>

              <section className="registration-form-section">
                <div className="registration-section-number">02</div>
                <div className="registration-section-title">
                  <p className="eyebrow">EDUCATION & EMPLOYMENT</p>
                  <h2>Your study and work details</h2>
                </div>
                <div className="registration-fields">
                  <RegistrationSelect
                    label="Did you pass Grade 12?"
                    name="passedGrade12"
                    options={["Yes", "No"]}
                    optionValues={["yes", "no"]}
                  />
                  <RegistrationField
                    label="Name of qualification"
                    name="qualificationName"
                    placeholder="Your highest qualification"
                  />
                  <fieldset className="registration-choice">
                    <legend>Are you currently employed at a real estate company?</legend>
                    <label className={!employed ? "selected" : ""}>
                      <input
                        type="radio"
                        name="employment"
                        checked={!employed}
                        onChange={() => setEmployed(false)}
                      />
                      No
                    </label>
                    <label className={employed ? "selected" : ""}>
                      <input
                        type="radio"
                        name="employment"
                        checked={employed}
                        onChange={() => setEmployed(true)}
                      />
                      Yes
                    </label>
                  </fieldset>
                  {employed ? (
                    <RegistrationField
                      label="Which company do you work for?"
                      name="realEstateCompany"
                      wide
                    />
                  ) : null}
                </div>
              </section>

              <section className="registration-form-section">
                <div className="registration-section-number">03</div>
                <div className="registration-section-title">
                  <p className="eyebrow">UPLOAD DOCUMENTS</p>
                  <h2>Add your supporting documents</h2>
                </div>
                <div className="registration-upload-grid">
                  <RegistrationFileUpload
                    label="Certified ID or passport"
                    hint="Front and back, or the identity page"
                    file={files.identity}
                    onChange={(file) => setFiles((current) => ({ ...current, identity: file }))}
                  />
                  <RegistrationFileUpload
                    label="Matric certificate or affidavit"
                    hint="Use the affidavit wording from the original form"
                    file={files.education}
                    onChange={(file) => setFiles((current) => ({ ...current, education: file }))}
                  />
                  <RegistrationFileUpload
                    label="Proof of payment"
                    hint="Receipt, transfer confirmation or payment slip"
                    file={files.payment}
                    onChange={(file) => setFiles((current) => ({ ...current, payment: file }))}
                  />
                </div>
              </section>

              <section className="registration-form-section">
                <div className="registration-section-number">04</div>
                <div className="registration-section-title">
                  <p className="eyebrow">PAYMENT PLAN & DECLARATION</p>
                  <h2>Choose how you would like to be invoiced</h2>
                </div>
                <fieldset className="payment-plan-options">
                  <legend>Payment plan</legend>
                  <label>
                    <input
                      type="radio"
                      name="paymentPlan"
                      value="once_off"
                      defaultChecked
                      required
                    />
                    <span>
                      <strong>R6,000 once-off</strong>
                      <small>One full payment</small>
                    </span>
                  </label>
                  <label>
                    <input type="radio" name="paymentPlan" value="monthly" required />
                    <span>
                      <strong>R1,200 × 6 months</strong>
                      <small>Total: R7,200</small>
                    </span>
                  </label>
                </fieldset>
                <div className="registration-declaration">
                  <p>
                    I understand that registration will only be finalised once my fully completed
                    form, the required identity and matric documents, and proof of payment have been
                    received and reviewed.
                  </p>
                  <label>
                    <input type="checkbox" name="declarationAccepted" required />
                    <span>
                      I have completed this form honestly and accept the declaration above.
                    </span>
                  </label>
                </div>
                <div className="registration-signature-fields">
                  <RegistrationField
                    label="Electronic signature — type your full name"
                    name="signatureName"
                  />
                  <RegistrationField
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
              {error ? (
                <p className="registration-error inline-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="registration-submit-bar">
                <p>
                  <ShieldCheck aria-hidden="true" /> Your application and documents are securely
                  sent for administrator review.
                </p>
                <button className="brand-button" type="submit" disabled={busy}>
                  {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
                  {busy ? "Uploading securely…" : "Submit registration"}
                  {!busy ? <ArrowRight aria-hidden="true" /> : null}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </PortalFrame>
  );
}

function RegistrationField({
  label,
  name,
  wide = false,
  ...inputProps
}: {
  label: string;
  name: string;
  wide?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "id">) {
  return (
    <label className={`registration-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      <input id={`registration-${name}`} name={name} required {...inputProps} />
    </label>
  );
}

function RegistrationSelect({
  label,
  name,
  options,
  optionValues,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: string[];
  optionValues?: string[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="registration-field">
      <span>{label}</span>
      <select
        id={`registration-${name}`}
        name={name}
        required
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {!value ? <option value="">Choose an option</option> : null}
        {options.map((option, index) => (
          <option value={optionValues?.[index] ?? option} key={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function RegistrationFileUpload({
  label,
  hint,
  file,
  onChange,
}: {
  label: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className={`registration-upload${file ? " has-file" : ""}`}>
      <span className="registration-upload-icon">
        {file ? <Check aria-hidden="true" /> : <FileText aria-hidden="true" />}
      </span>
      <strong>{label}</strong>
      <span>{file ? file.name : hint}</span>
      <small>
        {file ? `${Math.ceil(file.size / 1024)} KB · click to replace` : "Choose PDF, JPG or PNG"}
      </small>
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        required
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function StudentDashboard({
  profile,
  modules,
  content,
  progress,
  onOpenModule,
  onExplore,
}: {
  profile: Profile;
  modules: Module[];
  content: ContentItem[];
  progress: LearningProgress[];
  onOpenModule: (module: Module) => void;
  onExplore: () => void;
}) {
  const [search, setSearch] = useState("");
  const visibleModules = modules.filter((module) =>
    `${module.title} ${module.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  const contentIds = new Set(content.map((item) => item.id));
  const completed = new Set(
    progress
      .filter((item) => item.status === "completed" && contentIds.has(item.content_id))
      .map((item) => item.content_id),
  ).size;
  const overallProgress = content.length ? Math.round((completed / content.length) * 100) : 0;

  return (
    <div className="portal-container student-page">
      <section className="dashboard-hero">
        <div className="hero-stripe" aria-hidden="true" />
        <div className="dashboard-hero-copy">
          <p className="eyebrow">YOUR LEARNING SPACE</p>
          <h1>
            Good to see you, <span>{profile.full_name.split(" ")[0] || "learner"}</span>
          </h1>
          <p>
            {modules.length
              ? "Your learning journey is ready when you are. Pick up where you left off."
              : "Your learning space is ready. Assigned courses will appear here."}
          </p>
          <button
            className="brand-button student-hero-action"
            type="button"
            onClick={onExplore}
            disabled={!modules.length}
          >
            {modules.length
              ? completed
                ? "Continue learning"
                : "Explore your courses"
              : "No courses assigned"}
            {Boolean(modules.length) && <ArrowRight aria-hidden="true" />}
          </button>
        </div>
        <div className="student-id">
          <div
            className="student-progress-ring"
            role="progressbar"
            aria-label="Overall course progress"
            aria-valuenow={overallProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              background: `conic-gradient(var(--brand-orange) ${overallProgress}%, oklch(1 0 0 / 16%) 0)`,
            }}
          >
            <div>
              <strong>{overallProgress}%</strong>
              <span>COMPLETE</span>
            </div>
          </div>
          <div className="student-id-copy">
            <span>YOUR STUDENT ID</span>
            <strong>{profile.student_id}</strong>
            <span>
              {completed} of {content.length} learning {content.length === 1 ? "item" : "items"}
            </span>
          </div>
        </div>
      </section>
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">YOUR COURSES</p>
          <h2>My learning modules</h2>
          <p className="dashboard-subheading">Open a course to find your learning materials.</p>
        </div>
        <label className="search-field">
          <Search aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a module"
            aria-label="Find a module"
          />
        </label>
      </div>
      {modules.length === 0 ? (
        <section className="empty-state">
          <span className="empty-icon">
            <BookOpen aria-hidden="true" />
          </span>
          <h3>Your courses will appear here</h3>
          <p>
            Your administrator hasn’t assigned any learning modules to your account yet. Please
            contact IV Consulting if you think this is a mistake.
          </p>
          <a className="brand-button" href="mailto:inyapavhusiku@gmail.com">
            Contact support <ArrowRight aria-hidden="true" />
          </a>
        </section>
      ) : visibleModules.length === 0 ? (
        <p className="empty-search">No modules match “{search}”. Try another search.</p>
      ) : (
        <div className="module-grid">
          {visibleModules.map((module, index) => {
            const moduleItems = content.filter((item) => item.module_id === module.id);
            const itemIds = new Set(moduleItems.map((item) => item.id));
            const completedItems = progress.filter(
              (item) => itemIds.has(item.content_id) && item.status === "completed",
            ).length;
            const percentage = moduleItems.length
              ? Math.round((completedItems / moduleItems.length) * 100)
              : 0;
            return (
              <article
                className="module-card"
                key={module.id}
                style={{ animationDelay: `${Math.min(index, 5) * 70}ms` }}
              >
                <div className={`module-art art-${index % 6}`}>
                  <span className="module-number">{String(module.position).padStart(2, "0")}</span>
                  <BookOpen aria-hidden="true" />
                </div>
                <div className="module-card-body">
                  <div className="module-card-heading">
                    <span className="module-kicker">
                      {module.position === 0
                        ? "START HERE · REQUIRED"
                        : `${moduleItems.length} learning ${moduleItems.length === 1 ? "item" : "items"}`}
                    </span>
                    <span
                      className={`module-completion ${percentage === 100 ? "complete" : percentage ? "in-progress" : ""}`}
                    >
                      {percentage === 100
                        ? "Complete"
                        : percentage
                          ? "In progress"
                          : moduleItems.length
                            ? "Ready"
                            : "Coming soon"}
                    </span>
                  </div>
                  <h3>{module.title}</h3>
                  <p>
                    {moduleItems.length > 0 &&
                    module.description === "Course materials will be added by your administrator."
                      ? "Choose a folder or material and learn at your own pace."
                      : module.description || "Your learning materials are ready when you are."}
                  </p>
                  <div className="module-progress-label">
                    <span>Your progress</span>
                    <strong>{percentage}%</strong>
                  </div>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label={`${module.title} progress`}
                    aria-valuenow={percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${percentage}%` }} />
                  </div>
                  <button
                    className="brand-button module-open"
                    type="button"
                    onClick={() => onOpenModule(module)}
                  >
                    {module.position === 0 ? "Start here" : "Open module"}{" "}
                    <ArrowRight aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <section className="learning-summary">
        <div>
          <span className="summary-icon">
            <LayoutDashboard aria-hidden="true" />
          </span>
          <div>
            <strong>{modules.length}</strong>
            <span>assigned modules</span>
          </div>
        </div>
        <div>
          <span className="summary-icon orange">
            <Check aria-hidden="true" />
          </span>
          <div>
            <strong>{completed}</strong>
            <span>items completed</span>
          </div>
        </div>
        <p>Every step forward counts. Keep learning at your own pace.</p>
      </section>
    </div>
  );
}

function ModuleWorkspace({
  module,
  content,
  folders,
  progress,
  search,
  setSearch,
  kind,
  setKind,
  error,
  openingContent,
  onBack,
  onOpenItem,
}: {
  module: Module;
  content: ContentItem[];
  folders: LearningFolder[];
  progress: LearningProgress[];
  search: string;
  setSearch: (search: string) => void;
  kind: "all" | ContentKind;
  setKind: (kind: "all" | ContentKind) => void;
  error: string;
  openingContent: string | null;
  onBack: () => void;
  onOpenItem: (item: ContentItem) => void;
}) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedFolderId(null);
  }, [module.id]);

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const sortedFolders = [...folders].sort((a, b) => a.position - b.position);
  const childFolders = sortedFolders.filter(
    (folder) => folder.parent_folder_id === selectedFolderId,
  );
  const folderPath: LearningFolder[] = [];
  let pathFolder = selectedFolder;
  const visitedPathFolders = new Set<string>();
  while (pathFolder && !visitedPathFolders.has(pathFolder.id)) {
    visitedPathFolders.add(pathFolder.id);
    folderPath.unshift(pathFolder);
    pathFolder = pathFolder.parent_folder_id
      ? foldersById.get(pathFolder.parent_folder_id)
      : undefined;
  }

  function folderTrail(folderId: string | null) {
    const trail: LearningFolder[] = [];
    let trailFolder = folderId ? foldersById.get(folderId) : undefined;
    const visited = new Set<string>();
    while (trailFolder && !visited.has(trailFolder.id)) {
      visited.add(trailFolder.id);
      trail.unshift(trailFolder);
      trailFolder = trailFolder.parent_folder_id
        ? foldersById.get(trailFolder.parent_folder_id)
        : undefined;
    }
    return trail;
  }

  function descendantFolderIds(folderId: string) {
    const ids = new Set<string>([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      sortedFolders.forEach((folder) => {
        if (folder.parent_folder_id && ids.has(folder.parent_folder_id) && !ids.has(folder.id)) {
          ids.add(folder.id);
          changed = true;
        }
      });
    }
    return ids;
  }

  function itemsInFolder(folderId: string) {
    const ids = descendantFolderIds(folderId);
    return content.filter((item) => item.folder_id && ids.has(item.folder_id));
  }

  const normalizedSearch = search.trim().toLowerCase();
  const visibleFolders = normalizedSearch
    ? sortedFolders.filter((folder) =>
        `${folder.title} ${folder.description}`.toLowerCase().includes(normalizedSearch),
      )
    : childFolders;
  const visibleItems = content.filter((item) => {
    const matchesLocation = normalizedSearch || item.folder_id === selectedFolderId;
    return (
      matchesLocation &&
      (kind === "all" || item.type === kind) &&
      `${item.title} ${item.description}`.toLowerCase().includes(normalizedSearch)
    );
  });
  const progressById = new Map(progress.map((item) => [item.content_id, item]));
  const categories: { id: "all" | ContentKind; label: string }[] = [
    { id: "all", label: "All materials" },
    { id: "pdf", label: "Documents" },
    { id: "video", label: "Videos" },
    { id: "audio", label: "Podcasts" },
  ];
  const visibleResultCount = visibleFolders.length + visibleItems.length;
  const moduleDescription =
    content.length > 0 &&
    module.description === "Course materials will be added by your administrator."
      ? "Choose a folder or material to continue learning at your own pace."
      : module.description || "Choose what you would like to learn next.";
  const openFolder = (folder: LearningFolder) => {
    setSearch("");
    setKind("all");
    setSelectedFolderId(folder.id);
  };

  return (
    <section className="portal-container module-page">
      <button className="back-link" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Back to my modules
      </button>
      <div className="module-page-heading">
        <div>
          <p className="eyebrow">
            {module.position === 0 ? "START HERE · INDUCTION" : "YOU ARE LEARNING"}
          </p>
          <h1>{module.title}</h1>
          <p>{moduleDescription}</p>
        </div>
        <div className="module-page-symbol">
          <BookOpen aria-hidden="true" />
        </div>
      </div>
      <section className="module-guide" aria-label="How to use this module">
        <div className="module-guide-intro">
          <span>
            <CircleHelp aria-hidden="true" />
          </span>
          <div>
            <strong>Not sure where to begin?</strong>
            <p>Follow these simple steps. You cannot break or lose anything here.</p>
          </div>
        </div>
        <ol>
          <li>
            <span>1</span>
            <div>
              <strong>{folders.length ? "Choose a folder" : "Find a material"}</strong>
              <small>
                {folders.length ? "Use the large cards below" : "Browse or search below"}
              </small>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Open a material</strong>
              <small>Press the clear Open button</small>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Come back anytime</strong>
              <small>Use Back to my modules</small>
            </div>
          </li>
        </ol>
      </section>
      <div className="materials-toolbar">
        <div className="materials-tabs" aria-label="Filter course materials">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={kind === category.id ? "active" : ""}
              onClick={() => setKind(category.id)}
            >
              {category.label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by material name"
            aria-label="Search by material name"
          />
        </label>
      </div>
      <div className="module-explorer without-folder-nav">
        <div className="module-library">
          {selectedFolder ? (
            <nav className="module-breadcrumbs" aria-label="Folder path">
              <span className="module-breadcrumb-label">You are here:</span>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setKind("all");
                  setSelectedFolderId(null);
                }}
              >
                {module.title}
              </button>
              {folderPath.map((folder) => (
                <span key={folder.id}>
                  <ChevronRight aria-hidden="true" />
                  <button type="button" onClick={() => openFolder(folder)}>
                    {folder.title}
                  </button>
                </span>
              ))}
            </nav>
          ) : null}

          <div className="module-location-heading">
            {selectedFolder ? (
              <button
                className="module-parent-button"
                type="button"
                onClick={() => {
                  setSearch("");
                  setKind("all");
                  setSelectedFolderId(selectedFolder.parent_folder_id);
                }}
                aria-label={
                  selectedFolder.parent_folder_id
                    ? `Go back to ${foldersById.get(selectedFolder.parent_folder_id)?.title}`
                    : "Go back to module overview"
                }
              >
                <ArrowLeft aria-hidden="true" />
                <span>
                  {selectedFolder.parent_folder_id
                    ? foldersById.get(selectedFolder.parent_folder_id)?.title
                    : module.title}
                </span>
              </button>
            ) : null}
            <div className="module-location-copy">
              <p className="eyebrow">
                {normalizedSearch
                  ? "SEARCHING THIS MODULE"
                  : selectedFolder
                    ? "YOU ARE INSIDE THIS FOLDER"
                    : "YOUR MODULE LIBRARY"}
              </p>
              <h2>
                {normalizedSearch
                  ? `Results for “${search.trim()}”`
                  : (selectedFolder?.title ?? "What would you like to learn?")}
              </h2>
              <p>
                {normalizedSearch
                  ? `${visibleResultCount} ${visibleResultCount === 1 ? "result" : "results"} across all folders`
                  : selectedFolder?.description ||
                    "Choose a folder below, or open a learning material that is already available."}
              </p>
            </div>
          </div>

          {error ? (
            <div className="inline-error module-error" role="alert">
              {error}
            </div>
          ) : null}

          {!error && visibleFolders.length > 0 ? (
            <section className="module-folder-section" aria-labelledby="folders-title">
              <div className="module-section-heading">
                <div>
                  <span className="eyebrow">CHOOSE ONE OPTION</span>
                  <h3 id="folders-title">
                    {normalizedSearch ? "Folders that match" : "Where would you like to go?"}
                  </h3>
                </div>
                <span>
                  {visibleFolders.length} {visibleFolders.length === 1 ? "folder" : "folders"}
                </span>
              </div>
              <div className="module-folder-grid">
                {visibleFolders.map((folder, index) => {
                  const folderItems = itemsInFolder(folder.id);
                  const subfolderCount = sortedFolders.filter(
                    (entry) => entry.parent_folder_id === folder.id,
                  ).length;
                  return (
                    <button
                      className="module-folder-card"
                      type="button"
                      key={folder.id}
                      onClick={() => openFolder(folder)}
                    >
                      <span className="module-folder-card-icon">
                        <FolderOpen aria-hidden="true" />
                      </span>
                      <span className="module-folder-card-copy">
                        <span className="module-folder-step">
                          {normalizedSearch ? "Folder" : `Folder ${index + 1}`}
                        </span>
                        {normalizedSearch ? (
                          <span className="module-folder-card-path">
                            {folderTrail(folder.parent_folder_id)
                              .map((entry) => entry.title)
                              .join(" / ") || module.title}
                          </span>
                        ) : null}
                        <strong>{folder.title}</strong>
                        <span>
                          {folder.description || "Open this folder to explore its materials."}
                        </span>
                      </span>
                      <span className="module-folder-card-meta">
                        <span>
                          {folderItems.length} {folderItems.length === 1 ? "material" : "materials"}
                        </span>
                        {subfolderCount > 0 ? (
                          <span>
                            {subfolderCount}{" "}
                            {subfolderCount === 1 ? "folder inside" : "folders inside"}
                          </span>
                        ) : null}
                        <strong>
                          Open this folder <ArrowRight aria-hidden="true" />
                        </strong>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {!error && visibleItems.length > 0 ? (
            <section className="module-materials-section" aria-labelledby="materials-title">
              <div className="module-section-heading">
                <div>
                  <span className="eyebrow">
                    {selectedFolder && !normalizedSearch ? "READY TO OPEN" : "LEARNING MATERIALS"}
                  </span>
                  <h3 id="materials-title">
                    {normalizedSearch ? "Materials that match" : "Choose a material"}
                  </h3>
                </div>
                <span>
                  {visibleItems.length} {visibleItems.length === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="content-list">
                {visibleItems.map((item) => {
                  const itemProgress = progressById.get(item.id);
                  const itemFolderTrail = folderTrail(item.folder_id)
                    .map((entry) => entry.title)
                    .join(" / ");
                  return (
                    <article className="content-row" key={item.id}>
                      <span className={`content-kind-icon ${item.type}`}>
                        {kindIcon(item.type)}
                      </span>
                      <div className="content-row-copy">
                        <span className="module-kicker">
                          {itemFolderTrail ? `${itemFolderTrail} · ` : ""}
                          {kindLabel(item.type, item.storage_path)}
                        </span>
                        <h3>{item.title}</h3>
                        <p>{item.description || "Open this material to continue learning."}</p>
                      </div>
                      <span className={`status-pill ${itemProgress?.status ?? "not_started"}`}>
                        {itemProgress?.status === "completed"
                          ? "Completed"
                          : itemProgress?.status === "in_progress"
                            ? "In progress"
                            : "Ready to open"}
                      </span>
                      <button
                        className="outline-button"
                        type="button"
                        onClick={() => onOpenItem(item)}
                        disabled={openingContent === item.id}
                      >
                        {openingContent === item.id ? (
                          <LoaderCircle className="spin" aria-hidden="true" />
                        ) : (
                          <ArrowRight aria-hidden="true" />
                        )}
                        {openingContent === item.id
                          ? "Opening"
                          : `Open ${kindLabel(item.type, item.storage_path).toLowerCase()}`}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {!error && visibleResultCount === 0 ? (
            <div className="module-explorer-empty empty-state compact-empty">
              <span className="empty-icon">
                {normalizedSearch ? <Search aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
              </span>
              <h3>
                {normalizedSearch
                  ? "No results found"
                  : visibleFolders.length === 0 && childFolders.length === 0
                    ? "This folder is empty"
                    : content.length
                      ? "No materials in this location"
                      : "Materials are on their way"}
              </h3>
              <p>
                {normalizedSearch
                  ? "Try a shorter phrase or clear the material type filter."
                  : selectedFolder
                    ? "Return to the module overview or choose another folder."
                    : "Your administrator has not published course materials here yet."}
              </p>
              {normalizedSearch ? (
                <button
                  className="outline-button"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setKind("all");
                  }}
                >
                  Clear search
                </button>
              ) : selectedFolder ? (
                <button
                  className="outline-button"
                  type="button"
                  onClick={() => setSelectedFolderId(null)}
                >
                  <ArrowLeft aria-hidden="true" /> Module overview
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <p className="protection-note">
        <ShieldCheck aria-hidden="true" /> This content is for your personal learning. Please don’t
        share or redistribute it.
      </p>
    </section>
  );
}

function ContentViewer({
  item,
  url,
  profile,
  progress,
  onClose,
  onNotice,
}: {
  item: ContentItem;
  url: string;
  profile: Profile;
  progress: LearningProgress[];
  onClose: () => void;
  onNotice: (notice: string) => void;
}) {
  const savedProgress = progress.find((entry) => entry.content_id === item.id);
  const lastSaved = useRef(0);
  const startAt = savedProgress?.position_seconds ?? 0;
  const fileExtension = item.storage_path.split(".").at(-1)?.toLowerCase();
  const isImage = fileExtension === "jpg" || fileExtension === "jpeg" || fileExtension === "png";
  const isOfficeDocument =
    fileExtension === "pptx" ||
    fileExtension === "docx" ||
    fileExtension === "doc" ||
    fileExtension === "xlsx" ||
    fileExtension === "xls";
  const [mediaReady, setMediaReady] = useState(isOfficeDocument);

  async function saveProgress(status: "in_progress" | "completed", positionSeconds: number) {
    try {
      await saveLearningProgress({ data: { contentId: item.id, status, positionSeconds } });
    } catch (error) {
      onNotice(messageFrom(error));
    }
  }

  function onTimeUpdate(event: SyntheticEvent<HTMLMediaElement>) {
    const media = event.currentTarget;
    const seconds = Math.floor(media.currentTime);
    if (seconds < lastSaved.current + 15) return;
    lastSaved.current = seconds;
    void saveProgress("in_progress", seconds);
  }

  return (
    <div
      className="viewer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="viewer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="viewer-title"
      >
        <header className="viewer-header">
          <div>
            <span className="module-kicker">
              {kindLabel(item.type, item.storage_path)} · {profile.student_id}
            </span>
            <h2 id="viewer-title">{item.title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close learning material"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="viewer-content">
          {item.type === "pdf" && isImage ? (
            <div className="media-wrap document-image-wrap">
              <img
                src={url}
                alt={item.title}
                onLoad={() => setMediaReady(true)}
                onError={() => {
                  setMediaReady(true);
                  onNotice("This learning image could not be displayed.");
                }}
              />
              <div className="watermark">
                {profile.full_name} · {profile.student_id}
              </div>
            </div>
          ) : item.type === "pdf" && isOfficeDocument ? (
            <div className="document-download">
              <FileText aria-hidden="true" />
              <p>This {kindLabel(item.type, item.storage_path)} is available as a download.</p>
              <a className="brand-button" href={url} download>
                Download {kindLabel(item.type, item.storage_path)}
                <ArrowRight aria-hidden="true" />
              </a>
            </div>
          ) : item.type === "pdf" ? (
            <div className="pdf-wrap">
              <iframe
                title={item.title}
                src={`${url}#toolbar=0&navpanes=0`}
                onLoad={() => setMediaReady(true)}
              />
              <div className="watermark">
                {profile.full_name} · {profile.student_id}
              </div>
            </div>
          ) : (
            <div className="media-wrap">
              <div className="watermark">
                {profile.full_name} · {profile.student_id}
              </div>
              {item.type === "video" ? (
                <video
                  src={url}
                  controls
                  playsInline
                  controlsList="nodownload"
                  disablePictureInPicture
                  onLoadedMetadata={(event) => {
                    event.currentTarget.currentTime = startAt;
                    setMediaReady(true);
                  }}
                  onTimeUpdate={onTimeUpdate}
                  onEnded={(event) =>
                    void saveProgress("completed", event.currentTarget.duration || 0)
                  }
                  onContextMenu={(event) => event.preventDefault()}
                />
              ) : (
                <audio
                  src={url}
                  controls
                  controlsList="nodownload"
                  onLoadedMetadata={(event) => {
                    event.currentTarget.currentTime = startAt;
                    setMediaReady(true);
                  }}
                  onTimeUpdate={onTimeUpdate}
                  onEnded={(event) =>
                    void saveProgress("completed", event.currentTarget.duration || 0)
                  }
                  onContextMenu={(event) => event.preventDefault()}
                />
              )}
            </div>
          )}
          {!mediaReady && (
            <span className="viewer-loading">
              <LoaderCircle className="spin" aria-hidden="true" /> Loading secure material…
            </span>
          )}
        </div>
        <footer className="viewer-footer">
          <span>
            <ShieldCheck aria-hidden="true" /> For your learning only. Sharing is prohibited.
          </span>
          {item.type === "pdf" && (
            <button
              className="brand-button"
              type="button"
              onClick={() => {
                void saveProgress("completed", 0);
                onClose();
              }}
            >
              Mark as complete <Check aria-hidden="true" />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function AdminWorkspace({ profile, preview = false }: { profile: Profile; preview?: boolean }) {
  const [data, setData] = useState<AdminData | null>(() => {
    if (!preview) return null;
    return loadPreviewState()?.data ?? PREVIEW_ADMIN_DATA;
  });
  const [assignments, setAssignments] = useState<Record<string, string[]>>(() => {
    if (!preview) return {};
    return loadPreviewState()?.assignments ?? {};
  });
  const [error, setError] = useState("");
  const [retryableError, setRetryableError] = useState(false);
  const [loading, setLoading] = useState(!preview);
  const [tab, setTab] = useState<
    "overview" | "registrations" | "content" | "students" | "activity"
  >("overview");
  const [registrations, setRegistrations] = useState<RegistrationData[]>([]);
  const [selectedRegistration, setSelectedRegistration] = useState<RegistrationData | null>(null);
  const [registrationLogin, setRegistrationLogin] = useState<{
    name: string;
    email: string;
    studentId: string;
    temporaryPassword: string;
    loginPath: string;
  } | null>(null);
  const [contentFolderId, setContentFolderId] = useState<string | null>(null);
  const [contentSubfolderId, setContentSubfolderId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [studentDialog, setStudentDialog] = useState<AdminProfile | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [moduleFormOpen, setModuleFormOpen] = useState(false);
  const [moduleEditing, setModuleEditing] = useState<AdminModule | null>(null);
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [folderEditing, setFolderEditing] = useState<AdminFolder | null>(null);
  const contentFolder = data?.modules.find((module) => module.id === contentFolderId) ?? null;
  const contentSubfolder = data?.folders.find((folder) => folder.id === contentSubfolderId) ?? null;
  const missingStarterModules = STARTER_MODULES.filter(
    (starter) => !data?.modules.some((module) => module.title === starter.title),
  );
  const starterModuleIds = (data?.modules ?? [])
    .filter((module) => STARTER_MODULES.some((starter) => starter.title === module.title))
    .map((module) => module.id);
  const activeStudents =
    data?.profiles.filter((person) => person.active && person.role === "student") ?? [];
  const studentsMissingStarterModules = activeStudents.some((student) =>
    starterModuleIds.some((moduleId) => !assignments[student.id]?.includes(moduleId)),
  );

  const refresh = useCallback(async () => {
    if (preview) {
      setData((current) => current ?? PREVIEW_ADMIN_DATA);
      setError("");
      setRetryableError(false);
      setLoading(false);
      setRegistrations([]);
      return;
    }

    setLoading(true);
    setError("");
    setRetryableError(false);
    try {
      let [portalData, assignmentResult, registrationResult] = await Promise.all([
        listAdminPortalData(),
        supabase.from("student_modules").select("student_id, module_id"),
        listStudentRegistrations(),
      ]);
      if (assignmentResult.error) throw assignmentResult.error;
      const missingStarterModule = STARTER_MODULES.some(
        (starter) =>
          !portalData.modules.some(
            (module) => module.title.trim().toLowerCase() === starter.title.toLowerCase(),
          ),
      );
      if (missingStarterModule) {
        await setupStarterModules();
        [portalData, assignmentResult, registrationResult] = await Promise.all([
          listAdminPortalData(),
          supabase.from("student_modules").select("student_id, module_id"),
          listStudentRegistrations(),
        ]);
        if (assignmentResult.error) throw assignmentResult.error;
        const stillMissingStarterModule = STARTER_MODULES.some(
          (starter) =>
            !portalData.modules.some(
              (module) => module.title.trim().toLowerCase() === starter.title.toLowerCase(),
            ),
        );
        if (stillMissingStarterModule) {
          throw new Error(
            "The starter modules were created but could not be loaded. Verify this account has administrator access in Supabase.",
          );
        }
      }
      const nextAssignments: Record<string, string[]> = {};
      for (const assignment of assignmentResult.data ?? []) {
        nextAssignments[assignment.student_id] = [
          ...(nextAssignments[assignment.student_id] ?? []),
          assignment.module_id,
        ];
      }
      setData(portalData);
      setAssignments(nextAssignments);
      setRegistrations(registrationResult.registrations);
    } catch (caught) {
      setError(messageFrom(caught));
      setRetryableError(true);
    } finally {
      setLoading(false);
    }
  }, [preview]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!preview || !data || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        PREVIEW_STORAGE_KEY,
        JSON.stringify({ data, assignments } satisfies PreviewState),
      );
    } catch (error) {
      console.warn("Local preview changes could not be persisted.", error);
    }
  }, [assignments, data, preview]);

  async function seedModules() {
    if (preview) {
      setError("");
      setRetryableError(false);
      const newModules = missingStarterModules.map((module) => ({
        ...module,
        id: `preview-module-${crypto.randomUUID()}`,
      }));
      const allStarterModuleIds = [...starterModuleIds, ...newModules.map((module) => module.id)];
      setData((current) =>
        current ? { ...current, modules: [...current.modules, ...newModules] } : current,
      );
      setAssignments((current) => {
        const nextAssignments = { ...current };
        for (const student of activeStudents) {
          nextAssignments[student.id] = Array.from(
            new Set([...(nextAssignments[student.id] ?? []), ...allStarterModuleIds]),
          );
        }
        return nextAssignments;
      });
      setNotice("All starter modules are assigned to sample students and saved in this browser.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const result = await setupStarterModules();
      setNotice(
        `${result.moduleCount} starter modules are ready and assigned to ${result.assignedStudents} active students.`,
      );
      await refresh();
    } catch (caught) {
      setError(messageFrom(caught));
      setRetryableError(false);
    } finally {
      setBusy(false);
    }
  }

  async function saveModule(input: ModuleDraft) {
    if (preview) {
      setError("");
      setRetryableError(false);
      const duplicate = data?.modules.some(
        (module) =>
          module.id !== input.id && module.title.trim().toLowerCase() === input.title.toLowerCase(),
      );
      if (duplicate) throw new Error("A folder already uses that name. Choose a different name.");
      const existing = data?.modules.find((module) => module.id === input.id);
      const savedModule = {
        id: existing?.id ?? `preview-module-${crypto.randomUUID()}`,
        title: input.title.trim(),
        description: input.description.trim(),
        position:
          existing?.position ??
          Math.max(0, ...(data?.modules ?? []).map((module) => module.position)) + 1,
      };
      setData((current) =>
        current
          ? {
              ...current,
              modules: existing
                ? current.modules.map((module) =>
                    module.id === existing.id ? savedModule : module,
                  )
                : [...current.modules, savedModule],
            }
          : current,
      );
      setNotice("Sample folder saved in this browser.");
      return;
    }
    await savePortalModule({ data: input });
    setNotice("Course folder saved.");
    await refresh();
  }

  async function removeModule(module: AdminModule) {
    if (busy) return;
    if (
      !window.confirm(
        `Delete the "${module.title}" folder? It must be empty and have no student assignments. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setRetryableError(false);
    setNotice("");
    try {
      if (preview) {
        const hasContent = data?.items.some((item) => item.module_id === module.id);
        const hasAssignments = Object.values(assignments).some((moduleIds) =>
          moduleIds.includes(module.id),
        );
        if (hasContent || hasAssignments) {
          throw new Error(
            "This folder still has course content or student assignments. Remove those first, then try again.",
          );
        }
        setData((current) =>
          current
            ? {
                ...current,
                modules: current.modules.filter((candidate) => candidate.id !== module.id),
              }
            : current,
        );
        setNotice("Sample folder deleted from this browser.");
      } else {
        await deletePortalModule({ data: { id: module.id } });
        setNotice("Course folder deleted.");
        await refresh();
      }
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  async function toggleItem(
    item: AdminItem,
    action: "hide" | "publish" | "delete" | "restore" | "permanentlyDelete",
  ) {
    if (
      action === "delete" &&
      !window.confirm(
        `Move "${item.title}" to Recently deleted? Students will no longer see it. You can restore it for 30 days.`,
      )
    ) {
      return;
    }
    if (
      action === "permanentlyDelete" &&
      !window.confirm(`Permanently delete "${item.title}" and its file? This cannot be undone.`)
    ) {
      return;
    }
    if (preview) {
      setError("");
      setRetryableError(false);
      const isExpired = item.deleted_at ? !isRecentlyDeleted(item.deleted_at) : false;
      if (action === "permanentlyDelete" && !isExpired) {
        setError("Items can only be permanently deleted after 30 days in Recently deleted.");
        return;
      }
      setData((current) => {
        if (!current) return current;
        if (action === "permanentlyDelete") {
          return {
            ...current,
            items: current.items.filter((candidate) => candidate.id !== item.id),
          };
        }
        return {
          ...current,
          items: current.items.map((candidate) =>
            candidate.id === item.id
              ? action === "delete"
                ? { ...candidate, deleted_at: new Date().toISOString(), is_hidden: true }
                : action === "restore"
                  ? { ...candidate, deleted_at: null, is_hidden: true }
                  : { ...candidate, is_hidden: action === "hide" }
              : candidate,
          ),
        };
      });
      setNotice(
        action === "delete"
          ? "Sample item moved to Recently deleted."
          : action === "restore"
            ? "Sample item restored and kept hidden."
            : action === "hide"
              ? "Sample item hidden from students."
              : action === "publish"
                ? "Sample item published."
                : "Sample item permanently deleted.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setRetryableError(false);
    setNotice("");
    try {
      if (action === "permanentlyDelete") {
        await permanentlyDeletePortalContent({ data: { id: item.id } });
        setNotice("Course item and private file permanently deleted.");
      } else {
        await changePortalContentState({ data: { id: item.id, action } });
        setNotice(
          action === "delete"
            ? "Item moved to Recently deleted."
            : action === "restore"
              ? "Item restored and kept hidden."
              : action === "hide"
                ? "Item hidden from students."
                : "Item published.",
        );
      }
      await refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentDialog) return;
    const formData = new FormData(event.currentTarget);
    const moduleIds = Array.from(formData.getAll("student-module")).map(String);
    const studentUpdate = {
      studentId: studentDialog.id,
      fullName: String(formData.get("fullName") ?? "").trim(),
      role:
        studentDialog.id === profile.id
          ? studentDialog.role
          : String(formData.get("role")) === "admin"
            ? ("admin" as const)
            : ("student" as const),
      active:
        studentDialog.id === profile.id ? studentDialog.active : formData.get("active") === "on",
      moduleIds,
    };
    setBusy(true);
    setDialogError("");
    try {
      if (preview) {
        setData((current) =>
          current
            ? {
                ...current,
                profiles: current.profiles.map((person) =>
                  person.id === studentDialog.id
                    ? {
                        ...person,
                        full_name: studentUpdate.fullName,
                        role: studentUpdate.role,
                        active: studentUpdate.active,
                      }
                    : person,
                ),
              }
            : current,
        );
        setAssignments((current) => ({ ...current, [studentDialog.id]: moduleIds }));
        setNotice("Sample account updated in this browser.");
      } else {
        await updateStudentPortalAccess({ data: studentUpdate });
        setNotice("Student access updated.");
      }
      setStudentDialog(null);
      await refresh();
    } catch (caught) {
      setDialogError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  async function inviteStudent(input: {
    email: string;
    fullName: string;
    studentId: string;
    moduleIds: string[];
  }) {
    setBusy(true);
    setDialogError("");
    try {
      if (preview) {
        const id = `preview-student-${crypto.randomUUID()}`;
        setData((current) =>
          current
            ? {
                ...current,
                profiles: [
                  {
                    id,
                    full_name: input.fullName,
                    student_id: input.studentId,
                    role: "student",
                    active: true,
                    created_at: new Date().toISOString(),
                    terms_accepted_at: null,
                    email: input.email,
                  },
                  ...current.profiles,
                ],
              }
            : current,
        );
        setAssignments((current) => ({ ...current, [id]: input.moduleIds }));
        setNotice("Sample student added in this browser. No email was sent.");
      } else {
        await invitePortalStudent({ data: input });
        setNotice("Student invitation sent.");
      }
      setInviteOpen(false);
      await refresh();
    } catch (caught) {
      setDialogError(messageFrom(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function decideRegistration(
    registrationId: string,
    action: "approve" | "reject",
    notes: string,
  ) {
    setBusy(true);
    setDialogError("");
    setRegistrationLogin(null);
    try {
      const result = await reviewStudentRegistration({
        data: { registrationId, action, notes },
      });
      if (result.status === "approved") {
        setRegistrationLogin(result.login);
        setNotice("Registration approved and the student account has been created.");
      } else {
        setNotice("Registration rejected and saved for your records.");
        setSelectedRegistration(null);
      }
      await refresh();
    } catch (caught) {
      setDialogError(messageFrom(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data)
    return (
      <section className="portal-container admin-loading">
        <LoaderCircle className="spin" aria-hidden="true" /> Loading administration…
      </section>
    );

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <p className="eyebrow">ADMINISTRATION</p>
        <nav aria-label="Administration">
          {(
            [
              ["overview", LayoutDashboard, "Overview"],
              ["registrations", FileText, "Registrations"],
              ["content", BookOpen, "Course content"],
              ["students", Users, "Students"],
              ["activity", Clock3, "Activity"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setError("");
                setRetryableError(false);
                setNotice("");
                if (id === "content") {
                  setContentFolderId(null);
                  setContentSubfolderId(null);
                  setSearch("");
                }
              }}
            >
              <Icon aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
        <div className="admin-help">
          <ShieldCheck aria-hidden="true" />
          <strong>Keep learning safe</strong>
          <p>
            Private course files are only available to assigned students. A screen recording or
            photo cannot be completely prevented.
          </p>
        </div>
      </aside>
      <section className="admin-content">
        <div className="admin-topline">
          <div>
            <p className="eyebrow">IV CONSULTING · ADMIN</p>
            <h1>
              {tab === "overview"
                ? "Overview"
                : tab === "content"
                  ? (contentFolder?.title ?? "Course content")
                  : tab === "registrations"
                    ? "Student registrations"
                    : tab === "students"
                      ? "People & access"
                      : "Recent activity"}
            </h1>
          </div>
          {tab === "content" && (
            <button
              className="brand-button"
              type="button"
              onClick={
                contentFolder
                  ? () => {
                      setEditing(null);
                      setShowForm(true);
                    }
                  : () => {
                      setModuleEditing(null);
                      setModuleFormOpen(true);
                    }
              }
            >
              <Plus aria-hidden="true" />
              {contentFolder ? "Add course content" : "Add module folder"}
            </button>
          )}
          {tab === "students" && (
            <button
              className="brand-button"
              type="button"
              onClick={() => {
                setDialogError("");
                setInviteOpen(true);
              }}
              disabled={busy}
            >
              <Plus aria-hidden="true" /> Invite student
            </button>
          )}
        </div>
        {error && (
          <div className="admin-error" role="alert">
            <span>{error}</span>
            <div className="admin-error-actions">
              {retryableError && (
                <button type="button" className="text-button" onClick={() => void refresh()}>
                  Retry loading
                </button>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setError("");
                  setRetryableError(false);
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {notice && (
          <p className="admin-notice" role="status">
            {notice}
            <button type="button" aria-label="Dismiss" onClick={() => setNotice("")}>
              <X aria-hidden="true" />
            </button>
          </p>
        )}
        {!error && !data ? null : tab === "overview" ? (
          <div className="admin-overview">
            <section className="admin-welcome-band" aria-label="Administration overview">
              <div>
                <p className="eyebrow">YOUR WORKSPACE</p>
                <h2>Welcome back, {profile.full_name.split(" ")[0]}</h2>
                <p>Course content, student access, and activity—together in one place.</p>
              </div>
              <span className="admin-welcome-mark" aria-hidden="true">
                <LayoutDashboard />
              </span>
            </section>
            <div className="stat-grid">
              <StatCard
                label="Pending registrations"
                value={String(
                  registrations.filter((registration) => registration.status === "pending").length,
                )}
                icon={<FileText aria-hidden="true" />}
              />
              <StatCard
                label="Active students"
                value={String(
                  data?.profiles.filter((person) => person.active && person.role === "student")
                    .length ?? 0,
                )}
                icon={<Users aria-hidden="true" />}
              />
              <StatCard
                label="Learning modules"
                value={String(data?.modules.length ?? 0)}
                icon={<BookOpen aria-hidden="true" />}
              />
              <StatCard
                label="Published items"
                value={String(
                  data?.items.filter((item) => !item.is_hidden && !item.deleted_at).length ?? 0,
                )}
                icon={<FileText aria-hidden="true" />}
              />
            </div>
            {data && (missingStarterModules.length > 0 || studentsMissingStarterModules) && (
              <section className="admin-empty">
                <span className="empty-icon">
                  <BookOpen aria-hidden="true" />
                </span>
                <h2>
                  {missingStarterModules.length
                    ? "Set up your learning modules"
                    : "Assign modules to students"}
                </h2>
                <p>
                  Add any missing starter folders and make Induction and Modules 1–6 available on
                  every active student’s dashboard.
                </p>
                <button
                  className="brand-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void seedModules()}
                >
                  {busy ? (
                    <LoaderCircle className="spin" aria-hidden="true" />
                  ) : (
                    <Plus aria-hidden="true" />
                  )}{" "}
                  {missingStarterModules.length
                    ? "Add starter modules and assign students"
                    : "Assign starter modules to students"}
                </button>
              </section>
            )}
            <div className="admin-section-heading">
              <div>
                <p className="eyebrow">QUICK ACTIONS</p>
                <h2>What would you like to do?</h2>
              </div>
            </div>
            <div className="quick-actions">
              <button type="button" onClick={() => setTab("content")}>
                <Plus aria-hidden="true" />
                <strong>Add course content</strong>
                <span>Upload a textbook, video, or podcast.</span>
              </button>
              <button type="button" onClick={() => setTab("students")}>
                <Users aria-hidden="true" />
                <strong>Manage students</strong>
                <span>Invite students and manage access.</span>
              </button>
              <button type="button" onClick={() => setTab("registrations")}>
                <FileText aria-hidden="true" />
                <strong>Review registrations</strong>
                <span>Check documents and approve student access.</span>
              </button>
              <button type="button" onClick={() => setTab("activity")}>
                <Clock3 aria-hidden="true" />
                <strong>View activity</strong>
                <span>See recent course access.</span>
              </button>
            </div>
          </div>
        ) : tab === "content" ? (
          <div className="admin-content-browser">
            {!data?.modules.length ? (
              <div className="admin-table-card">
                <div className="admin-empty small">
                  <h2>No learning modules yet</h2>
                  <p>Create Induction and Modules 1–6 before adding course materials.</p>
                  <button
                    className="outline-button"
                    type="button"
                    onClick={() => setTab("overview")}
                  >
                    Go to overview <ArrowRight aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : contentFolder ? (
              <>
                <div className="folder-path">
                  <button
                    className="folder-back"
                    type="button"
                    onClick={() => {
                      if (contentSubfolder) {
                        setContentSubfolderId(contentSubfolder.parent_folder_id);
                      } else {
                        setContentFolderId(null);
                      }
                      setSearch("");
                    }}
                  >
                    <ArrowLeft aria-hidden="true" />
                    {contentSubfolder?.parent_folder_id ? "Parent folder" : "All module folders"}
                  </button>
                  <span className="folder-path-divider">/</span>
                  <span className="folder-path-icon">
                    <FolderOpen aria-hidden="true" />
                  </span>
                  <strong>{contentFolder.title}</strong>
                  {contentSubfolder && (
                    <>
                      <span className="folder-path-divider">/</span>
                      <strong>{contentSubfolder.title}</strong>
                    </>
                  )}
                  <span className="folder-path-count">
                    {
                      (data?.items ?? []).filter(
                        (item) =>
                          item.module_id === contentFolder.id &&
                          item.folder_id === contentSubfolderId &&
                          !item.deleted_at,
                      ).length
                    }{" "}
                    items
                  </span>
                </div>
                <div className="table-toolbar folder-items-toolbar">
                  <label className="search-field">
                    <Search aria-hidden="true" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search this module"
                      aria-label={`Search ${contentFolder.title}`}
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={includeDeleted}
                      onChange={(event) => setIncludeDeleted(event.target.checked)}
                    />
                    Recently deleted
                  </label>
                  <button
                    className="outline-button"
                    type="button"
                    onClick={() => {
                      setFolderEditing(null);
                      setFolderFormOpen(true);
                    }}
                  >
                    <Plus aria-hidden="true" /> Add subfolder
                  </button>
                </div>
                <div className="course-folder-grid">
                  {(data?.folders ?? [])
                    .filter(
                      (folder) =>
                        folder.module_id === contentFolder.id &&
                        folder.parent_folder_id === contentSubfolderId,
                    )
                    .map((folder) => (
                      <article className="course-folder-card" key={folder.id}>
                        <button
                          className="course-folder-main"
                          type="button"
                          onClick={() => setContentSubfolderId(folder.id)}
                        >
                          <span className="course-folder-icon">
                            <Folder aria-hidden="true" />
                          </span>
                          <span className="module-kicker">CONTENT FOLDER</span>
                          <strong>{folder.title}</strong>
                          <span className="course-folder-description">
                            {folder.description || "Open this folder to manage its materials."}
                          </span>
                          <span className="course-folder-open">
                            Open folder <ArrowRight aria-hidden="true" />
                          </span>
                        </button>
                        <div className="course-folder-actions">
                          <button
                            className="outline-button"
                            type="button"
                            onClick={() => {
                              setFolderEditing(folder);
                              setFolderFormOpen(true);
                            }}
                          >
                            Edit folder
                          </button>
                          <button
                            className="danger-outline-button"
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Delete the "${folder.title}" folder?`)) return;
                              void deletePortalFolder({ data: { id: folder.id } }).then(refresh);
                            }}
                          >
                            <Trash2 aria-hidden="true" /> Delete
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
                <div className="admin-table-card">
                  <ContentAdminList
                    items={(data?.items ?? []).filter(
                      (item) =>
                        item.module_id === contentFolder.id &&
                        item.folder_id === contentSubfolderId,
                    )}
                    modules={[contentFolder]}
                    search={search}
                    includeDeleted={includeDeleted}
                    busy={busy}
                    onEdit={(item) => {
                      setEditing(item);
                      setShowForm(true);
                    }}
                    onAction={(item, action) => void toggleItem(item, action)}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="folder-intro">
                  <div>
                    <p className="eyebrow">YOUR COURSE LIBRARY</p>
                    <h2>Choose a module folder</h2>
                    <p>Open a folder to find and manage its learning materials.</p>
                  </div>
                  <label className="search-field">
                    <Search aria-hidden="true" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Find a module"
                      aria-label="Search module folders"
                    />
                  </label>
                </div>
                <div className="course-folder-grid">
                  {(data?.modules ?? [])
                    .filter((module) =>
                      `${module.title} ${module.description}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((module) => {
                      const items = (data?.items ?? []).filter(
                        (item) => item.module_id === module.id && !item.deleted_at,
                      );
                      const publishedCount = items.filter((item) => !item.is_hidden).length;
                      return (
                        <article className="course-folder-card" key={module.id}>
                          <button
                            className="course-folder-main"
                            type="button"
                            onClick={() => {
                              setSearch("");
                              setContentFolderId(module.id);
                              setContentSubfolderId(null);
                            }}
                            aria-label={`Open ${module.title} folder, ${items.length} items`}
                          >
                            <span className="course-folder-icon">
                              <Folder aria-hidden="true" />
                            </span>
                            <span className="module-kicker">COURSE FOLDER</span>
                            <strong>{module.title}</strong>
                            <span className="course-folder-description">
                              {module.description || "Open this folder to manage course materials."}
                            </span>
                            <span className="course-folder-count">
                              <FileText aria-hidden="true" />
                              {items.length} {items.length === 1 ? "item" : "items"} ·{" "}
                              {publishedCount} published
                            </span>
                            <span className="course-folder-open">
                              Open folder <ArrowRight aria-hidden="true" />
                            </span>
                          </button>
                          <div className="course-folder-actions">
                            <button
                              className="outline-button"
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setModuleEditing(module);
                                setModuleFormOpen(true);
                              }}
                            >
                              Edit folder
                            </button>
                            <button
                              className="danger-outline-button"
                              type="button"
                              disabled={busy}
                              onClick={() => void removeModule(module)}
                            >
                              <Trash2 aria-hidden="true" /> Delete
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  {!data?.modules.some((module) =>
                    `${module.title} ${module.description}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  ) && <p className="empty-search">No module folders match “{search}”.</p>}
                </div>
              </>
            )}
          </div>
        ) : tab === "registrations" ? (
          <div className="admin-table-card registration-admin-card">
            <div className="table-toolbar">
              <div>
                <p>Review submitted applications and supporting documents.</p>
                <span className="form-hint">
                  Approving creates the login account and assigns the starter modules.
                </span>
              </div>
              <span className="student-count">{registrations.length} applications</span>
            </div>
            <div className="registration-admin-list">
              {registrations.map((registration) => (
                <article className="registration-admin-row" key={registration.id}>
                  <span className="student-avatar">
                    {registration.full_names.trim().charAt(0).toUpperCase() || "S"}
                  </span>
                  <div className="registration-admin-copy">
                    <strong>
                      {registration.full_names} {registration.surname}
                    </strong>
                    <span>{registration.email}</span>
                    <small>
                      Submitted {new Date(registration.created_at).toLocaleDateString()} ·{" "}
                      {registration.payment_plan === "once_off"
                        ? "R6,000 once-off"
                        : "R1,200 × 6 months"}
                    </small>
                  </div>
                  <span className={`status-pill ${registrationStatusClass(registration.status)}`}>
                    {registration.status === "pending"
                      ? "Needs review"
                      : registration.status.charAt(0).toUpperCase() + registration.status.slice(1)}
                  </span>
                  <button
                    className="outline-button"
                    type="button"
                    onClick={() => {
                      setDialogError("");
                      setRegistrationLogin(null);
                      setSelectedRegistration(registration);
                    }}
                  >
                    {registration.status === "pending" ? "Review application" : "View details"}{" "}
                    <ArrowRight aria-hidden="true" />
                  </button>
                </article>
              ))}
              {!registrations.length && (
                <div className="admin-empty small">
                  <h2>No registrations yet</h2>
                  <p>New student applications will appear here for review.</p>
                </div>
              )}
            </div>
          </div>
        ) : tab === "students" ? (
          <div className="admin-table-card">
            <div className="table-toolbar">
              <p>Review student and administrator accounts and assigned course access.</p>
              <span className="student-count">{data?.profiles.length ?? 0} accounts</span>
            </div>
            <div className="student-list">
              {(data?.profiles ?? []).map((person) => (
                <article className="student-row" key={person.id}>
                  <span className="student-avatar">
                    {person.full_name.trim().charAt(0).toUpperCase() || "S"}
                  </span>
                  <div className="student-row-copy">
                    <strong>{person.full_name}</strong>
                    <span>
                      {person.email || person.student_id} ·{" "}
                      {person.role === "admin" ? "Administrator" : person.student_id}
                    </span>
                  </div>
                  <span className={`status-pill ${person.active ? "completed" : "not_started"}`}>
                    {person.active ? "Active" : "Inactive"}
                  </span>
                  <button
                    className="outline-button"
                    type="button"
                    onClick={() => {
                      setDialogError("");
                      setStudentDialog(person);
                    }}
                  >
                    Manage <ArrowRight aria-hidden="true" />
                  </button>
                </article>
              ))}
              {!data?.profiles.length && (
                <div className="admin-empty small">
                  <h2>No student accounts yet</h2>
                  <p>
                    There are no accounts to manage right now. Create student invitations in
                    Supabase Auth or contact your portal administrator.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="admin-table-card">
            <div className="table-toolbar">
              <p>Latest activity recorded by the learning portal.</p>
              <span className="student-count">{data?.logs.length ?? 0} records</span>
            </div>
            <div className="activity-list">
              {(data?.logs ?? []).map((log) => {
                const person = data?.profiles.find((item) => item.id === log.student_id);
                const item = data?.items.find((entry) => entry.id === log.content_id);
                return (
                  <article className="activity-row" key={log.id}>
                    <span className="activity-dot" />
                    <div>
                      <strong>
                        {person?.full_name ?? "Student"} opened {item?.title ?? "learning content"}
                      </strong>
                      <span>{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                  </article>
                );
              })}
              {!data?.logs.length && (
                <div className="admin-empty small">
                  <h2>No activity yet</h2>
                  <p>Course access will appear here when students open published materials.</p>
                </div>
              )}
            </div>
          </div>
        )}
        <p className="admin-footer-note">
          Course materials are protected using private storage, account-based access, and expiring
          links. Screen recording and photography cannot be fully blocked.
        </p>
      </section>
      {moduleFormOpen && (
        <ModuleForm
          item={moduleEditing}
          preview={preview}
          onClose={() => setModuleFormOpen(false)}
          onSave={saveModule}
        />
      )}
      {folderFormOpen && contentFolder && (
        <FolderForm
          moduleId={contentFolder.id}
          parentFolderId={contentSubfolderId}
          folder={folderEditing}
          onClose={() => setFolderFormOpen(false)}
          onSaved={async (input) => {
            await savePortalFolder({ data: input });
            setFolderFormOpen(false);
            setFolderEditing(null);
            await refresh();
          }}
        />
      )}
      {showForm && data && (
        <ContentForm
          modules={data.modules}
          item={editing}
          initialModuleId={contentFolder?.id ?? ""}
          initialFolderId={contentSubfolderId}
          preview={preview}
          onClose={() => setShowForm(false)}
          onSaved={(message, savedContent) => {
            setShowForm(false);
            if (preview) {
              const savedItem: AdminItem = {
                id: savedContent.id ?? `preview-content-${crypto.randomUUID()}`,
                module_id: savedContent.moduleId,
                folder_id: savedContent.folderId ?? null,
                type: savedContent.type,
                title: savedContent.title,
                description: savedContent.description,
                storage_path: savedContent.storagePath,
                position:
                  data.items.find((item) => item.id === savedContent.id)?.position ??
                  Math.max(
                    0,
                    ...data.items
                      .filter((item) => item.module_id === savedContent.moduleId)
                      .map((item) => item.position),
                  ) + 1,
                is_hidden: !savedContent.publish,
                deleted_at: null,
                created_at:
                  data.items.find((item) => item.id === savedContent.id)?.created_at ??
                  new Date().toISOString(),
              };
              setData((current) =>
                current
                  ? {
                      ...current,
                      items: current.items.some((item) => item.id === savedItem.id)
                        ? current.items.map((item) => (item.id === savedItem.id ? savedItem : item))
                        : [...current.items, savedItem],
                    }
                  : current,
              );
            }
            setNotice(message);
            if (!preview) void refresh();
          }}
        />
      )}
      {inviteOpen && data && (
        <InviteStudentForm
          modules={data.modules}
          busy={busy}
          preview={preview}
          onClose={() => setInviteOpen(false)}
          onInvite={inviteStudent}
        />
      )}
      {selectedRegistration && (
        <RegistrationReviewDialog
          registration={selectedRegistration}
          busy={busy}
          error={dialogError}
          login={registrationLogin}
          onClose={() => {
            setDialogError("");
            setRegistrationLogin(null);
            setSelectedRegistration(null);
          }}
          onReview={decideRegistration}
        />
      )}
      {studentDialog && data && (
        <div className="viewer-backdrop">
          <section
            className="student-edit-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-edit-heading"
          >
            <header className="viewer-header">
              <div>
                <p className="eyebrow">ACCOUNT SETTINGS</p>
                <h2 id="student-edit-heading">Manage account</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => {
                  setDialogError("");
                  setStudentDialog(null);
                }}
                aria-label="Close"
                disabled={busy}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <p className="form-hint account-identifier">
              {studentDialog.email || "Email is unavailable"} · Student ID{" "}
              {studentDialog.student_id}
            </p>
            <form className="admin-form" onSubmit={(event) => void saveStudent(event)}>
              <label htmlFor="student-name">Full name</label>
              <input
                id="student-name"
                className="portal-input"
                name="fullName"
                defaultValue={studentDialog.full_name}
                required
              />
              <label htmlFor="student-role">Account type</label>
              <select
                id="student-role"
                className="portal-input"
                name="role"
                defaultValue={studentDialog.role}
                disabled={studentDialog.id === profile.id}
              >
                <option value="student">Student</option>
                <option value="admin">Administrator</option>
              </select>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={studentDialog.active}
                  disabled={studentDialog.id === profile.id}
                />{" "}
                Allow this account to sign in
              </label>
              {studentDialog.id === profile.id && (
                <p className="form-hint">
                  Your signed-in administrator account cannot be deactivated or changed to a
                  student.
                </p>
              )}
              <p className="form-hint">
                Turning this off blocks sign-in but keeps the account’s course history.
              </p>
              <fieldset>
                <legend>Assigned learning modules</legend>
                {data.modules.map((module) => (
                  <label className="checkbox-label" key={module.id}>
                    <input
                      type="checkbox"
                      name="student-module"
                      value={module.id}
                      defaultChecked={(assignments[studentDialog.id] ?? []).includes(module.id)}
                    />{" "}
                    {module.title}
                  </label>
                ))}
              </fieldset>
              {dialogError && (
                <p className="inline-error" role="alert">
                  {dialogError}
                </p>
              )}
              <div className="form-actions">
                <button
                  className="outline-button"
                  type="button"
                  onClick={() => {
                    setDialogError("");
                    setStudentDialog(null);
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button className="brand-button" type="submit" disabled={busy}>
                  {busy && <LoaderCircle className="spin" aria-hidden="true" />} Save changes
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function registrationStatusClass(status: RegistrationData["status"]) {
  if (status === "approved") return "completed";
  if (status === "pending") return "in_progress";
  return "not_started";
}

function RegistrationReviewDialog({
  registration,
  busy,
  error,
  login,
  onClose,
  onReview,
}: {
  registration: RegistrationData;
  busy: boolean;
  error: string;
  login: {
    name: string;
    email: string;
    studentId: string;
    temporaryPassword: string;
    loginPath: string;
  } | null;
  onClose: () => void;
  onReview: (registrationId: string, action: "approve" | "reject", notes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState(registration.review_notes);
  const [copied, setCopied] = useState(false);
  const identity = registration.south_african_id_number || registration.passport_number || "—";

  async function copyLoginDetails() {
    if (!login) return;
    const details = [
      `Student: ${login.name}`,
      `Login: ${login.email}`,
      `Student ID: ${login.studentId}`,
      `Temporary password: ${login.temporaryPassword}`,
      `Sign in: ${window.location.origin}${login.loginPath}`,
    ].join("\n");
    await navigator.clipboard.writeText(details);
    setCopied(true);
  }

  return (
    <div className="viewer-backdrop">
      <section
        className="registration-review-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-review-title"
      >
        <header className="viewer-header">
          <div>
            <p className="eyebrow">STUDENT REGISTRATION</p>
            <h2 id="registration-review-title">
              {registration.full_names} {registration.surname}
            </h2>
            <span className={`status-pill ${registrationStatusClass(registration.status)}`}>
              {registration.status === "pending"
                ? "Needs review"
                : registration.status.charAt(0).toUpperCase() + registration.status.slice(1)}
            </span>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close registration"
            disabled={busy}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="registration-review-body">
          {login ? (
            <section className="registration-credentials" role="status">
              <span className="message-icon">
                <Check aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">ACCOUNT CREATED</p>
                <h3>Send these details to the student now</h3>
                <p>
                  This temporary password is shown only once. Copy it before closing this window.
                </p>
              </div>
              <dl>
                <div>
                  <dt>Student ID</dt>
                  <dd>{login.studentId}</dd>
                </div>
                <div>
                  <dt>Email / login</dt>
                  <dd>{login.email}</dd>
                </div>
                <div>
                  <dt>Temporary password</dt>
                  <dd className="registration-password">{login.temporaryPassword}</dd>
                </div>
                <div>
                  <dt>Sign-in link</dt>
                  <dd>
                    {window.location.origin}
                    {login.loginPath}
                  </dd>
                </div>
              </dl>
              <button
                className="brand-button"
                type="button"
                onClick={() => void copyLoginDetails()}
              >
                {copied ? <Check aria-hidden="true" /> : <FileText aria-hidden="true" />}
                {copied ? "Copied" : "Copy login details"}
              </button>
            </section>
          ) : null}

          <section className="registration-review-section">
            <div className="registration-review-heading">
              <h3>Application details</h3>
              <span>Submitted {new Date(registration.created_at).toLocaleString()}</span>
            </div>
            <dl className="registration-details-grid">
              <div>
                <dt>Full names</dt>
                <dd>{registration.full_names}</dd>
              </div>
              <div>
                <dt>Surname</dt>
                <dd>{registration.surname}</dd>
              </div>
              <div>
                <dt>Cell phone</dt>
                <dd>{registration.cell_phone}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{registration.email}</dd>
              </div>
              <div>
                <dt>ID / passport</dt>
                <dd>{identity}</dd>
              </div>
              <div>
                <dt>Country of issue</dt>
                <dd>{registration.passport_country || "South Africa"}</dd>
              </div>
              <div>
                <dt>Gender</dt>
                <dd>{registration.gender}</dd>
              </div>
              <div>
                <dt>Ethnicity</dt>
                <dd>{registration.ethnicity}</dd>
              </div>
              <div>
                <dt>Home language</dt>
                <dd>{registration.home_language}</dd>
              </div>
              <div>
                <dt>Grade 12 passed</dt>
                <dd>{registration.passed_grade_12 ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Qualification</dt>
                <dd>{registration.qualification_name}</dd>
              </div>
              <div>
                <dt>Real estate employment</dt>
                <dd>
                  {registration.employed_at_real_estate_company
                    ? registration.real_estate_company
                    : "Not currently employed at a real estate company"}
                </dd>
              </div>
              <div className="wide">
                <dt>Home address</dt>
                <dd>
                  {registration.full_home_address}, {registration.province},{" "}
                  {registration.postal_code}
                </dd>
              </div>
              <div>
                <dt>Payment plan</dt>
                <dd>
                  {registration.payment_plan === "once_off"
                    ? "R6,000 once-off"
                    : "R1,200 × 6 months"}
                </dd>
              </div>
              <div>
                <dt>Signature</dt>
                <dd>
                  {registration.signature_name} · {registration.signature_date}
                </dd>
              </div>
            </dl>
          </section>

          <section className="registration-review-section">
            <div className="registration-review-heading">
              <h3>Supporting documents</h3>
              <span>Private links expire after 10 minutes</span>
            </div>
            <div className="registration-document-links">
              {[
                [
                  "Certified ID or passport",
                  registration.id_document_name,
                  registration.documentUrls.identity,
                ],
                [
                  "Matric certificate / affidavit",
                  registration.education_document_name,
                  registration.documentUrls.education,
                ],
                [
                  "Proof of payment",
                  registration.payment_proof_name,
                  registration.documentUrls.payment,
                ],
              ].map(([label, fileName, url]) => (
                <a href={url} target="_blank" rel="noreferrer" key={label}>
                  <FileText aria-hidden="true" />
                  <span>
                    <strong>{label}</strong>
                    <small>{fileName}</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>

          <section className="registration-review-section">
            <div className="registration-review-heading">
              <h3>Administrator review</h3>
              <span>Decision notes remain in the application record</span>
            </div>
            <label className="registration-notes">
              <span>Notes {registration.status === "pending" ? "(optional)" : ""}</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={registration.status !== "pending" || Boolean(login) || busy}
                rows={3}
                placeholder="Add any follow-up details or reason for the decision."
              />
            </label>
            {error ? (
              <p className="inline-error" role="alert">
                {error}
              </p>
            ) : null}
            {registration.status === "pending" && !login ? (
              <div className="registration-review-actions">
                <button
                  className="danger-outline-button"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Reject the registration from ${registration.full_names} ${registration.surname}?`,
                      )
                    ) {
                      void onReview(registration.id, "reject", notes);
                    }
                  }}
                >
                  Reject registration
                </button>
                <button
                  className="brand-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void onReview(registration.id, "approve", notes)}
                >
                  {busy ? (
                    <LoaderCircle className="spin" aria-hidden="true" />
                  ) : (
                    <Check aria-hidden="true" />
                  )}
                  Approve & create account
                </button>
              </div>
            ) : registration.reviewed_at ? (
              <p className="form-hint">
                Reviewed {new Date(registration.reviewed_at).toLocaleString()}.
              </p>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <article className="stat-card">
      <span className="stat-icon">{icon}</span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function FolderForm({
  moduleId,
  parentFolderId,
  folder,
  onClose,
  onSaved,
}: {
  moduleId: string;
  parentFolderId: string | null;
  folder: AdminFolder | null;
  onClose: () => void;
  onSaved: (input: {
    id?: string;
    moduleId: string;
    parentFolderId: string | null;
    title: string;
    description: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(folder?.title ?? "");
  const [description, setDescription] = useState(folder?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSaved({
        ...(folder ? { id: folder.id } : {}),
        moduleId,
        parentFolderId: folder?.parent_folder_id ?? parentFolderId,
        title: title.trim(),
        description: description.trim(),
      });
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="viewer-backdrop">
      <section className="content-form-card" role="dialog" aria-modal="true">
        <header className="viewer-header">
          <div>
            <p className="eyebrow">{folder ? "EDIT CONTENT FOLDER" : "ADD CONTENT FOLDER"}</p>
            <h2>{folder ? "Update folder" : "Create subfolder"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy}>
            <X aria-hidden="true" />
          </button>
        </header>
        <form className="admin-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="folder-title">Folder name</label>
          <input
            id="folder-title"
            className="portal-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            required
          />
          <label htmlFor="folder-description">Description (optional)</label>
          <textarea
            id="folder-description"
            className="portal-input form-textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            rows={3}
          />
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="outline-button" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="brand-button" type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {busy ? "Saving…" : "Save folder"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ModuleForm({
  item,
  preview,
  onClose,
  onSave,
}: {
  item: AdminModule | null;
  preview: boolean;
  onClose: () => void;
  onSave: (input: ModuleDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...(item ? { id: item.id } : {}),
        title: title.trim(),
        description: description.trim(),
      });
      onClose();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="viewer-backdrop">
      <section
        className="student-edit-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="module-form-heading"
      >
        <header className="viewer-header">
          <div>
            <p className="eyebrow">{item ? "COURSE FOLDER" : "NEW COURSE FOLDER"}</p>
            <h2 id="module-form-heading">{item ? "Edit folder details" : "Add a module folder"}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <form className="admin-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="module-title">Folder name</label>
          <input
            id="module-title"
            className="portal-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            required
            autoFocus
          />
          <label htmlFor="module-description">
            Short description <span>(optional)</span>
          </label>
          <textarea
            id="module-description"
            className="portal-input form-textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            rows={3}
          />
          {preview && (
            <p className="form-hint">This is a sample folder. Changes are saved in this browser.</p>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="outline-button" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="brand-button" type="submit" disabled={busy || !title.trim()}>
              {busy && <LoaderCircle className="spin" aria-hidden="true" />}
              {busy ? "Saving…" : item ? "Save folder" : "Create folder"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function InviteStudentForm({
  modules,
  busy,
  preview,
  onClose,
  onInvite,
}: {
  modules: Module[];
  busy: boolean;
  preview: boolean;
  onClose: () => void;
  onInvite: (input: {
    email: string;
    fullName: string;
    studentId: string;
    moduleIds: string[];
  }) => Promise<void>;
}) {
  const [moduleIds, setModuleIds] = useState<string[]>(() => modules.map((module) => module.id));
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const studentId = String(form.get("studentId") ?? "").trim();
    if (!fullName || !email || !studentId) {
      setError("Enter the student’s name, email, and student ID.");
      return;
    }
    try {
      await onInvite({ fullName, email, studentId, moduleIds });
    } catch (caught) {
      setError(messageFrom(caught));
    }
  }

  return (
    <div className="viewer-backdrop">
      <section
        className="student-edit-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-student-heading"
      >
        <header className="viewer-header">
          <div>
            <p className="eyebrow">NEW ACCOUNT</p>
            <h2 id="invite-student-heading">
              {preview ? "Add a sample student" : "Invite a student"}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <form className="admin-form" onSubmit={submit}>
          <label htmlFor="invite-name">Student’s full name</label>
          <input
            id="invite-name"
            className="portal-input"
            name="fullName"
            autoComplete="name"
            required
          />
          <label htmlFor="invite-email">Email address</label>
          <input
            id="invite-email"
            className="portal-input"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <label htmlFor="invite-id">Student ID</label>
          <input id="invite-id" className="portal-input" name="studentId" required />
          <fieldset>
            <legend>Assign learning modules</legend>
            {modules.map((module) => (
              <label className="checkbox-label" key={module.id}>
                <input
                  type="checkbox"
                  checked={moduleIds.includes(module.id)}
                  onChange={(event) => {
                    setModuleIds((current) =>
                      event.target.checked
                        ? [...current, module.id]
                        : current.filter((id) => id !== module.id),
                    );
                  }}
                />
                {module.title}
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <p className="form-hint">
            {preview
              ? "This only adds a sample account to the preview. No email will be sent."
              : "The student will receive an email invitation to set their password. All current modules are selected by default."}
          </p>
          <div className="form-actions">
            <button className="outline-button" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="brand-button" type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" aria-hidden="true" />
              ) : (
                <Mail aria-hidden="true" />
              )}
              {busy
                ? preview
                  ? "Adding…"
                  : "Sending…"
                : preview
                  ? "Add sample student"
                  : "Send invitation"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ContentAdminList({
  items,
  modules,
  search,
  includeDeleted,
  busy,
  onEdit,
  onAction,
}: {
  items: AdminItem[];
  modules: Module[];
  search: string;
  includeDeleted: boolean;
  busy: boolean;
  onEdit: (item: AdminItem) => void;
  onAction: (
    item: AdminItem,
    action: "hide" | "publish" | "delete" | "restore" | "permanentlyDelete",
  ) => void;
}) {
  const visibleItems = items.filter((item) => {
    const isDeleted = Boolean(item.deleted_at);
    const matchesDeleted = includeDeleted ? isDeleted : !isDeleted;
    return (
      matchesDeleted &&
      `${item.title} ${item.description}`.toLowerCase().includes(search.toLowerCase())
    );
  });
  return (
    <div className="content-admin-list">
      {visibleItems.map((item) => (
        <article className="content-admin-row" key={item.id}>
          <span className={`content-kind-icon ${item.type}`}>{kindIcon(item.type)}</span>
          <div className="content-admin-copy">
            <span className="module-kicker">
              {modules.find((module) => module.id === item.module_id)?.title ?? "Learning module"} ·{" "}
              {kindLabel(item.type, item.storage_path)}
            </span>
            <strong>{item.title}</strong>
            <span>{item.description || "No description"}</span>
          </div>
          <span
            className={`status-pill ${item.deleted_at ? "not_started" : item.is_hidden ? "in_progress" : "completed"}`}
          >
            {item.deleted_at
              ? isRecentlyDeleted(item.deleted_at)
                ? "Recently deleted"
                : "Recovery period ended"
              : item.is_hidden
                ? "Hidden"
                : "Published"}
          </span>
          <div className="admin-row-actions">
            {item.deleted_at ? (
              isRecentlyDeleted(item.deleted_at) ? (
                <button
                  className="outline-button"
                  type="button"
                  disabled={busy}
                  onClick={() => onAction(item, "restore")}
                >
                  Restore <ArrowRight aria-hidden="true" />
                </button>
              ) : (
                <button
                  className="danger-outline-button"
                  type="button"
                  disabled={busy}
                  onClick={() => onAction(item, "permanentlyDelete")}
                >
                  <Trash2 aria-hidden="true" /> Delete permanently
                </button>
              )
            ) : (
              <>
                <button
                  className="icon-button edit-item"
                  type="button"
                  disabled={busy}
                  onClick={() => onEdit(item)}
                >
                  Edit
                </button>
                <button
                  className="icon-button edit-item"
                  type="button"
                  disabled={busy}
                  onClick={() => onAction(item, item.is_hidden ? "publish" : "hide")}
                >
                  {item.is_hidden ? "Publish" : "Hide"}
                </button>
                <button
                  className="icon-button danger-action"
                  type="button"
                  aria-label={`Delete ${item.title}`}
                  disabled={busy}
                  onClick={() => onAction(item, "delete")}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </article>
      ))}
      {!visibleItems.length && (
        <div className="admin-empty small">
          <h2>{includeDeleted ? "Recently deleted is empty" : "No content found"}</h2>
          <p>
            {includeDeleted
              ? "Deleted items will appear here. Restore is available for 30 days."
              : "Add a textbook, video, or podcast to get started."}
          </p>
        </div>
      )}
    </div>
  );
}

function ContentForm({
  modules,
  item,
  initialModuleId,
  initialFolderId,
  preview,
  onClose,
  onSaved,
}: {
  modules: Module[];
  item: AdminItem | null;
  initialModuleId: string;
  initialFolderId: string | null;
  preview: boolean;
  onClose: () => void;
  onSaved: (message: string, savedContent: ContentDraft) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [moduleId, setModuleId] = useState(
    item?.module_id ?? (initialModuleId || modules[0]?.id || ""),
  );
  const [type, setType] = useState<ContentKind>(item?.type ?? "pdf");
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [publish, setPublish] = useState(item ? !item.is_hidden : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);

  function selectFile(nextFile: File | null) {
    setError("");
    if (!nextFile) return;
    const detectedKind = detectLearningKind(nextFile.name);
    if (!detectedKind) {
      setFile(null);
      setError(
        "Choose a PDF, PowerPoint, Word or Excel document, JPG or PNG image, video (MP4, MOV, M4V, WebM), or audio file (MP3, M4A, WAV).",
      );
      return;
    }
    if (nextFile.size > 2 * 1024 * 1024 * 1024) {
      setError("This file is larger than the 2 GB upload limit.");
      return;
    }
    setFile(nextFile);
    setType(detectedKind);
    if (!title || !item) setTitle(titleFromFilename(nextFile.name));
  }

  async function uploadFile(nextFile: File, path: string) {
    const tus = await import("tus-js-client");
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = data.session?.access_token;
    const publicKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
    if (!accessToken || !publicKey || !supabaseUrl) {
      throw new Error("Your secure upload session is unavailable. Sign in again and retry.");
    }

    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(nextFile, {
        endpoint: `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/upload/resumable`,
        retryDelays: [0, 1000, 3000, 5000],
        headers: { authorization: `Bearer ${accessToken}`, apikey: publicKey },
        metadata: {
          bucketName: "iv-learning-content",
          objectName: path,
          contentType: nextFile.type || "application/octet-stream",
          cacheControl: "3600",
        },
        uploadDataDuringCreation: true,
        chunkSize: 6 * 1024 * 1024,
        onError: reject,
        onProgress: (uploaded, total) => setUploadProgress(Math.round((uploaded / total) * 100)),
        onSuccess: () => resolve(),
      });
      upload.start();
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    let uploadedPath = "";
    try {
      if (!item && !file) throw new Error("Choose a course file before publishing.");
      if (!moduleId || !title.trim()) throw new Error("Choose a module and add a title.");
      if (file) {
        uploadedPath = `${moduleId}/${(item?.folder_id ?? initialFolderId) ? `${item?.folder_id ?? initialFolderId}/` : ""}${crypto.randomUUID()}-${file.name.replace(/[\\/]/g, "_")}`;
        if (!preview) await uploadFile(file, uploadedPath);
      }
      const savedContent: ContentDraft = {
        ...(item ? { id: item.id } : {}),
        moduleId,
        folderId: item?.folder_id ?? initialFolderId,
        type,
        title: title.trim(),
        description: description.trim(),
        storagePath: uploadedPath || item?.storage_path || "",
        publish,
      };
      if (!preview) await savePortalContent({ data: savedContent });
      onSaved(
        preview
          ? item
            ? "Sample content changes saved in this browser."
            : "Sample item added in this browser. No file was uploaded."
          : item
            ? "Content changes saved."
            : publish
              ? "Content uploaded and published."
              : "Content uploaded and saved as hidden.",
        savedContent,
      );
    } catch (caught) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from("iv-learning-content")
          .remove([uploadedPath]);
        if (cleanupError) {
          setError(
            `${messageFrom(caught)} The uploaded file also needs cleanup: ${cleanupError.message}`,
          );
        } else {
          setError(messageFrom(caught));
        }
      } else {
        setError(messageFrom(caught));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="viewer-backdrop">
      <section
        className="content-form-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-form-title"
      >
        <header className="viewer-header">
          <div>
            <p className="eyebrow">{item ? "EDIT LEARNING MATERIAL" : "ADD LEARNING MATERIAL"}</p>
            <h2 id="content-form-title">
              {item ? "Update course content" : "Upload course content"}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <form className="admin-form" onSubmit={(event) => void submit(event)}>
          {!item && (
            <>
              <label htmlFor="content-file">Choose a file</label>
              <input
                id="content-file"
                className="file-input"
                type="file"
                accept=".pdf,.pptx,.docx,.doc,.xlsx,.xls,.jpg,.jpeg,.png,.mp4,.mov,.m4v,.webm,.mp3,.m4a,.wav"
                onChange={(event) => selectFile(event.currentTarget.files?.[0] ?? null)}
                required
              />
              <p className="form-hint">
                {preview
                  ? "Choose a sample file to try the form. It will not be uploaded or stored."
                  : "PDF, PPTX, DOCX, DOC, XLSX, XLS, JPG, PNG, MP4, MOV, M4V, WebM, MP3, M4A, or WAV. Office documents open as downloads; images are shown in the viewer. Files upload privately and can be up to 2 GB."}
              </p>
            </>
          )}
          {item && (
            <div className="file-summary">
              <span className={`content-kind-icon ${type}`}>{kindIcon(type)}</span>
              <span>{item.title} · Replace the file by adding a new item.</span>
            </div>
          )}
          <label htmlFor="content-module">Learning module</label>
          <select
            id="content-module"
            className="portal-input"
            value={moduleId}
            onChange={(event) => setModuleId(event.target.value)}
            disabled={Boolean(item)}
            required
          >
            {modules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.title}
              </option>
            ))}
          </select>
          {!item && (
            <p className="form-hint">
              Detected content type: <strong>{kindLabel(type, file?.name)}</strong>
            </p>
          )}
          <label htmlFor="content-title">Title</label>
          <input
            id="content-title"
            className="portal-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={180}
          />
          <label htmlFor="content-description">
            Description <span>(optional)</span>
          </label>
          <textarea
            id="content-description"
            className="portal-input form-textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={1000}
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={publish}
              onChange={(event) => setPublish(event.target.checked)}
            />{" "}
            Publish now — students can see this item
          </label>
          {busy && file && !preview && (
            <div className="upload-status">
              <span>Uploading securely… {uploadProgress}%</span>
              <div className="progress-track">
                <span style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="outline-button" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="brand-button" type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {busy
                ? "Saving…"
                : preview && !item
                  ? "Save sample item"
                  : item
                    ? "Save changes"
                    : publish
                      ? "Upload & publish"
                      : "Upload item"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
