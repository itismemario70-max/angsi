import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight, ArrowRight, Check, ChevronDown, Compass, Copy, ExternalLink,
  Eye, EyeOff, KeyRound, Leaf, LockKeyhole, LogOut, Menu, Plus, Save, Shield,
  ShieldCheck, Swords, Trash2, Users, X, Sun, Moon, Minimize2, Maximize2, RotateCw,
  Palette, Monitor, Smartphone,
} from 'lucide-react';
import {
  getGetLegendsContentQueryKey, getGetLegendsSessionQueryKey, getGetBanAppealsQueryKey,
  getGetStaffApplicationsQueryKey, useGetLegendsContent,
  useGetLegendsSession, useLoginLegendsPanel, useLogoutLegendsPanel,
  useUpdateLegendsCodes, useUpdateLegendsContent, useSubmitBanAppeal, useSubmitStaffApplication,
  useGetBanAppeals, useUpdateBanAppealStatus, useGetStaffApplications,
  useUpdateStaffApplicationStatus,
} from '@workspace/api-client-react';
import type { SiteContentInput, CommunityFormSubmission, FormQuestion } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter, Link } from 'wouter';

const client = new QueryClient();
type Staff = SiteContentInput['staff'][number];
type DiscordLink = SiteContentInput['discordLinks'][number];
type Rule = SiteContentInput['rules'][number];
type Punishment = SiteContentInput['punishments'][number];
type Event = SiteContentInput['events'][number];
type CollectionKey = 'discordLinks' | 'staff' | 'rules' | 'punishments' | 'events';
type CollectionItem = DiscordLink | Staff | Rule | Punishment | Event;
type WebsiteColorKey = keyof SiteContentInput['website']['colors'];
type WebsitePageKey = 'global' | 'home' | 'join' | 'staff' | 'rules' | 'events' | 'punishments' | 'plugin' | 'apply' | 'appeal';

const defaultWebsite = {
  colors: {
    forest: '#263d32',
    forestDeep: '#1c3028',
    paper: '#f1eee3',
    paperBright: '#f8f6ee',
    gold: '#d6b66f',
    rust: '#b56c50',
    ink: '#283b31',
    darkForest: '#17231f',
    darkForestDeep: '#111a17',
    darkPaper: '#202a27',
    darkPaperBright: '#293530',
    darkGold: '#d4b671',
    darkRust: '#d28b6d',
    darkInk: '#e2e2d2',
  },
  copy: {
    'topline.primary': 'A WORLD BUILT TOGETHER',
    'topline.secondary': 'JAVA SURVIVAL · COMMUNITY FIRST',
    'brand.title': 'LEGENDS',
    'brand.subtitle': 'SMP',
    'nav.home': 'Home',
    'nav.staff': 'Staff',
    'nav.rules': 'Rules',
    'nav.events': 'Events',
    'nav.punishments': 'Punishments',
    'nav.plugin': 'Plugin info',
    'nav.apply': 'Apply for staff',
    'nav.appeal': 'Ban appeal',
    'nav.join': 'Join the world',
    'footer.line1': 'Take care of the world.',
    'footer.line2': 'Take care of each other.',
    'footer.tagline': 'BUILT FOR THE LONG GAME',
    'footer.copyright': 'LEGENDS SMP · SURVIVE TOGETHER',
    'home.hero.eyebrow': 'YOUR NEXT CHAPTER STARTS HERE',
    'home.hero.title': 'Make a little',
    'home.hero.accent': 'legend.',
    'home.hero.description': 'A survival world shaped by the people in it. Build something that lasts, find your crew, and leave your mark on the map.',
    'home.hero.primary': 'Find your way in',
    'home.hero.secondary': 'Meet the community',
    'home.hero.note': 'A PLACE FOR THE LONG GAME',
    'home.hero.coordinate': 'SEED UNKNOWN\nSTORIES CERTAIN',
    'home.hero.est': 'EST. IN THE OVERWORLD',
    'home.hero.index': 'THE OVERWORLD',
    'home.manifesto.kicker': 'MORE THAN A SPAWN POINT',
    'home.manifesto.title': 'It’s not about',
    'home.manifesto.accent': 'the blocks.',
    'home.manifesto.body1': 'It’s the road between bases. The town that grew out of nowhere. The friend who stayed up late to finish the roof.',
    'home.manifesto.body2': 'Legends is an independent survival community where the best things happen when nobody’s rushing to the end.',
    'home.manifesto.link': 'Read our charter',
    'home.manifesto.seal': 'BUILD\nWITH PURPOSE',
    'staff.kicker': 'THE PEOPLE BEHIND THE WORLD',
    'staff.title': 'Keepers of',
    'staff.accent': 'the realm.',
    'staff.description': 'Good worlds don’t run themselves. Meet the folks who keep this one welcoming, fair, and running smoothly.',
    'staff.empty.title': 'The roster is being written.',
    'staff.empty.body': 'Our community team will introduce themselves here soon.',
    'staff.showMore': 'Show more staff',
    'staff.showLess': 'Show fewer staff',
    'staff.gameTag': 'IN-GAME',
    'staff.discordLabel': 'DISCORD',
    'join.kicker': 'YOUR WAY IN',
    'join.title': 'Same horizon.',
    'join.accent': 'New story.',
    'join.season': 'CURRENT SEASON',
    'join.seasonEmpty': 'Awaiting the next chapter',
    'join.seasonStamp': 'SEASON',
    'join.serverAddress': 'SERVER ADDRESS',
    'join.serverEmpty': 'Server address not published yet',
    'join.copy': 'COPY',
    'join.copied': 'COPIED',
    'join.hint': 'Minecraft Java Edition · Add the address above to Multiplayer',
    'join.discord': 'FIND US OUTSIDE THE GAME',
    'join.linksEmpty': 'Community links will appear here when available.',
    'rules.kicker': 'A FEW THINGS WE HOLD TRUE',
    'rules.title': 'The',
    'rules.accent': 'charter.',
    'rules.mark': 'A GOOD WORLD\nIS EVERYONE’S WORK',
    'rules.aside': 'KEEP IT KIND.\nKEEP IT REAL.',
    'rules.asideBody': 'Simple promises.\nBetter adventures.',
    'rules.bottomLeft': 'THE WORLD IS BETTER WHEN EVERYONE BELONGS.',
    'rules.bottomRight': 'LEGENDS SMP · COMMUNITY CHARTER',
    'rules.empty.title': 'The charter is on its way.',
    'rules.empty.body': 'Our shared rules will be published here before the next adventure begins.',
    'events.kicker': 'THERE’S ALWAYS SOMETHING BREWING',
    'events.title': 'Meet me at',
    'events.accent': 'the campfire.',
    'events.description': 'Good memories don’t schedule themselves. Here’s what the community is looking forward to.',
    'events.empty.title': 'No gatherings on the map just yet.',
    'events.empty.body': 'When the next community event is planned, you’ll find it here.',
    'events.when': 'WHEN',
    'events.reward': 'BRING BACK',
    'punishments.kicker': 'FAIR PLAY, CLEAR EXPECTATIONS',
    'punishments.title': 'Every world\nneeds a',
    'punishments.accent': 'boundary.',
    'punishments.description': 'When things go sideways, our moderation team handles it with care and consistency.',
    'punishments.empty': 'Punishment schedules will be posted here when available.',
    'plugin.kicker': 'TOOLS THAT SUPPORT THE WORLD',
    'plugin.title': 'How we',
    'plugin.accent': 'play.',
    'plugin.description': 'Helpful details for getting started, shared by the people who play here.',
    'plugin.contentTitle': 'LEGENDS SMP / SERVER NOTES',
    'plugin.contentTag': 'COMMUNITY GUIDE',
    'plugin.empty.title': 'Details are being gathered.',
    'plugin.empty.body': 'Server notes will be shared here as the community settles in.',
    'plugin.signoff': 'KEEP IT KIND',
    'plugin.signoffTail': 'KEEP IT CURIOUS',
    'form.appeal.kicker': 'A WAY BACK TO THE WORLD',
    'form.apply.kicker': 'HELP SHAPE WHAT COMES NEXT',
    'form.appeal.title': 'A second',
    'form.appeal.accent': 'chapter.',
    'form.apply.title': 'Make room',
    'form.apply.accent': 'for your story.',
    'form.appeal.description': 'We know people can grow. Share your perspective and our moderation team will review your appeal with care.',
    'form.apply.description': 'Good communities are built by people who show up for one another. Tell us how you might help.',
    'form.readByTeam': 'READ BY THE LEGENDS TEAM',
    'form.appeal.note': 'ONE APPEAL AT A TIME',
    'form.apply.note': 'THOUGHTFUL PEOPLE WELCOME',
    'form.appeal.cardTitle': 'Tell us what happened.',
    'form.apply.cardTitle': 'Let’s get to know you.',
    'form.minecraft': 'MINECRAFT USERNAME',
    'form.discord': 'DISCORD USERNAME',
    'form.minecraftPlaceholder': 'Your in-game name',
    'form.discordPlaceholder': 'name or name#0000',
    'form.answerPlaceholder': 'Take your time. A little context helps.',
    'form.privacy': 'Your details are only shared with the Legends team.',
    'form.submit': 'Send to the team',
    'form.sending': 'Sending…',
    'form.failure': 'We couldn’t send this just now. Your answers are still here; please try again.',
    'form.appeal.closedTitle': 'Appeals are paused for now.',
    'form.appeal.closedBody': 'Our team is not accepting new appeals at the moment. Please check back later.',
    'form.success.kicker': 'RECEIVED BY THE TEAM',
    'form.success.title': 'Your words are with us.',
    'form.success.body': 'Thank you for taking the time to write. The team will review your response as soon as they can.',
    'form.success.again': 'Send another response',
    'form.appeal.switch': 'Interested in joining the team?',
    'form.apply.switch': 'Need to appeal a ban?',
    'form.appeal.switchAction': 'Apply here',
    'form.apply.switchAction': 'Start an appeal',
    'form.appeal.back': 'Back to Legends',
    'form.required': 'REQUIRED',
    'footer.staffAccess': 'Staff access',
    'footer.ownerAccess': 'Owner access',
    'footer.banAppeals': 'Ban appeals',
    'footer.staffApplications': 'Staff applications',
  } as Record<string, string>,
};

const websiteEditorPages: { key: WebsitePageKey; label: string; fields: { key: string; label: string; multiline?: boolean }[] }[] = [
  { key: 'global', label: 'Site-wide', fields: [
    { key: 'topline.primary', label: 'Top banner — left' }, { key: 'topline.secondary', label: 'Top banner — right' },
    { key: 'brand.title', label: 'Logo name' }, { key: 'brand.subtitle', label: 'Logo subname' },
    { key: 'nav.home', label: 'Navigation — home' }, { key: 'nav.staff', label: 'Navigation — staff' },
    { key: 'nav.rules', label: 'Navigation — rules' }, { key: 'nav.events', label: 'Navigation — events' },
    { key: 'nav.punishments', label: 'Navigation — punishments' }, { key: 'nav.plugin', label: 'Navigation — plugin info' },
    { key: 'nav.apply', label: 'Navigation — applications' }, { key: 'nav.appeal', label: 'Navigation — appeals' },
    { key: 'nav.join', label: 'Join button' }, { key: 'footer.line1', label: 'Footer line 1' },
    { key: 'footer.line2', label: 'Footer line 2' }, { key: 'footer.tagline', label: 'Footer tagline' },
    { key: 'footer.copyright', label: 'Footer copyright' }, { key: 'footer.staffAccess', label: 'Staff access link' },
    { key: 'footer.ownerAccess', label: 'Owner access link' }, { key: 'footer.banAppeals', label: 'Ban appeals link' },
    { key: 'footer.staffApplications', label: 'Staff applications link' },
  ] },
  { key: 'home', label: 'Homepage', fields: [
    { key: 'home.hero.eyebrow', label: 'Hero note' }, { key: 'home.hero.title', label: 'Hero heading — first line' },
    { key: 'home.hero.accent', label: 'Hero heading — accent' }, { key: 'home.hero.description', label: 'Hero paragraph', multiline: true },
    { key: 'home.hero.primary', label: 'Main button' }, { key: 'home.hero.secondary', label: 'Second button' },
    { key: 'home.hero.note', label: 'Small note' }, { key: 'home.hero.coordinate', label: 'Artwork note', multiline: true },
    { key: 'home.hero.est', label: 'Hero bottom detail' }, { key: 'home.hero.index', label: 'Hero side label' },
    { key: 'home.manifesto.kicker', label: 'Intro label' },
    { key: 'home.manifesto.title', label: 'Intro heading' }, { key: 'home.manifesto.accent', label: 'Intro heading accent' },
    { key: 'home.manifesto.body1', label: 'Intro paragraph 1', multiline: true }, { key: 'home.manifesto.body2', label: 'Intro paragraph 2', multiline: true },
    { key: 'home.manifesto.link', label: 'Intro link label' }, { key: 'home.manifesto.seal', label: 'Intro badge', multiline: true },
  ] },
  { key: 'staff', label: 'Staff page', fields: [
    { key: 'staff.kicker', label: 'Section label' }, { key: 'staff.title', label: 'Heading' },
    { key: 'staff.accent', label: 'Heading accent' }, { key: 'staff.description', label: 'Description', multiline: true },
    { key: 'staff.empty.title', label: 'Empty roster heading' }, { key: 'staff.empty.body', label: 'Empty roster note', multiline: true },
    { key: 'staff.showMore', label: 'Show-more button' }, { key: 'staff.showLess', label: 'Show-less button' },
    { key: 'staff.gameTag', label: 'In-game badge' }, { key: 'staff.discordLabel', label: 'Discord label' },
  ] },
  { key: 'join', label: 'Join page', fields: [
    { key: 'join.kicker', label: 'Section label' }, { key: 'join.title', label: 'Heading' }, { key: 'join.accent', label: 'Heading accent' },
    { key: 'join.season', label: 'Season label' }, { key: 'join.seasonEmpty', label: 'Missing-season note' },
    { key: 'join.seasonStamp', label: 'Season badge' },
    { key: 'join.serverAddress', label: 'Server address label' }, { key: 'join.serverEmpty', label: 'Missing-address note' },
    { key: 'join.copy', label: 'Copy button' }, { key: 'join.copied', label: 'Copied confirmation' },
    { key: 'join.hint', label: 'Connection instructions' }, { key: 'join.discord', label: 'Community links label' },
    { key: 'join.linksEmpty', label: 'Missing-links note' },
  ] },
  { key: 'rules', label: 'Rules page', fields: [
    { key: 'rules.kicker', label: 'Section label' }, { key: 'rules.title', label: 'Heading' }, { key: 'rules.accent', label: 'Heading accent' },
    { key: 'rules.mark', label: 'Side badge', multiline: true }, { key: 'rules.aside', label: 'Side note', multiline: true },
    { key: 'rules.asideBody', label: 'Side note text', multiline: true }, { key: 'rules.bottomLeft', label: 'Bottom statement' },
    { key: 'rules.bottomRight', label: 'Bottom label' }, { key: 'rules.empty.title', label: 'Empty rules heading' },
    { key: 'rules.empty.body', label: 'Empty rules note', multiline: true },
  ] },
  { key: 'events', label: 'Events page', fields: [
    { key: 'events.kicker', label: 'Section label' }, { key: 'events.title', label: 'Heading' },
    { key: 'events.accent', label: 'Heading accent' }, { key: 'events.description', label: 'Description', multiline: true },
    { key: 'events.empty.title', label: 'Empty events heading' }, { key: 'events.empty.body', label: 'Empty events note', multiline: true },
    { key: 'events.when', label: 'Event time label' }, { key: 'events.reward', label: 'Reward label' },
  ] },
  { key: 'punishments', label: 'Punishments', fields: [
    { key: 'punishments.kicker', label: 'Section label' }, { key: 'punishments.title', label: 'Heading', multiline: true },
    { key: 'punishments.accent', label: 'Heading accent' }, { key: 'punishments.description', label: 'Description', multiline: true },
    { key: 'punishments.empty', label: 'Empty schedule note', multiline: true },
  ] },
  { key: 'plugin', label: 'Plugin info', fields: [
    { key: 'plugin.kicker', label: 'Section label' }, { key: 'plugin.title', label: 'Heading' }, { key: 'plugin.accent', label: 'Heading accent' },
    { key: 'plugin.description', label: 'Description', multiline: true }, { key: 'plugin.contentTitle', label: 'Guide label' },
    { key: 'plugin.contentTag', label: 'Guide category' }, { key: 'plugin.empty.title', label: 'Empty guide heading' },
    { key: 'plugin.empty.body', label: 'Empty guide note', multiline: true }, { key: 'plugin.signoff', label: 'Sign-off' },
    { key: 'plugin.signoffTail', label: 'Sign-off ending' },
  ] },
  { key: 'apply', label: 'Application form', fields: [
    { key: 'form.apply.kicker', label: 'Section label' }, { key: 'form.apply.title', label: 'Heading' },
    { key: 'form.apply.accent', label: 'Heading accent' }, { key: 'form.apply.description', label: 'Description', multiline: true },
    { key: 'form.apply.note', label: 'Note' }, { key: 'form.apply.cardTitle', label: 'Form heading' },
    { key: 'form.apply.switch', label: 'Link to appeal page' }, { key: 'form.apply.switchAction', label: 'Appeal link action' },
  ] },
  { key: 'appeal', label: 'Appeal form', fields: [
    { key: 'form.appeal.kicker', label: 'Section label' }, { key: 'form.appeal.title', label: 'Heading' },
    { key: 'form.appeal.accent', label: 'Heading accent' }, { key: 'form.appeal.description', label: 'Description', multiline: true },
    { key: 'form.appeal.note', label: 'Note' }, { key: 'form.appeal.cardTitle', label: 'Form heading' },
    { key: 'form.appeal.closedTitle', label: 'Closed form heading' }, { key: 'form.appeal.closedBody', label: 'Closed form note', multiline: true },
    { key: 'form.appeal.switch', label: 'Link to application page' }, { key: 'form.appeal.switchAction', label: 'Application link action' },
    { key: 'form.appeal.back', label: 'Return-home button' },
  ] },
];

const colorEditorFields: { key: WebsiteColorKey; label: string }[] = [
  { key: 'forest', label: 'Light — main forest' },
  { key: 'forestDeep', label: 'Light — banner & footer' },
  { key: 'paper', label: 'Light — page background' },
  { key: 'paperBright', label: 'Light — nav & cards' },
  { key: 'gold', label: 'Light — gold accent' },
  { key: 'rust', label: 'Light — rust accent' },
  { key: 'ink', label: 'Light — main text' },
  { key: 'darkForest', label: 'Dark — main forest' },
  { key: 'darkForestDeep', label: 'Dark — banner & footer' },
  { key: 'darkPaper', label: 'Dark — page background' },
  { key: 'darkPaperBright', label: 'Dark — nav & cards' },
  { key: 'darkGold', label: 'Dark — gold accent' },
  { key: 'darkRust', label: 'Dark — rust accent' },
  { key: 'darkInk', label: 'Dark — main text' },
];

const emptyContent: SiteContentInput = {
  serverIp: '', season: '', discordLinks: [], staff: [], rules: [], punishments: [], events: [],
  banAppealsEnabled: false, banAppealQuestions: [], staffApplicationQuestions: [], pluginInfo: '',
  website: defaultWebsite,
};

function siteText(content: SiteContentInput, key: string) {
  return content.website.copy[key] ?? defaultWebsite.copy[key] ?? '';
}

function useSiteStyle(content: SiteContentInput): CSSProperties {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const syncTheme = () => setDark(document.documentElement.dataset.theme === 'dark');
    window.addEventListener('legends-theme-change', syncTheme);
    return () => window.removeEventListener('legends-theme-change', syncTheme);
  }, []);
  const { colors } = content.website;
  return useMemo(() => ({
    '--forest': dark ? colors.darkForest : colors.forest,
    '--forest-deep': dark ? colors.darkForestDeep : colors.forestDeep,
    '--paper': dark ? colors.darkPaper : colors.paper,
    '--paper-bright': dark ? colors.darkPaperBright : colors.paperBright,
    '--gold': dark ? colors.darkGold : colors.gold,
    '--rust': dark ? colors.darkRust : colors.rust,
    '--ink': dark ? colors.darkInk : colors.ink,
  } as CSSProperties), [colors, dark]);
}

function useWebsitePreviewContent(content: SiteContentInput): SiteContentInput {
  const [previewContent, setPreviewContent] = useState<SiteContentInput | null>(null);
  const previewMode = new URLSearchParams(window.location.search).get('website-preview') === '1';
  useEffect(() => {
    if (!previewMode) return;
    const receivePreview = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type !== 'legends-website-preview' || !event.data.content) return;
      setPreviewContent(event.data.content as SiteContentInput);
    };
    window.addEventListener('message', receivePreview);
    window.parent.postMessage({ type: 'legends-preview-ready' }, window.location.origin);
    return () => window.removeEventListener('message', receivePreview);
  }, [previewMode]);
  return previewContent ?? content;
}

function minecraftSkinUrl(username: string) {
  const name = username.trim();
  return /^[a-zA-Z0-9_]{1,16}$/.test(name)
    ? `https://mc-heads.net/body/${encodeURIComponent(name)}`
    : '';
}

function reloadedImageUrl(source: string, reload: number) {
  if (!reload) return source;
  try {
    const url = new URL(source, window.location.origin);
    url.searchParams.set('skin-reload', String(reload));
    return url.href;
  } catch {
    return source;
  }
}

function setManagementSectionsOpen(open: boolean) {
  document.querySelectorAll<HTMLDetailsElement>('.management-fold').forEach(section => {
    section.open = open;
  });
}

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={CommunityHome} />
        <Route path="/staff" component={CommunityHome} />
        <Route path="/rules" component={CommunityHome} />
        <Route path="/events" component={CommunityHome} />
        <Route path="/punishments" component={CommunityHome} />
        <Route path="/join" component={CommunityHome} />
        <Route path="/appeal">{() => <PublicSubmissionPage kind="appeal" />}</Route>
        <Route path="/apply">{() => <PublicSubmissionPage kind="application" />}</Route>
        <Route path="/plugin" component={PluginPage} />
        <Route path="/admin">{() => <ManagementPanel panel="admin" />}</Route>
        <Route path="/owner">{() => <ManagementPanel panel="owner" />}</Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function Brand({ dark = false, content }: { dark?: boolean; content?: SiteContentInput }) {
  return (
    <Link href="/" className={`brand ${dark ? 'brand-dark' : ''}`} data-testid="link-home-brand">
      <span className="brand-mark"><Compass size={21} strokeWidth={2.2} /></span>
      <span className="brand-word">{content ? siteText(content, 'brand.title') : 'LEGENDS'}<span>{content ? siteText(content, 'brand.subtitle') : 'SMP'}</span></span>
    </Link>
  );
}

function CommunityHeader({ page, content }: { page: string; content: SiteContentInput }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = [
    { href: '/', label: siteText(content, 'nav.home'), page: 'home' },
    { href: '/staff', label: siteText(content, 'nav.staff'), page: 'staff' },
    { href: '/rules', label: siteText(content, 'nav.rules'), page: 'rules' },
    { href: '/events', label: siteText(content, 'nav.events'), page: 'events' },
    { href: '/punishments', label: siteText(content, 'nav.punishments'), page: 'punishments' },
    { href: '/plugin', label: siteText(content, 'nav.plugin'), page: 'plugin' },
    { href: '/apply', label: siteText(content, 'nav.apply'), page: 'apply' },
    { href: '/appeal', label: siteText(content, 'nav.appeal'), page: 'appeal' },
  ];
  const closeMenu = () => setMobileOpen(false);

  return (
    <header className="site-nav">
      <Brand content={content} />
      <nav id="public-navigation" className={mobileOpen ? 'nav-links nav-open' : 'nav-links'} aria-label="Main navigation">
        {links.map(link => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={page === link.page ? 'page' : undefined}
            onClick={closeMenu}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <Link href="/join" className="nav-join" onClick={closeMenu} data-testid="button-join-nav">
        {siteText(content, 'nav.join')} <ArrowRight size={15} />
      </Link>
      <ThemeToggle />
      <button
        className="mobile-menu"
        type="button"
        onClick={() => setMobileOpen(value => !value)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
        aria-controls="public-navigation"
        data-testid="button-mobile-menu"
      >
        {mobileOpen ? <X /> : <Menu />}
      </button>
    </header>
  );
}

function SkinPortrait({ member }: { member: Staff }) {
  const username = member.minecraftUsername.trim();
  const manualSource = member.skinUrl?.trim() || '';
  const autoSource = minecraftSkinUrl(username);
  const sources = [...new Set([manualSource, autoSource].filter(Boolean))];
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    setSourceIndex(0);
    setFailed(false);
    setReload(0);
  }, [manualSource, username]);
  const source = sources[sourceIndex] ?? '';

  return (
    <div className="staff-art">
      {(!source || failed) && (
        <div className="skin-fallback">
          {username.slice(0, 1).toUpperCase() || "L"}
        </div>
      )}
      {source && !failed && (
        <img
          key={`${source}-${reload}`}
          src={reloadedImageUrl(source, reload)}
          alt={`${username || "Minecraft player"} skin`}
          onError={() => {
            if (sourceIndex < sources.length - 1) setSourceIndex(index => index + 1);
            else setFailed(true);
          }}
        />
      )}
      {failed && sources.length > 0 && (
        <button
          className="skin-retry"
          type="button"
          onClick={() => {
            setSourceIndex(0);
            setFailed(false);
            setReload(value => value + 1);
          }}
          aria-label={`Reload ${username || 'staff'} skin`}
        >
          <RotateCw size={11} /> Reload skin
        </button>
      )}
      <span className="staff-rank">{member.rank || "COMMUNITY"}</span>
    </div>
  );
}

function DiscordInline({ text }: { text: string }) {
  const tokens = text.split(
    /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\|\|[^|]+\|\||`[^`]+`|\*[^*]+\*|_[^_]+_)/g,
  );
  return (
    <>
      {tokens.map((token, index) => {
        if (token.startsWith("**") && token.endsWith("**")) {
          return <strong key={index}>{token.slice(2, -2)}</strong>;
        }
        if (token.startsWith("__") && token.endsWith("__")) {
          return <u key={index}>{token.slice(2, -2)}</u>;
        }
        if (token.startsWith("~~") && token.endsWith("~~")) {
          return <del key={index}>{token.slice(2, -2)}</del>;
        }
        if (token.startsWith("||") && token.endsWith("||")) {
          return <DiscordSpoiler key={index} text={token.slice(2, -2)} />;
        }
        if (token.startsWith("`") && token.endsWith("`")) {
          return <code key={index}>{token.slice(1, -1)}</code>;
        }
        if (
          (token.startsWith("*") && token.endsWith("*")) ||
          (token.startsWith("_") && token.endsWith("_"))
        ) {
          return <em key={index}>{token.slice(1, -1)}</em>;
        }
        return token;
      })}
    </>
  );
}

function DiscordSpoiler({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      className={`discord-spoiler${revealed ? ' is-revealed' : ''}`}
      onClick={() => setRevealed(value => !value)}
      aria-pressed={revealed}
      aria-label={revealed ? 'Hide spoiler' : 'Reveal spoiler'}
    >
      {text}
    </button>
  );
}

function DiscordText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      const language = line.trimStart().slice(3).trim();
      while (++index < lines.length && !lines[index].trimStart().startsWith('```')) {
        codeLines.push(lines[index]);
      }
      blocks.push(
        <pre className="discord-code-block" key={`code-${index}`}>
          {language && <span className="discord-code-language">{language}</span>}
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    if (!line.trim()) {
      blocks.push(<div className="discord-spacer" key={`space-${index}`} />);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length <= 2 ? 2 : heading[1].length <= 4 ? 3 : 4;
      const Heading = `h${level}` as 'h2' | 'h3' | 'h4';
      blocks.push(<Heading className="discord-heading" key={`heading-${index}`}><DiscordInline text={heading[2]} /></Heading>);
      continue;
    }
    if (line.startsWith('-# ')) {
      blocks.push(<p className="discord-small-line" key={`small-${index}`}><DiscordInline text={line.slice(3)} /></p>);
      continue;
    }
    if (line.trimStart().startsWith(">")) {
      blocks.push(
        <blockquote key={`quote-${index}`}>
          <DiscordInline text={line.trimStart().slice(1).trimStart()} />
        </blockquote>,
      );
      continue;
    }
    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      blocks.push(
        <p className="discord-list-line" key={`list-${index}`}>
          <DiscordInline text={listItem[1]} />
        </p>,
      );
      continue;
    }
    blocks.push(<p key={`line-${index}`}><DiscordInline text={line} /></p>);
  }

  return (
    <div className="discord-markdown">{blocks}</div>
  );
}

function CommunityHome() {
  const { data, isLoading, isError, refetch } = useGetLegendsContent();
  const content = useWebsitePreviewContent(data ?? emptyContent);
  const websiteStyle = useSiteStyle(content);
  const [location, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const [showAllStaff, setShowAllStaff] = useState(false);
  const page = location === '/' ? 'home' : location.slice(1);
  const copyAddress = async () => {
    if (!content.serverIp) return;
    try {
      await navigator.clipboard.writeText(content.serverIp);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  if (isLoading) return <CommunitySkeleton />;
  return (
    <main className="community" style={websiteStyle}>
      <div className="topline"><span><span className="pulse-dot" /> {siteText(content, 'topline.primary')}</span><span className="topline-right">{siteText(content, 'topline.secondary')}</span></div>
      <CommunityHeader page={page} content={content} />
      {isError && <div className="fetch-notice" role="alert">The world details could not be reached. <button onClick={() => refetch()} data-testid="button-retry-content">Try again</button></div>}

      {(page === 'home') && <>
      <section className="hero" id="world">
        <div className="hero-art" aria-hidden="true">
          <div className="sun-disc" />
          <div className="ridge ridge-back" />
          <div className="ridge ridge-mid" />
          <div className="ridge ridge-front" />
          <div className="pine pine-a"><i /><i /><i /></div>
          <div className="pine pine-b"><i /><i /><i /></div>
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
          <div className="hero-coordinate">{siteText(content, 'home.hero.coordinate')}</div>
        </div>
        <div className="hero-content">
          <div className="eyebrow"><span className="eyebrow-line" /> {siteText(content, 'home.hero.eyebrow')}</div>
          <h1>{siteText(content, 'home.hero.title')}<br /><em>{siteText(content, 'home.hero.accent')}</em></h1>
          <p className="hero-copy">{siteText(content, 'home.hero.description')}</p>
          <div className="hero-actions">
            <button className="button button-gold" onClick={() => setLocation('/join')} data-testid="button-start-adventure">{siteText(content, 'home.hero.primary')} <ArrowDownRight size={17} /></button>
            <button className="text-action" onClick={() => setLocation('/staff')} data-testid="button-meet-community">{siteText(content, 'home.hero.secondary')} <ArrowRight size={15} /></button>
          </div>
          <div className="hero-note"><span className="note-rule" /> {siteText(content, 'home.hero.note')} <span className="note-separator">/</span> {siteText(content, 'home.hero.est')}</div>
        </div>
        <div className="hero-index"><span>01</span><span className="index-line" /> {siteText(content, 'home.hero.index')}</div>
      </section>
      </>}

      {page === 'join' && <section className="world-strip reveal-in" id="join">
        <div className="strip-intro"><span className="section-kicker">{siteText(content, 'join.kicker')}</span><h2>{siteText(content, 'join.title')}<br /><span>{siteText(content, 'join.accent')}</span></h2></div>
        <div className="connect-panel">
          <div className="connect-top"><div><span className="section-kicker">{siteText(content, 'join.season')}</span><h3 data-testid="text-season">{content.season || siteText(content, 'join.seasonEmpty')}</h3></div><span className="season-stamp"><Leaf size={17} /> {siteText(content, 'join.seasonStamp')}</span></div>
          <div className="address-block">
            <span className="address-label">{siteText(content, 'join.serverAddress')}</span>
            <div className="address-value">
              <code data-testid="text-server-ip">{content.serverIp || siteText(content, 'join.serverEmpty')}</code>
              <button onClick={copyAddress} disabled={!content.serverIp} className="copy-button" aria-label="Copy server address" data-testid="button-copy-server">
                {copied ? <Check size={16} /> : <Copy size={16} />}<span>{copied ? siteText(content, 'join.copied') : siteText(content, 'join.copy')}</span>
              </button>
            </div>
            <span className="connect-hint">{siteText(content, 'join.hint')}</span>
          </div>
          <div className="discord-row">
            <span className="section-kicker">{siteText(content, 'join.discord')}</span>
            {content.discordLinks.length > 0 ? content.discordLinks.map(link => (
              <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="discord-link" data-testid={`link-discord-${link.id}`}>{link.label}<ExternalLink size={13} /></a>
            )) : <span className="muted-note">{siteText(content, 'join.linksEmpty')}</span>}
          </div>
        </div>
      </section>
      }

      {page === 'home' && <section className="manifesto" id="people">
        <div className="manifesto-number">01 <span>—</span> 04</div>
        <div className="manifesto-body">
          <span className="section-kicker">{siteText(content, 'home.manifesto.kicker')}</span>
          <h2>{siteText(content, 'home.manifesto.title')}<br /><span>{siteText(content, 'home.manifesto.accent')}</span></h2>
        </div>
        <div className="manifesto-copy"><p>{siteText(content, 'home.manifesto.body1')}</p><p>{siteText(content, 'home.manifesto.body2')}</p><button className="inline-link" onClick={() => setLocation('/rules')} data-testid="button-read-charter">{siteText(content, 'home.manifesto.link')} <ArrowRight size={15} /></button></div>
        <div className="manifesto-seal"><Swords size={28} strokeWidth={1.2} /><span>{siteText(content, 'home.manifesto.seal')}</span></div>
      </section>
      }

      {(page === 'home' || page === 'staff') && <section className={`people-section content-section ${page === 'staff' ? 'reveal-in' : ''}`}>
        <div className="section-heading">
          <div><span className="section-kicker">{siteText(content, 'staff.kicker')}</span><h2>{siteText(content, 'staff.title')}<br /><em>{siteText(content, 'staff.accent')}</em></h2></div>
          <p>{siteText(content, 'staff.description')}</p>
        </div>
        {content.staff.length > 0 ? (
          <div className="staff-grid">
            {(page === 'home' && !showAllStaff ? content.staff.slice(0, 3) : content.staff).map((member, index) => <article className={`staff-card staff-tone-${index % 3}`} key={member.id} data-testid={`card-staff-${member.id}`}>
              <SkinPortrait member={member} />
              <div className="staff-info"><h3>{member.displayName || member.minecraftUsername}</h3><div className="staff-meta"><span>{member.minecraftUsername}</span>{member.inGameStaff && <span className="game-tag"><span /> {siteText(content, 'staff.gameTag')}</span>}</div>{member.discordUsername && <div className="staff-discord">{siteText(content, 'staff.discordLabel')} <span>{member.discordUsername}</span></div>}</div>
              <span className="staff-index">0{index + 1}</span>
            </article>)}
          </div>
        ) : <EmptyBlock icon={<Users />} title={siteText(content, 'staff.empty.title')} body={siteText(content, 'staff.empty.body')} />}
        {page === 'home' && content.staff.length > 3 && <button className="button button-dark staff-more" onClick={() => setShowAllStaff(value => !value)} aria-expanded={showAllStaff} data-testid="button-show-more-staff">{showAllStaff ? siteText(content, 'staff.showLess') : siteText(content, 'staff.showMore')} <ArrowRight size={15} /></button>}
      </section>
      }

      {page === 'rules' && <section className="charter-section reveal-in" id="charter">
        <div className="charter-heading"><div><span className="section-kicker">{siteText(content, 'rules.kicker')}</span><h2>{siteText(content, 'rules.title')} <em>{siteText(content, 'rules.accent')}</em></h2></div><span className="charter-mark"><ShieldCheck size={24} /> {siteText(content, 'rules.mark')}</span></div>
        <div className="charter-layout">
          <div className="charter-aside"><span>{siteText(content, 'rules.aside')}</span><div className="aside-rule" /><p>{siteText(content, 'rules.asideBody')}</p></div>
          {content.rules.length > 0 ? <div className="rules-list">{content.rules.map((rule, index) => <article className="rule-row" key={rule.id} data-testid={`text-rule-${rule.id}`}><span className="rule-number">0{index + 1}</span><div><h3>{rule.title}</h3><DiscordText text={rule.body} /></div><ChevronDown size={17} /></article>)}</div> : <EmptyBlock icon={<Shield />} title={siteText(content, 'rules.empty.title')} body={siteText(content, 'rules.empty.body')} />}
        </div>
        <div className="charter-bottom"><span>{siteText(content, 'rules.bottomLeft')}</span><span>{siteText(content, 'rules.bottomRight')}</span></div>
      </section>
      }

      {page === 'events' && <section className="gatherings content-section reveal-in" id="calendar">
        <div className="section-heading"><div><span className="section-kicker">{siteText(content, 'events.kicker')}</span><h2>{siteText(content, 'events.title')}<br /><em>{siteText(content, 'events.accent')}</em></h2></div><p>{siteText(content, 'events.description')}</p></div>
        {content.events.length > 0 ? <div className="event-list">{content.events.map((event, index) => <article className="event-row" key={event.id} data-testid={`card-event-${event.id}`}><span className="event-no">0{index + 1}</span><div className="event-main"><h3>{event.title}</h3><p>{event.description}</p></div><div className="event-time"><span className="section-kicker">{siteText(content, 'events.when')}</span><span>{event.time}</span></div>{event.reward && <div className="event-reward"><span className="section-kicker">{siteText(content, 'events.reward')}</span><span>{event.reward}</span></div>}<ArrowRight size={17} /></article>)}</div> : <EmptyBlock icon={<Compass />} title={siteText(content, 'events.empty.title')} body={siteText(content, 'events.empty.body')} />}
      </section>
      }

      {page === 'punishments' && <section className="consequences reveal-in">
        <div className="consequence-title"><span className="section-kicker">{siteText(content, 'punishments.kicker')}</span><h2>{siteText(content, 'punishments.title')} <em>{siteText(content, 'punishments.accent')}</em></h2><p>{siteText(content, 'punishments.description')}</p></div>
        {content.punishments.length > 0 ? <div className="punishment-list">{content.punishments.map((item, i) => <article key={item.id} className="punishment-item" data-testid={`text-punishment-${item.id}`}><span>0{i + 1}</span><div><h3>{item.title}</h3><DiscordText text={item.description} /></div></article>)}</div> : <div className="punishment-empty"><Shield size={22} /><p>{siteText(content, 'punishments.empty')}</p></div>}
      </section>
      }

      <footer className="site-footer">
        <Brand dark content={content} />
        <p>{siteText(content, 'footer.line1')}<br />{siteText(content, 'footer.line2')}</p>
        <div className="footer-links"><span>{siteText(content, 'footer.tagline')}</span><Link href="/admin" data-testid="link-admin-panel">{siteText(content, 'footer.staffAccess')} <ArrowRight size={13} /></Link><Link href="/owner" data-testid="link-owner-panel">{siteText(content, 'footer.ownerAccess')} <ArrowRight size={13} /></Link></div>
        <span className="copyright">{siteText(content, 'footer.copyright')}</span>
      </footer>
    </main>
  );
}

const fallbackAppealQuestions: FormQuestion[] = [
  { id: 'appeal-context', label: 'What happened from your perspective?', required: true },
  { id: 'appeal-change', label: 'What would you do differently if welcomed back?', required: true },
];
const fallbackApplicationQuestions: FormQuestion[] = [
  { id: 'application-intro', label: 'Tell us a little about yourself and your time in the community.', required: true },
  { id: 'application-care', label: 'How would you help keep Legends welcoming and fair?', required: true },
];

function PublicSubmissionPage({ kind }: { kind: 'appeal' | 'application' }) {
  const { data, isLoading, isError, refetch } = useGetLegendsContent();
  const content = useWebsitePreviewContent(data ?? emptyContent);
  const websiteStyle = useSiteStyle(content);
  const submitAppeal = useSubmitBanAppeal();
  const submitApplication = useSubmitStaffApplication();
  const appeal = kind === 'appeal';
  const questions = appeal ? (data?.banAppealQuestions ?? fallbackAppealQuestions) : (data?.staffApplicationQuestions ?? fallbackApplicationQuestions);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const disabled = appeal && data?.banAppealsEnabled === false;
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFailure('');
    const form = new FormData(event.currentTarget);
    const payload = {
      minecraftUsername: String(form.get('minecraftUsername') || '').trim(),
      discordUsername: String(form.get('discordUsername') || '').trim(),
      answers: questions.map(question => ({ questionId: question.id, answer: String(form.get(question.id) || '').trim() })),
    };
    setBusy(true);
    try {
      if (appeal) await submitAppeal.mutateAsync({ data: payload });
      else await submitApplication.mutateAsync({ data: payload });
      setSent(true);
      event.currentTarget.reset();
    } catch {
      setFailure('We couldn’t send this just now. Your answers are still here; please try again.');
    } finally { setBusy(false); }
  };
  if (isLoading) return <CommunitySkeleton />;
  return <main className="community form-page" style={websiteStyle}>
    <div className="topline"><span><span className="pulse-dot" /> {siteText(content, 'topline.primary')}</span><span className="topline-right">{siteText(content, 'topline.secondary')}</span></div>
     <CommunityHeader page={appeal ? 'appeal' : 'apply'} content={content} />
    {isError && <div className="fetch-notice" role="alert">The form details could not be reached. <button onClick={() => refetch()}>Try again</button></div>}
    <section className="submission-layout reveal-in">
      <div className="submission-aside">
        <span className="section-kicker">{siteText(content, appeal ? 'form.appeal.kicker' : 'form.apply.kicker')}</span>
        <h1>{siteText(content, appeal ? 'form.appeal.title' : 'form.apply.title')}<br /><em>{siteText(content, appeal ? 'form.appeal.accent' : 'form.apply.accent')}</em></h1>
        <p>{siteText(content, appeal ? 'form.appeal.description' : 'form.apply.description')}</p>
        <div className="submission-note"><span className="note-rule" /> {siteText(content, 'form.readByTeam')} <span>/</span> {siteText(content, appeal ? 'form.appeal.note' : 'form.apply.note')}</div>
        <Link href={appeal ? '/apply' : '/appeal'} className="form-switch">{siteText(content, appeal ? 'form.appeal.switch' : 'form.apply.switch')} <span>{siteText(content, appeal ? 'form.appeal.switchAction' : 'form.apply.switchAction')} <ArrowRight size={14} /></span></Link>
      </div>
      <div className="submission-card">
         <div className="submission-card-head"><div><span className="section-kicker">{appeal ? 'BAN APPEAL' : 'STAFF APPLICATION'} / PRIVATE SUBMISSION</span><h2>{siteText(content, appeal ? 'form.appeal.cardTitle' : 'form.apply.cardTitle')}</h2></div><span className="form-index">01<br />—<br />04</span></div>
         {disabled ? <div className="form-closed"><span className="closed-mark"><LockKeyhole size={20} /></span><h3>{siteText(content, 'form.appeal.closedTitle')}</h3><p>{siteText(content, 'form.appeal.closedBody')}</p><Link href="/" className="button button-dark">{siteText(content, 'form.appeal.back')} <ArrowRight size={15} /></Link></div> : sent ? <div className="form-success"><span className="success-mark"><Check size={23} /></span><span className="section-kicker">{siteText(content, 'form.success.kicker')}</span><h3>{siteText(content, 'form.success.title')}</h3><p>{siteText(content, 'form.success.body')}</p><button className="button button-dark" onClick={() => setSent(false)}>{siteText(content, 'form.success.again')} <ArrowRight size={15} /></button></div> : <form className="community-form" onSubmit={onSubmit}>
           <div className="form-identity"><label>{siteText(content, 'form.minecraft')}<input name="minecraftUsername" required autoComplete="username" maxLength={32} placeholder={siteText(content, 'form.minecraftPlaceholder')} /></label><label>{siteText(content, 'form.discord')}<input name="discordUsername" required maxLength={80} placeholder={siteText(content, 'form.discordPlaceholder')} /></label></div>
           {questions.map((question, index) => <label className="question-field" key={question.id}><span><b>{String(index + 1).padStart(2, '0')}</b>{question.label}{question.required && <i>{siteText(content, 'form.required')}</i>}</span><textarea name={question.id} rows={4} required={question.required} maxLength={4000} placeholder={siteText(content, 'form.answerPlaceholder')} /></label>)}
           {failure && <p className="form-error" role="alert">{siteText(content, 'form.failure')}</p>}
           <div className="submit-form-bottom"><span>{siteText(content, 'form.privacy')}</span><button type="submit" className="button button-dark" disabled={busy}>{busy ? siteText(content, 'form.sending') : siteText(content, 'form.submit')} <ArrowRight size={15} /></button></div>
        </form>}
      </div>
    </section>
      <footer className="site-footer"><Brand dark content={content} /><p>{siteText(content, 'footer.line1')}<br />{siteText(content, 'footer.line2')}</p><div className="footer-links"><span>{siteText(content, 'footer.tagline')}</span><Link href="/admin">{siteText(content, 'footer.staffAccess')} <ArrowRight size={13} /></Link><Link href="/owner">{siteText(content, 'footer.ownerAccess')} <ArrowRight size={13} /></Link></div><span className="copyright">{siteText(content, 'footer.copyright')}</span></footer>
  </main>;
}

function PluginPage() {
  const { data, isLoading, isError, refetch } = useGetLegendsContent();
  const content = useWebsitePreviewContent(data ?? emptyContent);
  const websiteStyle = useSiteStyle(content);
  if (isLoading) return <CommunitySkeleton />;
  return <main className="community form-page" style={websiteStyle}><div className="topline"><span><span className="pulse-dot" /> {siteText(content, 'topline.primary')}</span><span className="topline-right">{siteText(content, 'topline.secondary')}</span></div><CommunityHeader page="plugin" content={content} />
    {isError && <div className="fetch-notice" role="alert">Plugin details could not be reached. <button onClick={() => refetch()}>Try again</button></div>}
    <section className="plugin-page reveal-in"><div className="plugin-intro"><span className="section-kicker">{siteText(content, 'plugin.kicker')}</span><h1>{siteText(content, 'plugin.title')}<br /><em>{siteText(content, 'plugin.accent')}</em></h1><p>{siteText(content, 'plugin.description')}</p><Link href="/join" className="button button-dark">{siteText(content, 'home.hero.primary')} <ArrowRight size={15} /></Link></div><article className="plugin-content"><div className="plugin-content-head"><span className="section-kicker">{siteText(content, 'plugin.contentTitle')}</span><span>{siteText(content, 'plugin.contentTag')}</span></div>{data?.pluginInfo?.trim() ? <DiscordText text={data.pluginInfo} /> : <div className="plugin-empty"><Compass size={24} /><h2>{siteText(content, 'plugin.empty.title')}</h2><p>{siteText(content, 'plugin.empty.body')}</p></div>}<div className="plugin-signoff">{siteText(content, 'plugin.signoff')} <span>·</span> {siteText(content, 'plugin.signoffTail')}</div></article></section>
    <footer className="site-footer"><Brand dark content={content} /><p>{siteText(content, 'footer.line1')}<br />{siteText(content, 'footer.line2')}</p><div className="footer-links"><span>{siteText(content, 'footer.tagline')}</span><Link href="/appeal">{siteText(content, 'footer.banAppeals')} <ArrowRight size={13} /></Link><Link href="/apply">{siteText(content, 'footer.staffApplications')} <ArrowRight size={13} /></Link></div><span className="copyright">{siteText(content, 'footer.copyright')}</span></footer></main>;
}

function EmptyBlock({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return <div className="empty-block"><span className="empty-icon">{icon}</span><div><h3>{title}</h3><p>{body}</p></div></div>;
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('legends-theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('legends-theme', dark ? 'dark' : 'light'); } catch { /* storage may be unavailable */ }
    window.dispatchEvent(new Event('legends-theme-change'));
  }, [dark]);
  return <button className="theme-toggle" type="button" onClick={() => setDark(value => !value)} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} aria-pressed={dark} data-testid="button-theme-toggle">{dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}<span className="theme-label">{dark ? 'Light' : 'Dark'}</span></button>;
}

function CommunitySkeleton() {
  return <main className="community loading-page"><div className="skeleton-nav shimmer" /><div className="skeleton-hero shimmer" /><div className="skeleton-strip shimmer" /><p>Preparing your place in the world…</p></main>;
}

const collectionMeta: Record<CollectionKey, { label: string; plural: string; fields: { key: string; label: string; multiline?: boolean; boolean?: boolean }[] }> = {
  discordLinks: { label: 'Community link', plural: 'Community links', fields: [{ key: 'label', label: 'Label' }, { key: 'url', label: 'Destination URL' }] },
  staff: { label: 'Staff member', plural: 'Staff roster', fields: [{ key: 'minecraftUsername', label: 'Minecraft username' }, { key: 'displayName', label: 'Display name' }, { key: 'rank', label: 'Rank' }, { key: 'discordUsername', label: 'Discord username' }, { key: 'skinUrl', label: 'Staff image' }, { key: 'inGameStaff', label: 'In-game staff', boolean: true }] },
  rules: { label: 'Rule', plural: 'Community rules', fields: [{ key: 'title', label: 'Rule title' }, { key: 'body', label: 'Rule text (Discord Markdown)', multiline: true }] },
  punishments: { label: 'Punishment set', plural: 'Punishments', fields: [{ key: 'title', label: 'Season / punishment title' }, { key: 'description', label: 'Punishments and details', multiline: true }] },
  events: { label: 'Gathering', plural: 'Community events', fields: [{ key: 'title', label: 'Event name' }, { key: 'time', label: 'When' }, { key: 'description', label: 'What to expect', multiline: true }, { key: 'reward', label: 'Reward / bring back' }] },
};
const newId = () => `legends-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const blankItem = (key: CollectionKey): CollectionItem => {
  const id = newId();
  if (key === 'discordLinks') return { id, label: '', url: '' };
  if (key === 'staff') return { id, minecraftUsername: '', skinUrl: null, discordUsername: '', displayName: '', rank: '', inGameStaff: false };
  if (key === 'rules') return { id, title: '', body: '' };
  if (key === 'punishments') return { id, title: '', description: '' };
  return { id, title: '', time: '', description: '', reward: '' };
};

function ManagementPanel({ panel }: { panel: 'admin' | 'owner' }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: session, isLoading: sessionLoading, isError: sessionError, refetch: retrySession } = useGetLegendsSession();
  const { data: contentData, isLoading: contentLoading, isError: contentError, refetch: retryContent } = useGetLegendsContent();
  const login = useLoginLegendsPanel();
  const logout = useLogoutLegendsPanel();
  const updateContent = useUpdateLegendsContent();
  const updateCodes = useUpdateLegendsCodes();
  const authorized = !!session?.authenticated && (panel === 'admin' ? session.role === 'admin' || session.role === 'owner' : session.role === 'owner');
  const [loginCode, setLoginCode] = useState('');
  const [loginVisible, setLoginVisible] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [content, setContent] = useState<SiteContentInput>(emptyContent);
  const [selected, setSelected] = useState<CollectionKey>('discordLinks');
  const [saveMessage, setSaveMessage] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [ownerCode, setOwnerCode] = useState('');
  const [showCodes, setShowCodes] = useState(false);
  const [websitePage, setWebsitePage] = useState<WebsitePageKey>('home');
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (contentData) setContent(contentData);
  }, [contentData]);
  const list = content[selected] as CollectionItem[];
  const dirty = useMemo(() => JSON.stringify(content) !== JSON.stringify(contentData ?? emptyContent), [content, contentData]);
  const websiteColorsValid = Object.values(content.website.colors).every(color => /^#[0-9a-fA-F]{6}$/.test(color));
  const previewRoute = websitePage === 'global' ? 'home' : websitePage;
  const postWebsitePreview = () => {
    previewFrameRef.current?.contentWindow?.postMessage(
      { type: 'legends-website-preview', content },
      window.location.origin,
    );
  };
  useEffect(() => {
    postWebsitePreview();
  }, [content, websitePage]);
  useEffect(() => {
    const handlePreviewReady = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== previewFrameRef.current?.contentWindow) return;
      if (event.data?.type === 'legends-preview-ready') postWebsitePreview();
    };
    window.addEventListener('message', handlePreviewReady);
    return () => window.removeEventListener('message', handlePreviewReady);
  }, [content]);
  const setWebsiteCopy = (key: string, value: string) => setContent(prev => ({
    ...prev,
    website: { ...prev.website, copy: { ...prev.website.copy, [key]: value } },
  }));
  const setWebsiteColor = (key: WebsiteColorKey, value: string) => setContent(prev => ({
    ...prev,
    website: { ...prev.website, colors: { ...prev.website.colors, [key]: value } },
  }));

  const performLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError('');
    try {
      await login.mutateAsync({ data: { panel, code: loginCode } });
      await queryClient.invalidateQueries({ queryKey: getGetLegendsSessionQueryKey() });
      setLoginCode('');
    } catch {
      setLoginError('That code did not open this panel. Check it and try again.');
    }
  };
  const doLogout = async () => {
    await logout.mutateAsync();
    await queryClient.invalidateQueries({ queryKey: getGetLegendsSessionQueryKey() });
    setLocation('/');
  };
  const saveContent = async () => {
    setSaveMessage('');
    if (!websiteColorsValid) {
      setSaveMessage('Use a valid 6-digit hex color for every site color before saving.');
      return;
    }
    try {
      await updateContent.mutateAsync({ data: content });
      await queryClient.invalidateQueries({ queryKey: getGetLegendsContentQueryKey() });
      setSaveMessage('Changes saved to the community site.');
    } catch {
      setSaveMessage('Could not save right now. Your edits are still here; try again.');
    }
  };
  const saveCodes = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const data: { adminCode?: string; ownerCode?: string } = {};
      if (adminCode) data.adminCode = adminCode;
      if (ownerCode) data.ownerCode = ownerCode;
      await updateCodes.mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getGetLegendsSessionQueryKey() });
      setAdminCode('');
      setOwnerCode('');
      setSaveMessage('Credentials updated. Store them somewhere safe.');
    } catch {
      setSaveMessage('Credentials were not updated. Codes must be at least 8 characters.');
    }
  };
  const patchItem = (id: string, field: string, value: string | boolean) => {
    setContent(prev => ({
      ...prev,
      [selected]: (prev[selected] as CollectionItem[]).map(item => item.id === id ? { ...item, [field]: value } : item),
    }));
  };
  const removeItem = (id: string) => setContent(prev => ({ ...prev, [selected]: (prev[selected] as CollectionItem[]).filter(item => item.id !== id) }));
  const addItem = () => setContent(prev => ({ ...prev, [selected]: [...prev[selected], blankItem(selected)] } as SiteContentInput));

  if (sessionLoading) return <PanelLoading />;
  if (sessionError) return <PanelError onRetry={() => retrySession()} />;
  return (
    <main className="panel-shell">
      <aside className="panel-rail"><Brand dark /><div className="rail-label">LEGENDS / MANAGEMENT</div><div className="rail-decoration"><Compass size={30} strokeWidth={1.1} /><span>THE<br />KEEPER’S<br />POST</span></div><div className="rail-footer"><span className="pulse-dot" /> PRIVATE AREA</div></aside>
      <div className="panel-main">
        <header className="panel-topbar"><Link href="/" className="back-home" data-testid="link-back-home"><ArrowRight className="back-arrow" size={14} /> Community site</Link><div className="panel-top-right">{authorized && <div className="manage-fold-controls" aria-label="Panel section controls"><button type="button" onClick={() => setManagementSectionsOpen(false)} aria-label="Minimize all panel sections" title="Minimize all"><Minimize2 size={13} /><span>Minimize all</span></button><button type="button" onClick={() => setManagementSectionsOpen(true)} aria-label="Expand all panel sections" title="Expand all"><Maximize2 size={13} /><span>Expand all</span></button></div>}<ThemeToggle /><span className="secure-label"><LockKeyhole size={13} /> PROTECTED PANEL</span>{authorized && <button className="logout-button" onClick={doLogout} disabled={logout.isPending} data-testid="button-logout"><LogOut size={14} /> Sign out</button>}</div></header>
        {!authorized ? <section className="login-wrap">
          <div className="login-index"><span>LEGENDS SMP</span><span>01 / ACCESS</span></div>
          <div className="login-card">
            <span className="section-kicker">{panel === 'owner' ? 'OWNER ACCESS' : 'STAFF ACCESS'}</span>
            <div className="login-emblem"><KeyRound size={25} /></div>
            <h1>{panel === 'owner' ? 'Owner’s post.' : 'Staff’s post.'}</h1>
            <p>{panel === 'owner' ? 'Manage credentials and keep the world’s controls in safe hands.' : 'Update the details players use to find and enjoy the world.'}</p>
            {panel === 'admin' && <div className="role-note"><ShieldCheck size={16} /><span>Owner credentials also unlock staff management.</span></div>}
            <form onSubmit={performLogin} className="login-form">
              <label className="sr-only" htmlFor="panel-username">PANEL USERNAME</label>
              <input id="panel-username" name="username" autoComplete="username" value={panel} readOnly className="sr-only" tabIndex={-1} />
              <label htmlFor="panel-code">ACCESS CODE</label>
              <div className="input-with-action"><input id="panel-code" data-testid="input-access-code" type={loginVisible ? 'text' : 'password'} value={loginCode} onChange={e => setLoginCode(e.target.value)} autoComplete="current-password" required placeholder="Enter your access code" /><button type="button" onClick={() => setLoginVisible(!loginVisible)} aria-label={loginVisible ? 'Hide access code' : 'Show access code'} data-testid="button-toggle-code">{loginVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
              {loginError && <p className="form-error" role="alert">{loginError}</p>}
              <button type="submit" className="button button-dark login-submit" disabled={login.isPending} data-testid="button-login">{login.isPending ? 'Checking access…' : 'Unlock panel'} <ArrowRight size={16} /></button>
            </form>
            <div className="login-bottom"><span>YOUR CODE STAYS PRIVATE</span><span>ENCRYPTED SESSION <LockKeyhole size={12} /></span></div>
          </div>
          <div className="switch-panel">{panel === 'admin' ? <>Need the owner controls? <Link href="/owner" data-testid="link-switch-owner">Owner access <ArrowRight size={13} /></Link></> : <>Looking for staff content management? <Link href="/admin" data-testid="link-switch-admin">Staff access <ArrowRight size={13} /></Link></>}</div>
        </section> : (
          <section className="dashboard">
            <div className="dashboard-heading"><div><span className="section-kicker">LEGENDS SMP / {panel.toUpperCase()} CONTROL</span><h1>Good to have<br /><em>you back.</em></h1><p>Keep the community’s public details clear, current, and true to the world.</p></div><div className="access-seal"><ShieldCheck size={21} /><span>{session.role?.toUpperCase()}<small>SESSION ACTIVE</small></span></div></div>
            {panel === 'owner' && <details className="owner-tools management-fold" open>
              <summary className="tool-heading fold-summary"><span className="tool-icon"><KeyRound size={18} /></span><div><span className="section-kicker">OWNER ONLY</span><h2>Access credentials</h2><p>Replace a code any time. Leave a field blank to keep its current code.</p></div><ChevronDown className="fold-chevron" size={17} /></summary>
              <form className="codes-form" onSubmit={saveCodes}>
                <label>NEW STAFF ACCESS CODE<input data-testid="input-new-admin-code" type={showCodes ? 'text' : 'password'} minLength={8} value={adminCode} onChange={e => setAdminCode(e.target.value)} placeholder="At least 8 characters" /></label>
                <label>NEW OWNER PASSWORD<input data-testid="input-new-owner-code" type={showCodes ? 'text' : 'password'} minLength={8} value={ownerCode} onChange={e => setOwnerCode(e.target.value)} placeholder="At least 8 characters" /></label>
                <div className="code-actions"><button type="button" className="reveal-button" onClick={() => setShowCodes(!showCodes)} data-testid="button-reveal-codes">{showCodes ? <EyeOff size={14} /> : <Eye size={14} />}{showCodes ? 'Hide' : 'Show'} codes</button><button type="submit" className="button button-dark" disabled={updateCodes.isPending || (!adminCode && !ownerCode)} data-testid="button-save-codes">{updateCodes.isPending ? 'Updating…' : 'Update credentials'} <ArrowRight size={15} /></button></div>
              </form>
            </details>}
            {panel === 'owner' && <section className="website-edit-section" aria-labelledby="website-edit-title">
              <div className="website-edit-heading">
                <span className="website-edit-icon"><Palette size={19} /></span>
                <div>
                  <span className="section-kicker">OWNER ONLY / LIVE PREVIEW</span>
                  <h2 id="website-edit-title">Website edit</h2>
                  <p>Change public page text and site colors, then preview your draft before publishing it.</p>
                </div>
                <button className="button button-dark website-save-button" onClick={saveContent} disabled={!dirty || updateContent.isPending || contentLoading || !websiteColorsValid}>
                  <Save size={14} />{updateContent.isPending ? 'Saving…' : 'Save website changes'}
                </button>
              </div>
              {contentLoading || contentError ? (
                <div className="website-editor-message">{contentError ? 'Load the public site content before editing.' : 'Loading website settings…'}</div>
              ) : (
                <div className="website-edit-grid">
                  <div className="website-controls">
                    <div className="website-editor-block">
                      <div className="website-block-title"><Palette size={14} /><span>Site colors</span><small>Applies across public pages</small></div>
                      <div className="website-color-grid">
                        {colorEditorFields.map(field => (
                          <label className="website-color-field" key={field.key}>
                            <span>{field.label}</span>
                            <div>
                              <input aria-label={`${field.label} color picker`} type="color" value={/^#[0-9a-fA-F]{6}$/.test(content.website.colors[field.key]) ? content.website.colors[field.key] : defaultWebsite.colors[field.key]} onChange={event => setWebsiteColor(field.key, event.target.value)} />
                              <input aria-label={`${field.label} hex value`} value={content.website.colors[field.key]} onChange={event => setWebsiteColor(field.key, event.target.value)} maxLength={7} />
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="website-editor-block">
                      <div className="website-block-title"><span>Page content</span><small>Changes appear in the preview as you type</small></div>
                      <div className="website-page-tabs" role="tablist" aria-label="Choose a page to edit">
                        {websiteEditorPages.map(page => <button key={page.key} type="button" role="tab" aria-selected={websitePage === page.key} className={websitePage === page.key ? 'website-page-tab selected' : 'website-page-tab'} onClick={() => setWebsitePage(page.key)}>{page.label}</button>)}
                      </div>
                      <div className="website-copy-fields">
                        {websiteEditorPages.find(page => page.key === websitePage)?.fields.map(field => (
                          <label key={field.key}>{field.label}
                            {field.multiline
                              ? <textarea rows={3} value={content.website.copy[field.key] ?? defaultWebsite.copy[field.key] ?? ''} onChange={event => setWebsiteCopy(field.key, event.target.value)} />
                              : <input value={content.website.copy[field.key] ?? defaultWebsite.copy[field.key] ?? ''} onChange={event => setWebsiteCopy(field.key, event.target.value)} />}
                          </label>
                        ))}
                      </div>
                    </div>
                    {!websiteColorsValid && <p className="website-color-error" role="alert">Enter valid colors in #RRGGBB format before saving.</p>}
                    <p className="website-editor-note"><LockKeyhole size={13} /> Draft changes are only visible here until you save. Custom HTML or JavaScript is not accepted; use the text and color controls so page content stays safe.</p>
                  </div>
                  <div className="website-preview-wrap">
                    <div className="website-preview-heading"><div><Monitor size={14} /><strong>Website demo</strong><span>Unsaved preview</span></div><span><Smartphone size={13} /> Responsive page</span></div>
                    <iframe
                      ref={previewFrameRef}
                      className="website-preview-frame"
                      src={`${window.location.origin}${previewRoute === 'home' ? '/' : `/${previewRoute}`}?website-preview=1`}
                      title={`Unsaved ${previewRoute} page preview`}
                      onLoad={postWebsitePreview}
                    />
                  </div>
                </div>
              )}
            </section>}
            <section className="editor-section">
               <div className="editor-top"><div><span className="section-kicker">PUBLIC SITE CONTENT</span><h2>Shape the world’s noticeboard.</h2><p>These changes are visible to every player who visits the community site.</p></div><button className="button button-dark save-button" onClick={saveContent} disabled={!dirty || updateContent.isPending || contentLoading || !websiteColorsValid} data-testid="button-save-content"><Save size={15} />{updateContent.isPending ? 'Saving…' : 'Save changes'}</button></div>
              {contentError ? <div className="editor-error" role="alert"><span>Could not load public content.</span><button onClick={() => retryContent()} data-testid="button-retry-editor">Retry loading</button></div> : contentLoading ? <div className="editor-skeleton"><i /><i /><i /></div> : (
                <>
                  <details className="panel-basics management-fold" open>
                    <summary className="fold-heading"><span><span className="section-kicker">SITE BASICS</span><strong>Server details</strong></span><ChevronDown className="fold-chevron" size={17} /></summary>
                    <div className="core-fields"><label>SERVER ADDRESS<input data-testid="input-server-ip" value={content.serverIp} onChange={e => setContent(prev => ({ ...prev, serverIp: e.target.value }))} placeholder="Your Minecraft server address" /></label><label>CURRENT SEASON<input data-testid="input-season" value={content.season} onChange={e => setContent(prev => ({ ...prev, season: e.target.value }))} placeholder="The name of the current season" /></label></div>
                  </details>
                  {panel === 'admin' && <details className="form-settings admin-form-settings management-fold" open>
                    <summary className="settings-title fold-summary"><div><span className="section-kicker">ADMIN / COMMUNITY CARE</span><h3>Ban appeals</h3><p>Choose whether players can submit an appeal, and keep the questions clear.</p></div><label className="appeals-switch" onClick={event => event.stopPropagation()}><input type="checkbox" checked={content.banAppealsEnabled} onChange={e => setContent(prev => ({ ...prev, banAppealsEnabled: e.target.checked }))} /><span>{content.banAppealsEnabled ? 'Accepting appeals' : 'Appeals paused'}</span></label><ChevronDown className="fold-chevron" size={17} /></summary>
                    <QuestionEditor title="Appeal questions" questions={content.banAppealQuestions} onChange={questions => setContent(prev => ({ ...prev, banAppealQuestions: questions }))} />
                  </details>}
                  {panel === 'owner' && <details className="form-settings owner-form-settings management-fold" open>
                    <summary className="settings-title fold-summary"><div><span className="section-kicker">OWNER / COMMUNITY INTAKE</span><h3>Staff applications</h3><p>Shape the questions players see when they apply to help the realm.</p></div><ChevronDown className="fold-chevron" size={17} /></summary>
                    <QuestionEditor title="Application questions" questions={content.staffApplicationQuestions} onChange={questions => setContent(prev => ({ ...prev, staffApplicationQuestions: questions }))} />
                  </details>}
                  {panel === 'owner' && <details className="form-settings plugin-info-settings management-fold" aria-labelledby="plugin-info-heading" open>
                    <summary className="settings-title fold-summary"><div><span className="section-kicker">OWNER / PUBLIC PAGE</span><h3 id="plugin-info-heading">Plugin information</h3><p>This text appears on the public Plugin info page. Saving applies all pending public-content edits.</p></div><ChevronDown className="fold-chevron" size={17} /></summary>
                    <label className="plugin-editor-label" htmlFor="plugin-info-content">PLUGIN & SERVER INFORMATION <small>Discord formatting: **bold**, *italic*, # headings, &gt; quotes, - lists, `code`</small></label>
                    <textarea id="plugin-info-content" data-testid="input-plugin-info" className="plugin-editor" rows={10} value={content.pluginInfo} onChange={e => setContent(prev => ({ ...prev, pluginInfo: e.target.value }))} placeholder={'**A few notes before you join**\n- Java Edition\n> Be kind to the world and each other'} />
                    <div className="plugin-editor-actions"><span>Published on the Plugin info page after saving.</span><button type="button" className="button button-dark" onClick={saveContent} disabled={!dirty || updateContent.isPending || contentLoading} data-testid="button-save-plugin-info"><Save size={14} />{updateContent.isPending ? 'Saving…' : 'Save changes'}</button></div>
                  </details>}
                  {panel === 'admin' && <AppealReviews />}
                  {panel === 'owner' && <ApplicationReviews />}
                  <div className="editor-tabs" role="tablist">{(Object.keys(collectionMeta) as CollectionKey[]).map(key => <button key={key} role="tab" aria-selected={selected === key} className={selected === key ? 'editor-tab active-tab' : 'editor-tab'} onClick={() => setSelected(key)} data-testid={`tab-${key}`}><span>{collectionMeta[key].plural}</span><b>{content[key].length}</b></button>)}</div>
                  <div className="collection-head"><div><span className="section-kicker">{collectionMeta[selected].plural.toUpperCase()}</span><span className="collection-count">{list.length} {list.length === 1 ? 'entry' : 'entries'}</span></div><button className="add-entry" onClick={addItem} data-testid={`button-add-${selected}`}><Plus size={15} /> Add {collectionMeta[selected].label.toLowerCase()}</button></div>
                  {list.length === 0 ? <div className="editor-empty"><span className="empty-icon"><Plus size={19} /></span><div><h3>Nothing here yet.</h3><p>Add the first {collectionMeta[selected].label.toLowerCase()} to publish it on the community site.</p></div></div> : <div className="entry-list">{list.map((item, index) => <article className="entry-card" key={item.id} data-testid={`editor-entry-${selected}-${item.id}`}><div className="entry-card-head"><span><b>{String(index + 1).padStart(2, '0')}</b> {collectionMeta[selected].label}</span><button onClick={() => removeItem(item.id)} aria-label={`Remove ${collectionMeta[selected].label.toLowerCase()}`} data-testid={`button-remove-${selected}-${item.id}`}><Trash2 size={15} /></button></div><details className="entry-fold management-fold" open><summary className="entry-fold-summary">Edit details <ChevronDown className="fold-chevron" size={15} /></summary><div className="entry-fields">{collectionMeta[selected].fields.map(field => field.key === 'skinUrl' && selected === 'staff' ? <StaffImageField key={field.key} member={item as Staff} onSkinUrlChange={url => setContent(prev => ({ ...prev, staff: prev.staff.map(member => member.id === item.id ? { ...member, skinUrl: url || null } : member) }))} /> : field.boolean ? <label className="check-field" key={field.key}><input type="checkbox" checked={Boolean((item as unknown as Record<string, unknown>)[field.key])} onChange={e => patchItem(item.id, field.key, e.target.checked)} data-testid={`input-${selected}-${field.key}-${item.id}`} /><span>{field.label}</span></label> : <label key={field.key}>{field.label}{field.multiline ? <textarea value={String((item as unknown as Record<string, unknown>)[field.key] ?? '')} onChange={e => patchItem(item.id, field.key, e.target.value)} data-testid={`input-${selected}-${field.key}-${item.id}`} rows={3} /> : <input value={String((item as unknown as Record<string, unknown>)[field.key] ?? '')} onChange={e => patchItem(item.id, field.key, e.target.value)} data-testid={`input-${selected}-${field.key}-${item.id}`} />}</label>)}</div></details></article>)}</div>}
                </>
              )}
              {saveMessage && <p className={saveMessage.startsWith('Could') ? 'save-feedback save-error' : 'save-feedback'} role="status" data-testid="status-save-message"><Check size={14} />{saveMessage}</p>}
              <div className="editor-bottom"><span><span className="pulse-dot" /> {dirty ? 'UNSAVED CHANGES' : 'ALL CHANGES SAVED'}</span><span>PUBLIC CONTENT IS LIVE AFTER SAVE</span></div>
            </section>
          </section>
        )}
      </div>
    </main>
  );
}

function QuestionEditor({ title, questions, onChange }: { title: string; questions: FormQuestion[]; onChange: (questions: FormQuestion[]) => void }) {
  const [label, setLabel] = useState('');
  const add = () => {
    if (!label.trim()) return;
    onChange([...questions, { id: `question-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: label.trim(), required: true }]);
    setLabel('');
  };
  return <details className="question-editor management-fold" open><summary className="question-editor-label fold-summary"><span>{title}</span><span>{questions.length} {questions.length === 1 ? 'question' : 'questions'}<ChevronDown className="fold-chevron" size={15} /></span></summary><div className="question-editor-body">{questions.length ? questions.map((question, index) => <div className="managed-question" key={question.id}><span className="managed-question-number">{String(index + 1).padStart(2, '0')}</span><input aria-label={`Question ${index + 1}`} value={question.label} onChange={e => onChange(questions.map(item => item.id === question.id ? { ...item, label: e.target.value } : item))} placeholder="Write a clear, welcoming question" /><label className="required-control"><input type="checkbox" checked={question.required} onChange={e => onChange(questions.map(item => item.id === question.id ? { ...item, required: e.target.checked } : item))} />Required</label><button type="button" className="remove-question" aria-label={`Remove question ${index + 1}`} onClick={() => onChange(questions.filter(item => item.id !== question.id))}><X size={15} /></button></div>) : <p className="no-questions">No custom questions yet. Public forms will use the community starter questions until you add your own.</p>}<div className="add-question-row"><input value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Add a question for players" /><button type="button" className="button button-dark" onClick={add} disabled={!label.trim()}><Plus size={14} /> Add question</button></div></div></details>;
}

function StaffImageField({ member, onSkinUrlChange }: { member: Staff; onSkinUrlChange: (url: string) => void }) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewReload, setPreviewReload] = useState(0);
  const preview = member.skinUrl?.trim() || minecraftSkinUrl(member.minecraftUsername);
  useEffect(() => {
    setPreviewFailed(false);
    setPreviewReload(0);
  }, [preview]);
  const useMinecraftSkin = () => {
    const url = minecraftSkinUrl(member.minecraftUsername);
    if (!url) return;
    onSkinUrlChange(url);
    setPreviewFailed(false);
    setPreviewReload(value => value + 1);
  };
  return (
    <div className="staff-image-editor">
      <span className="staff-image-heading">STAFF IMAGE</span>
      <div className="staff-image-control">
        <div className="staff-image-preview">
          {preview && !previewFailed
            ? <img key={`${preview}-${previewReload}`} src={reloadedImageUrl(preview, previewReload)} alt={`${member.displayName || member.minecraftUsername || 'Staff'} image preview`} onError={() => setPreviewFailed(true)} />
            : <span>{(member.minecraftUsername || 'L').slice(0, 1).toUpperCase()}</span>}
        </div>
        <div className="staff-image-fields">
          <div className="staff-image-actions">
            <button className="staff-image-action" type="button" disabled={!minecraftSkinUrl(member.minecraftUsername)} onClick={useMinecraftSkin}><Users size={13} />Use Minecraft skin</button>
            {preview && <button className="staff-image-action" type="button" onClick={() => { setPreviewFailed(false); setPreviewReload(value => value + 1); }}><RotateCw size={13} />Reload preview</button>}
          </div>
          <label className="skin-url-field">IMAGE URL<input type="url" value={member.skinUrl ?? ''} onChange={event => onSkinUrlChange(event.target.value)} placeholder="https://example.com/image.png" /></label>
          <p>Paste a public image URL or leave it blank to use the Minecraft skin. Image uploads are not enabled.</p>
          {previewFailed && <span className="image-preview-error" role="status">Preview did not load. Check the URL or reload the preview.</span>}
        </div>
      </div>
    </div>
  );
}

function AppealReviews() {
  const queryClient = useQueryClient();
  const query = useGetBanAppeals();
  const { data: content } = useGetLegendsContent();
  const update = useUpdateBanAppealStatus();
  const setStatus = async (submissionId: string, status: 'pending' | 'accepted' | 'declined') => {
    await update.mutateAsync({ submissionId, data: { status } });
    await queryClient.invalidateQueries({ queryKey: getGetBanAppealsQueryKey() });
  };
  return <ReviewSection title="Ban appeal inbox" kicker="ADMIN / PLAYER REVIEW" description="Read each account’s answers and record the next step." items={query.data} questions={content?.banAppealQuestions} loading={query.isLoading} error={query.isError} retry={() => query.refetch()} onStatus={setStatus} pendingId={update.variables?.submissionId} />;
}

function ApplicationReviews() {
  const queryClient = useQueryClient();
  const query = useGetStaffApplications();
  const { data: content } = useGetLegendsContent();
  const update = useUpdateStaffApplicationStatus();
  const setStatus = async (submissionId: string, status: 'pending' | 'accepted' | 'declined') => {
    await update.mutateAsync({ submissionId, data: { status } });
    await queryClient.invalidateQueries({ queryKey: getGetStaffApplicationsQueryKey() });
  };
  return <ReviewSection title="Staff applications" kicker="OWNER / PEOPLE REVIEW" description="Thoughtful stewardship begins with listening. Review applications here." items={query.data} questions={content?.staffApplicationQuestions} loading={query.isLoading} error={query.isError} retry={() => query.refetch()} onStatus={setStatus} pendingId={update.variables?.submissionId} />;
}

function ReviewSection({ title, kicker, description, items, questions = [], loading, error, retry, onStatus, pendingId }: { title: string; kicker: string; description: string; items?: CommunityFormSubmission[]; questions?: FormQuestion[]; loading: boolean; error: boolean; retry: () => void; onStatus: (id: string, status: 'pending' | 'accepted' | 'declined') => void; pendingId?: string }) {
  return <details className="review-section management-fold" open>
    <summary className="review-head fold-summary"><div><span className="section-kicker">{kicker}</span><h3>{title}</h3><p>{description}</p></div><span className="review-count">{items?.length ?? 0}<small>SUBMISSIONS</small></span><ChevronDown className="fold-chevron" size={17} /></summary>
    <div className="review-content">{error ? <div className="review-state error"><p>Submissions could not be loaded.</p><button type="button" onClick={retry}>Try again</button></div> : loading ? <div className="review-loading"><i /><i /><i /></div> : !items?.length ? <div className="review-state"><Compass size={20} /><p>No submissions to review yet. New responses will appear here.</p></div> : <div className="submission-list">{items.map((item, index) => <details className="review-card management-fold" key={item.id} open><summary className="review-card-top fold-summary"><div><span className="review-number">{String(index + 1).padStart(2, '0')}</span><h4>{item.minecraftUsername}</h4><span className="review-discord">{item.discordUsername}</span></div><span className="review-card-status"><span className={`status-pill status-${item.status}`}>{item.status}</span><ChevronDown className="fold-chevron" size={14} /></span></summary><div className="review-card-body"><time>{new Date(item.createdAt).toLocaleString()}</time><div className="review-answers">{(item.answers ?? []).map((answer, i) => <div key={`${answer.questionId}-${i}`}><h5>{questions.find(question => question.id === answer.questionId)?.label || `Response ${i + 1}`}</h5><p>{answer.answer}</p></div>)}</div><div className="review-actions"><span>REVIEW STATUS</span><div>{(['pending', 'accepted', 'declined'] as const).map(status => <button key={status} type="button" className={item.status === status ? `status-choice selected ${status}` : 'status-choice'} disabled={pendingId === item.id} onClick={() => onStatus(item.id, status)}>{status[0].toUpperCase() + status.slice(1)}</button>)}</div></div></div></details>)}</div>}</div>
  </details>;
}

function PanelLoading() {
  return <main className="panel-shell"><aside className="panel-rail"><Brand dark /></aside><div className="panel-main"><div className="panel-loading"><div className="loading-mark"><Compass size={26} /></div><span>Checking the gate…</span><div className="loading-bar"><i /></div></div></div></main>;
}
function PanelError({ onRetry }: { onRetry: () => void }) {
  return <main className="panel-shell"><aside className="panel-rail"><Brand dark /></aside><div className="panel-main"><div className="panel-loading error-loading"><Shield size={27} /><h2>We can’t reach the gate.</h2><p>Session status is unavailable. Your access remains protected.</p><button className="button button-dark" onClick={onRetry} data-testid="button-retry-session">Retry connection <ArrowRight size={15} /></button></div></div></main>;
}

function App() {
  return <QueryClientProvider client={client}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
