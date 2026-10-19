import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight, ArrowRight, Check, ChevronDown, Compass, Copy, ExternalLink, Upload,
  Eye, EyeOff, KeyRound, Leaf, LockKeyhole, LogOut, Menu, Plus, Save, Shield,
  ShieldCheck, Swords, Trash2, Users, X, Sun, Moon,
} from 'lucide-react';
import {
  getGetLegendsContentQueryKey, getGetLegendsSessionQueryKey, getGetBanAppealsQueryKey,
  getGetStaffApplicationsQueryKey, useGetLegendsContent,
  useGetLegendsSession, useLoginLegendsPanel, useLogoutLegendsPanel,
  useUpdateLegendsCodes, useUpdateLegendsContent, useSubmitBanAppeal, useSubmitStaffApplication,
  useGetBanAppeals, useUpdateBanAppealStatus, useGetStaffApplications,
  useUpdateStaffApplicationStatus, useRequestStaffSkinUpload, useFinalizeStaffSkinUpload,
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

const emptyContent: SiteContentInput = {
  serverIp: '', season: '', discordLinks: [], staff: [], rules: [], punishments: [], events: [],
  banAppealsEnabled: false, banAppealQuestions: [], staffApplicationQuestions: [], pluginInfo: '',
};

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

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className={`brand ${dark ? 'brand-dark' : ''}`} data-testid="link-home-brand">
      <span className="brand-mark"><Compass size={21} strokeWidth={2.2} /></span>
      <span className="brand-word">LEGENDS<span>SMP</span></span>
    </Link>
  );
}

function CommunityHeader({ page }: { page: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = [
    { href: '/', label: 'Home', page: 'home' },
    { href: '/staff', label: 'Staff', page: 'staff' },
    { href: '/rules', label: 'Rules', page: 'rules' },
    { href: '/events', label: 'Events', page: 'events' },
    { href: '/punishments', label: 'Punishments', page: 'punishments' },
    { href: '/plugin', label: 'Plugin info', page: 'plugin' },
    { href: '/apply', label: 'Apply for staff', page: 'apply' },
    { href: '/appeal', label: 'Ban appeal', page: 'appeal' },
  ];
  const closeMenu = () => setMobileOpen(false);

  return (
    <header className="site-nav">
      <Brand />
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
        Join the world <ArrowRight size={15} />
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
  const [failed, setFailed] = useState(false);
  const username = member.minecraftUsername.trim();
  const source = member.skinUrl?.trim() || "";
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
  const content = data ?? emptyContent;
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
    <main className="community">
      <div className="topline"><span><span className="pulse-dot" /> A WORLD BUILT TOGETHER</span><span className="topline-right">JAVA SURVIVAL · COMMUNITY FIRST</span></div>
      <CommunityHeader page={page} />
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
          <div className="hero-coordinate">SEED UNKNOWN<br />STORIES CERTAIN</div>
        </div>
        <div className="hero-content">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR NEXT CHAPTER STARTS HERE</div>
          <h1>Make a little<br /><em>legend.</em></h1>
          <p className="hero-copy">A survival world shaped by the people in it. Build something that lasts, find your crew, and leave your mark on the map.</p>
          <div className="hero-actions">
            <button className="button button-gold" onClick={() => setLocation('/join')} data-testid="button-start-adventure">Find your way in <ArrowDownRight size={17} /></button>
            <button className="text-action" onClick={() => setLocation('/staff')} data-testid="button-meet-community">Meet the community <ArrowRight size={15} /></button>
          </div>
          <div className="hero-note"><span className="note-rule" /> A PLACE FOR THE LONG GAME <span className="note-separator">/</span> EST. IN THE OVERWORLD</div>
        </div>
        <div className="hero-index"><span>01</span><span className="index-line" /> THE OVERWORLD</div>
      </section>
      </>}

      {page === 'join' && <section className="world-strip reveal-in" id="join">
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
      }

      {page === 'home' && <section className="manifesto" id="people">
        <div className="manifesto-number">01 <span>—</span> 04</div>
        <div className="manifesto-body">
          <span className="section-kicker">MORE THAN A SPAWN POINT</span>
          <h2>It’s not about<br />the <span>blocks.</span></h2>
        </div>
        <div className="manifesto-copy"><p>It’s the road between bases. The town that grew out of nowhere. The friend who stayed up late to finish the roof.</p><p>Legends is an independent survival community where the best things happen when nobody’s rushing to the end.</p><button className="inline-link" onClick={() => setLocation('/rules')} data-testid="button-read-charter">Read our charter <ArrowRight size={15} /></button></div>
        <div className="manifesto-seal"><Swords size={28} strokeWidth={1.2} /><span>BUILD<br />WITH PURPOSE</span></div>
      </section>
      }

      {(page === 'home' || page === 'staff') && <section className={`people-section content-section ${page === 'staff' ? 'reveal-in' : ''}`}>
        <div className="section-heading">
          <div><span className="section-kicker">THE PEOPLE BEHIND THE WORLD</span><h2>Keepers of<br /><em>the realm.</em></h2></div>
          <p>Good worlds don’t run themselves. Meet the folks who keep this one welcoming, fair, and running smoothly.</p>
        </div>
        {content.staff.length > 0 ? (
          <div className="staff-grid">
            {(page === 'home' && !showAllStaff ? content.staff.slice(0, 3) : content.staff).map((member, index) => <article className={`staff-card staff-tone-${index % 3}`} key={member.id} data-testid={`card-staff-${member.id}`}>
              <SkinPortrait member={member} />
              <div className="staff-info"><h3>{member.displayName || member.minecraftUsername}</h3><div className="staff-meta"><span>{member.minecraftUsername}</span>{member.inGameStaff && <span className="game-tag"><span /> IN-GAME</span>}</div>{member.discordUsername && <div className="staff-discord">DISCORD <span>{member.discordUsername}</span></div>}</div>
              <span className="staff-index">0{index + 1}</span>
            </article>)}
          </div>
        ) : <EmptyBlock icon={<Users />} title="The roster is being written." body="Our community team will introduce themselves here soon." />}
        {page === 'home' && content.staff.length > 3 && <button className="button button-dark staff-more" onClick={() => setShowAllStaff(value => !value)} aria-expanded={showAllStaff} data-testid="button-show-more-staff">{showAllStaff ? 'Show fewer staff' : 'Show more staff'} <ArrowRight size={15} /></button>}
      </section>
      }

      {page === 'rules' && <section className="charter-section reveal-in" id="charter">
        <div className="charter-heading"><div><span className="section-kicker">A FEW THINGS WE HOLD TRUE</span><h2>The <em>charter.</em></h2></div><span className="charter-mark"><ShieldCheck size={24} /> A GOOD WORLD<br />IS EVERYONE’S WORK</span></div>
        <div className="charter-layout">
          <div className="charter-aside"><span>KEEP IT KIND.<br />KEEP IT REAL.</span><div className="aside-rule" /><p>Simple promises.<br />Better adventures.</p></div>
          {content.rules.length > 0 ? <div className="rules-list">{content.rules.map((rule, index) => <article className="rule-row" key={rule.id} data-testid={`text-rule-${rule.id}`}><span className="rule-number">0{index + 1}</span><div><h3>{rule.title}</h3><DiscordText text={rule.body} /></div><ChevronDown size={17} /></article>)}</div> : <EmptyBlock icon={<Shield />} title="The charter is on its way." body="Our shared rules will be published here before the next adventure begins." />}
        </div>
        <div className="charter-bottom"><span>THE WORLD IS BETTER WHEN EVERYONE BELONGS.</span><span>LEGENDS SMP <b>·</b> COMMUNITY CHARTER</span></div>
      </section>
      }

      {page === 'events' && <section className="gatherings content-section reveal-in" id="calendar">
        <div className="section-heading"><div><span className="section-kicker">THERE’S ALWAYS SOMETHING BREWING</span><h2>Meet me at<br /><em>the campfire.</em></h2></div><p>Good memories don’t schedule themselves. Here’s what the community is looking forward to.</p></div>
        {content.events.length > 0 ? <div className="event-list">{content.events.map((event, index) => <article className="event-row" key={event.id} data-testid={`card-event-${event.id}`}><span className="event-no">0{index + 1}</span><div className="event-main"><h3>{event.title}</h3><p>{event.description}</p></div><div className="event-time"><span className="section-kicker">WHEN</span><span>{event.time}</span></div>{event.reward && <div className="event-reward"><span className="section-kicker">BRING BACK</span><span>{event.reward}</span></div>}<ArrowRight size={17} /></article>)}</div> : <EmptyBlock icon={<Compass />} title="No gatherings on the map just yet." body="When the next community event is planned, you’ll find it here." />}
      </section>
      }

      {page === 'punishments' && <section className="consequences reveal-in">
        <div className="consequence-title"><span className="section-kicker">FAIR PLAY, CLEAR EXPECTATIONS</span><h2>Every world<br />needs a <em>boundary.</em></h2><p>When things go sideways, our moderation team handles it with care and consistency.</p></div>
        {content.punishments.length > 0 ? <div className="punishment-list">{content.punishments.map((item, i) => <article key={item.id} className="punishment-item" data-testid={`text-punishment-${item.id}`}><span>0{i + 1}</span><div><h3>{item.title}</h3><DiscordText text={item.description} /></div></article>)}</div> : <div className="punishment-empty"><Shield size={22} /><p>Punishment schedules will be posted here when available.</p></div>}
      </section>
      }

      <footer className="site-footer">
        <Brand dark />
        <p>Take care of the world.<br />Take care of each other.</p>
        <div className="footer-links"><span>BUILT FOR THE LONG GAME</span><Link href="/admin" data-testid="link-admin-panel">Staff access <ArrowRight size={13} /></Link><Link href="/owner" data-testid="link-owner-panel">Owner access <ArrowRight size={13} /></Link></div>
        <span className="copyright">LEGENDS SMP · SURVIVE TOGETHER</span>
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
  return <main className="community form-page">
    <div className="topline"><span><span className="pulse-dot" /> A WORLD BUILT TOGETHER</span><span className="topline-right">JAVA SURVIVAL · COMMUNITY FIRST</span></div>
     <CommunityHeader page={appeal ? 'appeal' : 'apply'} />
    {isError && <div className="fetch-notice" role="alert">The form details could not be reached. <button onClick={() => refetch()}>Try again</button></div>}
    <section className="submission-layout reveal-in">
      <div className="submission-aside">
        <span className="section-kicker">{appeal ? 'A WAY BACK TO THE WORLD' : 'HELP SHAPE WHAT COMES NEXT'}</span>
        <h1>{appeal ? <>A second<br /><em>chapter.</em></> : <>Make room<br />for your <em>story.</em></>}</h1>
        <p>{appeal ? 'We know people can grow. Share your perspective and our moderation team will review your appeal with care.' : 'Good communities are built by people who show up for one another. Tell us how you might help.'}</p>
        <div className="submission-note"><span className="note-rule" /> READ BY THE LEGENDS TEAM <span>/</span> {appeal ? 'ONE APPEAL AT A TIME' : 'THOUGHTFUL PEOPLE WELCOME'}</div>
        <Link href={appeal ? '/apply' : '/appeal'} className="form-switch">{appeal ? 'Interested in joining the team?' : 'Need to appeal a ban?'} <span>{appeal ? 'Apply here' : 'Start an appeal'} <ArrowRight size={14} /></span></Link>
      </div>
      <div className="submission-card">
        <div className="submission-card-head"><div><span className="section-kicker">{appeal ? 'BAN APPEAL' : 'STAFF APPLICATION'} / PRIVATE SUBMISSION</span><h2>{appeal ? 'Tell us what happened.' : 'Let’s get to know you.'}</h2></div><span className="form-index">01<br />—<br />04</span></div>
        {disabled ? <div className="form-closed"><span className="closed-mark"><LockKeyhole size={20} /></span><h3>Appeals are paused for now.</h3><p>Our team is not accepting new appeals at the moment. Please check back later.</p><Link href="/" className="button button-dark">Back to Legends <ArrowRight size={15} /></Link></div> : sent ? <div className="form-success"><span className="success-mark"><Check size={23} /></span><span className="section-kicker">RECEIVED BY THE TEAM</span><h3>Your words are with us.</h3><p>Thank you for taking the time to write. The team will review your {appeal ? 'appeal' : 'application'} as soon as they can.</p><button className="button button-dark" onClick={() => setSent(false)}>Send another response <ArrowRight size={15} /></button></div> : <form className="community-form" onSubmit={onSubmit}>
          <div className="form-identity"><label>MINECRAFT USERNAME<input name="minecraftUsername" required autoComplete="username" maxLength={32} placeholder="Your in-game name" /></label><label>DISCORD USERNAME<input name="discordUsername" required maxLength={80} placeholder="name or name#0000" /></label></div>
          {questions.map((question, index) => <label className="question-field" key={question.id}><span><b>{String(index + 1).padStart(2, '0')}</b>{question.label}{question.required && <i>REQUIRED</i>}</span><textarea name={question.id} rows={4} required={question.required} maxLength={4000} placeholder="Take your time. A little context helps." /></label>)}
          {failure && <p className="form-error" role="alert">{failure}</p>}
          <div className="submit-form-bottom"><span>Your details are only shared with the Legends team.</span><button type="submit" className="button button-dark" disabled={busy}>{busy ? 'Sending…' : 'Send to the team'} <ArrowRight size={15} /></button></div>
        </form>}
      </div>
    </section>
    <footer className="site-footer"><Brand dark /><p>Take care of the world.<br />Take care of each other.</p><div className="footer-links"><span>BUILT FOR THE LONG GAME</span><Link href="/admin">Staff access <ArrowRight size={13} /></Link><Link href="/owner">Owner access <ArrowRight size={13} /></Link></div><span className="copyright">LEGENDS SMP · SURVIVE TOGETHER</span></footer>
  </main>;
}

function PluginPage() {
  const { data, isLoading, isError, refetch } = useGetLegendsContent();
  if (isLoading) return <CommunitySkeleton />;
  return <main className="community form-page"><div className="topline"><span><span className="pulse-dot" /> A WORLD BUILT TOGETHER</span><span className="topline-right">JAVA SURVIVAL · COMMUNITY FIRST</span></div><CommunityHeader page="plugin" />
    {isError && <div className="fetch-notice" role="alert">Plugin details could not be reached. <button onClick={() => refetch()}>Try again</button></div>}
    <section className="plugin-page reveal-in"><div className="plugin-intro"><span className="section-kicker">TOOLS THAT SUPPORT THE WORLD</span><h1>How we<br /><em>play.</em></h1><p>Helpful details for getting started, shared by the people who play here.</p><Link href="/join" className="button button-dark">Find your way in <ArrowRight size={15} /></Link></div><article className="plugin-content"><div className="plugin-content-head"><span className="section-kicker">LEGENDS SMP / SERVER NOTES</span><span>COMMUNITY GUIDE</span></div>{data?.pluginInfo?.trim() ? <DiscordText text={data.pluginInfo} /> : <div className="plugin-empty"><Compass size={24} /><h2>Details are being gathered.</h2><p>Server notes will be shared here as the community settles in.</p></div>}<div className="plugin-signoff">KEEP IT KIND <span>·</span> KEEP IT CURIOUS</div></article></section>
    <footer className="site-footer"><Brand dark /><p>Take care of the world.<br />Take care of each other.</p><div className="footer-links"><span>BUILT FOR THE LONG GAME</span><Link href="/appeal">Ban appeals <ArrowRight size={13} /></Link><Link href="/apply">Staff applications <ArrowRight size={13} /></Link></div><span className="copyright">LEGENDS SMP · SURVIVE TOGETHER</span></footer></main>;
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
  const requestSkinUpload = useRequestStaffSkinUpload();
  const finalizeSkinUpload = useFinalizeStaffSkinUpload();
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
  const [skinFiles, setSkinFiles] = useState<Record<string, File>>({});
  useEffect(() => {
    if (contentData) setContent(contentData);
  }, [contentData]);
  const list = content[selected] as CollectionItem[];
  const dirty = useMemo(() => JSON.stringify(content) !== JSON.stringify(contentData ?? emptyContent) || Object.keys(skinFiles).length > 0, [content, contentData, skinFiles]);

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
      let nextContent = content;
      for (const [staffId, file] of Object.entries(skinFiles)) {
        const requested = await requestSkinUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type as 'image/png' | 'image/jpeg' | 'image/webp' } });
        const upload = await fetch(requested.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!upload.ok) throw new Error('Image upload failed');
        const finalized = await finalizeSkinUpload.mutateAsync({ data: { objectPath: requested.objectPath } });
        nextContent = { ...nextContent, staff: nextContent.staff.map(member => member.id === staffId ? { ...member, skinUrl: finalized.imagePath } : member) };
      }
      setContent(nextContent);
      await updateContent.mutateAsync({ data: nextContent });
      setSkinFiles({});
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
        <header className="panel-topbar"><Link href="/" className="back-home" data-testid="link-back-home"><ArrowRight className="back-arrow" size={14} /> Community site</Link><div className="panel-top-right"><ThemeToggle /><span className="secure-label"><LockKeyhole size={13} /> PROTECTED PANEL</span>{authorized && <button className="logout-button" onClick={doLogout} disabled={logout.isPending} data-testid="button-logout"><LogOut size={14} /> Sign out</button>}</div></header>
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
                  {panel === 'admin' && <section className="form-settings admin-form-settings">
                    <div className="settings-title"><div><span className="section-kicker">ADMIN / COMMUNITY CARE</span><h3>Ban appeals</h3><p>Choose whether players can submit an appeal, and keep the questions clear.</p></div><label className="appeals-switch"><input type="checkbox" checked={content.banAppealsEnabled} onChange={e => setContent(prev => ({ ...prev, banAppealsEnabled: e.target.checked }))} /><span>{content.banAppealsEnabled ? 'Accepting appeals' : 'Appeals paused'}</span></label></div>
                    <QuestionEditor title="Appeal questions" questions={content.banAppealQuestions} onChange={questions => setContent(prev => ({ ...prev, banAppealQuestions: questions }))} />
                  </section>}
                  {panel === 'owner' && <section className="form-settings owner-form-settings">
                    <div className="settings-title"><div><span className="section-kicker">OWNER / COMMUNITY INTAKE</span><h3>Staff applications</h3><p>Shape the questions players see when they apply to help the realm.</p></div></div>
                    <QuestionEditor title="Application questions" questions={content.staffApplicationQuestions} onChange={questions => setContent(prev => ({ ...prev, staffApplicationQuestions: questions }))} />
                    <label className="plugin-editor-label">PLUGIN & SERVER INFORMATION <small>Discord-style formatting: **bold**, *italic*, &gt; quote, - list, `code`</small><textarea className="plugin-editor" rows={10} value={content.pluginInfo} onChange={e => setContent(prev => ({ ...prev, pluginInfo: e.target.value }))} placeholder={'**A few notes before you join**\\n- Java Edition\\n> Be kind to the world and each other'} /></label>
                  </section>}
                  {panel === 'admin' && <AppealReviews />}
                  {panel === 'owner' && <ApplicationReviews />}
                  <div className="editor-tabs" role="tablist">{(Object.keys(collectionMeta) as CollectionKey[]).map(key => <button key={key} role="tab" aria-selected={selected === key} className={selected === key ? 'editor-tab active-tab' : 'editor-tab'} onClick={() => setSelected(key)} data-testid={`tab-${key}`}><span>{collectionMeta[key].plural}</span><b>{content[key].length}</b></button>)}</div>
                  <div className="collection-head"><div><span className="section-kicker">{collectionMeta[selected].plural.toUpperCase()}</span><span className="collection-count">{list.length} {list.length === 1 ? 'entry' : 'entries'}</span></div><button className="add-entry" onClick={addItem} data-testid={`button-add-${selected}`}><Plus size={15} /> Add {collectionMeta[selected].label.toLowerCase()}</button></div>
                  {list.length === 0 ? <div className="editor-empty"><span className="empty-icon"><Plus size={19} /></span><div><h3>Nothing here yet.</h3><p>Add the first {collectionMeta[selected].label.toLowerCase()} to publish it on the community site.</p></div></div> : <div className="entry-list">{list.map((item, index) => <article className="entry-card" key={item.id} data-testid={`editor-entry-${selected}-${item.id}`}><div className="entry-card-head"><span><b>{String(index + 1).padStart(2, '0')}</b> {collectionMeta[selected].label}</span><button onClick={() => removeItem(item.id)} aria-label={`Remove ${collectionMeta[selected].label.toLowerCase()}`} data-testid={`button-remove-${selected}-${item.id}`}><Trash2 size={15} /></button></div><div className="entry-fields">{collectionMeta[selected].fields.map(field => field.key === 'skinUrl' && selected === 'staff' ? <StaffImageField key={field.key} member={item as Staff} file={skinFiles[item.id]} onFile={file => setSkinFiles(prev => ({ ...prev, [item.id]: file }))} /> : field.boolean ? <label className="check-field" key={field.key}><input type="checkbox" checked={Boolean((item as unknown as Record<string, unknown>)[field.key])} onChange={e => patchItem(item.id, field.key, e.target.checked)} data-testid={`input-${selected}-${field.key}-${item.id}`} /><span>{field.label}</span></label> : <label key={field.key}>{field.label}{field.multiline ? <textarea value={String((item as unknown as Record<string, unknown>)[field.key] ?? '')} onChange={e => patchItem(item.id, field.key, e.target.value)} data-testid={`input-${selected}-${field.key}-${item.id}`} rows={3} /> : <input value={String((item as unknown as Record<string, unknown>)[field.key] ?? '')} onChange={e => patchItem(item.id, field.key, e.target.value)} data-testid={`input-${selected}-${field.key}-${item.id}`} />}</label>)}</div></article>)}</div>}
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
  return <div className="question-editor"><div className="question-editor-label"><span>{title}</span><span>{questions.length} {questions.length === 1 ? 'question' : 'questions'}</span></div>{questions.length ? questions.map((question, index) => <div className="managed-question" key={question.id}><span className="managed-question-number">{String(index + 1).padStart(2, '0')}</span><input aria-label={`Question ${index + 1}`} value={question.label} onChange={e => onChange(questions.map(item => item.id === question.id ? { ...item, label: e.target.value } : item))} placeholder="Write a clear, welcoming question" /><label className="required-control"><input type="checkbox" checked={question.required} onChange={e => onChange(questions.map(item => item.id === question.id ? { ...item, required: e.target.checked } : item))} />Required</label><button type="button" className="remove-question" aria-label={`Remove question ${index + 1}`} onClick={() => onChange(questions.filter(item => item.id !== question.id))}><X size={15} /></button></div>) : <p className="no-questions">No custom questions yet. Public forms will use the community starter questions until you add your own.</p>}<div className="add-question-row"><input value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Add a question for players" /><button type="button" className="button button-dark" onClick={add} disabled={!label.trim()}><Plus size={14} /> Add question</button></div></div>;
}

function StaffImageField({ member, file, onFile }: { member: Staff; file?: File; onFile: (file: File) => void }) {
  const [invalid, setInvalid] = useState('');
  const [localPreview, setLocalPreview] = useState('');
  useEffect(() => {
    if (!file) { setLocalPreview(''); return; }
    const url = URL.createObjectURL(file);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const preview = localPreview || member.skinUrl || '';
  return <div className="staff-image-editor"><span className="upload-label">STAFF IMAGE</span><div className="image-upload-control"><div className="staff-image-preview">{preview ? <img src={preview} alt={`${member.displayName || member.minecraftUsername || 'Staff'} image preview`} /> : <span>{(member.minecraftUsername || 'L').slice(0, 1).toUpperCase()}</span>}</div><div className="upload-prompt"><label className="upload-button"><Upload size={14} />{file ? 'Choose another image' : member.skinUrl ? 'Replace image' : 'Upload staff image'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const picked = event.currentTarget.files?.[0]; if (!picked) return; if (!['image/png', 'image/jpeg', 'image/webp'].includes(picked.type) || picked.size > 5 * 1024 * 1024) { setInvalid('Choose a PNG, JPG, or WebP image up to 5 MB.'); event.currentTarget.value = ''; return; } setInvalid(''); onFile(picked); }} /></label><p>PNG, JPG, or WebP · up to 5 MB. Image uploads when you save.</p>{file && <span className="selected-file">{file.name}</span>}{invalid && <span className="upload-error" role="alert">{invalid}</span>}</div></div></div>;
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
  return <section className="review-section"><div className="review-head"><div><span className="section-kicker">{kicker}</span><h3>{title}</h3><p>{description}</p></div><span className="review-count">{items?.length ?? 0}<small>SUBMISSIONS</small></span></div>{error ? <div className="review-state error"><p>Submissions could not be loaded.</p><button type="button" onClick={retry}>Try again</button></div> : loading ? <div className="review-loading"><i /><i /><i /></div> : !items?.length ? <div className="review-state"><Compass size={20} /><p>No submissions to review yet. New responses will appear here.</p></div> : <div className="submission-list">{items.map((item, index) => <article className="review-card" key={item.id}><div className="review-card-top"><div><span className="review-number">{String(index + 1).padStart(2, '0')}</span><h4>{item.minecraftUsername}</h4><span className="review-discord">{item.discordUsername}</span></div><span className={`status-pill status-${item.status}`}>{item.status}</span></div><time>{new Date(item.createdAt).toLocaleString()}</time><div className="review-answers">{(item.answers ?? []).map((answer, i) => <div key={`${answer.questionId}-${i}`}><h5>{questions.find(question => question.id === answer.questionId)?.label || `Response ${i + 1}`}</h5><p>{answer.answer}</p></div>)}</div><div className="review-actions"><span>REVIEW STATUS</span><div>{(['pending', 'accepted', 'declined'] as const).map(status => <button key={status} type="button" className={item.status === status ? `status-choice selected ${status}` : 'status-choice'} disabled={pendingId === item.id} onClick={() => onStatus(item.id, status)}>{status[0].toUpperCase() + status.slice(1)}</button>)}</div></div></article>)}</div>}</section>;
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
