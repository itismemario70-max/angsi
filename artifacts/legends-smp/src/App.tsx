import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight, ArrowRight, Check, ChevronDown, Compass, Copy, ExternalLink,
  Eye, EyeOff, KeyRound, Leaf, LockKeyhole, LogOut, Menu, Plus, Save, Shield,
  ShieldCheck, Swords, Trash2, Users, X,
} from 'lucide-react';
import {
  getGetLegendsContentQueryKey, getGetLegendsSessionQueryKey, useGetLegendsContent,
  useGetLegendsSession, useLoginLegendsPanel, useLogoutLegendsPanel,
  useUpdateLegendsCodes, useUpdateLegendsContent,
} from '@workspace/api-client-react';
import type { SiteContentInput } from '@workspace/api-client-react';
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

const emptyContent: SiteContentInput = {
  serverIp: '', season: '', discordLinks: [], staff: [], rules: [], punishments: [], events: [],
};

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={CommunityHome} />
        <Route path="/admin">{() => <ManagementPanel panel="admin" />}</Route>
        <Route path="/owner">{() => <ManagementPanel panel="owner" />}</Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className={`brand ${dark ? 'brand-dark' : ''}`} data-testid="link-home-brand">
      <span className="brand-mark"><Compass size={21} strokeWidth={2.2} /></span>
      <span className="brand-word">LEGENDS<span>SMP</span></span>
    </Link>
  );
}

function SkinPortrait({ member }: { member: Staff }) {
  const [failed, setFailed] = useState(false);
  const username = member.minecraftUsername.trim();
  const source =
    member.skinUrl?.trim() ||
    (username
      ? `https://mc-heads.net/body/${encodeURIComponent(username)}/100`
      : "");
  useEffect(() => setFailed(false), [source]);

  return (
    <div className="staff-art">
      {(!source || failed) && (
        <div className="skin-fallback">
          {username.slice(0, 1).toUpperCase() || "L"}
        </div>
      )}
      {source && !failed && (
        <img
          src={source}
          alt={`${username || "Minecraft player"} skin`}
          onError={() => setFailed(true)}
        />
      )}
      <span className="staff-rank">{member.rank || "COMMUNITY"}</span>
    </div>
  );
}

function DiscordInline({ text }: { text: string }) {
  const tokens = text.split(
    /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\*[^*]+\*|_[^_]+_)/g,
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

function DiscordText({ text }: { text: string }) {
  return (
    <div className="discord-markdown">
      {text.split(/\r?\n/).map((line, index) => {
        if (!line.trim()) return <div className="discord-spacer" key={index} />;
        if (line.trimStart().startsWith(">")) {
          return (
            <blockquote key={index}>
              <DiscordInline text={line.trimStart().slice(1).trimStart()} />
            </blockquote>
          );
        }
        const listItem = line.match(/^\s*[-*]\s+(.+)$/);
        if (listItem) {
          return (
            <p className="discord-list-line" key={index}>
              <DiscordInline text={listItem[1]} />
            </p>
          );
        }
        return (
          <p key={index}>
            <DiscordInline text={line} />
          </p>
        );
      })}
    </div>
  );
}

function CommunityHome() {
  const { data, isLoading, isError, refetch } = useGetLegendsContent();
  const content = data ?? emptyContent;
  const [copied, setCopied] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileOpen(false);
  };

  if (isLoading) return <CommunitySkeleton />;
  return (
    <main className="community">
      <div className="topline"><span><span className="pulse-dot" /> A WORLD BUILT TOGETHER</span><span className="topline-right">JAVA SURVIVAL · COMMUNITY FIRST</span></div>
      <header className="site-nav">
        <Brand />
        <nav className={mobileOpen ? 'nav-links nav-open' : 'nav-links'} aria-label="Main navigation">
          <button onClick={() => jump('world')} data-testid="link-world">The world</button>
          <button onClick={() => jump('people')} data-testid="link-staff">Our people</button>
          <button onClick={() => jump('charter')} data-testid="link-rules">The charter</button>
          <button onClick={() => jump('calendar')} data-testid="link-events">Gatherings</button>
        </nav>
        <button className="nav-join" onClick={() => jump('join')} data-testid="button-join-nav">Join the world <ArrowRight size={15} /></button>
        <button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Close menu' : 'Open menu'} data-testid="button-mobile-menu">{mobileOpen ? <X /> : <Menu />}</button>
      </header>
      {isError && <div className="fetch-notice" role="alert">The world details could not be reached. <button onClick={() => refetch()} data-testid="button-retry-content">Try again</button></div>}

      <section className="hero" id="world">
        <div className="hero-art" aria-hidden="true">
          <div className="sun-disc" />
          <div className="ridge ridge-back" />
          <div className="ridge ridge-mid" />
          <div className="ridge ridge-front" />
          <div className="pine pine-a"><i /><i /><i /></div>
          <div className="pine pine-b"><i /><i /><i /></div>
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
          <div className="hero-coordinate">SEED UNKNOWN<br />STORIES CERTAIN</div>
        </div>
        <div className="hero-content">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR NEXT CHAPTER STARTS HERE</div>
          <h1>Make a little<br /><em>legend.</em></h1>
          <p className="hero-copy">A survival world shaped by the people in it. Build something that lasts, find your crew, and leave your mark on the map.</p>
          <div className="hero-actions">
            <button className="button button-gold" onClick={() => jump('join')} data-testid="button-start-adventure">Find your way in <ArrowDownRight size={17} /></button>
            <button className="text-action" onClick={() => jump('people')} data-testid="button-meet-community">Meet the community <ArrowRight size={15} /></button>
          </div>
          <div className="hero-note"><span className="note-rule" /> A PLACE FOR THE LONG GAME <span className="note-separator">/</span> EST. IN THE OVERWORLD</div>
        </div>
        <div className="hero-index"><span>01</span><span className="index-line" /> THE OVERWORLD</div>
      </section>

      <section className="world-strip" id="join">
        <div className="strip-intro"><span className="section-kicker">YOUR WAY IN</span><h2>Same horizon.<br /><span>New story.</span></h2></div>
        <div className="connect-panel">
          <div className="connect-top"><div><span className="section-kicker">CURRENT SEASON</span><h3 data-testid="text-season">{content.season || 'Awaiting the next chapter'}</h3></div><span className="season-stamp"><Leaf size={17} /> SEASON</span></div>
          <div className="address-block">
            <span className="address-label">SERVER ADDRESS</span>
            <div className="address-value">
              <code data-testid="text-server-ip">{content.serverIp || 'Server address not published yet'}</code>
              <button onClick={copyAddress} disabled={!content.serverIp} className="copy-button" aria-label="Copy server address" data-testid="button-copy-server">
                {copied ? <Check size={16} /> : <Copy size={16} />}<span>{copied ? 'COPIED' : 'COPY'}</span>
              </button>
            </div>
            <span className="connect-hint">Minecraft Java Edition · Add the address above to Multiplayer</span>
          </div>
          <div className="discord-row">
            <span className="section-kicker">FIND US OUTSIDE THE GAME</span>
            {content.discordLinks.length > 0 ? content.discordLinks.map(link => (
              <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="discord-link" data-testid={`link-discord-${link.id}`}>{link.label}<ExternalLink size={13} /></a>
            )) : <span className="muted-note">Community links will appear here when available.</span>}
          </div>
        </div>
      </section>

      <section className="manifesto" id="people">
        <div className="manifesto-number">01 <span>—</span> 04</div>
        <div className="manifesto-body">
          <span className="section-kicker">MORE THAN A SPAWN POINT</span>
          <h2>It’s not about<br />the <span>blocks.</span></h2>
        </div>
        <div className="manifesto-copy"><p>It’s the road between bases. The town that grew out of nowhere. The friend who stayed up late to finish the roof.</p><p>Legends is an independent survival community where the best things happen when nobody’s rushing to the end.</p><button className="inline-link" onClick={() => jump('charter')} data-testid="button-read-charter">Read our charter <ArrowRight size={15} /></button></div>
        <div className="manifesto-seal"><Swords size={28} strokeWidth={1.2} /><span>BUILD<br />WITH PURPOSE</span></div>
      </section>

      <section className="people-section content-section">
        <div className="section-heading">
          <div><span className="section-kicker">THE PEOPLE BEHIND THE WORLD</span><h2>Keepers of<br /><em>the realm.</em></h2></div>
          <p>Good worlds don’t run themselves. Meet the folks who keep this one welcoming, fair, and running smoothly.</p>
        </div>
        {content.staff.length > 0 ? (
          <div className="staff-grid">
            {content.staff.map((member, index) => <article className={`staff-card staff-tone-${index % 3}`} key={member.id} data-testid={`card-staff-${member.id}`}>
              <SkinPortrait member={member} />
              <div className="staff-info"><h3>{member.displayName || member.minecraftUsername}</h3><div className="staff-meta"><span>{member.minecraftUsername}</span>{member.inGameStaff && <span className="game-tag"><span /> IN-GAME</span>}</div>{member.discordUsername && <div className="staff-discord">DISCORD <span>{member.discordUsername}</span></div>}</div>
              <span className="staff-index">0{index + 1}</span>
            </article>)}
          </div>
        ) : <EmptyBlock icon={<Users />} title="The roster is being written." body="Our community team will introduce themselves here soon." />}
      </section>

      <section className="charter-section" id="charter">
        <div className="charter-heading"><div><span className="section-kicker">A FEW THINGS WE HOLD TRUE</span><h2>The <em>charter.</em></h2></div><span className="charter-mark"><ShieldCheck size={24} /> A GOOD WORLD<br />IS EVERYONE’S WORK</span></div>
        <div className="charter-layout">
          <div className="charter-aside"><span>KEEP IT KIND.<br />KEEP IT REAL.</span><div className="aside-rule" /><p>Simple promises.<br />Better adventures.</p></div>
          {content.rules.length > 0 ? <div className="rules-list">{content.rules.map((rule, index) => <article className="rule-row" key={rule.id} data-testid={`text-rule-${rule.id}`}><span className="rule-number">0{index + 1}</span><div><h3>{rule.title}</h3><DiscordText text={rule.body} /></div><ChevronDown size={17} /></article>)}</div> : <EmptyBlock icon={<Shield />} title="The charter is on its way." body="Our shared rules will be published here before the next adventure begins." />}
        </div>
        <div className="charter-bottom"><span>THE WORLD IS BETTER WHEN EVERYONE BELONGS.</span><span>LEGENDS SMP <b>·</b> COMMUNITY CHARTER</span></div>
      </section>

      <section className="gatherings content-section" id="calendar">
        <div className="section-heading"><div><span className="section-kicker">THERE’S ALWAYS SOMETHING BREWING</span><h2>Meet me at<br /><em>the campfire.</em></h2></div><p>Good memories don’t schedule themselves. Here’s what the community is looking forward to.</p></div>
        {content.events.length > 0 ? <div className="event-list">{content.events.map((event, index) => <article className="event-row" key={event.id} data-testid={`card-event-${event.id}`}><span className="event-no">0{index + 1}</span><div className="event-main"><h3>{event.title}</h3><p>{event.description}</p></div><div className="event-time"><span className="section-kicker">WHEN</span><span>{event.time}</span></div>{event.reward && <div className="event-reward"><span className="section-kicker">BRING BACK</span><span>{event.reward}</span></div>}<ArrowRight size={17} /></article>)}</div> : <EmptyBlock icon={<Compass />} title="No gatherings on the map just yet." body="When the next community event is planned, you’ll find it here." />}
      </section>

      <section className="consequences">
        <div className="consequence-title"><span className="section-kicker">FAIR PLAY, CLEAR EXPECTATIONS</span><h2>Every world<br />needs a <em>boundary.</em></h2><p>When things go sideways, our moderation team handles it with care and consistency.</p></div>
        {content.punishments.length > 0 ? <div className="punishment-list">{content.punishments.map((item, i) => <article key={item.id} className="punishment-item" data-testid={`text-punishment-${item.id}`}><span>0{i + 1}</span><div><h3>{item.title}</h3><DiscordText text={item.description} /></div></article>)}</div> : <div className="punishment-empty"><Shield size={22} /><p>Punishment schedules will be posted here when available.</p></div>}
      </section>

      <footer className="site-footer">
        <Brand dark />
        <p>Take care of the world.<br />Take care of each other.</p>
        <div className="footer-links"><span>BUILT FOR THE LONG GAME</span><Link href="/admin" data-testid="link-admin-panel">Staff access <ArrowRight size={13} /></Link><Link href="/owner" data-testid="link-owner-panel">Owner access <ArrowRight size={13} /></Link></div>
        <span className="copyright">LEGENDS SMP · SURVIVE TOGETHER</span>
      </footer>
    </main>
  );
}

function EmptyBlock({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return <div className="empty-block"><span className="empty-icon">{icon}</span><div><h3>{title}</h3><p>{body}</p></div></div>;
}

function CommunitySkeleton() {
  return <main className="community loading-page"><div className="skeleton-nav shimmer" /><div className="skeleton-hero shimmer" /><div className="skeleton-strip shimmer" /><p>Preparing your place in the world…</p></main>;
}

const collectionMeta: Record<CollectionKey, { label: string; plural: string; fields: { key: string; label: string; multiline?: boolean; boolean?: boolean }[] }> = {
  discordLinks: { label: 'Community link', plural: 'Community links', fields: [{ key: 'label', label: 'Label' }, { key: 'url', label: 'Destination URL' }] },
  staff: { label: 'Staff member', plural: 'Staff roster', fields: [{ key: 'minecraftUsername', label: 'Minecraft username' }, { key: 'displayName', label: 'Display name' }, { key: 'rank', label: 'Rank' }, { key: 'discordUsername', label: 'Discord username' }, { key: 'skinUrl', label: 'Skin image URL' }, { key: 'inGameStaff', label: 'In-game staff', boolean: true }] },
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
  useEffect(() => {
    if (contentData) setContent(contentData);
  }, [contentData]);
  const list = content[selected] as CollectionItem[];
  const dirty = useMemo(() => JSON.stringify(content) !== JSON.stringify(contentData ?? emptyContent), [content, contentData]);

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
        <header className="panel-topbar"><Link href="/" className="back-home" data-testid="link-back-home"><ArrowRight className="back-arrow" size={14} /> Community site</Link><div className="panel-top-right"><span className="secure-label"><LockKeyhole size={13} /> PROTECTED PANEL</span>{authorized && <button className="logout-button" onClick={doLogout} disabled={logout.isPending} data-testid="button-logout"><LogOut size={14} /> Sign out</button>}</div></header>
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
            {panel === 'owner' && <section className="owner-tools">
              <div className="tool-heading"><span className="tool-icon"><KeyRound size={18} /></span><div><span className="section-kicker">OWNER ONLY</span><h2>Access credentials</h2><p>Replace a code any time. Leave a field blank to keep its current code.</p></div></div>
              <form className="codes-form" onSubmit={saveCodes}>
                <label>NEW STAFF ACCESS CODE<input data-testid="input-new-admin-code" type={showCodes ? 'text' : 'password'} minLength={8} value={adminCode} onChange={e => setAdminCode(e.target.value)} placeholder="At least 8 characters" /></label>
                <label>NEW OWNER PASSWORD<input data-testid="input-new-owner-code" type={showCodes ? 'text' : 'password'} minLength={8} value={ownerCode} onChange={e => setOwnerCode(e.target.value)} placeholder="At least 8 characters" /></label>
                <div className="code-actions"><button type="button" className="reveal-button" onClick={() => setShowCodes(!showCodes)} data-testid="button-reveal-codes">{showCodes ? <EyeOff size={14} /> : <Eye size={14} />}{showCodes ? 'Hide' : 'Show'} codes</button><button type="submit" className="button button-dark" disabled={updateCodes.isPending || (!adminCode && !ownerCode)} data-testid="button-save-codes">{updateCodes.isPending ? 'Updating…' : 'Update credentials'} <ArrowRight size={15} /></button></div>
              </form>
            </section>}
            <section className="editor-section">
              <div className="editor-top"><div><span className="section-kicker">PUBLIC SITE CONTENT</span><h2>Shape the world’s noticeboard.</h2><p>These changes are visible to every player who visits the community site.</p></div><button className="button button-dark save-button" onClick={saveContent} disabled={!dirty || updateContent.isPending || contentLoading} data-testid="button-save-content"><Save size={15} />{updateContent.isPending ? 'Saving…' : 'Save changes'}</button></div>
              {contentError ? <div className="editor-error" role="alert"><span>Could not load public content.</span><button onClick={() => retryContent()} data-testid="button-retry-editor">Retry loading</button></div> : contentLoading ? <div className="editor-skeleton"><i /><i /><i /></div> : (
                <>
                  <div className="core-fields"><label>SERVER ADDRESS<input data-testid="input-server-ip" value={content.serverIp} onChange={e => setContent(prev => ({ ...prev, serverIp: e.target.value }))} placeholder="Your Minecraft server address" /></label><label>CURRENT SEASON<input data-testid="input-season" value={content.season} onChange={e => setContent(prev => ({ ...prev, season: e.target.value }))} placeholder="The name of the current season" /></label></div>
                  <div className="editor-tabs" role="tablist">{(Object.keys(collectionMeta) as CollectionKey[]).map(key => <button key={key} role="tab" aria-selected={selected === key} className={selected === key ? 'editor-tab active-tab' : 'editor-tab'} onClick={() => setSelected(key)} data-testid={`tab-${key}`}><span>{collectionMeta[key].plural}</span><b>{content[key].length}</b></button>)}</div>
                  <div className="collection-head"><div><span className="section-kicker">{collectionMeta[selected].plural.toUpperCase()}</span><span className="collection-count">{list.length} {list.length === 1 ? 'entry' : 'entries'}</span></div><button className="add-entry" onClick={addItem} data-testid={`button-add-${selected}`}><Plus size={15} /> Add {collectionMeta[selected].label.toLowerCase()}</button></div>
                  {list.length === 0 ? <div className="editor-empty"><span className="empty-icon"><Plus size={19} /></span><div><h3>Nothing here yet.</h3><p>Add the first {collectionMeta[selected].label.toLowerCase()} to publish it on the community site.</p></div></div> : <div className="entry-list">{list.map((item, index) => <article className="entry-card" key={item.id} data-testid={`editor-entry-${selected}-${item.id}`}><div className="entry-card-head"><span><b>{String(index + 1).padStart(2, '0')}</b> {collectionMeta[selected].label}</span><button onClick={() => removeItem(item.id)} aria-label={`Remove ${collectionMeta[selected].label.toLowerCase()}`} data-testid={`button-remove-${selected}-${item.id}`}><Trash2 size={15} /></button></div><div className="entry-fields">{collectionMeta[selected].fields.map(field => field.boolean ? <label className="check-field" key={field.key}><input type="checkbox" checked={Boolean((item as unknown as Record<string, unknown>)[field.key])} onChange={e => patchItem(item.id, field.key, e.target.checked)} data-testid={`input-${selected}-${field.key}-${item.id}`} /><span>{field.label}</span></label> : <label key={field.key}>{field.label}{field.multiline ? <textarea value={String((item as unknown as Record<string, unknown>)[field.key] ?? '')} onChange={e => patchItem(item.id, field.key, e.target.value)} data-testid={`input-${selected}-${field.key}-${item.id}`} rows={3} /> : <input value={String((item as unknown as Record<string, unknown>)[field.key] ?? '')} onChange={e => patchItem(item.id, field.key, e.target.value)} data-testid={`input-${selected}-${field.key}-${item.id}`} />}</label>)}</div></article>)}</div>}
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
