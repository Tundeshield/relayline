import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useOrg } from './data/store';
import MarketingLayout from './pages/marketing/MarketingLayout';
import Home from './pages/marketing/Home';
import Product from './pages/marketing/Product';
import UseCases from './pages/marketing/UseCases';
import Pricing from './pages/marketing/Pricing';
import { About, Contact, Privacy, Terms } from './pages/marketing/Static';
import { Login, Signup, ForgotPassword, ResetPassword } from './pages/auth/Auth';
import Onboarding from './pages/auth/Onboarding';
import AppShell from './components/AppShell';
import Dashboard from './pages/app/Dashboard';
import Contacts from './pages/app/Contacts';
import ContactProfile from './pages/app/ContactProfile';
import ImportContacts from './pages/app/ImportContacts';
import Lists, { ListDetail } from './pages/app/Lists';
import Templates from './pages/app/Templates';
import Campaigns from './pages/app/Campaigns';
import CampaignBuilder from './pages/app/CampaignBuilder';
import CampaignDetail from './pages/app/CampaignDetail';
import Inbox from './pages/app/Inbox';
import Automations from './pages/app/Automations';
import AutomationBuilder from './pages/app/AutomationBuilder';
import { AutomationHistory, ExecutionDetail } from './pages/app/AutomationHistory';
import Analytics from './pages/app/Analytics';
import ActivityLog from './pages/app/ActivityLog';
import Settings from './pages/app/Settings';
import Help from './pages/app/Help';
import Notifications from './pages/app/Notifications';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { if (!pathname.startsWith('/app/inbox')) window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function RequireAuth({ children, needOrg = true }) {
  const { user, org } = useOrg();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (needOrg && !org) return <Navigate to="/onboarding" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/product" element={<Product />} />
          <Route path="/use-cases" element={<UseCases />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/onboarding" element={<RequireAuth needOrg={false}><Onboarding /></RequireAuth>} />
        <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="campaigns/new" element={<CampaignBuilder />} />
          <Route path="campaigns/:id/edit" element={<CampaignBuilder />} />
          <Route path="campaigns/:id" element={<CampaignDetail />} />
          <Route path="automations" element={<Automations />} />
          <Route path="automations/new" element={<AutomationBuilder />} />
          <Route path="automations/:id" element={<AutomationBuilder />} />
          <Route path="automations/:id/history" element={<AutomationHistory />} />
          <Route path="automations/executions/:execId" element={<ExecutionDetail />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="inbox/:id" element={<Inbox />} />
          <Route path="templates" element={<Templates />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="contacts/import" element={<ImportContacts />} />
          <Route path="contacts/:id" element={<ContactProfile />} />
          <Route path="lists" element={<Lists />} />
          <Route path="lists/:id" element={<ListDetail />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="activity" element={<ActivityLog />} />
          <Route path="team" element={<Navigate to="/app/settings/team" replace />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/:tab" element={<Settings />} />
          <Route path="help" element={<Help />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
