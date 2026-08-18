import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./store/SessionContext";
import { VaultProvider } from "./store/VaultContext";
import { ThemeProvider } from "./store/ThemeContext";
import { DialogProvider } from "./store/DialogContext";
import { StudioLayout } from "./layouts/StudioLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LibraryPage } from "./pages/LibraryPage";
import { WatchLaterPage } from "./pages/WatchLaterPage";
import { PlaylistsPage } from "./pages/PlaylistsPage";
import { PlaylistDetailPage } from "./pages/PlaylistDetailPage";
import { SearchPage } from "./pages/SearchPage";
import { NotesPage } from "./pages/NotesPage";
import { ShotsPage } from "./pages/ShotsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ExtensionPage } from "./pages/ExtensionPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VideoDetailPage } from "./pages/VideoDetailPage";
import { SharePage } from "./pages/SharePage";
import type { ReactNode } from "react";
import { SessionLoader } from "./components/SessionLoader";

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
      <Route path="/share/:token" element={<SharePage />} />
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
