import { useEffect, useLayoutEffect, useRef } from "react";
import { revealPage } from "./lib/anim";
import { AssistantDrawer } from "./components/Assistant";
import { AuthScreen, ErrorScreen, LoadingScreen, NewPasswordScreen, OnboardingScreen, SetupMissingScreen } from "./components/Auth";
import { supabaseConfigured } from "./lib/supabase";
import { startAuth, useSession } from "./lib/sync";
import { CommandPalette, ConfirmDialog, Toasts, WeeklyReview } from "./components/Overlays";
import { QuickCaptureModal } from "./components/QuickCapture";
import { MobileNav, Sidebar } from "./components/Sidebar";
import { TaskDrawer } from "./components/TaskDrawer";
import { useApp } from "./lib/store";
import { ui, uiStore, useRoute } from "./lib/ui";
import { CalendarPage } from "./pages/Calendar";
import { PomodoroPage } from "./pages/Pomodoro";
import { AlertsPanel } from "./components/Alerts";
import { FeedbackButton } from "./components/Feedback";
import { checkDesktopAlerts } from "./lib/alerts";
import { resumeTimer } from "./lib/pomodoro";
import { PomodoroMini } from "./components/PomodoroMini";
import { PomodoroPlayer } from "./components/PomodoroPlayer";
import { CreativePage } from "./pages/CreativePage";
import { CreativesPage } from "./pages/Creatives";
import { SharedBoardPage } from "./pages/SharedBoard";
import { FinancePage } from "./pages/Finance";
import { HabitsPage } from "./pages/Habits";
import { MorePage } from "./pages/More";
import { NotesPage } from "./pages/Notes";
import { RoutinePage } from "./pages/Routine";
import { SettingsPage } from "./pages/Settings";
import { TasksPage } from "./pages/Tasks";
import { TodayPage } from "./pages/Today";
import { VideoPage } from "./pages/VideoPage";
import { VideosPage } from "./pages/Videos";

function useTheme() {
  const theme = useApp().settings.theme;
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const s = uiStore.get();
        if (s.paletteOpen) ui.closePalette();
        else ui.openPalette();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (uiStore.get().assistantOpen) ui.closeAssistant();
        else ui.openAssistant();
        return;
      }
      const target = e.target as HTMLElement;
      const typing = target.closest("input, textarea, select, [contenteditable='true']");
      const s = uiStore.get();
      const overlayOpen = s.paletteOpen || s.captureOpen || s.confirm || s.reviewOpen || s.assistantOpen;
      if (!typing && !overlayOpen && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        ui.openCapture();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Router() {
  const { parts } = useRoute();
  const [section, id] = parts;
  switch (section) {
    case "agenda":
      return <CalendarPage />;
    case "pomodoro":
      return <PomodoroPage />;
    case "tarefas":
      return <TasksPage />;
    case "ideias":
      return <NotesPage openId={id || null} />;
    case "videos":
      return id ? <VideoPage id={id} /> : <VideosPage />;
    case "criativos":
      return id ? <CreativePage id={id} /> : <CreativesPage />;
    case "habitos":
      return <HabitsPage />;
    case "rotina":
      return <RoutinePage />;
    case "financas":
      return <FinancePage tab={id || "mes"} />;
    case "config":
      return <SettingsPage />;
    case "mais":
      return <MorePage />;
    default:
      return <TodayPage />;
  }
}

startAuth();

export function App() {
  const { phase } = useSession();
  const { parts } = useRoute();
  useTheme();
  let screen: React.ReactNode;
  // o quadro compartilhado abre sem login: quem visita não entra na conta de ninguém
  if (parts[0] === "compartilhado" && parts[1]) {
    return (
      <>
        <SharedBoardPage token={parts[1]} />
        <Toasts />
      </>
    );
  }
  if (!supabaseConfigured) screen = <SetupMissingScreen />;
  else if (phase === "loading") screen = <LoadingScreen />;
  else if (phase === "signedOut") screen = <AuthScreen />;
  else if (phase === "recovery") screen = <NewPasswordScreen />;
  else if (phase === "onboarding") screen = <OnboardingScreen />;
  else if (phase === "error") screen = <ErrorScreen />;
  else screen = <Workspace />;
  return (
    <>
      {screen}
      <Toasts />
      {phase === "error" && <ConfirmDialog />}
    </>
  );
}

function Workspace() {
  useShortcuts();
  const { path } = useRoute();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    document.querySelector(".main")?.scrollTo(0, 0);
    ui.closeTask();
  }, [path]);
  // ao trocar de página, os blocos entram em sequência
  useLayoutEffect(() => revealPage(mainRef.current), [path]);
  // o cronômetro volta de onde parou, agora que as preferências já chegaram
  useEffect(() => resumeTimer(), []);
  // avisos de prazo no computador, de minuto em minuto
  useEffect(() => {
    checkDesktopAlerts();
    const id = window.setInterval(checkDesktopAlerts, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="app">
      <Sidebar />
      <main className="main" ref={mainRef}>
        <Router />
      </main>
      <MobileNav />
      <FeedbackButton />
      <PomodoroMini />
      <AlertsPanel />
      <PomodoroPlayer />
      <TaskDrawer />
      <AssistantDrawer />
      <QuickCaptureModal />
      <CommandPalette />
      <WeeklyReview />
      <ConfirmDialog />
    </div>
  );
}
