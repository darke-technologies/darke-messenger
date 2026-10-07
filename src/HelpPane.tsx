import { PLAN_FEATURE_COPY, PLAN_PRICE_LABEL } from "./workspaces";

export function HelpPane() {
  return (
    <section className="page help-page">
      <header className="page-head">
        <h2>Help</h2>
      </header>

      <article className="help-article">
        <p className="help-lead">
          DARKE is a web-first team workspace and social feed —
          username and password in the cloud.
        </p>

        <h3>Your account</h3>
        <p>
          Sign in with your username and password. DARKE stores your public
          profile, people, and social features in the cloud. Forget
          the password and you will need to create a new account.
        </p>

        <h3>Home</h3>
        <p>
          Home opens the Terminal — a command center for workspaces, invites,
          and thread mentions. Manage Home in Settings. The public social feed
          lives under DARKENET → Feed, not on Terminal.
        </p>

        <h3>DARKENET</h3>
        <p>
          DARKENET is Feed, People, Notifications, and Profile. Likes and
          followers only badge that Notifications item. Hide DARKENET in Sidebar
          Options and Home stays on Terminal.
        </p>

        <h3>Channels</h3>
        <p>
          Every channel lives inside a workspace, nested under that workspace in
          the left sidebar. FREE is {PLAN_PRICE_LABEL.free} (
          {PLAN_FEATURE_COPY.free}). PRO is {PLAN_PRICE_LABEL.pro} (
          {PLAN_FEATURE_COPY.pro}). Your plan badge sits at the bottom of the
          sidebar. Edit the workspace to reserve a unique URL like
          your-team.darke.ai.
        </p>

        <h3>Games</h3>
        <p>
          Games is the DARKE Gaming Hub. It lists popular titles from IGDB with
          search and genre filters. Add games to your public profile from a
          title’s detail view.
        </p>
      </article>
    </section>
  );
}
