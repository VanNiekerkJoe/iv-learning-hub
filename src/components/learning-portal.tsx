import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  Clock3,
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
  changePortalContentState,
  getLearningDashboard,
  getLearningModule,
  getTemporaryContentAccess,
  invitePortalStudent,
  listAdminPortalData,
  saveLearningProgress,
  savePortalContent,
  updateStudentPortalAccess,
} from "@/lib/portal.functions";
import { detectLearningKind, isRecentlyDeleted, titleFromFilename } from "@/lib/learning-domain";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Dashboard = Awaited<ReturnType<typeof getLearningDashboard>>;
type AdminData = Awaited<ReturnType<typeof listAdminPortalData>>;
type Profile = Dashboard["profile"];
type Module = Dashboard["modules"][number];
type ContentItem = NonNullable<Dashboard["content"]>[number];
type LearningProgress = Dashboard["progress"][number];
type AdminProfile = AdminData["profiles"][number];
type AdminItem = AdminData["items"][number];
type ContentKind = Tables<"content_items">["type"];
type AuthSession = NonNullable<
  Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]
>;

const STARTER_MODULES = Array.from({ length: 6 }, (_, index) => ({
  title: `Module ${index + 1}`,
  description: "Course materials will be added by your administrator.",
  position: index + 1,
}));

const PREVIEW_PROFILE: Profile = {
  id: "local-preview-student",
  full_name: "Alex Morgan",
  student_id: "IV-PREVIEW",
  role: "student",
  active: true,
  terms_accepted_at: new Date(0).toISOString(),
  email: "preview@example.test",
};

const PREVIEW_ADMIN_PROFILE: Profile = {
  ...PREVIEW_PROFILE,
  id: "local-preview-admin",
  full_name: "Casey Admin",
  student_id: "IV-ADMIN",
  role: "admin",
};

const PREVIEW_MODULE_ID = "preview-module-1";
const PREVIEW_MODULES: Module[] = Array.from({ length: 6 }, (_, index) => ({
  id: `preview-module-${index + 1}`,
  title: `Module ${index + 1}`,
  description: "Sample course area shown in local preview mode.",
  position: index + 1,
}));

const PREVIEW_CONTENT: ContentItem[] = [
  {
    id: "preview-textbook",
    module_id: PREVIEW_MODULE_ID,
    type: "pdf",
    title: "Sample textbook",
    description: "Preview-only placeholder. Real materials require an authenticated account.",
    position: 1,
  },
  {
    id: "preview-video",
    module_id: PREVIEW_MODULE_ID,
    type: "video",
    title: "Sample lesson video",
    description: "Preview-only placeholder.",
    position: 2,
  },
  {
    id: "preview-podcast",
    module_id: PREVIEW_MODULE_ID,
    type: "audio",
    title: "Sample podcast",
    description: "Preview-only placeholder.",
    position: 3,
  },
];

const PREVIEW_ADMIN_DATA: AdminData = {
  profiles: [
    {
      id: PREVIEW_PROFILE.id,
      full_name: PREVIEW_PROFILE.full_name,
      student_id: PREVIEW_PROFILE.student_id,
      role: "student",
      active: true,
      created_at: "2026-10-12T09:30:00.000Z",
      terms_accepted_at: PREVIEW_PROFILE.terms_accepted_at,
      email: PREVIEW_PROFILE.email,
    },
  ],
  modules: PREVIEW_MODULES,
  items: PREVIEW_CONTENT.map((item) => ({
    ...item,
    storage_path: `preview/${item.id}`,
    is_hidden: false,
    deleted_at: null,
    created_at: "2026-11-01T10:00:00.000Z",
  })),
  logs: [
    {
      id: "preview-log-1",
      student_id: PREVIEW_PROFILE.id,
      content_id: PREVIEW_CONTENT[0]?.id ?? null,
      event: "opened",
      ip: "127.0.0.1",
      created_at: "2026-11-17T09:30:00.000Z",
    },
  ],
};

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function kindLabel(kind: ContentKind) {
  if (kind === "pdf") return "Textbook";
  if (kind === "video") return "Video";
  return "Podcast";
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
    if (import.meta.env.DEV) {
      setAuthReady(true);
      return;
    }

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
    setModuleContent([]);
    setModuleSearch("");
    setModuleKind("all");
    setModuleError("");
    try {
      const result = await getLearningModule({ data: { moduleId: module.id } });
      setModuleContent(result.content);
      setModuleProgress(result.progress);
    } catch (error) {
      setModuleError(messageFrom(error));
    }
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
    if (error) setPageNotice(error.message);
  }

  if (!authReady) {
    return <LoadingScreen label="Preparing your learning portal" />;
  }

  if (!session) {
    if (import.meta.env.DEV) return <LocalPreviewPortal />;
    return <LoginScreen notice={pageNotice} setNotice={setPageNotice} />;
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

function LocalPreviewPortal() {
  const [previewRole, setPreviewRole] = useState<"admin" | "student">("admin");
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | ContentKind>("all");
  const [notice, setNotice] = useState("");
  const moduleContent = selectedModule
    ? PREVIEW_CONTENT.filter((item) => item.module_id === selectedModule.id)
    : [];
  const profile = previewRole === "admin" ? PREVIEW_ADMIN_PROFILE : PREVIEW_PROFILE;

  return (
    <PortalFrame profile={profile} onSignOut={() => undefined} showSignOut={false}>
      <div className="portal-container preview-role-switch">
        <span>Preview workspace</span>
        <div role="group" aria-label="Choose preview workspace">
          <button
            className={previewRole === "admin" ? "active" : ""}
            type="button"
            onClick={() => {
              setPreviewRole("admin");
              setSelectedModule(null);
              setNotice("");
            }}
          >
            Admin
          </button>
          <button
            className={previewRole === "student" ? "active" : ""}
            type="button"
            onClick={() => {
              setPreviewRole("student");
              setSelectedModule(null);
              setNotice("");
            }}
          >
            Student
          </button>
        </div>
      </div>
      {previewRole === "admin" ? (
        <AdminWorkspace profile={PREVIEW_ADMIN_PROFILE} preview />
      ) : selectedModule ? (
        <ModuleWorkspace
          module={selectedModule}
          content={moduleContent}
          progress={[]}
          search={search}
          setSearch={setSearch}
          kind={kind}
          setKind={setKind}
          error=""
          openingContent={null}
          onBack={() => setSelectedModule(null)}
          onOpenItem={() =>
            setNotice("Sample preview item only. Sign in to open real course materials.")
          }
        />
      ) : (
        <StudentDashboard
          profile={PREVIEW_PROFILE}
          modules={PREVIEW_MODULES}
          content={PREVIEW_CONTENT}
          progress={[]}
          onOpenModule={(module) => {
            setNotice("");
            setSearch("");
            setKind("all");
            setSelectedModule(module);
          }}
          onExplore={() => {
            const firstModule = PREVIEW_MODULES[0];
            if (firstModule) setSelectedModule(firstModule);
          }}
        />
      )}
      {notice && (
        <p className="portal-toast" role="status">
          {notice}
          <button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}>
            <X aria-hidden="true" />
          </button>
        </p>
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
  showSignOut = true,
  children,
}: {
  profile: Profile | null;
  onSignOut: () => void;
  showSignOut?: boolean;
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
            {profile && showSignOut && (
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
        {profile?.id === PREVIEW_PROFILE.id && (
          <div className="preview-banner" role="status">
            Local preview · sample data only · authentication is still required outside development
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
}: {
  notice: string;
  setNotice: (notice: string) => void;
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
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
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
  const completed = progress.filter((item) => item.status === "completed").length;

  return (
    <div className="portal-container student-page">
      <section className="dashboard-hero">
        <div className="hero-stripe" aria-hidden="true" />
        <div className="dashboard-hero-copy">
          <p className="eyebrow">YOUR LEARNING SPACE</p>
          <h1>
            Good to see you, <span>{profile.full_name.split(" ")[0] || "learner"}</span>
          </h1>
          <p>Keep building your skills. Your learning journey is right here.</p>
        </div>
        <div className="student-id">
          <span>STUDENT ID</span>
          <strong>{profile.student_id}</strong>
        </div>
      </section>
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">YOUR COURSES</p>
          <h2>My learning modules</h2>
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
              <article className="module-card" key={module.id}>
                <div className={`module-art art-${index % 6}`}>
                  <span className="module-number">0{index + 1}</span>
                  <BookOpen aria-hidden="true" />
                </div>
                <div className="module-card-body">
                  <span className="module-kicker">
                    {moduleItems.length} learning {moduleItems.length === 1 ? "item" : "items"}
                  </span>
                  <h3>{module.title}</h3>
                  <p>{module.description || "Your learning materials are ready when you are."}</p>
                  <div className="module-progress-label">
                    <span>Progress</span>
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
                    Open module <ArrowRight aria-hidden="true" />
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
        <button type="button" className="summary-link" onClick={onExplore}>
          Continue learning <ArrowRight aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}

function ModuleWorkspace({
  module,
  content,
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
  const visibleItems = content.filter(
    (item) =>
      (kind === "all" || item.type === kind) &&
      `${item.title} ${item.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  const progressById = new Map(progress.map((item) => [item.content_id, item]));
  const categories: { id: "all" | ContentKind; label: string }[] = [
    { id: "all", label: "All materials" },
    { id: "pdf", label: "Textbooks" },
    { id: "video", label: "Videos" },
    { id: "audio", label: "Podcasts" },
  ];

  return (
    <section className="portal-container module-page">
      <button className="back-link" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> All modules
      </button>
      <div className="module-page-heading">
        <div>
          <p className="eyebrow">YOUR COURSE</p>
          <h1>{module.title}</h1>
          <p>{module.description}</p>
        </div>
        <div className="module-page-symbol">
          <BookOpen aria-hidden="true" />
        </div>
      </div>
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
            placeholder="Search materials"
            aria-label="Search materials"
          />
        </label>
      </div>
      {error ? (
        <div className="inline-error module-error" role="alert">
          {error}
        </div>
      ) : null}
      {!error && visibleItems.length === 0 ? (
        <div className="empty-state compact-empty">
          <span className="empty-icon">
            <BookOpen aria-hidden="true" />
          </span>
          <h3>{content.length ? "No matching materials" : "Materials are on their way"}</h3>
          <p>
            {content.length
              ? "Try a different search or category."
              : "Your administrator has not published course materials here yet."}
          </p>
        </div>
      ) : (
        <div className="content-list">
          {visibleItems.map((item) => {
            const itemProgress = progressById.get(item.id);
            return (
              <article className="content-row" key={item.id}>
                <span className={`content-kind-icon ${item.type}`}>{kindIcon(item.type)}</span>
                <div className="content-row-copy">
                  <span className="module-kicker">{kindLabel(item.type)}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description || "Open this material to continue learning."}</p>
                </div>
                <span className={`status-pill ${itemProgress?.status ?? "not_started"}`}>
                  {itemProgress?.status === "completed"
                    ? "Completed"
                    : itemProgress?.status === "in_progress"
                      ? "In progress"
                      : "Not started"}
                </span>
                <button
                  className="outline-button"
                  type="button"
                  onClick={() => onOpenItem(item)}
                  disabled={openingContent === item.id}
                >
                  {openingContent === item.id ? (
                    <LoaderCircle className="spin" aria-hidden="true" />
                  ) : null}
                  {openingContent === item.id ? "Opening" : "Open"}
                  {!openingContent && <ArrowRight aria-hidden="true" />}
                </button>
              </article>
            );
          })}
        </div>
      )}
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
  const [mediaReady, setMediaReady] = useState(false);

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
              {kindLabel(item.type)} · {profile.student_id}
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
          {item.type === "pdf" ? (
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

function AdminWorkspace({ profile }: { profile: Profile }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "content" | "students" | "activity">("overview");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [studentDialog, setStudentDialog] = useState<AdminProfile | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [portalData, assignmentResult] = await Promise.all([
        listAdminPortalData(),
        supabase.from("student_modules").select("student_id, module_id"),
      ]);
      if (assignmentResult.error) throw assignmentResult.error;
      const nextAssignments: Record<string, string[]> = {};
      for (const assignment of assignmentResult.data ?? []) {
        nextAssignments[assignment.student_id] = [
          ...(nextAssignments[assignment.student_id] ?? []),
          assignment.module_id,
        ];
      }
      setData(portalData);
      setAssignments(nextAssignments);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function seedModules() {
    setBusy(true);
    setNotice("");
    try {
      const { error: insertError } = await supabase.from("modules").insert(STARTER_MODULES);
      if (insertError) throw insertError;
      setNotice(
        "Six starter modules are ready. You can start adding course content to any module.",
      );
      await refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  async function toggleItem(item: AdminItem, action: "hide" | "publish" | "delete" | "restore") {
    if (
      action === "delete" &&
      !window.confirm(
        `Remove "${item.title}"? Students will no longer see it. You can restore it within 30 days.`,
      )
    )
      return;
    setBusy(true);
    setNotice("");
    try {
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
    setBusy(true);
    setError("");
    try {
      const moduleIds = Array.from(formData.getAll("student-module")).map(String);
      await updateStudentPortalAccess({
        data: {
          studentId: studentDialog.id,
          fullName: String(formData.get("fullName") ?? "").trim(),
          role: String(formData.get("role")) === "admin" ? "admin" : "student",
          active: formData.get("active") === "on",
          moduleIds,
        },
      });
      setNotice("Student access updated.");
      setStudentDialog(null);
      await refresh();
    } catch (caught) {
      setError(messageFrom(caught));
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
    setError("");
    try {
      await invitePortalStudent({ data: input });
      setInviteOpen(false);
      setNotice("Student invitation sent.");
      await refresh();
    } catch (caught) {
      setError(messageFrom(caught));
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
              ["content", BookOpen, "Course content"],
              ["students", Users, "Students"],
              ["activity", Clock3, "Activity"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
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
                ? `Welcome, ${profile.full_name.split(" ")[0]}`
                : tab === "content"
                  ? "Course content"
                  : tab === "students"
                    ? "Student accounts"
                    : "Recent activity"}
            </h1>
          </div>
          {tab === "content" && (
            <button
              className="brand-button"
              type="button"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              <Plus aria-hidden="true" /> Add content
            </button>
          )}
          {tab === "students" && (
            <button
              className="brand-button"
              type="button"
              onClick={() => setInviteOpen(true)}
              disabled={!data?.modules.length}
            >
              <Plus aria-hidden="true" /> Invite student
            </button>
          )}
        </div>
        {error && (
          <div className="admin-error" role="alert">
            <span>{error}</span>
            <button type="button" className="text-button" onClick={() => void refresh()}>
              Retry
            </button>
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
            <div className="stat-grid">
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
            {!data?.modules.length && (
              <section className="admin-empty">
                <span className="empty-icon">
                  <BookOpen aria-hidden="true" />
                </span>
                <h2>Set up your learning modules</h2>
                <p>
                  Create six starter modules first. You can add course materials and invite students
                  when you’re ready.
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
                  Create six starter modules
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
              <button type="button" onClick={() => setTab("activity")}>
                <Clock3 aria-hidden="true" />
                <strong>View activity</strong>
                <span>See recent course access.</span>
              </button>
            </div>
          </div>
        ) : tab === "content" ? (
          <div className="admin-table-card">
            {!data?.modules.length ? (
              <div className="admin-empty small">
                <h2>No learning modules yet</h2>
                <p>Create starter modules from Overview before adding content.</p>
                <button className="outline-button" type="button" onClick={() => setTab("overview")}>
                  Go to overview <ArrowRight aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <div className="table-toolbar">
                  <label className="search-field">
                    <Search aria-hidden="true" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search content"
                      aria-label="Search content"
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={includeDeleted}
                      onChange={(event) => setIncludeDeleted(event.target.checked)}
                    />{" "}
                    Recently deleted
                  </label>
                </div>
                <ContentAdminList
                  items={data?.items ?? []}
                  modules={data?.modules ?? []}
                  search={search}
                  includeDeleted={includeDeleted}
                  busy={busy}
                  onEdit={(item) => {
                    setEditing(item);
                    setShowForm(true);
                  }}
                  onAction={(item, action) => void toggleItem(item, action)}
                />
              </>
            )}
          </div>
        ) : tab === "students" ? (
          <div className="admin-table-card">
            <div className="table-toolbar">
              <p>Review student accounts and assigned course access.</p>
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
                    onClick={() => setStudentDialog(person)}
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
      {showForm && data && (
        <ContentForm
          modules={data.modules}
          item={editing}
          onClose={() => setShowForm(false)}
          onSaved={(message) => {
            setShowForm(false);
            setNotice(message);
            void refresh();
          }}
        />
      )}
      {inviteOpen && data && (
        <InviteStudentForm
          modules={data.modules}
          busy={busy}
          onClose={() => setInviteOpen(false)}
          onInvite={(input) => void inviteStudent(input)}
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
                <h2 id="student-edit-heading">Manage student</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setStudentDialog(null)}
                aria-label="Close"
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <form className="admin-form" onSubmit={(event) => void saveStudent(event)}>
              <label htmlFor="student-name">Full name</label>
              <input
                id="student-name"
                className="portal-input"
                name="fullName"
                defaultValue={studentDialog.full_name}
                required
              />
              <label>Role</label>
              <select className="portal-input" name="role" defaultValue={studentDialog.role}>
                <option value="student">Student</option>
                <option value="admin">Administrator</option>
              </select>
              <label className="checkbox-label">
                <input type="checkbox" name="active" defaultChecked={studentDialog.active} />{" "}
                Account active
              </label>
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
              <div className="form-actions">
                <button
                  className="outline-button"
                  type="button"
                  onClick={() => setStudentDialog(null)}
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

function InviteStudentForm({
  modules,
  busy,
  onClose,
  onInvite,
}: {
  modules: Module[];
  busy: boolean;
  onClose: () => void;
  onInvite: (input: {
    email: string;
    fullName: string;
    studentId: string;
    moduleIds: string[];
  }) => void;
}) {
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const studentId = String(form.get("studentId") ?? "").trim();
    if (!fullName || !email || !studentId) {
      setError("Enter the student’s name, email, and student ID.");
      return;
    }
    if (moduleIds.length > 6) {
      setError("A student can be assigned up to six modules.");
      return;
    }
    onInvite({ fullName, email, studentId, moduleIds });
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
            <h2 id="invite-student-heading">Invite a student</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
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
            The student will receive an email invitation to set their password.
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
              {busy ? "Sending…" : "Send invitation"}
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
  onAction: (item: AdminItem, action: "hide" | "publish" | "delete" | "restore") => void;
}) {
  const visibleItems = items.filter((item) => {
    const isDeleted = Boolean(item.deleted_at);
    const matchesDeleted = includeDeleted
      ? isDeleted && isRecentlyDeleted(item.deleted_at ?? "")
      : !isDeleted;
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
              {kindLabel(item.type)}
            </span>
            <strong>{item.title}</strong>
            <span>{item.description || "No description"}</span>
          </div>
          <span
            className={`status-pill ${item.deleted_at ? "not_started" : item.is_hidden ? "in_progress" : "completed"}`}
          >
            {item.deleted_at ? "Recently deleted" : item.is_hidden ? "Hidden" : "Published"}
          </span>
          <div className="admin-row-actions">
            {item.deleted_at ? (
              <button
                className="outline-button"
                type="button"
                disabled={busy || !isRecentlyDeleted(item.deleted_at)}
                onClick={() => onAction(item, "restore")}
              >
                Restore <ArrowRight aria-hidden="true" />
              </button>
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
          <h2>{includeDeleted ? "Nothing to restore" : "No content found"}</h2>
          <p>
            {includeDeleted
              ? "Items deleted in the last 30 days will appear here."
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
  onClose,
  onSaved,
}: {
  modules: Module[];
  item: AdminItem | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [moduleId, setModuleId] = useState(item?.module_id ?? modules[0]?.id ?? "");
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
      setError("Choose a PDF, video (MP4, MOV, M4V, WebM), or audio file (MP3, M4A, WAV).");
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
        uploadedPath = `${moduleId}/${crypto.randomUUID()}-${file.name.replace(/[\\/]/g, "_")}`;
        await uploadFile(file, uploadedPath);
      }
      await savePortalContent({
        data: {
          ...(item ? { id: item.id } : {}),
          moduleId,
          type,
          title: title.trim(),
          description: description.trim(),
          storagePath: uploadedPath || item?.storage_path || "",
          publish,
        },
      });
      onSaved(
        item
          ? "Content changes saved."
          : publish
            ? "Content uploaded and published."
            : "Content uploaded and saved as hidden.",
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
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
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
                accept=".pdf,.mp4,.mov,.m4v,.webm,.mp3,.m4a,.wav"
                onChange={(event) => selectFile(event.currentTarget.files?.[0] ?? null)}
                required
              />
              <p className="form-hint">
                PDF, MP4, MOV, M4V, WebM, MP3, M4A, or WAV. Files upload privately and can be up to
                2 GB.
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
              Detected content type: <strong>{kindLabel(type)}</strong>
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
          {busy && file && (
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
