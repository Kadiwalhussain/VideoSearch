import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./store/SessionContext";
import { VaultProvider } from "./store/VaultContext";
import { ThemeProvider } from "./store/ThemeContext";
import { DialogProvider } from "./store/DialogContext";
import { StudioLayout } from "./layouts/StudioLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { lazy, Suspense, type ReactNode } from "react";
import { SessionLoader } from "./components/SessionLoader";

/**
 * Everything past the first screen loads on demand. Analytics alone pulls in
 * ~490KB of chart.js, which nobody should pay for to look at their library.
 */
const named = <K extends string>(
  loader: () => Promise<Record<K, React.ComponentType>>,
  key: K
) => lazy(async () => ({ default: (await loader())[key] }));

const LibraryPage = named(() => import("./pages/LibraryPage"), "LibraryPage");
const WatchLaterPage = named(() => import("./pages/WatchLaterPage"), "WatchLaterPage");
const PlaylistsPage = named(() => import("./pages/PlaylistsPage"), "PlaylistsPage");
const PlaylistDetailPage = named(() => import("./pages/PlaylistDetailPage"), "PlaylistDetailPage");
const SearchPage = named(() => import("./pages/SearchPage"), "SearchPage");
const NotesPage = named(() => import("./pages/NotesPage"), "NotesPage");
const ShotsPage = named(() => import("./pages/ShotsPage"), "ShotsPage");
const HistoryPage = named(() => import("./pages/HistoryPage"), "HistoryPage");
const AnalyticsPage = named(() => import("./pages/AnalyticsPage"), "AnalyticsPage");
const ExtensionPage = named(() => import("./pages/ExtensionPage"), "ExtensionPage");
const SettingsPage = named(() => import("./pages/SettingsPage"), "SettingsPage");
const VideoDetailPage = named(() => import("./pages/VideoDetailPage"), "VideoDetailPage");
const SharePage = named(() => import("./pages/SharePage"), "SharePage");
const StudyPage = named(() => import("./pages/StudyPage"), "StudyPage");

function PageFallback() {
  return (
    <SessionLoader variant="inline" title="Loading" sub="One moment…" />
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <SessionLoader
        title="Loading session"
        sub="Verifying your account and restoring vault access…"
      />
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Public shared video cards — no login required */}
      <Route
        path="/share/:token"
        element={
          <Suspense fallback={<PageFallback />}>
            <SharePage />
          </Suspense>
        }
      />
      <Route
        element={
          <Protected>
            <VaultProvider>
              <StudioLayout />
            </VaultProvider>
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="watch-later" element={<WatchLaterPage />} />
        <Route path="playlists" element={<PlaylistsPage />} />
        <Route path="playlists/:name" element={<PlaylistDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="notes" element={<NotesPage />} />
        <Route path="shots" element={<ShotsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="study" element={<StudyPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="extension" element={<ExtensionPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="video/:videoId" element={<VideoDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <DialogProvider>
          <BrowserRouter basename="/app">
            <AppRoutes />
          </BrowserRouter>
        </DialogProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
