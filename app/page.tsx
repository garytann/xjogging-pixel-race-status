"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const APP_SLUG = "htxawr2026";
const TEAM_ID = "6a9fb473863549b0de677041";
const API_ROOT = `https://api.42campaign.io/app/applications/${APP_SLUG}`;
const POLL_INTERVAL_MS = 60_000;
const CACHE_KEY = `pixel-race:${TEAM_ID}`;

type Team = {
  _id: string;
  name: string;
  description: string;
  accumulativeDistance: number;
  noOfMembers: number;
  leaderName: string;
  rank: number;
  registrationStatus: string;
};

type Member = {
  _id: string;
  rank: number;
  name: string;
  type: string;
  distance: number;
};

type MembersPayload = {
  data: Member[];
  metadata?: {
    totalRecords: number;
    page: number;
    maxPage: number;
    perPage: number;
    timeStamp: string;
  };
};

type TeamPayload = { data: Team };

type Snapshot = {
  team: Team;
  members: Member[];
  updatedAt: string;
};

type Movement = {
  rankDelta: number;
  distanceDelta: number;
};

const palettes = [
  ["#57e3c3", "#173c55", "#f6bb8f", "#f8fbff"],
  ["#ff6b6b", "#40304f", "#c9825f", "#ffd166"],
  ["#9b8afb", "#27365e", "#f2b38f", "#57e3c3"],
  ["#ffb84d", "#5e2d45", "#9a563d", "#fff1ca"],
  ["#46b9ff", "#172d50", "#e8ab83", "#ff6b6b"],
  ["#ff78b5", "#44305f", "#7d4938", "#ffe071"],
  ["#b5ed55", "#1a4653", "#d99a72", "#9b8afb"],
];

function paletteFor(id: string) {
  const hash = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return palettes[hash % palettes.length];
}

function formatDistance(distance: number) {
  return new Intl.NumberFormat("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(distance);
}

function formatTime(iso: string | null) {
  if (!iso) return "Waiting for first sync";
  return new Intl.DateTimeFormat("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Singapore",
  }).format(new Date(iso));
}

function safeSnapshot(value: string | null): Snapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Snapshot;
    if (!parsed.team || !Array.isArray(parsed.members) || !parsed.updatedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`The live feed returned ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

function PixelRunner({ member, leader }: { member: Member; leader: boolean }) {
  const [shirt, shorts, skin, accent] = paletteFor(member._id);
  const style = {
    "--shirt": shirt,
    "--shorts": shorts,
    "--skin": skin,
    "--accent": accent,
  } as React.CSSProperties;

  return (
    <div className="pixel-runner" style={style} aria-hidden="true">
      {leader && (
        <span className="pixel-crown">
          <i />
          <i />
          <i />
        </span>
      )}
      <span className="runner-shadow" />
      <span className="runner-hair" />
      <span className="runner-head" />
      <span className="runner-band" />
      <span className="runner-body" />
      <span className="runner-arm runner-arm-back" />
      <span className="runner-arm runner-arm-front" />
      <span className="runner-leg runner-leg-back" />
      <span className="runner-leg runner-leg-front" />
      <span className="runner-shoe runner-shoe-back" />
      <span className="runner-shoe runner-shoe-front" />
    </div>
  );
}

export default function Home() {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [movements, setMovements] = useState<Record<string, Movement>>({});
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState(
    () => Date.now() + POLL_INTERVAL_MS,
  );
  const [secondsToRefresh, setSecondsToRefresh] = useState(60);
  const [status, setStatus] = useState<"loading" | "live" | "cached" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pulse, setPulse] = useState(0);
  const previousMembers = useRef<Member[]>([]);
  const mounted = useRef(true);
  const nextRefreshRef = useRef(nextRefreshAt);

  const loadStandings = useCallback(async (manual = false) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);

    if (manual) setStatus("loading");

    try {
      const [teamPayload, firstPage] = await Promise.all([
        fetchJson<TeamPayload>(
          `${API_ROOT}/groups/team/${TEAM_ID}?skip=0&limit=50`,
          controller.signal,
        ),
        fetchJson<MembersPayload>(
          `${API_ROOT}/groups/teams/${TEAM_ID}/members?type=challenge&perPage=50&page=1`,
          controller.signal,
        ),
      ]);

      let allMembers = [...firstPage.data];
      const maxPage = firstPage.metadata?.maxPage ?? 1;

      if (maxPage > 1) {
        const remaining = await Promise.all(
          Array.from({ length: maxPage - 1 }, (_, index) =>
            fetchJson<MembersPayload>(
              `${API_ROOT}/groups/teams/${TEAM_ID}/members?type=challenge&perPage=50&page=${index + 2}`,
              controller.signal,
            ),
          ),
        );
        allMembers = allMembers.concat(remaining.flatMap((page) => page.data));
      }

      allMembers.sort((a, b) => a.rank - b.rank);
      const cachedPrevious = safeSnapshot(window.localStorage.getItem(CACHE_KEY));
      const previous = previousMembers.current.length
        ? previousMembers.current
        : (cachedPrevious?.members ?? []);
      const previousById = new Map(previous.map((member) => [member._id, member]));
      const nextMovements: Record<string, Movement> = {};
      const overtakes: string[] = [];

      for (const member of allMembers) {
        const old = previousById.get(member._id);
        if (!old) continue;
        const rankDelta = old.rank - member.rank;
        const distanceDelta = Math.max(0, member.distance - old.distance);
        nextMovements[member._id] = { rankDelta, distanceDelta };
        if (rankDelta > 0) overtakes.push(`${member.name.trim()} moved up to #${member.rank}`);
      }

      const syncTime = firstPage.metadata?.timeStamp ?? new Date().toISOString();
      const snapshot: Snapshot = {
        team: teamPayload.data,
        members: allMembers,
        updatedAt: syncTime,
      };

      if (!mounted.current) return;
      previousMembers.current = allMembers;
      setTeam(teamPayload.data);
      setMembers(allMembers);
      setMovements(nextMovements);
      setUpdatedAt(syncTime);
      setStatus("live");
      setError(null);
      setPulse((value) => value + 1);
      const nextSync = Date.now() + POLL_INTERVAL_MS;
      nextRefreshRef.current = nextSync;
      setNextRefreshAt(nextSync);
      setAnnouncement(overtakes[0] ?? `Standings updated at ${formatTime(syncTime)}`);
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
    } catch (caught) {
      if (!mounted.current) return;
      const cached = safeSnapshot(window.localStorage.getItem(CACHE_KEY));
      if (cached) {
        previousMembers.current = cached.members;
        setTeam(cached.team);
        setMembers(cached.members);
        setUpdatedAt(cached.updatedAt);
        setStatus("cached");
        setError("Live feed unavailable — showing the last successful update.");
      } else {
        setStatus("error");
        setError(
          caught instanceof Error && caught.name !== "AbortError"
            ? caught.message
            : "The live feed did not respond in time.",
        );
      }
      const nextSync = Date.now() + POLL_INTERVAL_MS;
      nextRefreshRef.current = nextSync;
      setNextRefreshAt(nextSync);
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const initialLoad = window.setTimeout(() => void loadStandings(), 0);

    const poller = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadStandings();
    }, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && Date.now() >= nextRefreshRef.current) {
        void loadStandings();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted.current = false;
      window.clearTimeout(initialLoad);
      window.clearInterval(poller);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadStandings]);

  useEffect(() => {
    const updateCountdown = () => {
      setSecondsToRefresh(
        Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000)),
      );
    };
    updateCountdown();
    const ticker = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(ticker);
  }, [nextRefreshAt]);

  const leaderDistance = members[0]?.distance ?? 1;
  const totalDistance = team?.accumulativeDistance ?? members.reduce((sum, member) => sum + member.distance, 0);
  const nextRefreshLabel = status === "loading" ? "SYNCING" : `${secondsToRefresh.toString().padStart(2, "0")} SEC`;
  const statusLabel = status === "live" ? "LIVE" : status === "cached" ? "CACHED" : status === "error" ? "OFFLINE" : "SYNCING";

  const teamRank = team?.rank
    ? `#${new Intl.NumberFormat("en-SG").format(team.rank)}`
    : "—";

  return (
    <main className="site-shell">
      <div className="noise" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="#leaderboard" aria-label="xJogging leaderboard home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>xJOGGING</span>
        </a>
        <div className="event-chip">
          <span className="live-dot" />
          HTX ANNUAL WALK &amp; RUN 2026
        </div>
        <div className={`feed-status feed-status--${status}`}>{statusLabel}</div>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <div className="eyebrow"><span>TEAM 973</span><i />18—25 SEP 2026</div>
        <div className="hero-heading">
          <div>
            <h1 id="page-title">PIXEL RACE<br /><em>LIVE</em></h1>
            <p>{team?.description || "Every kilometre moves the whole team forward."}</p>
          </div>
          <div className="hero-message">
            <span className="message-icon">↗</span>
            <strong>KEEP MOVING</strong>
            <small>Same steps. Bigger tomorrow.</small>
          </div>
        </div>

        <div className="stat-grid" aria-label="Team summary">
          <article className="stat-card stat-card--distance">
            <span>TEAM DISTANCE</span>
            <strong>{formatDistance(totalDistance)}</strong>
            <small>KM CLOCKED TOGETHER</small>
          </article>
          <article className="stat-card">
            <span>TEAM RANK</span>
            <strong>{teamRank}</strong>
            <small>EVENT STANDING</small>
          </article>
          <article className="stat-card">
            <span>RUNNERS</span>
            <strong>{team?.noOfMembers ?? (members.length || "—")}</strong>
            <small>{team?.leaderName ? `LED BY ${team.leaderName.toUpperCase()}` : "ON THE START LINE"}</small>
          </article>
          <article className="stat-card stat-card--refresh">
            <span>NEXT REFRESH</span>
            <strong>{nextRefreshLabel}</strong>
            <button type="button" onClick={() => void loadStandings(true)} disabled={status === "loading"}>
              REFRESH NOW <span aria-hidden="true">↻</span>
            </button>
          </article>
        </div>
      </section>

      <section className="race-board" id="leaderboard" aria-labelledby="race-title">
        <div className="board-header">
          <div>
            <span className="section-kicker">CURRENT STANDINGS</span>
            <h2 id="race-title">THE TEAM TRACK</h2>
          </div>
          <div className="sync-copy">
            <span>LAST SYNC · SGT</span>
            <strong>{formatTime(updatedAt)}</strong>
          </div>
        </div>

        {error && (
          <div className="alert" role="status">
            <span aria-hidden="true">!</span>
            {error}
          </div>
        )}

        {members.length > 0 ? (
          <ol className="race-list" key={pulse}>
            {members.map((member) => {
              const progress = 8 + Math.min(1, member.distance / Math.max(leaderDistance, 1)) * 82;
              const movement = movements[member._id];
              const rowStyle = { "--progress": `${progress}%` } as React.CSSProperties;

              return (
                <li className="race-row" key={member._id} style={rowStyle}>
                  <div className={`rank rank--${member.rank <= 3 ? member.rank : "other"}`}>
                    <span>{member.rank.toString().padStart(2, "0")}</span>
                  </div>
                  <div className="runner-info">
                    <strong>{member.name.trim()}</strong>
                    <span>
                      {movement?.rankDelta > 0 ? (
                        <em className="rank-up">▲ {movement.rankDelta} PLACE{movement.rankDelta > 1 ? "S" : ""}</em>
                      ) : member.rank === 1 ? (
                        <em className="rank-lead">PACE LEADER</em>
                      ) : (
                        `LANE ${member.rank}`
                      )}
                    </span>
                  </div>
                  <div className="track" aria-hidden="true">
                    <span className="start-line">START</span>
                    <span className="track-dashes" />
                    <span className="finish-line">FINISH</span>
                    <span className="runner-marker">
                      {movement?.distanceDelta > 0.005 && (
                        <span className="distance-pop">+{movement.distanceDelta.toFixed(2)}</span>
                      )}
                      <PixelRunner member={member} leader={member.rank === 1} />
                    </span>
                  </div>
                  <div className="distance">
                    <strong>{formatDistance(member.distance)}</strong>
                    <span>KM</span>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="loading-state" role="status">
            <div className="loading-runner"><span /><span /><span /></div>
            <strong>{status === "error" ? "THE FEED IS TAKING A BREATHER" : "RUNNERS ARE HEADING TO THE TRACK"}</strong>
            <span>{status === "error" ? "Try refresh again in a moment." : "Fetching the latest distances…"}</span>
          </div>
        )}

        <div className="board-footer">
          <span>TRACK POSITION IS SCALED TO THE CURRENT LEADER</span>
          <span>DATA REFRESHES EVERY 60 SECONDS WHILE THIS TAB IS OPEN</span>
        </div>
      </section>

      <footer>
        <span>UNOFFICIAL COMPANION LEADERBOARD</span>
        <span>PUBLIC EVENT DATA · NO INVITE CODES DISPLAYED</span>
      </footer>

      <p className="sr-only" aria-live="polite">{announcement}</p>
    </main>
  );
}
