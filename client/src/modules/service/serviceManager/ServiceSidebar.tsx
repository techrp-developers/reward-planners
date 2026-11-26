import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, BarChart3, BriefcaseBusiness, ChevronDown, CircleDollarSign, ClipboardList, Coins, Grid2X2, Inbox, Layers, List, LockKeyhole, LogOut, Settings, ShoppingBag, Tags, UserRound, UsersRound, XCircle } from 'lucide-react';
import BrandLogo from '../../../common/components/BrandLogo';
import { useAuth } from '../../../common/auth/useAuth';
import { routes } from '../../../routes';
const groups = [
  { label: 'Overview', links: [{ label: 'Dashboard', to: routes.service.dashboard, icon: Grid2X2 }] },
  { label: 'In-House Services', links: [
    { label: 'Overview', to: '/service/in-house', icon: BriefcaseBusiness },
    { label: 'Categories', to: '/service/catalog/categories', icon: List },
    { label: 'Services', to: '/service/catalog/services', icon: Layers },
    { label: 'Variants', to: '/service/catalog/variants', icon: Tags },
    { label: 'Pricing Management', to: '/service/pricing', icon: CircleDollarSign },
    { label: 'Reward Rules', to: '/service/rewards', icon: Coins },
    { label: 'Enquiries', to: routes.service.enquiries, icon: Inbox },
    { label: 'Orders', to: routes.service.orders, icon: ShoppingBag },
    { label: 'Cancellations & Refunds', to: routes.service.cancellations, icon: XCircle },
  ] },
  { label: 'Partner Services', links: [
    { label: 'Overview', to: '/service/partners/overview', icon: BriefcaseBusiness },
    { label: 'Partner Catalogue', to: '/service/partners/catalogue', icon: Layers },
    { label: 'Partner Assignments', to: '/service/partners/assignments', icon: UsersRound },
    { label: 'Partner Pricing', to: '/service/partners/pricing', icon: CircleDollarSign },
    { label: 'Partner Enquiries', to: '/service/partners/enquiries', icon: Inbox },
    { label: 'Partner Orders', to: '/service/partners/orders', icon: ShoppingBag },
  ] },
  { label: 'Management', links: [
    { label: 'Reports & Analytics', to: routes.service.reports, icon: BarChart3 },
    { label: 'Activity Logs', to: '/service/activity', icon: Activity },
    { label: 'Classification Review', to: '/service/classification', icon: ClipboardList },
    { label: 'Settings', to: routes.service.settings, icon: Settings },
  ] },
  { label: 'Account', links: [
    { label: 'My Profile', to: routes.service.profile, icon: UserRound },
    { label: 'Change Password', to: routes.service.changePassword, icon: LockKeyhole },
  ] },
];
export default function ServiceNavbar() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState<string[]>(() => { try { const stored: unknown = JSON.parse(localStorage.getItem('sm-navigation') || '[]'); return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string') : []; } catch { return []; } });
  const toggle = (label: string) => { const next = collapsed.includes(label) ? collapsed.filter(item => item !== label) : [...collapsed, label]; setCollapsed(next); try { localStorage.setItem('sm-navigation', JSON.stringify(next)); } catch { /* Navigation works without storage. */ } };
  return <nav aria-label="Service Manager navigation" className="sm-sidebar"><div className="sm-brand"><BrandLogo className="w-32" /><span>Service Manager</span></div><div className="sm-menu">{groups.map((group, index) => <section key={group.label}><button className="sm-group-toggle" aria-expanded={!collapsed.includes(group.label)} aria-controls={`sm-group-${index}`} onClick={() => toggle(group.label)}>{group.label}<ChevronDown size={13} style={{ transform: collapsed.includes(group.label) ? 'rotate(-90deg)' : undefined }} /></button><div id={`sm-group-${index}`} hidden={collapsed.includes(group.label)}>{group.links.map(({ label, to, icon: Icon }) => <NavLink key={to} end to={to} className={({ isActive }) => `sm-nav-link ${isActive ? 'sm-nav-active' : ''}`}><Icon size={16} strokeWidth={1.7} /><span>{label}</span></NavLink>)}</div></section>)}</div><div className="sm-user"><div className="sm-avatar">{(user?.name || user?.email || 'S').slice(0, 1).toUpperCase()}</div><div><strong>{user?.name || 'Service Manager'}</strong><span>{user?.email}</span></div><button onClick={() => void logout()} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button></div></nav>;
}
